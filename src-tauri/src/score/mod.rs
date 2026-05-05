pub mod shared;
pub mod work;
pub mod noise;
pub mod ema;
pub mod phase;
pub mod state;

use std::sync::atomic::Ordering::*;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Runtime};

use crate::audio;
use crate::input;
use crate::permissions::{self, PermissionStatus};
use crate::power;
use crate::score::phase::{grace_from, state_from_total, LiveState, Phase};
use crate::score::shared::{
    current_phase, load_db_ema, seconds_idle, store_time_left, time_left_secs, AX_GRANTED,
    EMIT_ERR_COUNT, MIC_GRANTED, SCORE_STARTED, START_AT,
};

/// FR-2 / BR-noise-80: Idle 상태에서 시끄럽다(loud) 판단 임계값(dB).
const NOISE_LOUD_THRESHOLD_DB: f32 = 80.0;
use crate::score::state::ScoreSnapshot;
use crate::score::{noise::noise_score, work::work_score};
use crate::timer;
use crate::tray;

/// score 엔진 기동 (FR-13, MUST-5).
///
/// - SCORE_STARTED CAS로 멱등성 보장 (재호출 시 즉시 Ok).
/// - 권한을 1회 조회 후 캐시 (DEC-9).
/// - mic Granted → audio thread, ax Granted → input thread.
/// - 1Hz tick thread를 spawn하여 score-tick emit + tray 갱신.
pub fn start<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if SCORE_STARTED
        .compare_exchange(false, true, AcqRel, Acquire)
        .is_err()
    {
        return Ok(());
    }

    START_AT.get_or_init(Instant::now);

    let mic = permissions::current_mic_status() == PermissionStatus::Granted;
    let ax = permissions::current_accessibility_status() == PermissionStatus::Granted;
    MIC_GRANTED.store(mic, Relaxed);
    AX_GRANTED.store(ax, Relaxed);

    if mic {
        if let Err(e) = audio::start(app.clone()) {
            eprintln!("[mohashim] audio start failed: {e}");
        }
    }
    if ax {
        if let Err(e) = input::start() {
            eprintln!("[mohashim] input start failed: {e}");
        }
    }

    let app_clone = app.clone();
    let spawn_result = std::thread::Builder::new()
        .name("mohashim-score-tick".into())
        .spawn(move || tick_loop(app_clone));
    match spawn_result {
        Ok(_) => Ok(()),
        Err(e) => {
            // 재시도 가능 상태로 복원.
            SCORE_STARTED.store(false, Release);
            Err(format!("score tick spawn failed: {e}"))
        }
    }
}

/// 1Hz tick 루프 (FR-11, QE-3).
///
/// atomic read + 산술 + emit만 수행한다 (오디오/입력 스레드를 차단하지 않음).
/// state 변경된 tick에서만 트레이 갱신 호출 (AC-13).
///
/// 누적 drift 방지: `next_tick`을 절대 시각으로 유지하여 sleep + 본문 실행 시간을
/// 흡수한다. 본문이 1초 이상 걸려 next_tick이 과거가 되면 sleep을 건너뛰고 즉시 진행.
fn tick_loop<R: Runtime>(app: AppHandle<R>) {
    let mut prev_live: Option<LiveState> = None;
    let mut next_tick = Instant::now();
    loop {
        next_tick += Duration::from_secs(1);
        if let Some(remaining) = next_tick.checked_duration_since(Instant::now()) {
            std::thread::sleep(remaining);
        }

        // 1) 슬립 wake 처리 (DEC-10/10a/10b, BR-sleep-1/2).
        // wake 차감이 발생하면 같은 tick의 phase 분기에서 -1을 추가 적용하지 않는다 —
        // 그렇지 않으면 1초가 중복 차감되어 슬립 경과 산출이 어긋난다.
        let mut wake_handled = false;
        if let Some(elapsed) = power::drain_wake_event() {
            let phase = current_phase();
            if matches!(phase, Phase::Focus | Phase::Break) {
                if elapsed <= timer::SLEEP_GRACE_SECS {
                    let cur = time_left_secs();
                    store_time_left(cur.saturating_sub(elapsed));
                    wake_handled = true;
                    // 차감 결과가 0이면 같은 tick의 phase 분기에서 자동 전환이 그대로 발생.
                } else {
                    timer::on_sleep_overflow_discard(&app);
                }
            }
        }

        // 2) 기존 work/noise/state/grace 산출.
        let idle = if AX_GRANTED.load(Relaxed) {
            seconds_idle()
        } else {
            0
        };
        let db = if MIC_GRANTED.load(Relaxed) {
            load_db_ema()
        } else {
            0.0
        };

        let work = work_score(idle);
        let noise = noise_score(db);
        let total = work.saturating_add(noise); // BR-9: 0..=100. saturating_add로 u8 overflow 방어.
        let live = state_from_total(total);
        let grace = grace_from(idle, work);

        // Phase 8 R-G2: Focus tick에만 세션 평균 누적.
        if matches!(current_phase(), Phase::Focus) {
            crate::score::shared::accumulate_session_score(total as u32);
        }

        // 3) phase 분기 (FR-4a/4b, AC-3 Complete 1-tick).
        let phase_at_emit;
        let time_left_for_emit;
        let cur_phase = current_phase();
        match cur_phase {
            Phase::Focus | Phase::Break => {
                let cur = time_left_secs();
                // wake 차감이 이미 발생한 tick에서는 -1을 추가하지 않는다 (중복 차감 방지).
                let new = if wake_handled { cur } else { cur.saturating_sub(1) };
                if new == 0 {
                    let to = if cur_phase == Phase::Focus {
                        Phase::Break
                    } else {
                        Phase::Complete
                    };
                    timer::on_phase_transition(&app, cur_phase, to);
                    phase_at_emit = to;
                    time_left_for_emit = time_left_secs();
                } else {
                    store_time_left(new);
                    phase_at_emit = cur_phase;
                    time_left_for_emit = new;
                }
            }
            Phase::Complete => {
                // AC-3 단일 tick 정합: 정상 흐름에서는 (Break, Complete) 전이가 위 분기에서 발생하고
                // 본 tick 끝에서 on_complete_consumed로 atomic이 Idle로 복귀하므로 본 분기 진입 안 됨.
                // 외부 트리거로 atomic이 Complete로 set된 비정상 케이스에 대한 방어 no-op.
                phase_at_emit = Phase::Idle;
                time_left_for_emit = 0;
            }
            Phase::Idle | Phase::Discarded => {
                phase_at_emit = Phase::Idle;
                time_left_for_emit = 0;
            }
        }

        // FR-2 / BR-noise-80: Idle 상태에서 NOISE_LOUD_THRESHOLD_DB 초과 tick 카운터 (멘트 출력은 후속 character 도메인).
        if matches!(phase_at_emit, Phase::Idle) && db > NOISE_LOUD_THRESHOLD_DB {
            crate::score::shared::IDLE_NOISE_LOUD_TICKS.fetch_add(1, Relaxed);
        }

        let snap = ScoreSnapshot {
            total,
            work,
            noise,
            state: live,
            db,
            seconds_idle: idle,
            grace,
            phase: phase_at_emit,
            time_left: time_left_for_emit,
        };

        if let Err(e) = app.emit("score-tick", &snap) {
            // MUST-4: 1분당 1회 throttle.
            let n = EMIT_ERR_COUNT.fetch_add(1, Relaxed);
            if n == 0 || n % 60 == 0 {
                eprintln!("[mohashim] score-tick emit failed (#{n}): {e}");
            }
        }

        if Some(live) != prev_live {
            match tray::apply_state(&app, live) {
                Ok(()) => {
                    prev_live = Some(live);
                }
                Err(e) => {
                    eprintln!("[mohashim] tray apply_state failed: {e}");
                    // prev_live 미갱신 → 다음 tick에서 재시도.
                }
            }
        }

        // AC-3 토스트 순서 보장: score-tick(Complete) emit 직후 atomic Idle 복귀 + 토스트 발화.
        // emit이 비동기이므로 토스트가 score-tick(Complete) payload보다 먼저 JS에 도달하지
        // 않도록 본 tick의 emit 이후에 호출한다. 다음 tick은 atomic=Idle이라 Idle arm 진입.
        if phase_at_emit == Phase::Complete {
            timer::on_complete_consumed(&app);
        }
    }
}
