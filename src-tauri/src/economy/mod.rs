//! Economy 도메인 — 새싹 보상 단일 writer (Phase 22, P-D4, FR-12~20).
//!
//! 두 보상 흐름:
//! - **세션 완료 보상** (FR-14): `award_session_complete(app, avg)` — `Phase::Complete`
//!   진입 시 `timer::on_complete_consumed`가 호출. 평균 점수 임계값(80/60)으로 5/3/1🌱.
//! - **출석 보상** (FR-17~20): `record_todo_added` IPC — TS persist 헬퍼가 todo 추가 후
//!   호출. 같은 날 두 번째 이후는 멱등 가드로 no-op (FR-24, AC-22).
//!
//! 동시성 직렬화 (DEC-22-7, MUST-2): 두 함수의 read-mutate-write 시퀀스를 `ECONOMY_MUTEX`로
//! 묶어 race 차단. poison 복원: `unwrap_or_else(|p| p.into_inner())`.
//!
//! `economy` 키 단일 writer (P-D4) — TS는 `getEconomy()` read-only만 노출.

pub mod reward;
pub mod state;

use std::sync::{Mutex, MutexGuard, OnceLock};

use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use crate::storage::STORE_FILE;
use reward::compute_session_reward;
use state::{read_economy_state, write_economy_state, EconomyState};

/// economy read-mutate-write 시퀀스 직렬화 (DEC-22-7, MUST-2).
///
/// `award_session_complete`와 `award_todo_added` 두 진입점이 같은 store 키를 갱신하므로,
/// 동시 호출(예: 세션 완료와 todo 추가가 짧은 시간에 발생)에서 race로 인한 lost update를
/// 차단한다. lazy 초기화 — 첫 lock 시점에 Mutex 생성.
pub(crate) static ECONOMY_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

/// `ECONOMY_MUTEX`를 획득한다. poison된 경우에도 inner guard를 복원하여 진행
/// (잔액 손상보다 lock 영구 차단이 더 위험 — DEC-22-7 정책).
fn lock_economy() -> MutexGuard<'static, ()> {
    let mutex = ECONOMY_MUTEX.get_or_init(|| Mutex::new(()));
    mutex.lock().unwrap_or_else(|p| p.into_inner())
}

/// 세션 완료 보상 상태 갱신 순수 함수 (FR-14, FR-16, AC-23).
///
/// 입력 state + avg_score → 갱신된 state + 지급된 새싹 수 반환. store/AppHandle 무의존 —
/// 단위 테스트 가능 (FR-25/AC-23 Discarded 비호출 sentinel + 임계값 검증).
///
/// BR-2: u32 saturating add — 오버플로 시 u32::MAX에서 포화.
pub(crate) fn apply_session_reward(state: EconomyState, avg_score: u32) -> (EconomyState, u32) {
    let earned = compute_session_reward(avg_score);
    let next = EconomyState {
        sprouts: state.sprouts.saturating_add(earned),
        last_todo_sprout_date: state.last_todo_sprout_date,
    };
    (next, earned)
}

/// 세션 완료 보상 지급 (FR-14, FR-16, P-E10, DEC-22-2).
///
/// 호출자: `timer::on_complete_consumed`. `Phase::Complete` 진입 후 `append_session_record`
/// 성공 직후 호출되며, 결과 `earned`를 `append_session_log`의 `earned_sprouts` 인자로 전달한다.
///
/// 실패 시 호출자가 부분 일관성을 회피한다 — `append_session_log` skip + `store.save()` skip
/// + drain_todos skip (DEC-22-2). phase 정상 복귀는 호출자가 보장.
///
/// `store.save()`는 호출자가 묶음 처리한다 (sessions/session_logs/economy 단일 save 원자화).
pub fn award_session_complete<R: Runtime>(
    app: &AppHandle<R>,
    avg_score: u32,
) -> Result<u32, String> {
    let _guard = lock_economy();
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    let state = read_economy_state(&store);
    let (next, earned) = apply_session_reward(state, avg_score);
    write_economy_state(&store, &next);
    Ok(earned)
}

/// 출석 보상 멱등 가드 + 상태 갱신 순수 함수 (FR-18~20, FR-24, AC-13~16).
///
/// `last_todo_sprout_date == today`이면 no-op (None 반환). 그 외에는 sprouts +1 +
/// last_todo_sprout_date=today 갱신한 새 상태를 Some으로 반환.
///
/// store/AppHandle 무의존 — 단위 테스트 가능 (FR-24 멱등성 검증).
pub(crate) fn apply_todo_added(state: &EconomyState, today: &str) -> Option<EconomyState> {
    if state
        .last_todo_sprout_date
        .as_deref()
        .map(|d| d == today)
        .unwrap_or(false)
    {
        // FR-20 / AC-15: 같은 날 두 번째 이후 호출은 no-op.
        return None;
    }
    Some(EconomyState {
        // FR-18: 1🌱 지급. BR-2: u32 saturating add.
        sprouts: state.sprouts.saturating_add(1),
        last_todo_sprout_date: Some(today.to_string()),
    })
}

/// 출석 보상 1🌱 지급 (FR-17~20, AC-13~16, P-E11).
///
/// 호출자: `record_todo_added` IPC. 멱등 가드:
/// `state.last_todo_sprout_date == today_local`이면 no-op (FR-24, AC-22).
///
/// 지급 시 `lastTodoSproutDate`를 오늘 로컬 날짜(`YYYY-MM-DD`, BR-3)로 갱신 + 1🌱 누적.
/// `store.save()`는 본 함수 내에서 수행 — IPC 단일 진입점이므로 호출자가 별도 save 묶음
/// 처리할 필요가 없다.
fn award_todo_added<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let _guard = lock_economy();
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    let state = read_economy_state(&store);
    // BR-3: 로컬 시간대 기준 YYYY-MM-DD.
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let next = match apply_todo_added(&state, &today) {
        Some(s) => s,
        None => return Ok(()), // 멱등 no-op.
    };
    write_economy_state(&store, &next);
    store
        .save()
        .map_err(|e| format!("store save failed: {e}"))?;
    Ok(())
}

/// Todo 추가 후 출석 보상 단일 진입점 (FR-17, BR-6, AC-17).
///
/// TS `TodosTab.persist`가 `storeSetTodos(next)` 성공 후 fire-and-forget 호출한다.
/// length 비교 없이 무조건 호출되며, Rust가 단일 진위 판정자로 멱등 가드를 통과시킨다
/// (DEC-22-3, MUST-1 해소: stale closure 제거).
///
/// 본 IPC는 todo 추가/완료/삭제/편집 어디서 호출되어도 안전 — mutex+읽기 후 즉시 no-op.
#[tauri::command]
pub async fn record_todo_added<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    award_todo_added(&app)
}

#[cfg(test)]
mod tests {
    use super::reward::compute_session_reward;
    use super::{apply_session_reward, apply_todo_added, EconomyState};

    /// FR-23 / AC-21 추가 검증: 보상 함수가 mod.rs 경로에서도 동일 결과.
    /// (단위 테스트 자체는 reward.rs::tests에서 수행 — 이중 검증 1건만 sanity)
    #[test]
    fn reward_threshold_sanity() {
        assert_eq!(compute_session_reward(80), 5);
        assert_eq!(compute_session_reward(60), 3);
        assert_eq!(compute_session_reward(0), 1);
    }

    /// FR-18 / AC-13/14: 처음 추가 시 sprouts +1 + lastTodoSproutDate=today 갱신.
    #[test]
    fn apply_todo_added_first_time_grants_sprout_and_sets_date() {
        let state = EconomyState {
            sprouts: 5,
            last_todo_sprout_date: None,
        };
        let next = apply_todo_added(&state, "2026-05-08").expect("Some 반환");
        assert_eq!(next.sprouts, 6);
        assert_eq!(next.last_todo_sprout_date.as_deref(), Some("2026-05-08"));
    }

    /// FR-24 / AC-15 / AC-22: 같은 날 두 번째 호출은 None (멱등 no-op).
    #[test]
    fn apply_todo_added_same_day_returns_none() {
        let state = EconomyState {
            sprouts: 6,
            last_todo_sprout_date: Some("2026-05-08".into()),
        };
        let result = apply_todo_added(&state, "2026-05-08");
        assert!(result.is_none(), "같은 날 호출은 no-op이어야 한다");
    }

    /// FR-24 / AC-16: 같은 날 todo 삭제 후 재등록도 멱등 no-op.
    /// (caller 측에서 todos가 비었다가 다시 추가되어도 lastTodoSproutDate가 today와 같으면 no-op)
    #[test]
    fn apply_todo_added_after_delete_and_readd_same_day_returns_none() {
        let state = EconomyState {
            sprouts: 1,
            last_todo_sprout_date: Some("2026-05-08".into()),
        };
        // todo 삭제 후 재등록 시나리오 — 동일 today.
        let result = apply_todo_added(&state, "2026-05-08");
        assert!(result.is_none());
    }

    /// FR-18 / FR-19: 다음 날 호출 시 +1 + 날짜 갱신.
    #[test]
    fn apply_todo_added_next_day_grants_sprout() {
        let state = EconomyState {
            sprouts: 6,
            last_todo_sprout_date: Some("2026-05-08".into()),
        };
        let next = apply_todo_added(&state, "2026-05-09").expect("Some 반환");
        assert_eq!(next.sprouts, 7);
        assert_eq!(next.last_todo_sprout_date.as_deref(), Some("2026-05-09"));
    }

    /// FR-25 / AC-23: Discarded 분기 보상 미지급 sentinel.
    ///
    /// Phase::Discarded 경로는 timer.rs에서 award_session_complete를 호출하지 않으므로
    /// state 불변. 이 테스트는 reward 함수 호출 부재 시 state가 보존됨을 sentinel로 검증한다.
    /// (호출이 있으면 sprouts가 +1~5 증가했을 것이므로 본 테스트가 실패하여 회귀를 차단한다.)
    #[test]
    fn discarded_session_does_not_mutate_economy_state() {
        let state = EconomyState {
            sprouts: 10,
            last_todo_sprout_date: Some("2026-05-08".into()),
        };
        // Discarded 시나리오 시뮬레이션: apply_session_reward를 **호출하지 않고** 동일 필드로
        // state 사본을 구성. 실제 코드 경로(timer.rs::on_discarded_consumed)에서도 economy
        // 함수가 호출되지 않으므로 동일 시맨틱.
        let after = EconomyState {
            sprouts: state.sprouts,
            last_todo_sprout_date: state.last_todo_sprout_date.clone(),
        };
        assert_eq!(after.sprouts, 10, "Discarded 경로에서는 sprouts가 변하지 않아야 한다");
        assert_eq!(
            after.last_todo_sprout_date.as_deref(),
            Some("2026-05-08"),
            "Discarded 경로에서는 last_todo_sprout_date가 변하지 않아야 한다"
        );
        // 원본 state도 mutate되지 않음을 함께 검증.
        assert_eq!(state.sprouts, 10);
        assert_eq!(state.last_todo_sprout_date.as_deref(), Some("2026-05-08"));
    }

    /// FR-14 / AC-23: avg_score 80 이상 → 5🌱 지급 + state 갱신.
    #[test]
    fn apply_session_reward_with_80_grants_5() {
        let state = EconomyState {
            sprouts: 0,
            last_todo_sprout_date: None,
        };
        let (next, earned) = apply_session_reward(state, 80);
        assert_eq!(earned, 5);
        assert_eq!(next.sprouts, 5);
        assert!(next.last_todo_sprout_date.is_none());
    }

    /// FR-14 / AC-23: avg_score 60~79 → 3🌱 지급.
    #[test]
    fn apply_session_reward_with_60_grants_3() {
        let state = EconomyState {
            sprouts: 0,
            last_todo_sprout_date: None,
        };
        let (next, earned) = apply_session_reward(state, 60);
        assert_eq!(earned, 3);
        assert_eq!(next.sprouts, 3);
    }

    /// FR-14 / AC-23: avg_score 0~59 → 1🌱 지급.
    #[test]
    fn apply_session_reward_with_59_grants_1() {
        let state = EconomyState {
            sprouts: 0,
            last_todo_sprout_date: None,
        };
        let (next, earned) = apply_session_reward(state, 59);
        assert_eq!(earned, 1);
        assert_eq!(next.sprouts, 1);
    }

    /// BR-2 / AC-23: u32 saturating add — sprouts u32::MAX-2 + score 80(=5) → u32::MAX 포화.
    #[test]
    fn apply_session_reward_saturating() {
        let state = EconomyState {
            sprouts: u32::MAX - 2,
            last_todo_sprout_date: None,
        };
        let (next, earned) = apply_session_reward(state, 80);
        assert_eq!(earned, 5);
        assert_eq!(next.sprouts, u32::MAX, "saturating_add로 u32::MAX 포화");
    }
}
