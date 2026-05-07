//! 시스템 슬립/wake 이벤트 옵저버 (DEC-10, MUST-4).
//!
//! macOS: `NSWorkspace.notificationCenter`에 WillSleep/DidWake 옵저버 등록.
//! 콜백 본문은 atomic store만 수행 (lock-free, Send 무관).
//! 비즈니스 로직(grace 판정 + Discarded)은 `score::tick`의 `drain_wake_event`가 처리.
//!
//! Windows/기타 OS: 직접 옵저버 미등록. score/mod.rs의 tick_loop이 wall-clock
//! drift를 감지하여 SLEEP_AT_UNIX_MS / WAKE_FLAG를 합성한다 (Phase 14 C-2 fix).

use std::sync::atomic::Ordering::Relaxed;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Runtime};

use crate::score::shared::{SLEEP_AT_UNIX_MS, WAKE_FLAG};

/// 슬립/wake 옵저버 기동.
///
/// macOS: NSWorkspace 옵저버 등록 (메인 RunLoop 정합).
/// 기타 OS: 즉시 Ok.
pub fn start<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        platform::start_observer(app)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(())
    }
}

/// wake 이벤트 소비 (score::tick 진입부에서 1회 호출).
///
/// `WAKE_FLAG=true && SLEEP_AT_UNIX_MS != 0`이면 wall-clock 경과 초를 산출하고
/// atomic을 reset한 뒤 `Some(elapsed_secs)` 반환. 그 외 None.
pub fn drain_wake_event() -> Option<u64> {
    if !WAKE_FLAG.load(Relaxed) {
        return None;
    }
    let sleep_at = SLEEP_AT_UNIX_MS.load(Relaxed);
    if sleep_at == 0 {
        // 비정상: WAKE_FLAG만 set된 케이스. 플래그만 reset 후 무시.
        WAKE_FLAG.store(false, Relaxed);
        return None;
    }
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let elapsed_secs = now_ms.saturating_sub(sleep_at) / 1000;

    SLEEP_AT_UNIX_MS.store(0, Relaxed);
    WAKE_FLAG.store(false, Relaxed);
    Some(elapsed_secs)
}

// =====================================================================
// macOS 구현 (NSWorkspace WillSleep/DidWake)
// =====================================================================

#[cfg(target_os = "macos")]
mod platform {
    use std::sync::atomic::Ordering::Relaxed;
    use std::time::{SystemTime, UNIX_EPOCH};

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::NSNotification;
    use tauri::{AppHandle, Manager, Runtime};

    use crate::score::shared::{SLEEP_AT_UNIX_MS, WAKE_FLAG};

    /// NSWorkspace observer 토큰 retain holder. `app.manage`로 retain하여 앱 수명 동안 유지한다.
    ///
    /// `Retained<AnyObject>`는 기본 `!Send`이므로 Tauri State 요건을 충족하기 위해
    /// `Send`/`Sync`를 unsafe impl한다. 안전성 근거:
    /// - 토큰은 등록 후 NSNotificationCenter 측이 retain. Drop 시점은 앱 종료 시
    ///   removeObserver 호출(생략 가능, 프로세스 종료로 자연 회수).
    /// - 본 구조체는 read-only retain holder. 다른 스레드에서 직접 메서드 호출 안 함.
    ///
    /// SAFETY (Drop 정책): macOS NSNotificationCenter는 등록된 observer를 자체 retain하며,
    /// 프로세스 종료 시 자동 정리한다. ObserverHolder Drop이 어느 스레드에서 발생하든
    /// `Retained::release` 호출은 thread-safe하다 (Apple 공식 보장 — 모든 NSObject release).
    /// 명시적 `removeObserver:` 호출은 본 Phase에서 미적용 (앱 수명과 동일).
    struct ObserverHolder {
        _will_sleep: Retained<AnyObject>,
        _did_wake: Retained<AnyObject>,
    }
    unsafe impl Send for ObserverHolder {}
    unsafe impl Sync for ObserverHolder {}

    pub fn start_observer<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
        // NSWorkspace.sharedWorkspace는 메인 스레드 호출 권장 — Tauri 2.x setup
        // 클로저는 NSApplication 메인 RunLoop에서 실행되므로 정합.
        let workspace = NSWorkspace::sharedWorkspace();
        let center = workspace.notificationCenter();

        let will_sleep_name = unsafe { objc2_app_kit::NSWorkspaceWillSleepNotification };
        let did_wake_name = unsafe { objc2_app_kit::NSWorkspaceDidWakeNotification };

        // WillSleep 콜백: SLEEP_AT_UNIX_MS에 wall-clock ms 기록.
        // 이전 sleep이 미소비 상태(WAKE_FLAG=false && SLEEP_AT_UNIX_MS!=0)면 덮어쓰지 않음.
        // 닫힌 lid 상태에서 외부 디스플레이 사용 등으로 DidWake 없이 다음 sleep이 시도되는
        // 케이스에서 가장 오래된 sleep_at_unix_ms를 보존하여 grace 판정의 wall-clock 기준이
        // 의도치 않게 짧아지는 회귀를 방지한다.
        let will_sleep_block = RcBlock::new(move |_n: std::ptr::NonNull<NSNotification>| {
            if WAKE_FLAG.load(Relaxed) || SLEEP_AT_UNIX_MS.load(Relaxed) == 0 {
                let now_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                SLEEP_AT_UNIX_MS.store(now_ms, Relaxed);
                WAKE_FLAG.store(false, Relaxed);
            }
        });

        // DidWake 콜백: WAKE_FLAG=true. score::tick이 다음 1Hz tick에서 처리.
        let did_wake_block = RcBlock::new(move |_n: std::ptr::NonNull<NSNotification>| {
            WAKE_FLAG.store(true, Relaxed);
        });

        // queue=nil + setup 메인 RunLoop 등록 → 콜백은 등록 스레드 RunLoop에서 발화.
        let will_sleep_token = unsafe {
            center.addObserverForName_object_queue_usingBlock(
                Some(&will_sleep_name),
                None,
                None,
                &will_sleep_block,
            )
        };
        let did_wake_token = unsafe {
            center.addObserverForName_object_queue_usingBlock(
                Some(&did_wake_name),
                None,
                None,
                &did_wake_block,
            )
        };

        // protocol → AnyObject 캐스팅하여 Tauri State에 retain.
        let holder = ObserverHolder {
            _will_sleep: unsafe { Retained::cast_unchecked(will_sleep_token) },
            _did_wake: unsafe { Retained::cast_unchecked(did_wake_token) },
        };
        app.manage(holder);

        Ok(())
    }
}
