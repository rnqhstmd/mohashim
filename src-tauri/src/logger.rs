//! 분석용 JSON Lines 로컬 로거 (FR-B1~B9).
//!
//! 8개 이벤트(`app_start` / `app_quit` / `phase_change` / `session_complete` /
//! `session_discarded` / `noise_enter` / `noise_exit` / `audio_error`)를
//! `app_log_dir()/mohashim-YYYY-MM-DD.jsonl`에 append + flush 한다.
//!
//! BR-B1 정책: write 실패는 swallow + eprintln. init 실패 시 `LOG_WRITER` 미초기화 →
//! `write`가 no-op (BR-B3).

use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

/// 30일 cleanup 멱등성 가드 (J).
///
/// `init`이 재호출되어도 동일 프로세스 lifetime 내에서는 cleanup이 1회만 수행된다.
static CLEANUP_DONE: AtomicBool = AtomicBool::new(false);

/// JSON Lines 파일 writer. `init` 성공 시 set, 실패 시 미초기화 → write no-op (BR-B3).
static LOG_WRITER: OnceLock<Mutex<BufWriter<File>>> = OnceLock::new();

/// 로그 디렉토리 경로 (`app_log_dir()`). `open_log_dir` command에서 참조.
static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();

/// 8개 분석 이벤트 스키마 (FR-B4).
///
/// `event` 필드(snake_case)와 페이로드를 분리하여 직렬화한다.
/// 공통 필드 `ts`(RFC 3339)는 `write` 함수에서 합성하여 prepend 한다 (I).
#[derive(Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum LogEvent {
    AppStart {
        version: String,
        os: String,
    },
    AppQuit,
    PhaseChange {
        from: String,
        to: String,
        elapsed_secs: u64,
    },
    SessionComplete {
        focus_mins: u32,
        break_mins: u32,
        final_score: u32,
        tag: Option<String>,
    },
    /// reason: `"manual"` | `"boot_reset"` | `"sleep_overflow"` (D).
    SessionDiscarded {
        reason: String,
    },
    NoiseEnter {
        db_ema: f32,
    },
    NoiseExit {
        db_ema: f32,
        duration_secs: u64,
    },
    AudioError {
        message: String,
    },
}

/// 로거 초기화 (FR-B2).
///
/// 1. `app_log_dir()` 디렉토리 생성. 실패 시 Err 반환 — 호출자 eprintln (BR-B3).
/// 2. 30일 초과 `mohashim-*.jsonl` 파일 일괄 삭제 (FR-B7, J: AtomicBool 멱등 가드).
/// 3. 오늘 파일 OpenOptions::append 오픈 + BufWriter::new + LOG_WRITER set.
/// 4. `AppStart{version, os}` 첫 이벤트 기록.
pub fn init<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("app_log_dir failed: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all failed: {e}"))?;

    // LOG_DIR 보존 (open_log_dir command 참조용). 재초기화 시 set Err은 무시.
    let _ = LOG_DIR.set(dir.clone());

    // J: AtomicBool로 30일 cleanup 멱등성 보장. 같은 프로세스에서 1회만 수행.
    if !CLEANUP_DONE.swap(true, Ordering::AcqRel) {
        cleanup_old_files(&dir);
    }

    // 오늘 파일 경로: mohashim-YYYY-MM-DD.jsonl (chrono::Local 기준).
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let file_path = dir.join(format!("mohashim-{}.jsonl", today));
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file_path)
        .map_err(|e| format!("open log file failed: {e}"))?;
    let writer = BufWriter::new(file);
    if LOG_WRITER.set(Mutex::new(writer)).is_err() {
        // 이미 초기화된 경우 — 재호출 방어. AppStart는 1회만 발화.
        return Ok(());
    }

    write(LogEvent::AppStart {
        version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
    });

    Ok(())
}

/// 1줄 JSON Lines append + flush (FR-B3, BR-B1).
///
/// `LOG_WRITER` 미초기화 시 no-op (BR-B3). 직렬화/락/IO 실패는 swallow + eprintln.
/// `ts`는 RFC 3339(`chrono::Local`)로 합성하여 첫 키로 삽입 (I: Map 머지).
pub fn write(event: LogEvent) {
    let Some(writer) = LOG_WRITER.get() else {
        // BR-B3: init 실패/미호출 → write no-op.
        return;
    };
    let value = match serde_json::to_value(&event) {
        Ok(serde_json::Value::Object(map)) => map,
        Ok(_) => {
            eprintln!("[mohashim] logger serialize unexpected non-object");
            return;
        }
        Err(e) => {
            eprintln!("[mohashim] logger serialize failed: {e}");
            return;
        }
    };
    // I: ts를 첫 키로 prepend. serde_json::Map은 IndexMap이라 삽입 순서가 직렬화 순서.
    let mut ordered = serde_json::Map::new();
    ordered.insert(
        "ts".to_string(),
        serde_json::Value::String(chrono::Local::now().to_rfc3339()),
    );
    for (k, v) in value {
        ordered.insert(k, v);
    }
    let line = match serde_json::to_string(&ordered) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[mohashim] logger to_string failed: {e}");
            return;
        }
    };
    let mut buf = match writer.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(), // poison 복원
    };
    if let Err(e) = writeln!(buf, "{}", line).and_then(|_| buf.flush()) {
        eprintln!("[mohashim] logger write failed: {e}");
    }
}

/// 종료 직전 BufWriter flush (E: RunEvent::Exit).
///
/// `write`가 매 호출마다 flush 하므로 정상 흐름에서는 no-op. 그러나 RunEvent::Exit
/// 핸들러에서 명시 호출하여 종료 race를 방어한다 (MA-2).
pub fn flush() {
    if let Some(writer) = LOG_WRITER.get() {
        if let Ok(mut buf) = writer.lock() {
            let _ = buf.flush();
        }
    }
}

/// 로그 디렉토리 경로 반환. `init` 성공 후에만 Some (FR-B9 / open_log_dir 참조용).
pub fn log_dir() -> Option<PathBuf> {
    LOG_DIR.get().cloned()
}

/// 30일 초과 `mohashim-*.jsonl` 파일 삭제 (FR-B7).
///
/// `dir` 직속 파일 walk + modified time 비교. 파일명 prefix 검사로 다른 파일은 보호.
/// 모든 IO 실패는 swallow + eprintln (BR-B1 정책 일관).
fn cleanup_old_files(dir: &std::path::Path) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("[mohashim] logger cleanup read_dir failed: {e}");
            return;
        }
    };
    let cutoff = std::time::SystemTime::now()
        .checked_sub(std::time::Duration::from_secs(30 * 24 * 60 * 60))
        .unwrap_or(std::time::UNIX_EPOCH);
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        if !name.starts_with("mohashim-") || !name.ends_with(".jsonl") {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok();
        let Some(mtime) = modified else { continue };
        if mtime < cutoff {
            if let Err(e) = fs::remove_file(&path) {
                eprintln!(
                    "[mohashim] logger cleanup remove_file failed ({}): {e}",
                    name
                );
            }
        }
    }
}

/// 로그 폴더 OS 파일 매니저로 열기 (FR-B9, D-3).
///
/// `LOG_DIR` 미초기화 시 Err 반환 — 호출자(JS)가 catch 후 console.error.
/// `tauri-plugin-opener::open_path`로 OS 기본 핸들러 호출. capabilities `opener:allow-open-path` 필요 (C).
#[tauri::command]
pub async fn open_log_dir<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let dir = log_dir().ok_or_else(|| "log_dir not initialized".to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("open_path failed: {e}"))
}
