use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::StoreExt;

pub const STORE_FILE: &str = ".store.json";

/// 8개 defaults 키 목록 (idempotent 시드, C9).
fn defaults() -> [(&'static str, Value); 8] {
    [
        ("onboarding_completed", json!(false)),
        ("focus_minutes", json!(25)),
        ("break_minutes", json!(5)),
        ("notifications_enabled", json!(true)),
        ("todos", json!([])),
        ("work_tags", json!([])),
        ("locations", json!([])),
        ("sessions", json!({})),
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
fn seed_defaults<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
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

/// 손상된 `.store.json`을 `.store.json.corrupted-{unix_ts}`로 rename 백업.
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
    std::fs::rename(&store_path, &backup_path)
        .map_err(|e| format!("rename {} -> {} failed: {e}", store_path.display(), backup_path.display()))?;
    Ok(())
}
