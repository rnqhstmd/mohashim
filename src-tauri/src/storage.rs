use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::StoreExt;

pub const STORE_FILE: &str = ".store.json";

/// 9개 defaults 키 목록 (idempotent 시드, C9).
///
/// `active_phase` 9번째 키 영속 의도: PRD AC-12/13 (앱 재시작 시 진행 중이던 세션
/// 자동 Discarded 처리)와 후속 grass 도메인의 비정상 종료 추적용. 허용값:
/// `"idle"` | `"focus"` | `"break"` (Complete/Discarded는 즉시 idle로 기록).
fn defaults() -> [(&'static str, Value); 9] {
    [
        ("onboarding_completed", json!(false)),
        ("focus_minutes", json!(25)),
        ("break_minutes", json!(5)),
        ("notifications_enabled", json!(true)),
        ("todos", json!([])),
        ("work_tags", json!([])),
        ("locations", json!([])),
        ("sessions", json!({})),
        ("active_phase", json!("idle")),
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

/// 모든 데이터 초기화 (FR-24, BR-reset-1, MUST-2).
///
/// 순서: ① atomic 강제 리셋 → ② store.clear() → ③ seed_defaults.
/// atomic을 먼저 Idle로 강제하여 score::tick의 자동 전환이 reset 도중 store에
/// 끼어들지 못하도록 차단한다 (Rust 단일 writer 정책 보강).
#[tauri::command]
pub async fn reset_all<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    crate::timer::reset_runtime_state();
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    store.clear();
    seed_defaults(&app)?;
    Ok(())
}
