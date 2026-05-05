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
use crate::score::phase::{grace_from, state_from_total, LiveState, Phase};
use crate::score::shared::{
    load_db_ema, seconds_idle, AX_GRANTED, EMIT_ERR_COUNT, MIC_GRANTED, SCORE_STARTED, START_AT,
};
use crate::score::state::ScoreSnapshot;
use crate::score::{noise::noise_score, work::work_score};
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

        let snap = ScoreSnapshot {
            total,
            work,
            noise,
            state: live,
            db,
            seconds_idle: idle,
            grace,
            phase: Phase::Idle,
            time_left: 0,
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
    }
}
