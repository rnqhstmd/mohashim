use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;
use tauri::{AppHandle, Runtime};

use crate::score::ema::{rms_to_db, update_ema};
use crate::score::shared::{load_db_ema, store_db_ema};

/// 오디오 캡처 스레드 기동 (FR-9, MUST-2).
///
/// `mohashim-audio` 스레드 안에서 cpal Stream을 보유하고 `thread::park()`로 영구 대기한다.
/// Stream(!Send)은 스레드 수명 동안만 살아있으며, 이 스레드가 사라지면 함께 drop된다.
/// 빌드/장치/스트림 에러 발생 시 eprintln 후 스레드 종료 → db_ema=0.0 폴백 (BR-6).
///
/// `app` 인자는 후속 Phase에서 80dB 경고 emit 용으로 보존한다.
pub fn start<R: Runtime>(_app: AppHandle<R>) -> Result<(), String> {
    std::thread::Builder::new()
        .name("mohashim-audio".into())
        .spawn(move || {
            run_audio_loop();
        })
        .map(|_| ())
        .map_err(|e| format!("audio thread spawn failed: {e}"))
}

fn run_audio_loop() {
    let host = cpal::default_host();
    let device = match host.default_input_device() {
        Some(d) => d,
        None => {
            eprintln!("[mohashim] no default input device");
            store_db_ema(0.0);
            return;
        }
    };
    let config = match device.default_input_config() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[mohashim] default_input_config failed: {e}");
            store_db_ema(0.0);
            return;
        }
    };
    let sample_format = config.sample_format();
    let stream_cfg: cpal::StreamConfig = config.clone().into();

    // err_cb: cpal Stream 콜백 에러는 eprintln + db_ema=0.0 폴백 (BR-6).
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
            return;
        }
    };

    let stream = match stream_result {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[mohashim] build_input_stream failed: {e}");
            store_db_ema(0.0);
            return;
        }
    };

    if let Err(e) = stream.play() {
        eprintln!("[mohashim] stream.play failed: {e}");
        store_db_ema(0.0);
        return;
    }

    // Stream(!Send/!Sync)은 이 스레드가 살아있는 동안만 콜백 발화.
    // spurious wakeup 방어: park가 깨어나도 loop로 다시 park → Stream 살아있는 상태 유지.
    // stream 변수는 이 함수 종료 시 drop되지만, 본 loop는 영원히 돌아 도달하지 않는다.
    let _stream_guard = stream;
    loop {
        std::thread::park();
    }
}

/// cpal Stream 콜백 에러 핸들러 (BR-6).
///
/// 캡처 없는 fn 포인터로 정의하여 의도(정적 함수, 상태 비공유)를 명시한다.
fn on_stream_error(e: cpal::StreamError) {
    eprintln!("[mohashim] cpal stream error: {e}");
    store_db_ema(0.0);
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
