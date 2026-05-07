use std::sync::atomic::{AtomicBool, Ordering::AcqRel, Ordering::Acquire, Ordering::Relaxed};
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;
use tauri::{AppHandle, Runtime};

use crate::score::ema::{rms_to_db, update_ema};
use crate::score::shared::{load_db_ema, store_db_ema};

/// Phase 15 H-3 (FR-1): cpal Stream 콜백 에러 신호.
///
/// `on_stream_error` (fn 포인터, capture 불가)가 모듈 레벨 atomic을 set한다.
/// `run_audio_session`이 1Hz 폴링 루프에서 이 플래그를 감지하면 stream을 drop하고
/// `run_audio_loop`의 outer reconnect 루프로 복귀한다 (FR-2).
// PR #16 리뷰 (gemini): 모듈 내부 신호이므로 pub 제거 (캡슐화).
static AUDIO_STREAM_ERROR: AtomicBool = AtomicBool::new(false);

/// 오디오 스레드 기동 idempotency 가드. 부팅 시 권한 미부여 → 후속 권한 부여 시
/// 재시도 호출 가능하도록 SCORE_STARTED와 별개의 atomic을 둔다 (DB 94 고정 회귀 방지).
static AUDIO_STARTED: AtomicBool = AtomicBool::new(false);

/// 오디오 캡처 스레드 기동 (FR-9, MUST-2).
///
/// `mohashim-audio` 스레드 안에서 outer reconnect 루프(`run_audio_loop`)를 돌린다.
/// Phase 15 H-3 (FR-2/3): session 실패 시 지수 백오프(1→2→4→8→16→30초 상한)로 재시도.
/// 마이크 분리/재연결 등 일시적 실패에서 앱 재시작 없이 자동 복구한다.
///
/// 멱등 호출 — 이미 시작됐으면 즉시 Ok 반환. 부팅 시 권한 미부여 → 사용자 권한 부여
/// 시점에 다시 호출되는 경로(permission_status IPC)에서 안전하게 통과한다.
pub fn start<R: Runtime>(_app: AppHandle<R>) -> Result<(), String> {
    if AUDIO_STARTED
        .compare_exchange(false, true, AcqRel, Acquire)
        .is_err()
    {
        return Ok(());
    }
    let spawn_result = std::thread::Builder::new()
        .name("mohashim-audio".into())
        .spawn(move || {
            run_audio_loop();
        });
    match spawn_result {
        Ok(_) => Ok(()),
        Err(e) => {
            AUDIO_STARTED.store(false, Relaxed);
            Err(format!("audio thread spawn failed: {e}"))
        }
    }
}

/// Phase 15 H-3 (FR-2/3): outer reconnect 루프 + 지수 백오프.
///
/// session 실패(=true) 시 백오프 후 재시도. 정상 종료(=false)는 안전장치 (실제로는 발생 안 함).
/// 백오프: 1→2→4→8→16→30초 상한 (BR-2: CPU 부하 vs 복구 지연 균형).
///
/// PR #16 리뷰 (gemini/copilot): 세션이 60초 이상 정상 유지된 후 발생한 에러는
/// 누적 백오프와 무관하므로 1초로 리셋 — 오랜 정상 동작 후 단일 에러에서 30초 대기 회피.
fn run_audio_loop() {
    let mut backoff_secs: u64 = 1;
    loop {
        AUDIO_STREAM_ERROR.store(false, Relaxed);
        let session_start = std::time::Instant::now();
        let session_failed = run_audio_session();
        if !session_failed {
            break;
        }
        // 세션이 60초 이상 정상 유지된 후 에러면 백오프 초기화 (PR #16 리뷰).
        if session_start.elapsed() >= Duration::from_secs(60) {
            backoff_secs = 1;
        }
        eprintln!("[mohashim] audio retry in {}s", backoff_secs);
        std::thread::sleep(Duration::from_secs(backoff_secs));
        backoff_secs = (backoff_secs * 2).min(30);
    }
}

/// 단일 오디오 세션 실행. 반환값: true=실패(재시도 필요), false=정상 종료.
///
/// stream 변수는 함수 내에서 보유되며 함수 종료(return) 시 자동 drop된다.
/// FR-4 (BR-6 정합): 실패/재시도 진입 시 `db_ema = 0.0` 보장 (마이크 끊김 = 무음).
fn run_audio_session() -> bool {
    let host = cpal::default_host();
    let device = match host.default_input_device() {
        Some(d) => d,
        None => {
            eprintln!("[mohashim] no default input device");
            store_db_ema(0.0);
            return true;
        }
    };
    let config = match device.default_input_config() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[mohashim] default_input_config failed: {e}");
            store_db_ema(0.0);
            return true;
        }
    };
    let sample_format = config.sample_format();
    let stream_cfg: cpal::StreamConfig = config.clone().into();

    // err_cb: cpal Stream 콜백 에러는 eprintln + db_ema=0.0 폴백 (BR-6) + AUDIO_STREAM_ERROR set (FR-1).
    // fn 포인터로 정의하여 캡처 없는 정적 함수임을 의도 명시.
    let stream_result = match sample_format {
        SampleFormat::I16 => device.build_input_stream(
            &stream_cfg,
            move |data: &[i16], _: &cpal::InputCallbackInfo| process_i16(data),
            on_stream_error,
            None,
        ),
        SampleFormat::U16 => device.build_input_stream(
            &stream_cfg,
            move |data: &[u16], _: &cpal::InputCallbackInfo| process_u16(data),
            on_stream_error,
            None,
        ),
        SampleFormat::F32 => device.build_input_stream(
            &stream_cfg,
            move |data: &[f32], _: &cpal::InputCallbackInfo| process_f32(data),
            on_stream_error,
            None,
        ),
        other => {
            eprintln!("[mohashim] unsupported sample format: {other:?}");
            store_db_ema(0.0);
            return true;
        }
    };

    let stream = match stream_result {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[mohashim] build_input_stream failed: {e}");
            store_db_ema(0.0);
            return true;
        }
    };

    if let Err(e) = stream.play() {
        eprintln!("[mohashim] stream.play failed: {e}");
        store_db_ema(0.0);
        return true;
    }

    // Phase 15 H-3 (FR-2/4): 1Hz 폴링으로 AUDIO_STREAM_ERROR 감지.
    // 신호 발생 시 stream(_stream_guard)을 함수 종료로 drop → outer 루프가 재시도.
    let _stream_guard = stream;
    loop {
        std::thread::sleep(Duration::from_secs(1));
        if AUDIO_STREAM_ERROR.load(Relaxed) {
            store_db_ema(0.0);
            return true;
        }
    }
}

/// cpal Stream 콜백 에러 핸들러 (BR-6, Phase 15 FR-1).
///
/// 캡처 없는 fn 포인터로 정의하여 의도(정적 함수, 상태 비공유)를 명시한다.
/// AUDIO_STREAM_ERROR atomic을 set하여 session 폴링 루프가 stream drop + 재시도하도록 신호.
///
/// Phase 18 FR-B5 (G): cpal 콜백 스레드 비차단 정책 — logger::write가 락을 잡으므로 직접 호출하지
/// 않고 `std::thread::spawn`으로 위임한다. 콜백이 락 경합으로 블로킹되는 것을 방지한다.
fn on_stream_error(e: cpal::StreamError) {
    eprintln!("[mohashim] cpal stream error: {e}");
    store_db_ema(0.0);
    AUDIO_STREAM_ERROR.store(true, Relaxed);
    let msg = e.to_string();
    std::thread::spawn(move || {
        crate::logger::write(crate::logger::LogEvent::AudioError { message: msg });
    });
}

/// i16 PCM → 정규화 RMS → dB → EMA 갱신.
fn process_i16(data: &[i16]) {
    if data.is_empty() {
        return;
    }
    let mut sum_sq: f64 = 0.0;
    for &sample in data {
        let norm = sample as f32 / i16::MAX as f32;
        sum_sq += (norm as f64) * (norm as f64);
    }
    let rms = (sum_sq / data.len() as f64).sqrt() as f32;
    apply_ema(rms);
}

/// u16 PCM → 정규화 RMS → dB → EMA 갱신.
fn process_u16(data: &[u16]) {
    if data.is_empty() {
        return;
    }
    let mut sum_sq: f64 = 0.0;
    for &sample in data {
        // u16 → 중앙(=u16::MAX/2)을 0으로 평행이동 후 정규화.
        let centered = sample as f32 - (u16::MAX as f32 / 2.0);
        let norm = centered / (u16::MAX as f32 / 2.0);
        sum_sq += (norm as f64) * (norm as f64);
    }
    let rms = (sum_sq / data.len() as f64).sqrt() as f32;
    apply_ema(rms);
}

/// f32 PCM (이미 -1..=1 정규화) → RMS → dB → EMA 갱신.
fn process_f32(data: &[f32]) {
    if data.is_empty() {
        return;
    }
    let mut sum_sq: f64 = 0.0;
    for &sample in data {
        sum_sq += (sample as f64) * (sample as f64);
    }
    let rms = (sum_sq / data.len() as f64).sqrt() as f32;
    apply_ema(rms);
}

/// 공통 EMA 갱신 경로.
fn apply_ema(rms: f32) {
    let db = rms_to_db(rms);
    let prev = load_db_ema();
    let next = update_ema(prev, db);
    store_db_ema(next);
}
