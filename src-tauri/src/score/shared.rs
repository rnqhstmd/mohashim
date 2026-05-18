use std::sync::atomic::{
    AtomicBool, AtomicU32, AtomicU64, AtomicU8,
    Ordering::{Acquire, Relaxed, Release},
};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use crate::score::phase::{GraceState, LiveState, Phase};

/// 앱 부트 기준 시각 (Q10). now_ms 계산 기준점.
pub static START_AT: OnceLock<Instant> = OnceLock::new();

/// 마지막 입력 발생 시각 (ms since START_AT). 0=미입력 센티넬.
pub static LAST_INPUT_AT_MS: AtomicU64 = AtomicU64::new(0);

/// 최신 EMA 근사값 (f32 bits). audio cb가 store, score tick이 load.
/// Relaxed ordering으로 일시적 staleness 허용 — 1Hz tick 해상도에서 무관.
pub static DB_EMA_BITS: AtomicU32 = AtomicU32::new(0);

/// Issue #25: 작업 점수 EMA 평활값 (f32 bits).
///
/// `work_score(idle)`는 step function이라 idle 경계에서 점수가 급변한다 — 사용자가
/// 입력을 멈추면 빠르게 0으로 떨어지고, 재개하면 80으로 즉시 복귀해 체감이 거칠다.
/// tick_loop가 매 1Hz에 raw 값을 EMA로 평활하여 천천히 수렴하도록 한다.
///
/// **비대칭 정책 (Phase 22+ 사용자 피드백)**: 차감은 빠르게(tau=30s), 회복은 느리게(tau=90s).
/// "잃기 쉽고 회복은 어려운" 페널티 체감을 강화한다.
/// - alpha_decay = 1 - exp(-1/30) ≈ 0.0328 (raw < prev: 30초당 ~63% 차감)
/// - alpha_recover = 1 - exp(-1/90) ≈ 0.0111 (raw > prev: 90초당 ~63% 회복)
///
/// 초기값: 0x42a00000 = f32 80.0 bits (grace period 기본 점수와 일치 — 부팅 직후 0으로
/// 시작해 30초간 점차 올라가며 misleading한 "산만" 표시되는 회귀를 방지).
pub static WORK_SCORE_EMA_BITS: AtomicU32 = AtomicU32::new(0x42a00000);

/// EMA 차감 계수 (raw < prev). tau=30s — 입력 멈추면 빠르게 떨어진다.
pub const WORK_EMA_ALPHA_DECAY: f32 = 0.0328;

/// EMA 회복 계수 (raw > prev). tau=90s — 입력 재개해도 천천히 회복.
pub const WORK_EMA_ALPHA_RECOVER: f32 = 0.0111;

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

/// Phase 14 C-2 fix: tick 본문 진입 시 wall-clock 기록.
/// 이전 tick과의 차이가 WAKE_DRIFT_THRESHOLD_MS 이상이면 sleep으로 간주하여
/// SLEEP_AT_UNIX_MS / WAKE_FLAG 합성 (Windows fallback, macOS NSWorkspace 우선).
/// 0=초기화 미완. 첫 tick 진입 시 set, drift 검사 skip.
pub static LAST_TICK_WALL_MS: AtomicU64 = AtomicU64::new(0);

/// Phase 14: drift detection 임계값. 5초 점프 → sleep 합성.
pub const WAKE_DRIFT_THRESHOLD_MS: u64 = 5000;

/// Phase 14 FR-2: next_tick pollution 차단 임계값. now-next_tick이 이 값 이상이면
/// next_tick = now로 reset → 1Hz 정상 진행 복구. sleep/wake 후 monotonic Instant
/// 점프 케이스에서 누적 틱 폭주 방지.
pub const TICK_POLLUTION_RESET_THRESHOLD_SECS: u64 = 2;

/// Phase 14 FR-2: next_tick reset 판정 (순수 함수).
/// PRD FR-7 [Should]: AC-5 회귀 차단을 위한 단위 테스트 가능 헬퍼.
pub fn should_reset_next_tick(elapsed_past: std::time::Duration) -> bool {
    elapsed_past >= std::time::Duration::from_secs(TICK_POLLUTION_RESET_THRESHOLD_SECS)
}

/// db_ema > NOISE_LOUD_THRESHOLD_DB 인 1Hz tick 카운터. Idle/Focus/Break 모든 phase에서 누적.
/// hysteresis 활용: NOISE_LOUD_HYSTERESIS_TICKS 도달 시 noiseLoud 활성.
/// Complete/Discarded 진입 시 0 리셋.
pub static NOISE_LOUD_TICKS: AtomicU64 = AtomicU64::new(0);

/// noiseLoud 활성 진입에 필요한 누적 틱 수 (5초 hysteresis).
pub const NOISE_LOUD_HYSTERESIS_TICKS: u64 = 5;

/// noiseLoud 판정 dB 임계값. 80은 미해당, 81 이상부터 누적.
pub const NOISE_LOUD_THRESHOLD_DB: f32 = 80.0;

/// 60.0 < db_ema ≤ 80.0 구간 1Hz tick 카운터 (medium 누적).
/// NOISE_MEDIUM_HYSTERESIS_TICKS 도달 시 noiseMedium 활성. loud와 상호 배타.
pub static NOISE_MEDIUM_TICKS: AtomicU64 = AtomicU64::new(0);

/// noiseMedium 활성 진입에 필요한 누적 틱 수 (5초 hysteresis, loud와 동일).
pub const NOISE_MEDIUM_HYSTERESIS_TICKS: u64 = 5;

/// noiseMedium 판정 dB 하한. 60은 미해당, 61 이상부터 누적. 상한은 NOISE_LOUD_THRESHOLD_DB.
pub const NOISE_MEDIUM_THRESHOLD_DB: f32 = 60.0;

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

/// Issue #25: work_score EMA 평활값 atomic 로드.
pub fn load_work_ema() -> f32 {
    f32::from_bits(WORK_SCORE_EMA_BITS.load(Relaxed))
}

/// Issue #25: work_score EMA 평활값 atomic 저장.
pub fn store_work_ema(v: f32) {
    WORK_SCORE_EMA_BITS.store(v.to_bits(), Relaxed);
}

/// Issue #25: raw work_score를 EMA로 평활하여 갱신·반환 (순수 함수 아님 — atomic mutation).
///
/// next = alpha * raw + (1 - alpha) * prev
/// **비대칭**: raw > prev(회복)는 ALPHA_RECOVER(tau=90s), raw <= prev(차감/유지)는 ALPHA_DECAY(tau=30s).
/// raw == prev에서는 alpha 선택이 결과에 영향을 주지 않으므로 DECAY 분기로 묶는다.
pub fn update_work_ema(raw: u8) -> f32 {
    let prev = load_work_ema();
    let raw_f = raw as f32;
    let alpha = if raw_f > prev {
        WORK_EMA_ALPHA_RECOVER
    } else {
        WORK_EMA_ALPHA_DECAY
    };
    let next = alpha * raw_f + (1.0 - alpha) * prev;
    store_work_ema(next);
    next
}

// ---------- Break phase 점수 freeze (Phase 22+) ----------
//
// 사용자 피드백: "휴식 중엔 점수가 변경되면 안 되지" — Break 진입 시 work/noise/total/db/grace/live를
// 스냅샷으로 보관하고, Break 진행 중 매 tick은 이 스냅샷을 그대로 emit한다.
// EMA 갱신도 Break 동안엔 스킵 → Focus 재개 시 직전 EMA 값에서 이어진다.

pub static BREAK_SNAPSHOT_VALID: AtomicBool = AtomicBool::new(false);
pub static BREAK_SNAPSHOT_WORK: AtomicU8 = AtomicU8::new(0);
pub static BREAK_SNAPSHOT_NOISE: AtomicU8 = AtomicU8::new(0);
pub static BREAK_SNAPSHOT_TOTAL: AtomicU8 = AtomicU8::new(0);
pub static BREAK_SNAPSHOT_DB_BITS: AtomicU32 = AtomicU32::new(0);
pub static BREAK_SNAPSHOT_GRACE: AtomicU8 = AtomicU8::new(0);
pub static BREAK_SNAPSHOT_LIVE: AtomicU8 = AtomicU8::new(0);

fn grace_to_u8(g: GraceState) -> u8 {
    match g {
        GraceState::Active => 0,
        GraceState::Looking => 1,
        GraceState::Gone => 2,
    }
}

fn grace_from_u8(v: u8) -> GraceState {
    match v {
        1 => GraceState::Looking,
        2 => GraceState::Gone,
        _ => GraceState::Active,
    }
}

fn live_to_u8(s: LiveState) -> u8 {
    match s {
        LiveState::Focused => 0,
        LiveState::Calm => 1,
        LiveState::Distracted => 2,
        LiveState::Covering => 3,
        LiveState::Stressed => 4,
    }
}

fn live_from_u8(v: u8) -> LiveState {
    match v {
        1 => LiveState::Calm,
        2 => LiveState::Distracted,
        3 => LiveState::Covering,
        4 => LiveState::Stressed,
        _ => LiveState::Focused,
    }
}

/// Focus → Break 전이 1회 호출. 현재 live 값을 freeze.
pub fn store_break_snapshot(
    work: u8,
    noise: u8,
    total: u8,
    db: f32,
    grace: GraceState,
    live: LiveState,
) {
    BREAK_SNAPSHOT_WORK.store(work, Relaxed);
    BREAK_SNAPSHOT_NOISE.store(noise, Relaxed);
    BREAK_SNAPSHOT_TOTAL.store(total, Relaxed);
    BREAK_SNAPSHOT_DB_BITS.store(db.to_bits(), Relaxed);
    BREAK_SNAPSHOT_GRACE.store(grace_to_u8(grace), Relaxed);
    BREAK_SNAPSHOT_LIVE.store(live_to_u8(live), Relaxed);
    BREAK_SNAPSHOT_VALID.store(true, Release);
}

/// Break 진행 중 tick에서 호출. 스냅샷이 유효하면 Some(...) 반환.
pub fn load_break_snapshot() -> Option<(u8, u8, u8, f32, GraceState, LiveState)> {
    if !BREAK_SNAPSHOT_VALID.load(Acquire) {
        return None;
    }
    Some((
        BREAK_SNAPSHOT_WORK.load(Relaxed),
        BREAK_SNAPSHOT_NOISE.load(Relaxed),
        BREAK_SNAPSHOT_TOTAL.load(Relaxed),
        f32::from_bits(BREAK_SNAPSHOT_DB_BITS.load(Relaxed)),
        grace_from_u8(BREAK_SNAPSHOT_GRACE.load(Relaxed)),
        live_from_u8(BREAK_SNAPSHOT_LIVE.load(Relaxed)),
    ))
}

/// Break → Complete / Discarded / Idle 전이에서 호출. 스냅샷 무효화.
pub fn clear_break_snapshot() {
    BREAK_SNAPSHOT_VALID.store(false, Release);
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
    // 소음 hysteresis 카운터는 세션 종료(Complete/Discarded) 시에만 리셋.
    // Focus⇄Break 전환에서는 누적 보존하여 멘트 일관성 유지.
    if matches!(p, Phase::Complete | Phase::Discarded) {
        reset_noise_state();
    }
    // Phase 13 FR-17: Idle/Focus 진입 시 buffer clear. Break/Complete 미clear.
    if matches!(p, Phase::Idle | Phase::Focus) {
        clear_todos();
    }
    // Phase 22+: Break 외 phase 진입 시 freeze snapshot 자동 정리 (stale 데이터 방지).
    // Focus→Break 전이는 tick_loop이 transition 이후 store_phase(Break)를 호출하지 않으므로
    // 본 분기로 인해 방금 저장한 snapshot이 지워지지 않는다 (on_phase_transition이 직접 PHASE_BITS만 갱신).
    if !matches!(p, Phase::Break) {
        clear_break_snapshot();
    }
}

/// 두 hysteresis 카운터 모두 0으로 리셋.
/// 호출자: store_phase 내부(Complete/Discarded 진입 시).
pub fn reset_noise_state() {
    NOISE_LOUD_TICKS.store(0, Relaxed);
    NOISE_MEDIUM_TICKS.store(0, Relaxed);
}

/// 소음 hysteresis 산출 (순수 함수).
///
/// 두 카운터(loud, medium)를 한 번에 결정한다. 분기:
/// - phase = Complete/Discarded → (0, 0, false, false)
/// - db is NaN → (0, 0, false, false)
/// - db > NOISE_LOUD_THRESHOLD_DB (80.0) → loud 누적, medium 0
/// - db > NOISE_MEDIUM_THRESHOLD_DB (60.0) && db ≤ 80.0 → medium 누적, loud 0
/// - 그 외 (db ≤ 60.0) → 둘 다 0
///
/// 분기 자체가 mutually exclusive하므로 loud_active && medium_active는 불가능 (BR-1).
pub fn apply_noise_hysteresis(
    phase: Phase,
    db: f32,
    prev_loud: u64,
    prev_medium: u64,
) -> (u64, u64, bool, bool) {
    if matches!(phase, Phase::Complete | Phase::Discarded) {
        return (0, 0, false, false);
    }
    if db.is_nan() {
        return (0, 0, false, false);
    }
    if db > NOISE_LOUD_THRESHOLD_DB {
        let nl = prev_loud.saturating_add(1);
        let active_l = nl >= NOISE_LOUD_HYSTERESIS_TICKS;
        return (nl, 0, active_l, false);
    }
    if db > NOISE_MEDIUM_THRESHOLD_DB {
        let nm = prev_medium.saturating_add(1);
        let active_m = nm >= NOISE_MEDIUM_HYSTERESIS_TICKS;
        return (0, nm, false, active_m);
    }
    (0, 0, false, false)
}

/// Phase 14: prev/now wall-clock diff 기반 sleep 합성 산출 (순수 함수).
///
/// tick_loop의 atomic 의존을 분리하여 단위 테스트 가능하게 한 헬퍼.
/// macOS NSWorkspace가 이미 `SLEEP_AT_UNIX_MS`를 set한 경우 보존하기 위해
/// `sleep_at_existing != 0`이면 `sleep_at_to_set = None`으로 반환한다 (BR-1).
///
/// 반환: `(synthesized, sleep_at_to_set, set_wake_flag)`
/// - prev_wall=0: 초기화 미완 → `(false, None, false)` (BR-3)
/// - diff < threshold: drift 미감지 → `(false, None, false)`
/// - diff >= threshold: drift 감지 → `(true, Some(prev_wall) | None, true)`
pub fn detect_drift_sleep(
    prev_wall: u64,
    now_wall: u64,
    sleep_at_existing: u64,
) -> (bool, Option<u64>, bool) {
    if prev_wall == 0 {
        return (false, None, false);
    }
    let diff_ms = now_wall.saturating_sub(prev_wall);
    if diff_ms < WAKE_DRIFT_THRESHOLD_MS {
        return (false, None, false);
    }
    let sleep_at = if sleep_at_existing == 0 {
        Some(prev_wall)
    } else {
        None
    };
    (true, sleep_at, true)
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

/// Phase 15 FR-8 / BR-3: push_todo id 길이 상한 (보안 정합).
///
/// 정상 todo.id는 timestamp + random suffix로 ~30자. 256자 초과는 abnormal로 간주하여
/// push 거부. phase 가드보다 먼저 적용 (early return으로 dup 검사 우회).
pub const MAX_TODO_ID_LEN: usize = 256;

/// FR-14 / BR-7: phase가 Focus|Break일 때만 todo_id를 push. 중복 차단(set 의미).
///
/// 반환값: push 성공 시 true, 길이 가드/phase 가드 실패 또는 중복 차단 시 false.
/// Phase 15 FR-8: id가 MAX_TODO_ID_LEN 초과 시 즉시 false (phase 가드보다 우선).
/// Idle/Discarded/Complete 진입 시 호출 → 가드 false 반환 (AC-15).
pub fn push_todo(id: &str) -> bool {
    if id.len() > MAX_TODO_ID_LEN {
        return false;
    }
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

/// 현재 buffer 상태 스냅샷 (clone, 비파괴). drain_todos와 달리 buffer를 비우지 않는다.
///
/// Phase 19 FR-B2: Break→Complete 분기에서 timer::compute_session_tag가 호출하여
/// 다수결 tag 산출에 사용한다. drain은 후속 on_complete_consumed의 drain_todos에서
/// 수행되므로 본 함수는 read-only이며 race 없음 (같은 tick 내 동기 순차 호출).
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

    // Noise hysteresis 단위 테스트 — 3단계 분리 (AC-1~AC-11).

    #[test]
    fn ac1_focus_loud_increments() {
        // AC-1: Idle 외 phase(Focus)에서도 loud 카운트 시작.
        let (nl, nm, la, ma) = apply_noise_hysteresis(Phase::Focus, 85.0, 0, 0);
        assert_eq!(nl, 1);
        assert_eq!(nm, 0);
        assert!(!la);
        assert!(!ma);
    }

    #[test]
    fn ac2_focus_loud_active_at_5th() {
        // AC-2: Focus phase에서 5틱 연속 85dB → 5번째에 loud_active=true.
        let mut prev_loud = 0u64;
        for tick in 1..=5 {
            let (nl, _, la, _) =
                apply_noise_hysteresis(Phase::Focus, 85.0, prev_loud, 0);
            assert_eq!(nl, tick);
            if tick < 5 {
                assert!(!la);
            } else {
                assert!(la);
            }
            prev_loud = nl;
        }
    }

    #[test]
    fn ac3_focus_medium_active_at_5th() {
        // AC-3: Focus phase에서 5틱 연속 70dB → medium_active=true, loud_active=false.
        let mut prev_medium = 0u64;
        for tick in 1..=5 {
            let (nl, nm, la, ma) =
                apply_noise_hysteresis(Phase::Focus, 70.0, 0, prev_medium);
            assert_eq!(nl, 0);
            assert_eq!(nm, tick);
            assert!(!la);
            if tick < 5 {
                assert!(!ma);
            } else {
                assert!(ma);
            }
            prev_medium = nm;
        }
    }

    #[test]
    fn ac4_medium_to_loud_resets_medium() {
        // AC-4: medium 카운터 3 누적 상태에서 85dB 진입 → medium 리셋, loud 1 시작.
        let (nl, nm, la, ma) = apply_noise_hysteresis(Phase::Idle, 85.0, 0, 3);
        assert_eq!(nl, 1);
        assert_eq!(nm, 0);
        assert!(!la);
        assert!(!ma);
    }

    #[test]
    fn ac5_loud_to_medium_resets_loud() {
        // AC-5: loud 카운터 3 누적 상태에서 70dB 진입 → loud 리셋, medium 1 시작.
        let (nl, nm, la, ma) = apply_noise_hysteresis(Phase::Idle, 70.0, 3, 0);
        assert_eq!(nl, 0);
        assert_eq!(nm, 1);
        assert!(!la);
        assert!(!ma);
    }

    #[test]
    fn ac6_db_60_exact_no_medium() {
        // AC-6: db=60.0 정확히 → medium 미누적 (strict `db > 60.0`).
        let (nl, nm, la, ma) = apply_noise_hysteresis(Phase::Idle, 60.0, 0, 0);
        assert_eq!(nl, 0);
        assert_eq!(nm, 0);
        assert!(!la);
        assert!(!ma);
    }

    #[test]
    fn ac7_db_80_exact_medium() {
        // AC-7: db=80.0 정확히 → medium 누적 (`60 < 80 ≤ 80`), loud 0.
        let (nl, nm, la, ma) = apply_noise_hysteresis(Phase::Idle, 80.0, 0, 0);
        assert_eq!(nl, 0);
        assert_eq!(nm, 1);
        assert!(!la);
        assert!(!ma);
    }

    #[test]
    fn ac8_nan_resets_both() {
        // AC-8: db=NaN → 두 카운터 모두 0.
        let (nl, nm, la, ma) = apply_noise_hysteresis(Phase::Idle, f32::NAN, 7, 4);
        assert_eq!(nl, 0);
        assert_eq!(nm, 0);
        assert!(!la);
        assert!(!ma);
    }

    #[test]
    fn ac9_complete_resets_both() {
        // AC-9: Phase::Complete → 두 카운터 모두 0.
        let (nl, nm, la, ma) = apply_noise_hysteresis(Phase::Complete, 85.0, 4, 4);
        assert_eq!(nl, 0);
        assert_eq!(nm, 0);
        assert!(!la);
        assert!(!ma);
    }

    #[test]
    fn ac10_discarded_resets_both() {
        // AC-10: Phase::Discarded → 두 카운터 모두 0.
        let (nl, nm, la, ma) = apply_noise_hysteresis(Phase::Discarded, 70.0, 3, 3);
        assert_eq!(nl, 0);
        assert_eq!(nm, 0);
        assert!(!la);
        assert!(!ma);
    }

    #[test]
    #[serial]
    fn ac11_focus_to_break_preserves_counters() {
        // AC-11: Focus → Break 전환 → 두 카운터 모두 유지 (BR-2).
        NOISE_LOUD_TICKS.store(3, Relaxed);
        NOISE_MEDIUM_TICKS.store(2, Relaxed);
        store_phase(Phase::Break);
        assert_eq!(NOISE_LOUD_TICKS.load(Relaxed), 3);
        assert_eq!(NOISE_MEDIUM_TICKS.load(Relaxed), 2);
        // 종료 시 atomic 복원.
        NOISE_LOUD_TICKS.store(0, Relaxed);
        NOISE_MEDIUM_TICKS.store(0, Relaxed);
        store_phase(Phase::Idle);
    }

    #[test]
    #[serial]
    fn store_phase_complete_resets_both_counters() {
        // Complete 진입 시 두 카운터 모두 0 (BR-2).
        NOISE_LOUD_TICKS.store(5, Relaxed);
        NOISE_MEDIUM_TICKS.store(5, Relaxed);
        store_phase(Phase::Complete);
        assert_eq!(NOISE_LOUD_TICKS.load(Relaxed), 0);
        assert_eq!(NOISE_MEDIUM_TICKS.load(Relaxed), 0);
        store_phase(Phase::Idle);
    }

    #[test]
    fn nan_db_returns_zero_inactive() {
        // NaN 입력 시 두 카운터 모두 즉시 리셋.
        let (nl, nm, la, ma) = apply_noise_hysteresis(Phase::Idle, f32::NAN, 7, 4);
        assert_eq!(nl, 0);
        assert_eq!(nm, 0);
        assert!(!la);
        assert!(!ma);
    }

    #[test]
    fn negative_infinity_db_returns_zero_inactive() {
        // 음의 무한대는 `!(-inf > 60.0)` true → (0, 0, false, false).
        let (nl, nm, la, ma) =
            apply_noise_hysteresis(Phase::Idle, f32::NEG_INFINITY, 7, 4);
        assert_eq!(nl, 0);
        assert_eq!(nm, 0);
        assert!(!la);
        assert!(!ma);
    }

    #[test]
    fn positive_infinity_db_increments_loud() {
        // 양의 무한대는 `+inf > 80.0` true → loud 누적.
        let (nl, nm, la, ma) =
            apply_noise_hysteresis(Phase::Idle, f32::INFINITY, 4, 0);
        assert_eq!(nl, 5);
        assert_eq!(nm, 0);
        assert!(la);
        assert!(!ma);
    }

    // ---------- Phase 14 C-2 — wall-clock drift detection 테스트 (FR-6, AC-6) ----------

    #[test]
    fn wake_drift_threshold_constant() {
        // 5초 임계가 의도대로 정의되어 있는지 회귀 차단.
        assert_eq!(WAKE_DRIFT_THRESHOLD_MS, 5000);
    }

    #[test]
    #[serial]
    fn last_tick_wall_ms_initial_zero() {
        // 모듈 초기 상태에서 0 (drift 검사 skip 의미).
        // 다른 테스트 영향 회피 — store(0) 후 load 검증만.
        LAST_TICK_WALL_MS.store(0, Relaxed);
        assert_eq!(LAST_TICK_WALL_MS.load(Relaxed), 0);
    }

    #[test]
    fn drift_below_threshold_no_synthesis() {
        // 4초 점프 (임계 미만) → 합성 안 함.
        let (det, sleep_at, wake) = detect_drift_sleep(1000, 4999, 0);
        assert!(!det);
        assert_eq!(sleep_at, None);
        assert!(!wake);
    }

    #[test]
    fn drift_at_threshold_synthesizes() {
        // 5초 점프 (임계 도달) → 합성 + WAKE_FLAG.
        let (det, sleep_at, wake) = detect_drift_sleep(1000, 6000, 0);
        assert!(det);
        assert_eq!(sleep_at, Some(1000));
        assert!(wake);
    }

    #[test]
    fn drift_preserves_existing_sleep_at() {
        // BR-1: macOS NSWorkspace가 이미 set한 SLEEP_AT_UNIX_MS는 보존 (None 반환).
        let (det, sleep_at, wake) = detect_drift_sleep(1000, 10000, 500);
        assert!(det);
        assert_eq!(sleep_at, None);
        assert!(wake);
    }

    #[test]
    fn drift_initial_state_skips() {
        // BR-3: prev_wall=0 (초기화 미완) → drift 검사 skip.
        let (det, sleep_at, wake) = detect_drift_sleep(0, 10000, 0);
        assert!(!det);
        assert_eq!(sleep_at, None);
        assert!(!wake);
    }

    // ---------- Phase 14 FR-7: next_tick pollution reset 단위 테스트 (PR #15 cross-review) ----------

    #[test]
    fn should_reset_next_tick_below_threshold() {
        use std::time::Duration;
        // 0초/0.5초/1초/1.999초 — 임계 미만이라 reset 안 함.
        assert!(!should_reset_next_tick(Duration::from_secs(0)));
        assert!(!should_reset_next_tick(Duration::from_millis(500)));
        assert!(!should_reset_next_tick(Duration::from_secs(1)));
        assert!(!should_reset_next_tick(Duration::from_millis(1999)));
    }

    #[test]
    fn should_reset_next_tick_at_or_above_threshold() {
        use std::time::Duration;
        // 정확히 2초 + 그 이상은 reset 발화.
        assert!(should_reset_next_tick(Duration::from_secs(2)));
        assert!(should_reset_next_tick(Duration::from_millis(2001)));
        assert!(should_reset_next_tick(Duration::from_secs(60)));
        assert!(should_reset_next_tick(Duration::from_secs(3600)));
    }

    #[test]
    fn tick_pollution_reset_threshold_constant() {
        // 임계 상수 회귀 차단 (의도적 변경 시 PRD 갱신 필요).
        assert_eq!(TICK_POLLUTION_RESET_THRESHOLD_SECS, 2);
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

    // ---------- Phase 15 FR-7 / FR-8 — 이월 폴리싱 테스트 ----------

    #[test]
    #[serial]
    fn push_todo_rejects_oversized_id() {
        // Phase 15 FR-8 / AC-7 / BR-3: 256자 초과 id는 abnormal로 push 거부.
        // phase 가드를 통과해도 길이 가드가 우선 차단 (early return).
        store_phase(Phase::Focus);
        clear_todos();
        let oversized = "a".repeat(257);
        assert!(!push_todo(&oversized));
        assert_eq!(snapshot_todos().len(), 0);
        // 경계: 정확히 256자는 통과.
        let boundary = "b".repeat(256);
        assert!(push_todo(&boundary));
        assert_eq!(snapshot_todos().len(), 1);
        store_phase(Phase::Idle);
    }

    #[test]
    #[serial]
    fn discard_clears_session_buffer() {
        // Phase 15 FR-7 / AC-6: discard 경로 시뮬레이션.
        // Focus 시작 → todo 체크 누적 → discard (= store_phase(Idle))는
        // FR-17에 따라 buffer를 자동 clear한다.
        store_phase(Phase::Focus);
        clear_todos();
        push_todo("todo-1");
        push_todo("todo-2");
        assert_eq!(snapshot_todos().len(), 2);
        // Discard 경로 시뮬: store_phase(Idle)이 clear_todos 자동 호출.
        store_phase(Phase::Idle);
        assert!(snapshot_todos().is_empty());
    }
}
