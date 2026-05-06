//! 뽀모도로 타이머 도메인 (FR-4, FR-4a/b/c, FR-21, FR-22, DEC-11).
//!
//! Phase 전이의 부수효과(스토어 `active_phase` 기록, OS 알림 발송, 토스트 emit)를
//! 한 곳에 집약한다. **`active_phase` 스토어 키의 write는 본 모듈에서만 수행**한다 —
//! Rust 단일 writer 정책으로 race 차단 (MUST-1).

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

/// 슬립 grace 기준 (BR-sleep-1, DEC-10a/b). wall-clock 경과 ≤ 180s: 세션 유지.
pub const SLEEP_GRACE_SECS: u64 = 180;

const FOCUS_MINUTES_KEY: &str = "focus_minutes";
const BREAK_MINUTES_KEY: &str = "break_minutes";
const DEFAULT_FOCUS_MINUTES: u64 = 25;
const DEFAULT_BREAK_MINUTES: u64 = 5;

/// UI canSave가 보장하는 focus/break 분(分) 범위. 손상/외부 편집 케이스 방어용.
pub const FOCUS_MINUTES_MIN: u64 = 5;
pub const FOCUS_MINUTES_MAX: u64 = 90;
pub const BREAK_MINUTES_MIN: u64 = 3;
pub const BREAK_MINUTES_MAX: u64 = 30;

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

    let avg = snapshot_and_reset_session_avg();
    if current_phase() == Phase::Complete {
        if let Err(e) = append_session_record(app, avg) {
            eprintln!("[mohashim] append_session_record failed: {e}");
        }
    }
    store_phase(Phase::Idle);
    store_time_left(0);
    write_active_phase(app, "idle");
}

/// sessions 키 적재 (R-G1, FR-16, BR-G4).
///
/// 같은 날짜 키가 이미 있으면 sessions++ + 가중 평균 갱신. 없으면 신규 1회 레코드.
/// 자정 경계는 chrono::Local 기준 — 23:55 시작 → 00:05 Complete 시 익일 적재.
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

    let (new_sessions, new_avg, new_sum) = if let Some(e) = map.get(&today).and_then(|v| v.as_object()) {
        let old_sessions = e.get("sessions").and_then(|v| v.as_u64()).unwrap_or(0);
        // `sum` 필드 우선 사용. 레거시 레코드(sum 미존재)는 avg*sessions으로 역산 (호환성).
        let old_sum = e.get("sum").and_then(|v| v.as_u64()).unwrap_or_else(|| {
            e.get("avg").and_then(|v| v.as_u64()).unwrap_or(0).saturating_mul(old_sessions)
        });
        let s = old_sessions + 1;
        let total_sum = old_sum + score as u64;
        let avg = (total_sum + s / 2) / s; // 반올림 평균
        (s as u32, avg as u32, total_sum)
    } else {
        (1u32, score, score as u64)
    };

    map.insert(
        today.clone(),
        json!({
            "date": today,
            "sessions": new_sessions,
            "avg": new_avg,
            "sum": new_sum,
        }),
    );
    store.set("sessions", Value::Object(map));
    store.save().map_err(|e| format!("store save failed: {e}"))?;
    Ok(())
}

/// 슬립 grace 초과 자동 Discarded (DEC-10b, FR-toast-sleep, AC-9).
pub fn on_sleep_overflow_discard<R: Runtime>(app: &AppHandle<R>) {
    store_phase(Phase::Idle);
    store_time_left(0);
    write_active_phase(app, "idle");
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
    }
    Ok(())
}

/// atomic 강제 리셋 (storage::reset_all에서 호출).
///
/// store는 reset_all 내에서 clear→seed로 처리되므로 본 함수는 atomic만 담당한다.
pub fn reset_runtime_state() {
    store_phase(Phase::Idle);
    store_time_left(0);
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
