use std::time::{SystemTime, UNIX_EPOCH};

use chrono::Datelike;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_store::StoreExt;

pub const STORE_FILE: &str = ".store.json";

/// 9번째 스토어 키. timer 모듈에서 단일 writer 정책으로 영속하지만, defaults 시드와
/// 부트 시 자동 Discarded 검사에서도 참조하므로 storage 모듈에 단일 정의를 둔다
/// (storage ← timer 단방향 의존을 유지하기 위해 storage.rs에 정의). 허용값:
/// `"idle"` | `"focus"` | `"break"` (Complete/Discarded는 즉시 idle로 기록).
pub const ACTIVE_PHASE_KEY: &str = "active_phase";

/// 12개 defaults 키 목록 (idempotent 시드, C9).
///
/// `active_phase` 9번째 키 영속 의도: PRD AC-12/13 (앱 재시작 시 진행 중이던 세션
/// 자동 Discarded 처리)와 후속 grass 도메인의 비정상 종료 추적용.
/// `auto_launch_enabled` 10번째 키: Phase 9 인프라 (FR-8). OS launcher
/// 동기화 기준 — 기동 시 본 키 ↔ launcher 상태 비교 후 차이 발생 시 enable/disable.
/// `session_logs` 11번째 키: Phase 10 FR-4. Focus 세션 단위 로그 (Rust 단일 writer, BR-1).
/// `last_cleanup_year` 12번째 키: Phase 10 FR-7. yearly_cleanup 실행 연도 추적 (멱등 가드).
fn defaults() -> [(&'static str, Value); 12] {
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
        ("session_logs", json!([])),
        ("last_cleanup_year", json!(0)),
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

/// 연도 자동 정리 (Phase 10 FR-7, AC-16/17, DEC-10-6).
///
/// 동일 연도 재실행 시 no-op (`last_cleanup_year >= current_year` 가드).
/// 정리 항목:
/// - `sessions`: 키 prefix(YYYY-)가 현재 연도 미만이면 삭제.
/// - `session_logs`: 항목 `date` 필드 연도가 현재 연도 미만이면 삭제.
/// - `todos`: `done=true` 전체 삭제 (BR-5, DEC-10-6 — `completedAt` 무관 단순 비교).
///
/// 단일 save로 atomic 처리 — 실패 시 `last_cleanup_year` 미반영으로 BR-4 멱등 재시도 가능.
/// save 성공 후에만 `year-cleanup` 이벤트를 emit (FR-8).
pub fn yearly_cleanup<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    let current_year = chrono::Local::now().year() as u32;
    let last = store
        .get("last_cleanup_year")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    if last >= current_year {
        // AC-16: 동일 연도 재실행 no-op.
        return Ok(());
    }

    // 1. sessions: 키 prefix(YYYY-) 비교.
    // 파싱 실패 항목은 보존 (Q2 결정). 타입 불일치(비객체) 시에도 store.set 자체를 skip하여
    // 외부 편집/손상 데이터를 빈 객체로 덮어쓰는 데이터 손실을 방지한다 (PR #10 리뷰 반영).
    let sessions_raw = store.get("sessions").unwrap_or(json!({}));
    let mut deleted_sessions: u32 = 0;
    if let Some(map) = sessions_raw.as_object() {
        let mut new_map = serde_json::Map::new();
        for (k, v) in map.iter() {
            let key_year_opt = k.get(0..4).and_then(|s| s.parse::<u32>().ok());
            match key_year_opt {
                Some(y) if y < current_year => {
                    deleted_sessions += 1;
                }
                _ => {
                    // 파싱 성공 + 현재 연도 이상, 또는 파싱 실패(None) → 보존.
                    new_map.insert(k.clone(), v.clone());
                }
            }
        }
        store.set("sessions", Value::Object(new_map));
    }
    // else: 비객체(외부 손상)는 set 자체를 skip하여 원본 보존.

    // 2. session_logs: date 필드 연도 비교.
    // 파싱 실패 항목은 보존 (Q2 결정). 타입 불일치(비배열) 시 set skip — 동일 보존 정책.
    let logs_raw = store.get("session_logs").unwrap_or(json!([]));
    let mut deleted_logs: u32 = 0;
    if let Some(arr) = logs_raw.as_array() {
        let kept: Vec<Value> = arr
            .iter()
            .filter(|log| {
                let date = log
                    .get("date")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let log_year_opt = date.get(0..4).and_then(|s| s.parse::<u32>().ok());
                match log_year_opt {
                    Some(y) if y < current_year => {
                        deleted_logs += 1;
                        false
                    }
                    _ => true,
                }
            })
            .cloned()
            .collect();
        store.set("session_logs", Value::Array(kept));
    }
    // else: 비배열은 보존.

    // 3. todos: done=true 전체 삭제 (BR-5, DEC-10-6).
    // gemini-code-assist HIGH 리뷰 반영: last == 0(첫 업데이트, last_cleanup_year 키 부재)
    // 케이스에서는 todos 정리를 skip하여 현재 연도 완료 데이터 손실을 차단한다.
    // last > 0(이전 정리 기록 존재 = 명시적 연도 전환 확인)일 때만 일괄 삭제 수행.
    // 비배열 타입 불일치 시에도 set skip — 데이터 보존 정책 일관 (PR #10 리뷰 반영).
    let mut deleted_todos: u32 = 0;
    if last > 0 {
        let todos_raw = store.get("todos").unwrap_or(json!([]));
        if let Some(arr) = todos_raw.as_array() {
            let kept: Vec<Value> = arr
                .iter()
                .filter(|t| {
                    let done = t.get("done").and_then(|v| v.as_bool()).unwrap_or(false);
                    if done {
                        deleted_todos += 1;
                        false
                    } else {
                        true
                    }
                })
                .cloned()
                .collect();
            store.set("todos", Value::Array(kept));
        }
        // else: 비배열은 보존.
    }
    // last == 0: 첫 업데이트 시 todos 정리 skip — 다음 연도 전환에서 정상 동작.

    // 4. last_cleanup_year 갱신.
    store.set("last_cleanup_year", json!(current_year));

    // 5. 단일 save (실패 시 last_cleanup_year 미반영 → BR-4 멱등 재시도).
    store
        .save()
        .map_err(|e| format!("store save failed: {e}"))?;

    // 6. emit (FR-8) — save 성공 후에만.
    let _ = app.emit(
        "year-cleanup",
        json!({
            "year": current_year,
            "deleted_sessions": deleted_sessions,
            "deleted_logs": deleted_logs,
            "deleted_todos": deleted_todos,
        }),
    );
    Ok(())
}

/// Todo 완료/롤백 시 sessions[date] 엔트리의 todos_completed 필드를 갱신하는 순수 로직 (Phase 12 FR-2/3).
///
/// `delta`: +1(record) 또는 -1(undo). 결과 카운트는 0 미만으로 떨어지지 않도록 saturating 처리.
/// 레코드 미존재 + delta>0: 신규 레코드 생성 (sessions=0, avg=0, sum=0, todos_completed=delta).
/// 레코드 미존재 + delta≤0: no-op — 음수 카운트 방지 (BR-3).
///
/// 외부 손상 데이터로 sessions 키가 비객체인 경우, 호출자가 빈 객체로 시작하도록 한다.
pub(crate) fn apply_todo_delta(
    sessions: &mut serde_json::Map<String, Value>,
    date: &str,
    delta: i32,
) {
    let existing = sessions.get(date).and_then(|v| v.as_object()).cloned();
    match existing {
        Some(obj) => {
            let old_count = obj
                .get("todos_completed")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let new_count = if delta >= 0 {
                old_count.saturating_add(delta as u64)
            } else {
                old_count.saturating_sub((-delta) as u64)
            };
            // 기존 필드(sessions, avg, sum, date)는 보존.
            let mut next = obj.clone();
            next.insert("todos_completed".into(), json!(new_count));
            // date 필드 누락 시 키와 동일하게 채움 (정합성).
            if !next.contains_key("date") {
                next.insert("date".into(), json!(date));
            }
            sessions.insert(date.to_string(), Value::Object(next));
        }
        None => {
            if delta <= 0 {
                // 레코드 없음 + undo: no-op (BR-3).
                return;
            }
            let mut new_obj = serde_json::Map::new();
            new_obj.insert("date".into(), json!(date));
            new_obj.insert("sessions".into(), json!(0));
            new_obj.insert("avg".into(), json!(0));
            new_obj.insert("sum".into(), json!(0));
            new_obj.insert("todos_completed".into(), json!(delta as u64));
            sessions.insert(date.to_string(), Value::Object(new_obj));
        }
    }
}

/// 주어진 ID 목록 순서를 보존하여 (id, tag) 페어 반환 (Phase 19 FR-B2).
///
/// store 조회 실패 또는 todos 키 부재/비배열: 빈 Vec 반환 → 호출자(`timer::compute_session_tag`)가 None 폴백.
/// ID가 todos에 없으면 결과에서 제외 (산정 제외). tag가 string이 아니거나 빈 문자열이면 None
/// — TS `getTodos` 폴백 정합 (storage.ts).
pub(crate) fn read_todo_tags<R: Runtime>(
    app: &AppHandle<R>,
    ids: &[String],
) -> Vec<(String, Option<String>)> {
    use std::collections::HashMap;
    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[mohashim] read_todo_tags store open failed: {e}");
            return Vec::new();
        }
    };
    let value = match store.get("todos") {
        Some(v) => v,
        None => return Vec::new(),
    };
    let arr = match value.as_array() {
        Some(a) => a.clone(),
        None => return Vec::new(),
    };
    let mut lookup: HashMap<String, Value> = HashMap::with_capacity(arr.len());
    for item in arr {
        if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
            lookup.insert(id.to_string(), item);
        }
    }
    let mut result = Vec::with_capacity(ids.len());
    for id in ids {
        let Some(item) = lookup.get(id) else { continue };
        let tag = item
            .get("tag")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(String::from);
        result.push((id.clone(), tag));
    }
    result
}

/// Todo 완료 카운트 +1 (Phase 12 FR-2) + 세션 buffer 적재 (Phase 13 FR-14).
///
/// sessions[date].todos_completed += 1. 레코드 미존재 시 신규 생성 (sessions=0, avg=0, sum=0).
/// store save 후 `todo-completion` 이벤트 emit (FR-7, AC-12, AC-14).
/// Rust 단일 writer 정책 유지 (BR-2).
///
/// Phase 13 (MA-1): `todo_id`는 required — silent miss 차단. JS invoke에 todoId 누락 시 IPC 에러.
/// Phase 13 FR-14: sessions 갱신 후 `score::shared::push_todo`로 buffer 적재. phase 가드는
/// push_todo 내부에서 Focus|Break만 통과 (Idle/Discarded/Complete는 미적재).
#[tauri::command]
pub async fn record_todo_completion<R: Runtime>(
    app: AppHandle<R>,
    date: String,
    todo_id: String,
) -> Result<(), String> {
    update_sessions_todo(&app, &date, 1)?;
    // Phase 13 FR-14 / BR-7: phase 가드 + 중복 차단은 push_todo 내부에서 수행.
    // 가드 false 반환은 정상 흐름 (Idle 상태 호출 등) — 결과 무시.
    let _ = crate::score::shared::push_todo(&todo_id);
    app.emit("todo-completion", json!({ "date": date }))
        .map_err(|e| format!("todo-completion emit failed: {e}"))
}

/// Todo 완료 롤백 카운트 -1 (Phase 12 FR-3) + 세션 buffer 제거 (Phase 13 FR-15).
///
/// sessions[date].todos_completed = max(0, current - 1). 레코드 미존재 시 no-op.
/// store save 후 `todo-completion` 이벤트 emit.
///
/// Phase 13 (MA-1): `todo_id`는 required — record와 정합성 유지.
/// Phase 13 FR-15: sessions 갱신 후 `score::shared::remove_todo`로 buffer 제거. 일치 항목 없으면 no-op.
#[tauri::command]
pub async fn undo_todo_completion<R: Runtime>(
    app: AppHandle<R>,
    date: String,
    todo_id: String,
) -> Result<(), String> {
    update_sessions_todo(&app, &date, -1)?;
    // Phase 13 FR-15: buffer에서 해당 todo_id 제거. 일치 항목 없으면 false → 무시.
    let _ = crate::score::shared::remove_todo(&todo_id);
    app.emit("todo-completion", json!({ "date": date }))
        .map_err(|e| format!("todo-completion emit failed: {e}"))
}

/// record/undo 공통 store 갱신 — apply_todo_delta 적용 후 save.
fn update_sessions_todo<R: Runtime>(
    app: &AppHandle<R>,
    date: &str,
    delta: i32,
) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    let raw = store.get("sessions").unwrap_or(json!({}));
    // 외부 편집/손상으로 비객체일 경우, 빈 객체로 시작하여 todo 적재 후 정상 형태로 복원.
    let mut map = raw
        .as_object()
        .cloned()
        .unwrap_or_else(serde_json::Map::new);
    apply_todo_delta(&mut map, date, delta);
    store.set("sessions", Value::Object(map));
    store
        .save()
        .map_err(|e| format!("store save failed: {e}"))
}

/// SessionLog in-memory append (Phase 10 FR-4, DEC-10-8).
///
/// store.set만 수행하고 store.save()는 호출자가 묶음 단일 호출한다 — sessions 키 적재와
/// session_logs 적재의 부분 일관성을 회피하기 위한 원자화 정책 (B3).
/// session_logs 키의 단일 writer (BR-1).
///
/// Phase 13 FR-16: `todos_done`은 호출자(`timer::on_complete_consumed`)가 `score::shared::drain_todos`로
/// 회수한 세션 todo ID 배열. 빈 배열도 허용 — todo 미체크 세션의 정상 케이스.
pub(crate) fn append_session_log<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    date: &str,
    start_at: &str,
    end_at: &str,
    duration_mins: u32,
    score: u32,
    todos_done: Vec<String>,
) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    let raw = store.get("session_logs").unwrap_or(json!([]));
    let mut arr = raw.as_array().cloned().unwrap_or_default();
    arr.push(json!({
        "id": id,
        "date": date,
        "start_at": start_at,
        "end_at": end_at,
        "duration_mins": duration_mins,
        "score": score,
        "todos_done": todos_done,
    }));
    store.set("session_logs", Value::Array(arr));
    // save는 호출자가 단일 처리 (DEC-10-8).
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::apply_todo_delta;
    use serde_json::{json, Value};

    /// AC-10 (PRD): 레코드 미존재 + record(+1) → 신규 레코드 생성 (sessions=0, avg=0, sum=0, todos_completed=1).
    #[test]
    fn apply_todo_delta_creates_new_record_on_record() {
        let mut sessions = serde_json::Map::new();
        apply_todo_delta(&mut sessions, "2026-05-06", 1);
        let entry = sessions
            .get("2026-05-06")
            .and_then(|v| v.as_object())
            .expect("새 레코드 생성");
        assert_eq!(entry.get("sessions"), Some(&json!(0)));
        assert_eq!(entry.get("avg"), Some(&json!(0)));
        assert_eq!(entry.get("sum"), Some(&json!(0)));
        assert_eq!(entry.get("todos_completed"), Some(&json!(1)));
        assert_eq!(entry.get("date"), Some(&json!("2026-05-06")));
    }

    /// AC-10: 기존 레코드에서 record(+1) → todos_completed += 1, 다른 필드 보존.
    #[test]
    fn apply_todo_delta_increments_existing_record() {
        let mut sessions = serde_json::Map::new();
        sessions.insert(
            "2026-05-06".into(),
            json!({
                "date": "2026-05-06",
                "sessions": 4,
                "avg": 75,
                "sum": 300,
                "todos_completed": 2,
            }),
        );
        apply_todo_delta(&mut sessions, "2026-05-06", 1);
        let entry = sessions
            .get("2026-05-06")
            .and_then(|v| v.as_object())
            .expect("기존 레코드 유지");
        assert_eq!(entry.get("sessions"), Some(&json!(4)));
        assert_eq!(entry.get("avg"), Some(&json!(75)));
        assert_eq!(entry.get("sum"), Some(&json!(300)));
        assert_eq!(entry.get("todos_completed"), Some(&json!(3)));
    }

    /// 기존 레코드에 todos_completed 필드 부재 시 0에서 시작.
    #[test]
    fn apply_todo_delta_initializes_missing_field_on_existing() {
        let mut sessions = serde_json::Map::new();
        sessions.insert(
            "2026-05-06".into(),
            json!({
                "date": "2026-05-06",
                "sessions": 1,
                "avg": 50,
            }),
        );
        apply_todo_delta(&mut sessions, "2026-05-06", 1);
        let entry = sessions
            .get("2026-05-06")
            .and_then(|v| v.as_object())
            .unwrap();
        assert_eq!(entry.get("todos_completed"), Some(&json!(1)));
        // 기존 필드 보존.
        assert_eq!(entry.get("sessions"), Some(&json!(1)));
        assert_eq!(entry.get("avg"), Some(&json!(50)));
    }

    /// AC-11: undo로 0 미만이 되지 않음 (saturating_sub).
    #[test]
    fn apply_todo_delta_undo_clamps_at_zero() {
        let mut sessions = serde_json::Map::new();
        sessions.insert(
            "2026-05-06".into(),
            json!({
                "date": "2026-05-06",
                "sessions": 0,
                "avg": 0,
                "sum": 0,
                "todos_completed": 0,
            }),
        );
        apply_todo_delta(&mut sessions, "2026-05-06", -1);
        let entry = sessions
            .get("2026-05-06")
            .and_then(|v| v.as_object())
            .unwrap();
        assert_eq!(entry.get("todos_completed"), Some(&json!(0)));
    }

    /// AC-11: 정상 undo는 -1.
    #[test]
    fn apply_todo_delta_undo_decrements() {
        let mut sessions = serde_json::Map::new();
        sessions.insert(
            "2026-05-06".into(),
            json!({
                "date": "2026-05-06",
                "sessions": 0,
                "avg": 0,
                "sum": 0,
                "todos_completed": 3,
            }),
        );
        apply_todo_delta(&mut sessions, "2026-05-06", -1);
        let entry = sessions
            .get("2026-05-06")
            .and_then(|v| v.as_object())
            .unwrap();
        assert_eq!(entry.get("todos_completed"), Some(&json!(2)));
    }

    /// 레코드 미존재 + undo: no-op (BR-3, 음수 카운트 차단).
    #[test]
    fn apply_todo_delta_undo_on_missing_is_noop() {
        let mut sessions = serde_json::Map::new();
        apply_todo_delta(&mut sessions, "2026-05-06", -1);
        assert!(sessions.get("2026-05-06").is_none());
    }

    /// 신규 레코드 생성 시 date 키와 entry.date 필드가 일치.
    #[test]
    fn apply_todo_delta_existing_without_date_field_fills_it() {
        let mut sessions = serde_json::Map::new();
        sessions.insert(
            "2026-05-06".into(),
            json!({
                "sessions": 1,
                "avg": 80,
                "sum": 80,
            }),
        );
        apply_todo_delta(&mut sessions, "2026-05-06", 1);
        let entry = sessions
            .get("2026-05-06")
            .and_then(|v| v.as_object())
            .unwrap();
        assert_eq!(entry.get("date"), Some(&json!("2026-05-06")));
        assert_eq!(entry.get("todos_completed"), Some(&json!(1)));
    }

    /// 다중 record 누적 — 4회 호출 후 todos_completed=4.
    #[test]
    fn apply_todo_delta_multi_record_accumulates() {
        let mut sessions = serde_json::Map::new();
        for _ in 0..4 {
            apply_todo_delta(&mut sessions, "2026-05-06", 1);
        }
        let entry = sessions
            .get("2026-05-06")
            .and_then(|v| v.as_object())
            .unwrap();
        assert_eq!(entry.get("todos_completed"), Some(&json!(4)));
    }

    /// 다른 날짜는 독립적으로 누적.
    #[test]
    fn apply_todo_delta_isolates_dates() {
        let mut sessions = serde_json::Map::new();
        apply_todo_delta(&mut sessions, "2026-05-06", 1);
        apply_todo_delta(&mut sessions, "2026-05-07", 1);
        apply_todo_delta(&mut sessions, "2026-05-06", 1);
        let day6 = sessions.get("2026-05-06").and_then(|v| v.as_object()).unwrap();
        let day7 = sessions.get("2026-05-07").and_then(|v| v.as_object()).unwrap();
        assert_eq!(day6.get("todos_completed"), Some(&json!(2)));
        assert_eq!(day7.get("todos_completed"), Some(&json!(1)));
        // 음 unused 변수 경고 회피.
        let _: &Value = sessions.get("2026-05-06").unwrap();
    }
}
