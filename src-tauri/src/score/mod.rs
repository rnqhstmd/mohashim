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
#[cfg(not(target_os = "macos"))]
use crate::input;
use crate::permissions::{self, PermissionStatus};
use crate::power;
use crate::score::phase::{final_tray_state, grace_from, state_from_total, LiveState, Phase};
use crate::score::shared::{
    apply_noise_loud_hysteresis, current_phase, load_db_ema, seconds_idle, store_time_left,
    time_left_secs, update_work_ema, AX_GRANTED, EMIT_ERR_COUNT, IDLE_NOISE_LOUD_TICKS,
    MIC_GRANTED, SCORE_STARTED, START_AT,
};
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
        // Phase 21 핫픽스: rdev 0.5의 macOS 버그 (TSMGetInputSourceProperty가
        // 백그라운드 스레드에서 호출되어 dispatch_assert_queue_fail → abort).
        // macOS에서는 input 리스너를 임시 비활성화하여 크래시를 막는다.
        // 결과: seconds_idle=0 폴백 → work=80 항상 유지 (자리비움 감지 비활성).
        // 후속 작업: NSEvent.addGlobalMonitorForEvents로 교체.
        #[cfg(not(target_os = "macos"))]
        if let Err(e) = input::start() {
            eprintln!("[mohashim] input start failed: {e}");
        }
        #[cfg(target_os = "macos")]
        {
            eprintln!(
                "[mohashim] macOS: rdev input listener disabled (Phase 21 hotfix; rdev 0.5 TSM thread bug)"
            );
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
    let mut prev_tray_state: Option<LiveState> = None;
    let mut prev_title: Option<Option<String>> = None;
    let mut next_tick = Instant::now();
    // Phase 18 FR-B5 (F): noise_enter/exit 전환 감지용 로컬 상태.
    // Idle phase 한정 — Focus/Break/Complete 진입 시 active=true→false 합성으로 NoiseExit 발화.
    let mut prev_noise_loud_active = false;
    let mut noise_loud_started_at_secs: u64 = 0;
    loop {
        next_tick += Duration::from_secs(1);
        if let Some(remaining) = next_tick.checked_duration_since(Instant::now()) {
            std::thread::sleep(remaining);
        } else {
            // Phase 14 FR-2: next_tick pollution 차단. should_reset_next_tick 헬퍼로
            // 단위 테스트 가능하게 분리 (PR #15 cross-review 반영).
            // 정상 본문이 1초 이내 실행되는 한 거의 발화하지 않음. sleep/wake 후 monotonic Instant
            // 점프 케이스에서 1Hz 정상 진행을 복구한다. 다음 루프 선두 += 1초로 1Hz 회복.
            //
            // Phase 15 FR-9 (AC-8): reset 동작 흐름 ——
            // now_inst로 reset → 다음 루프 선두에서 next_tick += 1초 →
            // checked_duration_since(Instant::now())가 ~1초 remaining 반환 → 정상 thread::sleep 진입.
            // 이로써 sleep/wake 후 pollution이 누적된 상태에서도 다음 tick부터 1Hz 정상 복구된다.
            let now_inst = Instant::now();
            if crate::score::shared::should_reset_next_tick(
                now_inst.saturating_duration_since(next_tick),
            ) {
                next_tick = now_inst;
            }
            // 그 외(1초 미만 늦은 케이스)는 즉시 진행 — 기존 동작 유지.
        }

        // Phase 14 C-2: wall-clock drift detection (Windows sleep/wake 합성).
        // macOS는 NSWorkspace가 SLEEP_AT_UNIX_MS를 우선 set한 경우 보존 (BR-1).
        // detect_drift_sleep 순수 함수로 산출하여 단위 테스트 가능하게 분리.
        let now_wall = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let (synth, sleep_at_set, set_wake) = crate::score::shared::detect_drift_sleep(
            crate::score::shared::LAST_TICK_WALL_MS.load(Relaxed),
            now_wall,
            crate::score::shared::SLEEP_AT_UNIX_MS.load(Relaxed),
        );
        if synth {
            if let Some(s) = sleep_at_set {
                crate::score::shared::SLEEP_AT_UNIX_MS.store(s, Relaxed);
            }
            if set_wake {
                crate::score::shared::WAKE_FLAG.store(true, Relaxed);
            }
        }
        crate::score::shared::LAST_TICK_WALL_MS.store(now_wall, Relaxed);

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
        //
        // Break phase 점수 freeze (Phase 22+): cur_phase가 Break면 EMA 갱신 및 raw 산출을 모두
        // 스킵하고 BREAK_SNAPSHOT에 저장된 Focus 종료 시점 값을 그대로 사용한다.
        // 예외: Focus→Break 전이 tick에서는 cur_phase가 아직 Focus이므로 live 산출 → 후속에서 snapshot 저장.
        let cur_phase_pre = current_phase();
        let idle = if AX_GRANTED.load(Relaxed) {
            seconds_idle()
        } else {
            0
        };

        let (work_raw, work, noise, db, total, live, grace) =
            if cur_phase_pre == Phase::Break {
                if let Some((w, n, t, snap_db, g, l)) =
                    crate::score::shared::load_break_snapshot()
                {
                    // grace_from은 work_raw 기준 계산이지만, Break 중엔 snapshot grace를 그대로 노출.
                    // work_raw는 emit 페이로드에 포함되지 않으므로 0으로 placeholder.
                    (0u8, w, n, snap_db, t, l, g)
                } else {
                    // Snapshot 무효 (이론상 도달 불가) → live 산출 폴백.
                    let db_live = if MIC_GRANTED.load(Relaxed) {
                        load_db_ema()
                    } else {
                        0.0
                    };
                    let raw = work_score(idle);
                    let smoothed = update_work_ema(raw);
                    let w = smoothed.round().clamp(0.0, 80.0) as u8;
                    let n = noise_score(db_live);
                    let t = w.saturating_add(n);
                    (raw, w, n, db_live, t, state_from_total(t), grace_from(idle, raw))
                }
            } else {
                let db_live = if MIC_GRANTED.load(Relaxed) {
                    load_db_ema()
                } else {
                    0.0
                };
                // Issue #25: raw work_score는 step function이라 입력 정지/재개 시 점수가 급변한다.
                // EMA로 평활하여 부드럽게 수렴 (Phase 22+ 비대칭: 회복 tau=90s, 차감 tau=30s).
                // grace_from은 work=0 정확 판정이 필요하므로 raw 값을 그대로 전달.
                let raw = work_score(idle);
                let smoothed = update_work_ema(raw);
                let w = smoothed.round().clamp(0.0, 80.0) as u8;
                let n = noise_score(db_live);
                let t = w.saturating_add(n);
                (raw, w, n, db_live, t, state_from_total(t), grace_from(idle, raw))
            };

        // Phase 8 R-G2: Focus tick 세션 평균 누적은 phase transition 이후에 수행하여
        // wake tick에서 전이가 발생한 경우를 제외한다 (아래 phase 분기 후 phase_at_emit 조건 확인).

        // 3) phase 분기 (FR-4a/4b, AC-3 Complete 1-tick).
        let phase_at_emit;
        let time_left_for_emit;
        let cur_phase = cur_phase_pre;
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
                    // Focus→Break 전이: 현재 live 값을 freeze 스냅샷에 저장 (Break 동안 그대로 emit).
                    if cur_phase == Phase::Focus && to == Phase::Break {
                        crate::score::shared::store_break_snapshot(
                            work, noise, total, db, grace, live,
                        );
                    }
                    timer::on_phase_transition(&app, cur_phase, to);
                    // Break→Complete 전이: snapshot 무효화 (Complete tick부터 live 산출).
                    if cur_phase == Phase::Break && to == Phase::Complete {
                        crate::score::shared::clear_break_snapshot();
                    }
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

        // Phase 11 FR-7~9 / BR-3~5: noiseLoud hysteresis 진입 산출.
        // PR #11 리뷰: fetch_update로 원자화 (load-store race 방지).
        // store_phase가 다른 스레드에서 카운터를 0으로 리셋하면 클로저가 재호출되어
        // 새 prev=0 기준으로 (1, false)를 산출 → race 발생 시에도 일관성 보장.
        // phase_at_emit이 Idle 외이거나 db가 NaN/≤80이면 (0, false)로 즉시 리셋.
        // NOISE_LOUD_HYSTERESIS_TICKS(=5) 도달 시 active=true.
        let mut noise_loud_active = false;
        let _ = IDLE_NOISE_LOUD_TICKS.fetch_update(Relaxed, Relaxed, |prev| {
            let (new_count, active) =
                apply_noise_loud_hysteresis(phase_at_emit, db, prev);
            noise_loud_active = active;
            Some(new_count)
        });

        // Phase 18 FR-B5 (F): noise_enter/exit 전환 감지 (Idle phase 한정).
        // apply_noise_loud_hysteresis가 Idle 외 phase에서 (0, false)를 반환하므로
        // Focus/Break 진입 시 prev=true → cur=false 자연스러운 전환 → NoiseExit 합성 발화.
        // BR-B4: hysteresis 5틱 도달 시점이 noise_enter 기록 시점.
        let now_secs = crate::score::shared::START_AT
            .get()
            .map(|s| s.elapsed().as_secs())
            .unwrap_or(0);
        if !prev_noise_loud_active && noise_loud_active {
            noise_loud_started_at_secs = now_secs;
            crate::logger::write(crate::logger::LogEvent::NoiseEnter { db_ema: db });
        } else if prev_noise_loud_active && !noise_loud_active {
            let dur = now_secs.saturating_sub(noise_loud_started_at_secs);
            crate::logger::write(crate::logger::LogEvent::NoiseExit {
                db_ema: db,
                duration_secs: dur,
            });
        }
        prev_noise_loud_active = noise_loud_active;

        // Phase 8 R-G2: Focus tick에만 세션 평균 누적.
        // phase transition 블록 이후에 확인하여 wake tick에서 전이가 발생한 경우를 제외한다.
        if phase_at_emit == Phase::Focus {
            crate::score::shared::accumulate_session_score(total as u32);
        }

        // FR-D1~D3: Idle override 적용한 최종 tray_state.
        let tray_state = final_tray_state(live, phase_at_emit, db);
        // FR-C1~C3, BR-T3, BR-T4: phase=Focus|Break && time_left>0일 때만 mm:ss.
        let title = crate::tray::format_title(phase_at_emit, time_left_for_emit);

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
            noise_loud: noise_loud_active,
        };

        if let Err(e) = app.emit("score-tick", &snap) {
            // MUST-4: 1분당 1회 throttle.
            let n = EMIT_ERR_COUNT.fetch_add(1, Relaxed);
            if n == 0 || n % 60 == 0 {
                eprintln!("[mohashim] score-tick emit failed (#{n}): {e}");
            }
        }

        let state_changed = Some(tray_state) != prev_tray_state;
        let title_changed = Some(&title) != prev_title.as_ref();

        // 1) 아이콘: tray_state 변경 시 (BR-T7, AC-T11).
        if state_changed {
            match tray::apply_icon(&app, tray_state) {
                Ok(()) => {
                    prev_tray_state = Some(tray_state);
                }
                Err(e) => {
                    eprintln!("[mohashim] tray apply_icon failed: {e}");
                    // prev_tray_state 미갱신 → 다음 tick에서 재시도.
                }
            }
        }

        // 2) 툴팁: state 또는 title(mm:ss) 변경 시 갱신.
        // Issue #26: Windows는 set_title이 no-op이라 mm:ss를 호버 툴팁에 포함시켜야 한다.
        // macOS는 title이 메뉴바에 직접 노출되고 툴팁은 보조 정보로 동작.
        if state_changed || title_changed {
            let _ = tray::apply_tooltip_label(&app, tray_state, title.as_deref());
        }

        // 3) 타이틀: format_title 결과 변경 시에만 (None→None 재호출 방지).
        //   macOS NSStatusItem.title — 메뉴바 아이콘 옆 텍스트 노출.
        //   Windows — no-op (시스템 트레이는 라벨 미지원). mm:ss는 위 툴팁 경로로 가시화.
        if title_changed {
            match tray::apply_title(&app, title.as_deref()) {
                Ok(()) => {
                    prev_title = Some(title);
                }
                Err(e) => {
                    eprintln!("[mohashim] tray apply_title failed: {e}");
                    // prev_title 미갱신 → 다음 tick에서 재시도.
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
