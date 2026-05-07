//! 뽀모도로 타이머 도메인 (FR-4, FR-4a/b/c, FR-21, FR-22, DEC-11).
//!
//! Phase 전이의 부수효과(스토어 `active_phase` 기록, OS 알림 발송, 토스트 emit)를
//! 한 곳에 집약한다. **`active_phase` 스토어 키의 write는 본 모듈에서만 수행**한다 —
//! Rust 단일 writer 정책으로 race 차단 (MUST-1).

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_store::StoreExt;

use crate::score::phase::Phase;
use crate::score::shared::{
    current_phase, reset_session_totals, snapshot_and_reset_session_avg, store_phase,
    store_time_left,
};
use crate::storage::{ACTIVE_PHASE_KEY, STORE_FILE};

/// Focus 세션 시작 시각 (Unix epoch ms). Phase 10 FR-4 SessionLog `start_at` 기록용 (DEC-10-1).
///
/// cleanup 4경로:
/// - on_complete_consumed: `swap(0, AcqRel)` — start 값 회수 후 0으로 리셋.
/// - discard_session / auto_discard_on_boot / on_sleep_overflow_discard: `store(0, Release)`.
/// - reset_runtime_state: `store(0, Release)` — reset_all 후 stale 차단.
///
/// BR-2: focus_start의 Idle 가드 통과 후에만 갱신되므로, 비Idle 재호출은 stale 시각을 덮어쓰지 않는다.
pub static FOCUS_START_AT_MS: AtomicU64 = AtomicU64::new(0);

/// 슬립 grace 기준 (BR-sleep-1, DEC-10a/b). wall-clock 경과 ≤ 180s: 세션 유지.
pub const SLEEP_GRACE_SECS: u64 = 180;

const FOCUS_MINUTES_KEY: &str = "focus_minutes";
const BREAK_MINUTES_KEY: &str = "break_minutes";
const DEFAULT_FOCUS_MINUTES: u64 = 25;
const DEFAULT_BREAK_MINUTES: u64 = 5;

/// UI DurationsEditScreen canSave가 보장하는 focus/break 분(分) 범위.
/// Phase 17 BR-4: 5/90/3/30 → 1/180/1/60으로 확대 (자유 입력 화면 도입).
pub const FOCUS_MINUTES_MIN: u64 = 1;
pub const FOCUS_MINUTES_MAX: u64 = 180;
pub const BREAK_MINUTES_MIN: u64 = 1;
pub const BREAK_MINUTES_MAX: u64 = 60;

// =====================================================================
// Tauri commands
// =====================================================================

/// Focus 세션 시작 (FR-4).
///
/// 스토어에서 `focus_minutes`를 읽어 atomic을 Focus + time_left=min*60으로 설정하고
/// `active_phase`를 `"focus"`로 영속한다.
///
/// 진행 중 세션 보호: phase가 Idle이 아닐 때 재호출되면 early return으로 타이머 리셋을
/// 차단한다. 정상 흐름은 IdleScreen에서만 노출되지만, IPC 직접 호출 케이스 방어.
#[tauri::command]
pub async fn focus_start<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if !matches!(current_phase(), Phase::Idle) {
        return Ok(());
    }
    // Idle 상태에서 슬립 후 깨어났을 때 발생한 stale wake 이벤트가 atomic에 남아있으면
    // 새 Focus 세션의 첫 tick에서 잘못 차감되므로 여기서 폐기한다.
    let _ = crate::power::drain_wake_event();
    let minutes = read_minutes(&app, FOCUS_MINUTES_KEY, DEFAULT_FOCUS_MINUTES);
    // Phase 8 R-G2: Focus 시작 시 누적 점수 리셋.
    reset_session_totals();
    // Phase 10 FR-4 (BR-2): Idle 가드 통과 후 Focus 시작 시각 기록. 비Idle 재호출은 위 early return으로 차단.
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    FOCUS_START_AT_MS.store(now_ms, Ordering::Release);
    store_phase(Phase::Focus);
    store_time_left(minutes.saturating_mul(60));
    write_active_phase(&app, "focus");
    Ok(())
}

/// 진행 중 세션 폐기 (FR-4c).
///
/// 현재 phase가 Focus|Break이 아니면 no-op. 그 외에는 atomic을 Idle로 리셋하고
/// `active_phase`를 `"idle"`로 영속한다.
#[tauri::command]
pub async fn discard_session<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    match current_phase() {
        Phase::Focus | Phase::Break => {
            store_phase(Phase::Idle);
            store_time_left(0);
            write_active_phase(&app, "idle");
            // Phase 10 DEC-10-7: Discarded 경로 cleanup. SessionLog 미적재.
            FOCUS_START_AT_MS.store(0, Ordering::Release);
        }
        _ => {}
    }
    Ok(())
}

// =====================================================================
// 내부 함수 (score::tick에서 호출)
// =====================================================================

/// Phase 자동 전환 부수효과 (FR-4a/4b, FR-4a-notif/4b-notif).
///
/// - Focus → Break: atomic Break + time_left=break_minutes*60, "휴식 시작" 알림,
///   `active_phase`="break" 영속.
/// - Break → Complete: atomic Complete + time_left=0, "세션 완료" OS 알림.
///   토스트 emit + atomic Idle 복귀 + `active_phase`="idle" 영속은 본 함수에서 수행하지 않는다.
///   `score::tick_loop`이 본 tick에서 score-tick(Complete)을 emit한 직후 `on_complete_consumed`을
///   호출하여 토스트 발화 — JS 측에서 score-tick(Complete) 수신과 토스트 수신 순서를 보장한다 (AC-3).
pub fn on_phase_transition<R: Runtime>(app: &AppHandle<R>, from: Phase, to: Phase) {
    match (from, to) {
        (Phase::Focus, Phase::Break) => {
            let minutes = read_minutes(app, BREAK_MINUTES_KEY, DEFAULT_BREAK_MINUTES);
            store_phase(Phase::Break);
            store_time_left(minutes.saturating_mul(60));
            send_notification(app, "휴식 시작", "잠깐 쉬어가세요.");
            write_active_phase(app, "break");
        }
        (Phase::Break, Phase::Complete) => {
            store_phase(Phase::Complete);
            store_time_left(0);
            send_notification(app, "세션 완료", "고생했습니다.");
            // 토스트 + active_phase=idle은 score::tick_loop의 emit 직후 on_complete_consumed에서 수행.
            // 토스트가 score-tick Complete payload보다 먼저 JS에 도달하지 않도록 순서 보장.
        }
        _ => {
            // 정상 흐름에서 호출되지 않는 조합. 방어적 no-op.
        }
    }
}

/// Complete 1-tick emit 후 Idle 복귀 (FR-4b, AC-3).
///
/// score::tick에서 `match Phase::Complete` 분기 진입 시 호출된다.
/// atomic을 Idle로 리셋 + `active_phase`="idle" 영속만 담당.
///
/// 토스트 발화는 Phase 5(character)에서 frontend MainScreen이 sessionComplete
/// 캐릭터 멘트로 push한다. FR-35: SpeechBubble과 토스트에 동일한 캐릭터 멘트가
/// 표시되도록 frontend 단일 발화 — 본 함수에서 emit_toast를 호출하면 중복 표시됨.
///
/// Phase 8 R-G1: 세션 평균을 산출하여 sessions 키에 직접 적재한다.
/// Rust 단일 writer 정책 (active_phase 패턴 동일). 적재 실패는 swallow — UI에 영향 없음.
pub fn on_complete_consumed<R: Runtime>(app: &AppHandle<R>) {
    if current_phase() != Phase::Complete {
        return;
    }
    // 외부 가드(위)에서 Phase::Complete 진입이 보장되므로 내부 재검사 불필요.
    // DEC-10-8: snapshot_and_reset_session_avg()는 부수효과(누적값 리셋)가 있으므로
    // 외부 가드를 변경할 때 비정상 경로에서 호출되지 않도록 주의.

    let avg = snapshot_and_reset_session_avg();
    // 1. sessions 적재 (in-memory only, DEC-10-8).
    if let Err(e) = append_session_record(app, avg) {
        eprintln!("[mohashim] append_session_record failed: {e}");
        // record 실패 시 session_logs도 적재하지 않고 store.save도 호출하지 않는다.
        // sessions와 session_logs 부분 일관성을 회피한다 (Q1 결정).
        // 후속 phase 처리(store_phase Idle 등)는 그대로 수행 — phase 정상 복귀 보장.
        // FOCUS_START_AT_MS도 cleanup하여 stale 시각이 남지 않도록 한다 (DEC-10-7).
        //
        // Phase 13 MA-3 (silent drop): 본 분기에서 SESSION_TODOS_DONE buffer를 drain하지
        // 않는다. 후속 store_phase(Idle)의 collateral clear가 buffer를 비우므로 todo ID는
        // silent drop된다. sessions/session_logs 적재 실패 시 todo도 함께 폐기하여 일관성을
        // 유지하는 정책 — todo만 별도 저장소가 없는 상태에서 분리 적재는 부분 일관성을 만든다.
        FOCUS_START_AT_MS.store(0, Ordering::Release);
    } else {
        // 2. SessionLog 적재 (FR-4, DEC-10-2/3, DEC-10-7 swap cleanup).
        let start_ms = FOCUS_START_AT_MS.swap(0, Ordering::AcqRel);
        let end_local = chrono::Local::now();
        let end_at_iso = end_local.to_rfc3339();
        let date_str = end_local.format("%Y-%m-%d").to_string();
        // timestamp_millis()는 i64 — Unix epoch 이전(현실 거의 없음) 음수 가능.
        // FOCUS_START_AT_MS와 동일하게 u64로 통일 (음수는 0으로 가드).
        let end_ms = end_local.timestamp_millis().max(0) as u64;
        // start_ms == 0이면 cleanup 후 재진입 또는 timestamp_millis_opt 변환 실패.
        // end_at_iso로 폴백하면 start_at == end_at이 되어 duration_mins(설정값)와
        // (end_at - start_at)이 불일치한다 — 본 Phase 수용 edge case (PRD 미명시,
        // 비정상 경로). Phase 13 상세 조회 도입 시 정합 정책 재검토.
        let start_at_iso = if start_ms > 0 {
            use chrono::TimeZone;
            chrono::Local
                .timestamp_millis_opt(start_ms as i64)
                .single()
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_else(|| end_at_iso.clone())
        } else {
            end_at_iso.clone()
        };
        let duration_mins = read_minutes(app, FOCUS_MINUTES_KEY, DEFAULT_FOCUS_MINUTES) as u32;
        let id = format!("sl-{}-{}", end_ms, avg);
        // Phase 13 FR-16: success path에서만 buffer drain → session_logs 적재.
        // 실패 path는 위 분기에서 silent drop (MA-3).
        let todos_done = crate::score::shared::drain_todos();
        let log_ok = match crate::storage::append_session_log(
            app,
            &id,
            &date_str,
            &start_at_iso,
            &end_at_iso,
            duration_mins,
            avg,
            todos_done,
        ) {
            Ok(()) => true,
            Err(e) => {
                eprintln!("[mohashim] append_session_log failed: {e}");
                false
            }
        };
        // 3. 단일 save 원자화 (DEC-10-8): log 성공 시에만 save 호출.
        // log 실패 시 save를 skip하여 sessions/session_logs 부분 일관성을 회피한다 —
        // 두 적재가 모두 in-memory 성공한 경우에만 disk persist. log 실패 시 sessions
        // in-memory 변경은 다음 store load 시 폐기되어 자연 회복 (Q1 정책 일관 확장).
        if log_ok {
            if let Ok(store) = app.store(STORE_FILE) {
                if let Err(e) = store.save() {
                    eprintln!("[mohashim] on_complete_consumed save failed: {e}");
                }
            }
        }
    }
    // record 실패 여부와 무관하게 phase 정상 복귀 보장 (Q1).
    store_phase(Phase::Idle);
    store_time_left(0);
    write_active_phase(app, "idle");
}

/// sessions 키 적재 (R-G1, FR-16, BR-G4).
///
/// 같은 날짜 키가 이미 있으면 sessions++ + 가중 평균 갱신. 없으면 신규 1회 레코드.
/// 자정 경계는 chrono::Local 기준 — 23:55 시작 → 00:05 Complete 시 익일 적재.
///
/// Phase 10 DEC-10-8: store.set만 수행하고 store.save()는 호출자(`on_complete_consumed`)가
/// session_logs 적재와 묶어 단일 save로 원자화한다. sessions/session_logs 부분 일관성 회피.
///
/// Phase 12 GAP fix: 기존 레코드의 `todos_completed` 필드를 보존한다 — 같은 날 todo 체크
/// (storage::record_todo_completion) 후 세션 완료 시 이전에 적재된 todos_completed가
/// 0으로 덮어써지면 잔디 데이터가 손실되므로, 순수 함수 `apply_session_record`로 분리하여
/// 기존 객체 위에 sessions/avg/sum/date만 덮어쓰는 머지 정책을 적용한다.
fn append_session_record<R: Runtime>(app: &AppHandle<R>, score: u32) -> Result<(), String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    let raw = store.get("sessions").unwrap_or(json!({}));
    let mut map = if let Some(obj) = raw.as_object() {
        obj.clone()
    } else {
        serde_json::Map::new()
    };

    apply_session_record(&mut map, &today, score);
    store.set("sessions", Value::Object(map));
    // save는 호출자가 단일 처리 (DEC-10-8).
    Ok(())
}

/// sessions[date] 갱신 순수 함수 — 세션 완료 1회분의 sessions/avg/sum 갱신만 수행하고
/// 기존 `todos_completed`는 보존한다 (Phase 12 GAP fix).
///
/// `storage::apply_todo_delta`의 머지 정책과 대칭: 한 writer는 자기 책임 필드만 갱신하고
/// 상대 writer 필드는 보존하여 두 경로(세션 완료 / todo 체크)가 같은 날에 공존할 수 있도록 한다.
pub(crate) fn apply_session_record(
    sessions: &mut serde_json::Map<String, Value>,
    date: &str,
    score: u32,
) {
    let existing = sessions.get(date).and_then(|v| v.as_object()).cloned();
    let (new_sessions, new_avg, new_sum, todos_completed) = if let Some(ref e) = existing {
        let old_sessions = e.get("sessions").and_then(|v| v.as_u64()).unwrap_or(0);
        // `sum` 필드 우선 사용. 레거시 레코드(sum 미존재)는 avg*sessions으로 역산 (호환성).
        let old_sum = e.get("sum").and_then(|v| v.as_u64()).unwrap_or_else(|| {
            e.get("avg")
                .and_then(|v| v.as_u64())
                .unwrap_or(0)
                .saturating_mul(old_sessions)
        });
        let s = old_sessions + 1;
        let total_sum = old_sum + score as u64;
        let avg = (total_sum + s / 2) / s; // 반올림 평균
        // 기존 todos_completed 보존 (없으면 None).
        let todos = e.get("todos_completed").and_then(|v| v.as_u64());
        (s as u32, avg as u32, total_sum, todos)
    } else {
        (1u32, score, score as u64, None)
    };

    let mut next = serde_json::Map::new();
    next.insert("date".into(), json!(date));
    next.insert("sessions".into(), json!(new_sessions));
    next.insert("avg".into(), json!(new_avg));
    next.insert("sum".into(), json!(new_sum));
    if let Some(t) = todos_completed {
        next.insert("todos_completed".into(), json!(t));
    }
    sessions.insert(date.to_string(), Value::Object(next));
}

/// 슬립 grace 초과 자동 Discarded (DEC-10b, FR-toast-sleep, AC-9).
pub fn on_sleep_overflow_discard<R: Runtime>(app: &AppHandle<R>) {
    store_phase(Phase::Idle);
    store_time_left(0);
    write_active_phase(app, "idle");
    // Phase 10 DEC-10-7: Discarded 경로 cleanup. SessionLog 미적재.
    FOCUS_START_AT_MS.store(0, Ordering::Release);
    emit_toast(
        app,
        "sleep_discard",
        "슬립 시간이 길어 세션이 종료되었습니다",
    );
}

/// 부트 시점 진행 중 세션 자동 Discarded (DEC-11, BR-phase-3).
///
/// 스토어 `active_phase`가 `"focus"` 또는 `"break"`이면 `"idle"`로 리셋한다.
/// in-memory atomic은 default(Idle=0)이므로 별도 갱신 불필요.
/// **반드시 `score::start` 호출 이전에 실행해야 한다** (lib.rs setup 순서).
pub fn auto_discard_on_boot<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    let value = store.get(ACTIVE_PHASE_KEY).unwrap_or(Value::Null);
    let active = value.as_str().unwrap_or("idle");
    if active == "focus" || active == "break" {
        write_active_phase(app, "idle");
        // Phase 10 DEC-10-7: 부트 시점 자동 Discarded cleanup. in-memory atomic은 default 0이지만,
        // 미래에 부트 시 atomic을 미리 로드하더라도 안전하도록 명시 리셋.
        FOCUS_START_AT_MS.store(0, Ordering::Release);
    }
    Ok(())
}

/// atomic 강제 리셋 (storage::reset_all에서 호출).
///
/// store는 reset_all 내에서 clear→seed로 처리되므로 본 함수는 atomic만 담당한다.
pub fn reset_runtime_state() {
    store_phase(Phase::Idle);
    store_time_left(0);
    // Phase 10 DEC-10-7: reset_all 후 stale FOCUS_START_AT_MS 차단.
    FOCUS_START_AT_MS.store(0, Ordering::Release);
}

// =====================================================================
// 내부 헬퍼
// =====================================================================

/// `active_phase` 스토어 키 단일 writer.
///
/// 실패는 eprintln 후 무시 (FR-notif-fallback과 동일 정책 — 부수효과 실패가
/// 카운트다운 동작을 차단하지 않도록).
fn write_active_phase<R: Runtime>(app: &AppHandle<R>, value: &str) {
    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[mohashim] timer write_active_phase store open failed: {e}");
            return;
        }
    };
    store.set(ACTIVE_PHASE_KEY, json!(value));
    if let Err(e) = store.save() {
        eprintln!("[mohashim] timer write_active_phase save failed: {e}");
    }
}

/// `focus_minutes` / `break_minutes` 스토어 read. 누락/타입 불일치 시 default.
///
/// store가 외부 편집/손상으로 0/1/9999 등 비정상 값을 반환해도 비정상 세션이
/// 생성되지 않도록 UI canSave와 동일한 범위로 clamp 한다 (단일 진실 소스).
fn read_minutes<R: Runtime>(app: &AppHandle<R>, key: &str, default: u64) -> u64 {
    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[mohashim] timer read_minutes store open failed: {e}");
            return default;
        }
    };
    let raw = match store.get(key) {
        Some(v) => v.as_u64().unwrap_or(default),
        None => default,
    };
    let (min, max) = match key {
        FOCUS_MINUTES_KEY => (FOCUS_MINUTES_MIN, FOCUS_MINUTES_MAX),
        BREAK_MINUTES_KEY => (BREAK_MINUTES_MIN, BREAK_MINUTES_MAX),
        _ => (default, default),
    };
    raw.clamp(min, max)
}

/// OS 알림 발송 (FR-4a-notif, FR-4b-notif, FR-notif-fallback).
///
/// 권한 거절/플러그인 실패 시 Err 무시 — 앱 카운트다운 동작에 영향 없음.
fn send_notification<R: Runtime>(app: &AppHandle<R>, title: &str, body: &str) {
    // BR-notif-guard 방어: 정상 흐름에서는 호출 경로가 없지만, 미래 회귀 차단을 위해
    // Focus 중 알림 발송을 명시적으로 차단한다.
    if matches!(current_phase(), Phase::Focus) {
        return;
    }
    // FR-21: notifications_enabled=false면 OS 알림 발송 차단. 누락/실패 시 default true (BR-6).
    if !crate::storage::get_notifications_enabled(app) {
        return;
    }
    if let Err(e) = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show()
    {
        eprintln!("[mohashim] notification show failed: {e}");
    }
}

/// 토스트 emit (FR-toast-complete, FR-toast-sleep).
fn emit_toast<R: Runtime>(app: &AppHandle<R>, kind: &str, text: &str) {
    if let Err(e) = app.emit("toast", json!({ "kind": kind, "text": text })) {
        eprintln!("[mohashim] toast emit failed: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::apply_session_record;
    use serde_json::json;

    /// Phase 12 GAP fix: 기존 todos_completed=N 상태에서 세션 완료 적재 시 N 보존.
    #[test]
    fn apply_session_record_preserves_existing_todos_completed() {
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
        apply_session_record(&mut sessions, "2026-05-06", 80);
        let entry = sessions
            .get("2026-05-06")
            .and_then(|v| v.as_object())
            .expect("레코드 존재");
        // sessions/avg/sum은 정상 갱신.
        assert_eq!(entry.get("sessions"), Some(&json!(1)));
        assert_eq!(entry.get("avg"), Some(&json!(80)));
        assert_eq!(entry.get("sum"), Some(&json!(80)));
        // todos_completed는 기존 값 유지.
        assert_eq!(entry.get("todos_completed"), Some(&json!(3)));
        assert_eq!(entry.get("date"), Some(&json!("2026-05-06")));
    }

    /// 기존 sessions=N + todos_completed=M 상태에서 세션 +1 시 둘 다 정합 갱신.
    #[test]
    fn apply_session_record_merges_with_existing_session_and_todos() {
        let mut sessions = serde_json::Map::new();
        sessions.insert(
            "2026-05-06".into(),
            json!({
                "date": "2026-05-06",
                "sessions": 2,
                "avg": 60,
                "sum": 120,
                "todos_completed": 5,
            }),
        );
        apply_session_record(&mut sessions, "2026-05-06", 90);
        let entry = sessions
            .get("2026-05-06")
            .and_then(|v| v.as_object())
            .unwrap();
        assert_eq!(entry.get("sessions"), Some(&json!(3)));
        // (120 + 90 + 3/2) / 3 = (210 + 1) / 3 = 70.
        assert_eq!(entry.get("avg"), Some(&json!(70)));
        assert_eq!(entry.get("sum"), Some(&json!(210)));
        assert_eq!(entry.get("todos_completed"), Some(&json!(5)));
    }

    /// 기존 레코드 부재 시 정상 신규 생성 — todos_completed 필드는 미존재.
    #[test]
    fn apply_session_record_creates_new_record_without_todos_field() {
        let mut sessions = serde_json::Map::new();
        apply_session_record(&mut sessions, "2026-05-06", 75);
        let entry = sessions
            .get("2026-05-06")
            .and_then(|v| v.as_object())
            .expect("신규 레코드 생성");
        assert_eq!(entry.get("sessions"), Some(&json!(1)));
        assert_eq!(entry.get("avg"), Some(&json!(75)));
        assert_eq!(entry.get("sum"), Some(&json!(75)));
        // todos_completed 미존재 (None) — todo 체크 경로 미진입 정상 케이스.
        assert!(entry.get("todos_completed").is_none());
        assert_eq!(entry.get("date"), Some(&json!("2026-05-06")));
    }

    /// 레거시 레코드(sum 필드 부재)에서 avg*sessions로 역산 + todos_completed 보존.
    #[test]
    fn apply_session_record_legacy_sum_fallback_preserves_todos() {
        let mut sessions = serde_json::Map::new();
        sessions.insert(
            "2026-05-06".into(),
            json!({
                "date": "2026-05-06",
                "sessions": 2,
                "avg": 50,
                // sum 필드 부재 — avg*sessions = 100 로 역산.
                "todos_completed": 2,
            }),
        );
        apply_session_record(&mut sessions, "2026-05-06", 70);
        let entry = sessions
            .get("2026-05-06")
            .and_then(|v| v.as_object())
            .unwrap();
        assert_eq!(entry.get("sessions"), Some(&json!(3)));
        // (100 + 70 + 3/2) / 3 = (170 + 1) / 3 = 57.
        assert_eq!(entry.get("avg"), Some(&json!(57)));
        assert_eq!(entry.get("sum"), Some(&json!(170)));
        assert_eq!(entry.get("todos_completed"), Some(&json!(2)));
    }
}
