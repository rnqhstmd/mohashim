use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicU8, Ordering::Relaxed};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use crate::score::phase::Phase;

/// 앱 부트 기준 시각 (Q10). now_ms 계산 기준점.
pub static START_AT: OnceLock<Instant> = OnceLock::new();

/// 마지막 입력 발생 시각 (ms since START_AT). 0=미입력 센티넬.
pub static LAST_INPUT_AT_MS: AtomicU64 = AtomicU64::new(0);

/// 최신 EMA 근사값 (f32 bits). audio cb가 store, score tick이 load.
/// Relaxed ordering으로 일시적 staleness 허용 — 1Hz tick 해상도에서 무관.
pub static DB_EMA_BITS: AtomicU32 = AtomicU32::new(0);

/// 권한 게이팅 캐시 (start 시 1회 기록).
pub static MIC_GRANTED: AtomicBool = AtomicBool::new(false);
pub static AX_GRANTED: AtomicBool = AtomicBool::new(false);

/// score::start 멱등성 게이트 (MUST-5).
pub static SCORE_STARTED: AtomicBool = AtomicBool::new(false);

/// emit 실패 throttle 카운터 (MUST-4).
pub static EMIT_ERR_COUNT: AtomicU64 = AtomicU64::new(0);

/// 현재 phase. 0=Idle, 1=Focus, 2=Break, 3=Complete, 4=Discarded.
/// 단일 writer: timer.rs / score::tick(자동 전환). reader: score::tick.
pub static PHASE_BITS: AtomicU8 = AtomicU8::new(0);

/// 현재 세션 잔여 초. Idle/Discarded/Complete 시 0.
pub static TIME_LEFT_SECS: AtomicU64 = AtomicU64::new(0);

/// 슬립 진입 시각 (UNIX wall-clock ms). 0=미슬립.
/// monotonic Instant는 슬립 중 동결 → wall-clock 사용.
pub static SLEEP_AT_UNIX_MS: AtomicU64 = AtomicU64::new(0);

/// DidWake 발생 플래그. WillSleep과 짝지어 wake 이벤트 신호.
pub static WAKE_FLAG: AtomicBool = AtomicBool::new(false);

/// FR-2 / BR-noise-80: phase=Idle 상태에서 db_ema > NOISE_LOUD_THRESHOLD_DB 인 1Hz tick 카운터.
/// hysteresis 활용: NOISE_LOUD_HYSTERESIS_TICKS 도달 시 noiseLoud 활성, db≤80 또는
/// phase 전환 시 0 리셋 (Phase 11 FR-7~9, BR-5).
pub static IDLE_NOISE_LOUD_TICKS: AtomicU64 = AtomicU64::new(0);

/// FR-7 / BR-3 / BR-5: noiseLoud 활성 진입에 필요한 누적 틱 수 (5초 hysteresis).
pub const NOISE_LOUD_HYSTERESIS_TICKS: u64 = 5;

/// FR-2 / BR-noise-80 / BR-4: noiseLoud 판정 dB 임계값. 80은 미해당, 81 이상부터 누적.
pub const NOISE_LOUD_THRESHOLD_DB: f32 = 80.0;

/// 세션 점수 누적 합 (Focus 진행 중 매초 work+noise를 더함).
/// Focus 시작 시 0으로 리셋. Complete 1-tick에서 평균 산출 후 다시 0.
pub static SESSION_SCORE_SUM: AtomicU64 = AtomicU64::new(0);

/// 세션 점수 누적 카운트. 평균 = SUM / COUNT.
pub static SESSION_TICK_COUNT: AtomicU32 = AtomicU32::new(0);

/// Focus 시작 시 호출. 누적 변수를 0으로 리셋.
pub fn reset_session_totals() {
    SESSION_SCORE_SUM.store(0, std::sync::atomic::Ordering::Release);
    SESSION_TICK_COUNT.store(0, std::sync::atomic::Ordering::Release);
}

/// 매 Focus tick에 호출. work+noise 순간값을 누적.
pub fn accumulate_session_score(score: u32) {
    SESSION_SCORE_SUM.fetch_add(score as u64, std::sync::atomic::Ordering::AcqRel);
    SESSION_TICK_COUNT.fetch_add(1, std::sync::atomic::Ordering::AcqRel);
}

/// Complete 1-tick에서 호출. 세션 평균을 반환하고 누적 변수를 리셋.
/// COUNT가 0이면 0 반환 (Focus 진입 직후 즉시 Discarded 등 엣지).
pub fn snapshot_and_reset_session_avg() -> u32 {
    let sum = SESSION_SCORE_SUM.swap(0, std::sync::atomic::Ordering::AcqRel);
    let count = SESSION_TICK_COUNT.swap(0, std::sync::atomic::Ordering::AcqRel) as u64;
    if count == 0 {
        0
    } else {
        ((sum + count / 2) / count) as u32
    }
}

/// START_AT 기준 ms 경과. START_AT 미초기화 시 0 반환.
pub fn now_ms() -> u64 {
    match START_AT.get() {
        Some(start) => Instant::now().duration_since(*start).as_millis() as u64,
        None => 0,
    }
}

/// f32 EMA 값 atomic 저장.
pub fn store_db_ema(v: f32) {
    DB_EMA_BITS.store(v.to_bits(), Relaxed);
}

/// f32 EMA 값 atomic 로드.
pub fn load_db_ema() -> f32 {
    f32::from_bits(DB_EMA_BITS.load(Relaxed))
}

/// 입력 발생 시각 갱신 (rdev 콜백에서 단일 호출).
///
/// 호출 순서 의존성: `score::start`가 `START_AT.get_or_init` 후 input 스레드를 spawn하므로
/// 정상 경로에서는 ms > 0이 보장된다. 방어 코드로 ms==0 시 갱신을 건너뛴다 — 미초기화 상태에서
/// 0 저장 시 "미입력" 센티넬과 충돌하기 때문.
pub fn touch_input() {
    let ms = now_ms();
    if ms > 0 {
        LAST_INPUT_AT_MS.store(ms, Relaxed);
    }
}

/// 마지막 입력 후 경과 초. last가 0(미입력)이면 0 반환.
pub fn seconds_idle() -> u64 {
    let last = LAST_INPUT_AT_MS.load(Relaxed);
    if last == 0 {
        return 0;
    }
    let now = now_ms();
    if now <= last {
        return 0;
    }
    (now - last) / 1000
}

/// 현재 phase atomic 로드 (PHASE_BITS → Phase 디코드).
pub fn current_phase() -> Phase {
    Phase::from_u8(PHASE_BITS.load(Relaxed))
}

/// phase atomic 저장 (Phase → u8 인코드).
///
/// Phase 11 (MA-2): Idle 외 Phase 진입 시 hysteresis 카운터 자동 리셋.
/// timer.rs의 7개 호출 사이트(focus_start/break_start/discard 등)에 별도 reset
/// 호출이 필요 없도록 본 함수 내장. Idle→Idle 전이는 카운터 유지(FR-7 누적 보존).
///
/// Phase 13 FR-17 (MA-2): Idle/Focus 진입 시만 SESSION_TODOS_DONE buffer를 clear한다.
/// Break/Complete 진입 시 미clear — Break 중 todo 체크가 같은 세션에 누적되도록 보존하고,
/// Complete 진입 시 on_complete_consumed의 drain_todos가 buffer 내용을 session_logs로 적재한다.
/// (Phase 11 hysteresis 카운터의 "Idle 외 일괄 리셋" 패턴과 의도적으로 다름.)
pub fn store_phase(p: Phase) {
    PHASE_BITS.store(p.as_u8(), Relaxed);
    if !matches!(p, Phase::Idle) {
        reset_noise_loud_state();
    }
    // Phase 13 FR-17: Idle/Focus 진입 시 buffer clear. Break/Complete 미clear.
    if matches!(p, Phase::Idle | Phase::Focus) {
        clear_todos();
    }
}

/// FR-8 / FR-9 / BR-5: hysteresis 카운터 0 리셋.
/// 호출자: db≤80 / phase 전환 / store_phase 내장 호출.
pub fn reset_noise_loud_state() {
    IDLE_NOISE_LOUD_TICKS.store(0, Relaxed);
}

/// FR-7~9 / BR-3~5: idle+db>80 hysteresis 산출 (순수 함수).
///
/// atomic 의존 없이 입력값만으로 (new_count, active)를 결정한다 — tick_loop에서
/// fetch_update 클로저 안에서 호출 (PR #11 리뷰: load-store race 방지).
/// CON-2 단위 테스트 가능성을 위해 분리.
///
/// - phase != Idle → (0, false)  (BR-3: Idle 외 phase는 어떤 dB여도 누적 불가)
/// - phase == Idle && !(db > NOISE_LOUD_THRESHOLD_DB) → (0, false)
///   (BR-4: db=80 미증가 + NaN 방어 — `!(NaN > 80)`은 true이므로 NaN 입력 시 0 리셋)
/// - phase == Idle && db > NOISE_LOUD_THRESHOLD_DB  → (prev+1, prev+1 >= NOISE_LOUD_HYSTERESIS_TICKS)
pub fn apply_noise_loud_hysteresis(phase: Phase, db: f32, prev_count: u64) -> (u64, bool) {
    if !matches!(phase, Phase::Idle) || !(db > NOISE_LOUD_THRESHOLD_DB) {
        return (0, false);
    }
    let new_count = prev_count.saturating_add(1);
    let active = new_count >= NOISE_LOUD_HYSTERESIS_TICKS;
    (new_count, active)
}

/// 잔여 초 atomic 로드.
pub fn time_left_secs() -> u64 {
    TIME_LEFT_SECS.load(Relaxed)
}

/// 잔여 초 atomic 저장.
pub fn store_time_left(secs: u64) {
    TIME_LEFT_SECS.store(secs, Relaxed);
}

// ---------- 세션 todos_done buffer (Phase 13 FR-13) ----------

/// 현재 세션 중 완료된 todo의 ID 누적 buffer.
///
/// Rust 단일 writer (BR-6) — JS는 read-only. session_logs.todos_done 적재 전용.
/// CON-1: 별도 모듈로 분리하지 않고 본 shared.rs에 도메인 함수와 동거 (active_phase /
/// session score 누적과 동일한 통합 패턴).
///
/// 라이프사이클 (FR-17, store_phase 분기 + on_complete_consumed의 drain_todos):
/// - Idle/Focus 진입: clear (이전 세션 잔존 방어 + Discard/Sleep 잔존 cleanup).
/// - Break/Complete 진입: 미clear (Break 중 todo 누적 / drain 대기).
/// - on_complete_consumed success path: drain_todos로 session_logs 적재 + buffer 비움.
/// - append_session_record 실패: drain 미호출 → store_phase(Idle)의 collateral clear에
///   위임 (silent drop, MA-3).
pub static SESSION_TODOS_DONE: OnceLock<Mutex<Vec<String>>> = OnceLock::new();

/// buffer lazy init 헬퍼.
fn buffer() -> &'static Mutex<Vec<String>> {
    SESSION_TODOS_DONE.get_or_init(|| Mutex::new(Vec::new()))
}

/// FR-14 / BR-7: phase가 Focus|Break일 때만 todo_id를 push. 중복 차단(set 의미).
///
/// 반환값: push 성공 시 true, phase 가드 실패 또는 중복 차단 시 false.
/// Idle/Discarded/Complete 진입 시 호출 → 가드 false 반환 (AC-15).
pub fn push_todo(id: &str) -> bool {
    if !matches!(current_phase(), Phase::Focus | Phase::Break) {
        return false;
    }
    let mut buf = match buffer().lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(), // poison 복원
    };
    if buf.iter().any(|x| x == id) {
        return false;
    }
    buf.push(id.to_string());
    true
}

/// FR-15: buffer에서 todo_id 제거 (undo). 일치 항목이 있으면 제거 후 true.
///
/// phase 가드 없음 — undo는 어떤 phase에서도 호출될 수 있으나, buffer가 비어있거나
/// 일치 항목 없으면 단순 false 반환 (no-op).
pub fn remove_todo(id: &str) -> bool {
    let mut buf = match buffer().lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    if let Some(pos) = buf.iter().position(|x| x == id) {
        buf.remove(pos);
        true
    } else {
        false
    }
}

/// FR-16: buffer 내용 clone 반환 + 비움. on_complete_consumed success path 전용.
///
/// 호출 후 buffer는 빈 상태가 된다 — 후속 store_phase(Idle)의 clear는 no-op.
pub fn drain_todos() -> Vec<String> {
    let mut buf = match buffer().lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    // PR #14 리뷰 (gemini): std::mem::take로 clone+clear 일괄 처리.
    // 소유권 이동으로 불필요한 복사 방지 (idiomatic Rust).
    std::mem::take(&mut *buf)
}

/// FR-17: buffer 무조건 비움. store_phase(Idle/Focus)에서 호출.
pub fn clear_todos() {
    let mut buf = match buffer().lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    buf.clear();
}

/// 테스트 전용 — 현재 buffer 상태 스냅샷 (clone, 비파괴).
#[cfg(test)]
pub fn snapshot_todos() -> Vec<String> {
    let buf = match buffer().lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    buf.clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[test]
    fn db_ema_store_load_roundtrip() {
        store_db_ema(0.0);
        assert_eq!(load_db_ema(), 0.0);

        store_db_ema(60.0);
        assert!((load_db_ema() - 60.0).abs() < f32::EPSILON);

        store_db_ema(-12.5);
        assert!((load_db_ema() - (-12.5)).abs() < f32::EPSILON);
    }

    #[test]
    fn touch_input_then_seconds_idle_zero_or_more() {
        // START_AT 초기화 (다른 테스트와 공유될 수 있음).
        START_AT.get_or_init(Instant::now);
        touch_input();
        // 직후이므로 0초 ~ 1초 미만.
        let idle = seconds_idle();
        assert!(idle <= 1, "idle should be 0 or 1 right after touch, got {idle}");
    }

    #[test]
    fn seconds_idle_returns_zero_when_never_touched() {
        // last_input=0 상태를 강제로 만든 후 검증.
        LAST_INPUT_AT_MS.store(0, Relaxed);
        assert_eq!(seconds_idle(), 0);
    }

    #[test]
    #[serial]
    fn phase_store_load_roundtrip() {
        for p in [
            Phase::Idle,
            Phase::Focus,
            Phase::Break,
            Phase::Complete,
            Phase::Discarded,
        ] {
            store_phase(p);
            assert_eq!(current_phase(), p);
        }
        // 종료 시 Idle 복원 (다른 테스트와의 공유 atomic 영향 최소화).
        store_phase(Phase::Idle);
    }

    #[test]
    fn time_left_store_load_roundtrip() {
        store_time_left(0);
        assert_eq!(time_left_secs(), 0);
        store_time_left(1500);
        assert_eq!(time_left_secs(), 1500);
        store_time_left(u64::MAX);
        assert_eq!(time_left_secs(), u64::MAX);
        // 종료 시 0 복원.
        store_time_left(0);
    }

    // Phase 11 — noiseLoud hysteresis 단위 테스트 (AC-9~AC-12).

    #[test]
    fn ac9_hysteresis_reaches_active_at_5th_tick() {
        // 1~4틱: 누적 중이지만 active=false.
        let (c1, a1) = apply_noise_loud_hysteresis(Phase::Idle, 85.0, 0);
        assert_eq!(c1, 1);
        assert!(!a1);
        let (c2, a2) = apply_noise_loud_hysteresis(Phase::Idle, 85.0, c1);
        assert_eq!(c2, 2);
        assert!(!a2);
        let (c3, a3) = apply_noise_loud_hysteresis(Phase::Idle, 85.0, c2);
        assert_eq!(c3, 3);
        assert!(!a3);
        let (c4, a4) = apply_noise_loud_hysteresis(Phase::Idle, 85.0, c3);
        assert_eq!(c4, 4);
        assert!(!a4);
        // 5틱째: active=true.
        let (c5, a5) = apply_noise_loud_hysteresis(Phase::Idle, 85.0, c4);
        assert_eq!(c5, 5);
        assert!(a5);
    }

    #[test]
    fn ac10_db_below_threshold_resets() {
        // db ≤ 80 → 누적 중이던 카운터를 0으로 리셋, active=false.
        let (c, a) = apply_noise_loud_hysteresis(Phase::Idle, 70.0, 7);
        assert_eq!(c, 0);
        assert!(!a);
    }

    #[test]
    #[serial]
    fn ac11_store_phase_focus_resets_counter() {
        // 누적된 카운터가 Idle 외 phase 진입 시 0으로 리셋.
        IDLE_NOISE_LOUD_TICKS.store(7, Relaxed);
        store_phase(Phase::Focus);
        assert_eq!(IDLE_NOISE_LOUD_TICKS.load(Relaxed), 0);
        // 종료 시 atomic 복원.
        store_phase(Phase::Idle);
    }

    #[test]
    #[serial]
    fn ac11_store_phase_idle_preserves_counter() {
        // Idle→Idle 전이는 카운터 유지 (FR-7 누적 보존).
        IDLE_NOISE_LOUD_TICKS.store(7, Relaxed);
        store_phase(Phase::Idle);
        assert_eq!(IDLE_NOISE_LOUD_TICKS.load(Relaxed), 7);
        // 종료 시 atomic 복원.
        IDLE_NOISE_LOUD_TICKS.store(0, Relaxed);
    }

    #[test]
    fn ac12_db_80_does_not_increment() {
        // 경계값: db=80은 noiseLoud 조건 미해당 (BR-4).
        let (c, a) = apply_noise_loud_hysteresis(Phase::Idle, 80.0, 0);
        assert_eq!(c, 0);
        assert!(!a);
    }

    #[test]
    fn nan_db_returns_zero_inactive() {
        // PR #11 리뷰: NaN 입력 시 카운터가 증가하지 않고 즉시 리셋.
        // `!(NaN > 80.0)` is true → (0, false) 보장.
        let (c, a) = apply_noise_loud_hysteresis(Phase::Idle, f32::NAN, 7);
        assert_eq!(c, 0);
        assert!(!a);
    }

    #[test]
    fn negative_infinity_db_returns_zero_inactive() {
        // 음의 무한대도 `!(-inf > 80.0)` true → (0, false).
        let (c, a) = apply_noise_loud_hysteresis(Phase::Idle, f32::NEG_INFINITY, 7);
        assert_eq!(c, 0);
        assert!(!a);
    }

    #[test]
    fn positive_infinity_db_increments() {
        // 양의 무한대는 `+inf > 80.0` true이므로 누적은 됨 (실 운영에서는 audio sanitize가 차단).
        // 그러나 hysteresis 정책상 phase=Idle && db>80에서는 누적이 정의된 동작이라 의도적 허용.
        let (c, a) = apply_noise_loud_hysteresis(Phase::Idle, f32::INFINITY, 4);
        assert_eq!(c, 5);
        assert!(a);
    }

    // ---------- Phase 13 FR-13~17 buffer 테스트 ----------
    //
    // 모든 buffer 조작 테스트는 #[serial] 적용 — PHASE_BITS와 SESSION_TODOS_DONE
    // 둘 다 프로세스 공유 atomic이라 병렬 실행 시 race가 발생할 수 있다.

    #[test]
    #[serial]
    fn push_todo_when_focus_active() {
        store_phase(Phase::Focus);
        clear_todos();
        assert!(push_todo("t1"));
        assert_eq!(snapshot_todos(), vec!["t1".to_string()]);
        // cleanup
        store_phase(Phase::Idle);
    }

    #[test]
    #[serial]
    fn push_todo_when_break_active() {
        // Break 진입 시 buffer 미clear → 같은 세션의 누적 보존 (FR-17).
        store_phase(Phase::Focus);
        clear_todos();
        push_todo("t1");
        // Break로 전환해도 buffer 보존.
        PHASE_BITS.store(Phase::Break.as_u8(), Relaxed);
        assert!(push_todo("t2"));
        let snap = snapshot_todos();
        assert_eq!(snap, vec!["t1".to_string(), "t2".to_string()]);
        // cleanup
        store_phase(Phase::Idle);
    }

    #[test]
    #[serial]
    fn push_todo_rejected_when_idle() {
        // AC-15: Idle 상태에서 push_todo 호출 시 가드 false 반환 + buffer 미변경.
        store_phase(Phase::Idle);
        clear_todos();
        assert!(!push_todo("t1"));
        assert!(snapshot_todos().is_empty());
    }

    #[test]
    #[serial]
    fn push_todo_rejected_when_complete() {
        // Complete는 drain 대기 phase — 이미 끝난 세션에 추가 불가.
        store_phase(Phase::Focus);
        clear_todos();
        // store_phase(Complete)는 미clear (FR-17) — 직접 PHASE_BITS만 조작.
        PHASE_BITS.store(Phase::Complete.as_u8(), Relaxed);
        assert!(!push_todo("t1"));
        assert!(snapshot_todos().is_empty());
        store_phase(Phase::Idle);
    }

    #[test]
    #[serial]
    fn push_todo_dedup() {
        // BR-7: 같은 todo_id 두 번 push → 두 번째 false, buffer 1건만 보유.
        store_phase(Phase::Focus);
        clear_todos();
        assert!(push_todo("t1"));
        assert!(!push_todo("t1"));
        assert_eq!(snapshot_todos(), vec!["t1".to_string()]);
        store_phase(Phase::Idle);
    }

    #[test]
    #[serial]
    fn remove_todo_existing() {
        store_phase(Phase::Focus);
        clear_todos();
        push_todo("t1");
        push_todo("t2");
        assert!(remove_todo("t1"));
        assert_eq!(snapshot_todos(), vec!["t2".to_string()]);
        store_phase(Phase::Idle);
    }

    #[test]
    #[serial]
    fn remove_todo_missing() {
        store_phase(Phase::Focus);
        clear_todos();
        push_todo("t1");
        // 일치 항목 없음 → false + 기존 buffer 보존.
        assert!(!remove_todo("ghost"));
        assert_eq!(snapshot_todos(), vec!["t1".to_string()]);
        store_phase(Phase::Idle);
    }

    #[test]
    #[serial]
    fn drain_todos_clones_and_clears() {
        store_phase(Phase::Focus);
        clear_todos();
        push_todo("t1");
        push_todo("t2");
        let drained = drain_todos();
        assert_eq!(drained, vec!["t1".to_string(), "t2".to_string()]);
        assert!(snapshot_todos().is_empty());
        store_phase(Phase::Idle);
    }

    #[test]
    #[serial]
    fn store_phase_idle_clears_buffer() {
        // FR-17: Idle 진입 시 clear (Discard/Sleep/error 잔존 cleanup).
        // store_phase(Focus)로 buffer를 채울 수 있는 phase 만든 후 push, 그 다음 Idle로 전환.
        store_phase(Phase::Focus);
        clear_todos();
        push_todo("t1");
        push_todo("t2");
        assert_eq!(snapshot_todos().len(), 2);
        store_phase(Phase::Idle);
        assert!(snapshot_todos().is_empty());
    }

    #[test]
    #[serial]
    fn store_phase_focus_clears_buffer() {
        // FR-17: Focus 진입 시 clear (Idle→Focus 진입 방어망 — 이전 잔존 차단).
        // PHASE_BITS만 직접 조작하여 buffer를 채운 뒤 store_phase(Focus) 호출.
        store_phase(Phase::Focus);
        push_todo("stale");
        assert_eq!(snapshot_todos(), vec!["stale".to_string()]);
        // 다시 Focus 진입 → clear.
        store_phase(Phase::Focus);
        assert!(snapshot_todos().is_empty());
        store_phase(Phase::Idle);
    }

    #[test]
    #[serial]
    fn store_phase_break_preserves_buffer() {
        // FR-17: Break 진입 시 미clear — 같은 세션의 누적 보존.
        store_phase(Phase::Focus);
        clear_todos();
        push_todo("t1");
        store_phase(Phase::Break);
        assert_eq!(snapshot_todos(), vec!["t1".to_string()]);
        store_phase(Phase::Idle);
    }

    #[test]
    #[serial]
    fn store_phase_complete_preserves_buffer() {
        // FR-17: Complete 진입 시 미clear — drain_todos 대기.
        store_phase(Phase::Focus);
        clear_todos();
        push_todo("t1");
        store_phase(Phase::Complete);
        assert_eq!(snapshot_todos(), vec!["t1".to_string()]);
        // 후속 drain + Idle 복귀 시뮬레이션.
        let drained = drain_todos();
        assert_eq!(drained, vec!["t1".to_string()]);
        store_phase(Phase::Idle);
        assert!(snapshot_todos().is_empty());
    }
}
