use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_store::StoreExt;

pub const STORE_FILE: &str = ".store.json";

/// 9번째 스토어 키. timer 모듈에서 단일 writer 정책으로 영속하지만, defaults 시드와
/// 부트 시 자동 Discarded 검사에서도 참조하므로 storage 모듈에 단일 정의를 둔다
/// (storage ← timer 단방향 의존을 유지하기 위해 storage.rs에 정의). 허용값:
/// `"idle"` | `"focus"` | `"break"` (Complete/Discarded는 즉시 idle로 기록).
pub const ACTIVE_PHASE_KEY: &str = "active_phase";

/// 10개 defaults 키 목록 (idempotent 시드, C9).
///
/// `active_phase` 9번째 키 영속 의도: PRD AC-12/13 (앱 재시작 시 진행 중이던 세션
/// 자동 Discarded 처리)와 후속 grass 도메인의 비정상 종료 추적용.
/// `auto_launch_enabled` 10번째 키: Phase 9 인프라 (FR-8). OS launcher
/// 동기화 기준 — 기동 시 본 키 ↔ launcher 상태 비교 후 차이 발생 시 enable/disable.
fn defaults() -> [(&'static str, Value); 10] {
    [
        ("onboarding_completed", json!(false)),
        ("focus_minutes", json!(25)),
        ("break_minutes", json!(5)),
        ("notifications_enabled", json!(true)),
        ("todos", json!([])),
        ("work_tags", json!([])),
        ("locations", json!([])),
        ("sessions", json!({})),
        (ACTIVE_PHASE_KEY, json!("idle")),
        ("auto_launch_enabled", json!(false)),
    ]
}

/// Store 초기화. defaults 시드는 idempotent — 기존 키는 덮어쓰지 않는다 (C9).
/// JSON parse 실패 또는 IO 실패 시 손상 파일을 백업하고 재생성한다 (C7).
/// 실패하더라도 부트를 차단하지 않는다.
pub fn init<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    match seed_defaults(app) {
        Ok(()) => Ok(()),
        Err(first_err) => {
            eprintln!("[mohashim] storage init first attempt failed: {first_err}");
            if let Err(backup_err) = backup_corrupted(app) {
                eprintln!("[mohashim] storage backup failed: {backup_err}");
            }
            // retry 1회.
            match seed_defaults(app) {
                Ok(()) => Ok(()),
                Err(retry_err) => {
                    eprintln!("[mohashim] storage init retry failed: {retry_err}");
                    Err(retry_err)
                }
            }
        }
    }
}

/// Store를 열고 누락된 defaults를 시드한다.
///
/// `reset_all`에서 store.clear() 직후 호출하므로 `pub(crate)`로 노출한다.
pub(crate) fn seed_defaults<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;

    for (key, value) in defaults() {
        if !store.has(key) {
            store.set(key, value);
        }
    }

    store
        .save()
        .map_err(|e| format!("store save failed: {e}"))?;

    Ok(())
}

/// 손상된 `.store.json`을 `.store.json.corrupted-{unix_ts}`로 백업.
/// rename은 cross-filesystem 에서 EXDEV로 실패할 수 있으므로,
/// 그 경우 copy + remove_file 폴백을 시도한다.
fn backup_corrupted<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir resolution failed: {e}"))?;
    let store_path = dir.join(STORE_FILE);
    if !store_path.exists() {
        return Ok(());
    }
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup_path = dir.join(format!("{STORE_FILE}.corrupted-{ts}"));

    if let Err(rename_err) = std::fs::rename(&store_path, &backup_path) {
        // EXDEV 등 cross-device 실패에 대비한 copy + remove 폴백.
        eprintln!(
            "[mohashim] rename {} -> {} failed ({rename_err}), falling back to copy",
            store_path.display(),
            backup_path.display()
        );
        std::fs::copy(&store_path, &backup_path).map_err(|e| {
            format!(
                "copy {} -> {} failed: {e}",
                store_path.display(),
                backup_path.display()
            )
        })?;
        std::fs::remove_file(&store_path)
            .map_err(|e| format!("remove {} failed: {e}", store_path.display()))?;
    }
    Ok(())
}

/// 글로벌 boolean 설정 read 헬퍼 (FR-22, DEC-9-9).
///
/// store open/get 실패 또는 키 누락/타입 불일치 시 `default_value`를 반환한다.
/// 호출자(timer.rs/lib.rs)는 inline read 대신 본 헬퍼만 사용해 storage ← 호출자
/// 단방향 의존을 유지한다.
fn get_bool_setting<R: Runtime>(app: &AppHandle<R>, key: &str, default_value: bool) -> bool {
    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[mohashim] storage::get_{key} failed: {e}");
            return default_value;
        }
    };
    match store.get(key) {
        Some(v) => v.as_bool().unwrap_or(default_value),
        None => default_value,
    }
}

/// `notifications_enabled` 헬퍼 — 실패/누락 시 default `true` (BR-6 안전 측 기본값).
pub fn get_notifications_enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    get_bool_setting(app, "notifications_enabled", true)
}

/// `auto_launch_enabled` 헬퍼 — 실패/누락 시 default `false` (보수적 폴백).
pub fn get_auto_launch_enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    get_bool_setting(app, "auto_launch_enabled", false)
}

/// `onboarding_completed` 헬퍼 — 실패/누락 시 default `false` (DEC-9-9, FR-14).
///
/// store open 실패 시 `false`를 반환해 호출자(`lib.rs::show_window_for_onboarding`)가
/// 신규 인스톨 가능성으로 간주하고 conservative fallback으로 윈도우 노출을 시도하도록 한다.
pub fn get_onboarding_completed<R: Runtime>(app: &AppHandle<R>) -> bool {
    get_bool_setting(app, "onboarding_completed", false)
}

/// 모든 데이터 초기화 (FR-24, BR-reset-1, MUST-2).
///
/// 순서: ① atomic 강제 리셋 → ② store.clear() → ③ seed_defaults → ④ OS launcher disable.
/// atomic을 먼저 Idle로 강제하여 score::tick의 자동 전환이 reset 도중 store에
/// 끼어들지 못하도록 차단한다 (Rust 단일 writer 정책 보강).
/// store는 false로 리셋되지만 OS LaunchAgent plist는 그대로이므로 명시적으로 disable
/// 호출을 추가해 store↔OS 정합을 맞춘다. autolaunch disable 실패 시 eprintln 후 진행
/// (DEC-9-2 정책 일관 — reset 자체는 성공으로 본다).
#[tauri::command]
pub async fn reset_all<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    crate::timer::reset_runtime_state();
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    store.clear();
    seed_defaults(&app)?;
    if let Err(e) = app.autolaunch().disable() {
        eprintln!("[mohashim] reset_all: autolaunch disable failed: {e}");
    }
    Ok(())
}

// auto_launch IPC (FR-10).
//
// `auto_launch_enabled` 키의 store write는 본 IPC만 수행한다 (Rust 단일 writer 정책).
// 기동 시 동기화는 `lib.rs::sync_autolaunch`가 read만 수행하고 OS API enable/disable로
// store-OS 정합을 맞춘다 — store write 미수행 (DEC-9-1).

/// 현재 설정된 자동 실행 여부 read.
#[tauri::command]
pub async fn get_auto_launch<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    Ok(get_auto_launch_enabled(&app))
}

/// 자동 실행 toggle (FR-10).
///
/// store에 `auto_launch_enabled` 영속한 뒤 OS launcher API를 enable/disable한다.
/// OS API 실패 시 Err — 호출자(설정 UI)가 결과를 받아 사용자에게 안내할 수 있도록 한다.
#[tauri::command]
pub async fn set_auto_launch<R: Runtime>(app: AppHandle<R>, enabled: bool) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    store.set("auto_launch_enabled", json!(enabled));
    store
        .save()
        .map_err(|e| format!("store save failed: {e}"))?;
    let manager = app.autolaunch();
    let res = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    res.map_err(|e| format!("autolaunch toggle failed: {e}"))
}
