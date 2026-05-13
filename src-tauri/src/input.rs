//! 사용자 입력 idle 감지 — OS 표준 polling API 기반.
//!
//! v1.0.6 (방안 A): rdev 0.5의 WH_KEYBOARD_LL hook이 콜백 진입 전에 ToUnicodeEx /
//! GetKeyboardState를 호출해 한국어 IME의 dead-key/입력 큐를 망가뜨려 한·영 동시 입력
//! 회귀가 발생하던 문제를 차단하기 위해 이벤트 후킹에서 OS 표준 polling으로 전환했다.
//! 이 모듈은 더 이상 키 코드/문자를 읽지 않으며, 시스템이 자체적으로 기록하는 "마지막
//! 입력 시각"만 조회한다 — 사용자 입력 큐/IME 상태에 무영향(zero side-effect).
//!
//! - Windows: GetLastInputInfo + GetTickCount → idle ms
//! - macOS: CGEventSourceSecondsSinceLastEventType(CombinedSessionState, AnyInputEventType)
//!
//! 폴링 주기 1초 (score tick과 동일). idle 표시의 최대 지연은 1초 — score 단위 자체가
//! 1초이므로 사용자 체감 차이 없음.

use std::sync::atomic::Ordering::Relaxed;
use std::thread;
use std::time::Duration;

use crate::score::shared::{now_ms, LAST_INPUT_AT_MS};

const POLL_INTERVAL: Duration = Duration::from_secs(1);

/// 입력 polling 스레드 기동. `mohashim-input` 이름의 단일 데몬 스레드를 spawn한다.
/// 시그니처는 rdev 기반 구현과 동일하게 유지되어 호출자(lib.rs) 변경 없음.
pub fn start() -> Result<(), String> {
    thread::Builder::new()
        .name("mohashim-input".into())
        .spawn(input_loop)
        .map(|_| ())
        .map_err(|e| format!("input thread spawn failed: {e}"))
}

/// 1초마다 OS API로 idle ms를 조회해 `LAST_INPUT_AT_MS`(epoch ms)를 갱신한다.
/// API 실패 시 store를 건너뛰고 다음 주기로 — 이전 값이 유지되어 idle이 자연스럽게 증가한다.
fn input_loop() {
    loop {
        if let Some(idle_ms) = get_idle_ms() {
            let now = now_ms();
            // now가 idle_ms보다 작으면 시스템 시계 점프 또는 부팅 직후 상태 — 저장 건너뜀.
            if now > idle_ms {
                LAST_INPUT_AT_MS.store(now - idle_ms, Relaxed);
            }
        }
        thread::sleep(POLL_INTERVAL);
    }
}

/// 마지막 입력 후 경과 시간(ms). 실패 시 None.
#[cfg(target_os = "windows")]
fn get_idle_ms() -> Option<u64> {
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    let mut info = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    // GetLastInputInfo는 시스템이 자체적으로 기록한 last-input tick(GetTickCount 기반)을 읽기만 한다.
    // hook 미설치이므로 IME / dead-key / sticky-key 등 사용자 입력 상태에 영향 없음.
    let ok = unsafe { GetLastInputInfo(&mut info) };
    if !ok.as_bool() {
        return None;
    }
    // GetTickCount는 49.7일마다 rollover. wrapping_sub로 안전 처리.
    let now_tick = unsafe { GetTickCount() };
    Some(now_tick.wrapping_sub(info.dwTime) as u64)
}

#[cfg(target_os = "macos")]
fn get_idle_ms() -> Option<u64> {
    // CoreGraphics framework의 CGEventSourceSecondsSinceLastEventType는 macOS의 입력 큐를
    // read-only로 조회. CGEventTap을 설치하지 않으므로 임의 입력 변형이나 권한 요청 없음.
    // - state_id = kCGCombinedSessionState (0): 시스템 전체 세션의 입력 이벤트
    // - event_type = kCGAnyInputEventType (~0_u32): 키보드/마우스/스크롤 통합
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state_id: u32, event_type: u32) -> f64;
    }
    const K_CG_COMBINED_SESSION_STATE: u32 = 0;
    const K_CG_ANY_INPUT_EVENT_TYPE: u32 = u32::MAX;

    let seconds = unsafe {
        CGEventSourceSecondsSinceLastEventType(
            K_CG_COMBINED_SESSION_STATE,
            K_CG_ANY_INPUT_EVENT_TYPE,
        )
    };
    if !seconds.is_finite() || seconds < 0.0 {
        return None;
    }
    Some((seconds * 1000.0) as u64)
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn get_idle_ms() -> Option<u64> {
    // Linux 등 미지원 플랫폼은 polling 결과 없음 — input 스레드는 1초마다 no-op 회전.
    None
}
