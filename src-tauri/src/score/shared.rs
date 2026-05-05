use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicU8, Ordering::Relaxed};
use std::sync::OnceLock;
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

/// FR-2 / BR-noise-80: phase=Idle 상태에서 db_ema > 80.0 인 1Hz tick 카운터.
/// 본 Phase는 카운터 증가만 수행 — 실제 멘트 출력은 후속 character 도메인.
pub static IDLE_NOISE_LOUD_TICKS: AtomicU64 = AtomicU64::new(0);

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
pub fn store_phase(p: Phase) {
    PHASE_BITS.store(p.as_u8(), Relaxed);
}

/// 잔여 초 atomic 로드.
pub fn time_left_secs() -> u64 {
    TIME_LEFT_SECS.load(Relaxed)
}

/// 잔여 초 atomic 저장.
pub fn store_time_left(secs: u64) {
    TIME_LEFT_SECS.store(secs, Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
