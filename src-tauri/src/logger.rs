//! 분석용 JSON Lines 로컬 로거 (FR-B1~B9).
//!
//! 8개 이벤트(`app_start` / `app_quit` / `phase_change` / `session_complete` /
//! `session_discarded` / `noise_enter` / `noise_exit` / `audio_error`)를
//! `app_log_dir()/mohashim-YYYY-MM-DD.jsonl`에 append + flush 한다.
//!
//! BR-B1 정책: write 실패는 swallow + eprintln. init 실패 시 `LOG_WRITER` 미초기화 →
//! `write`가 no-op (BR-B3).
//!
//! PR #19 gemini G1 반영: 자정 넘김 시 자동 회전. write 시점에 today 비교 후 필요 시
//! 새 파일로 writer 교체. `Mutex<LogState>`로 date + writer를 함께 보유.

use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use chrono::NaiveDate;
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

/// 30일 cleanup 멱등성 가드 (J).
static CLEANUP_DONE: AtomicBool = AtomicBool::new(false);

/// JSON Lines 파일 writer + 현재 파일이 가리키는 날짜.
///
/// PR #19 G1: write 시점에 `date != today`이면 writer를 새 파일로 교체하여
/// 자정 넘김 시 일별 회전을 보장한다.
struct LogState {
    date: NaiveDate,
    writer: BufWriter<File>,
}

/// init 성공 시 set, 실패 시 미초기화 → write no-op (BR-B3).
static LOG_WRITER: OnceLock<Mutex<LogState>> = OnceLock::new();

/// 로그 디렉토리 경로 (`app_log_dir()`). `open_log_dir` command + 자정 회전에서 참조.
static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();

/// 8개 분석 이벤트 스키마 (FR-B4).
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

/// 오늘 날짜의 jsonl 파일을 OpenOptions::append로 열고 BufWriter로 래핑.
fn open_today_file(dir: &Path, date: NaiveDate) -> Result<BufWriter<File>, String> {
    let file_path = dir.join(format!("mohashim-{}.jsonl", date.format("%Y-%m-%d")));
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file_path)
        .map_err(|e| format!("open log file failed: {e}"))?;
    Ok(BufWriter::new(file))
}

/// 로거 초기화 (FR-B2).
pub fn init<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("app_log_dir failed: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all failed: {e}"))?;

    let _ = LOG_DIR.set(dir.clone());

    if !CLEANUP_DONE.swap(true, Ordering::AcqRel) {
        cleanup_old_files(&dir);
    }

    let today = chrono::Local::now().date_naive();
    let writer = open_today_file(&dir, today)?;
    if LOG_WRITER
        .set(Mutex::new(LogState {
            date: today,
            writer,
        }))
        .is_err()
    {
        // 재호출 방어 — AppStart는 1회만 발화.
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
/// `ts`는 RFC 3339(`chrono::Local`)로 합성하여 첫 키로 삽입 (I, preserve_order로 순서 보장).
/// 자정 회전 (G1): today != state.date이면 새 파일로 writer 교체.
pub fn write(event: LogEvent) {
    let Some(writer_lock) = LOG_WRITER.get() else {
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

    let mut state = match writer_lock.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };

    // G1 자정 회전: 오늘 날짜와 다르면 새 파일로 writer 교체.
    let today = chrono::Local::now().date_naive();
    if state.date != today {
        let _ = state.writer.flush();
        if let Some(dir) = LOG_DIR.get() {
            match open_today_file(dir, today) {
                Ok(new_writer) => {
                    state.writer = new_writer;
                    state.date = today;
                }
                Err(e) => {
                    eprintln!("[mohashim] logger rotate failed: {e}");
                    // 회전 실패 시 기존 파일에 계속 기록 (write no-op보다 보존 우선).
                }
            }
        }
    }

    if let Err(e) = writeln!(state.writer, "{}", line).and_then(|_| state.writer.flush()) {
        eprintln!("[mohashim] logger write failed: {e}");
    }
}

/// 종료 직전 BufWriter flush (E: RunEvent::Exit).
pub fn flush() {
    if let Some(writer_lock) = LOG_WRITER.get() {
        if let Ok(mut state) = writer_lock.lock() {
            let _ = state.writer.flush();
        }
    }
}

/// 로그 디렉토리 경로 반환. `init` 성공 후에만 Some (FR-B9 / open_log_dir 참조용).
pub fn log_dir() -> Option<PathBuf> {
    LOG_DIR.get().cloned()
}

/// 30일 초과 `mohashim-*.jsonl` 파일 삭제 (FR-B7).
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
        let modified = entry.metadata().and_then(|m| m.modified()).ok();
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
#[tauri::command]
pub async fn open_log_dir<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let dir = log_dir().ok_or_else(|| "log_dir not initialized".to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("open_path failed: {e}"))
}
