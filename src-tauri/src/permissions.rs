use std::sync::atomic::Ordering::Relaxed;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PermissionStatus {
    Granted,
    Denied,
    NotDetermined,
}

#[derive(Serialize, Debug)]
pub struct PermissionState {
    pub mic: PermissionStatus,
    pub accessibility: PermissionStatus,
}

#[derive(Deserialize, Debug, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum PermissionKind {
    Microphone,
    Accessibility,
    /// Phase 21: 알림 권한 — macOS는 동일 origin 재요청 불가하므로 denied 시
    /// 시스템 설정 deep-link로 안내.
    Notification,
}

// =====================================================================
// 내부 헬퍼 (score 모듈 게이팅용)
// =====================================================================

/// score::start에서 권한 1회 조회용 동기 헬퍼.
pub fn current_mic_status() -> PermissionStatus {
    platform::mic_status()
}

/// score::start에서 권한 1회 조회용 동기 헬퍼.
pub fn current_accessibility_status() -> PermissionStatus {
    platform::accessibility_status()
}

// =====================================================================
// Tauri commands
// =====================================================================

#[tauri::command]
pub async fn permission_status(app: AppHandle) -> PermissionState {
    let mic = platform::mic_status();
    let accessibility = platform::accessibility_status();
    sync_runtime_grants(&app, mic, accessibility);
    PermissionState { mic, accessibility }
}

#[tauri::command]
pub async fn request_microphone_permission(app: AppHandle) -> Result<PermissionStatus, String> {
    let status = platform::request_microphone().await?;
    sync_runtime_grants(&app, status, platform::accessibility_status());
    Ok(status)
}

/// 마이크/AX 권한 변경을 런타임 atomic + audio thread에 반영한다.
///
/// 부팅 시점에 score::start가 권한 미부여 상태로 audio thread 미기동된 경우,
/// 이후 사용자가 권한을 부여한 시점(권한 다이얼로그/포커스 재조회)에 호출되어
/// MIC_GRANTED atomic을 갱신하고 audio thread를 멱등 기동한다. 미부여 시 db=0
/// 폴백 경로가 그대로 동작 — UI 측은 dBFS 0 → SPL 94 고정으로 보이지 않는다.
fn sync_runtime_grants(app: &AppHandle, mic: PermissionStatus, accessibility: PermissionStatus) {
    let mic_granted = mic == PermissionStatus::Granted;
    let ax_granted = accessibility == PermissionStatus::Granted;
    crate::score::shared::MIC_GRANTED.store(mic_granted, Relaxed);
    crate::score::shared::AX_GRANTED.store(ax_granted, Relaxed);
    if mic_granted {
        if let Err(e) = crate::audio::start(app.clone()) {
            eprintln!("[mohashim] audio start (post-grant) failed: {e}");
        }
    }
}

/// 설계 §6.1/C2: AX 다이얼로그를 트리거하지 않는다. status 조회만 수행한다.
#[tauri::command]
pub async fn request_accessibility_permission() -> Result<PermissionStatus, String> {
    Ok(platform::accessibility_status())
}

#[tauri::command]
pub async fn open_permission_settings(
    app: AppHandle,
    kind: PermissionKind,
) -> Result<(), String> {
    let url = platform::settings_url(kind);
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("open_url failed: {e}"))
}

// =====================================================================
// Platform 분기
// =====================================================================

#[cfg(target_os = "macos")]
mod platform {
    use super::PermissionKind;
    use super::PermissionStatus;

    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_av_foundation::{
        AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio,
    };
    use tokio::sync::oneshot;

    // ApplicationServices framework 의 AXIsProcessTrusted 직접 link (C2/C4: prompt 옵션 사용 안 함).
    // 반환 타입은 u8로 두어 0/1 외 값에 대한 UB를 회피한다 (ObjC BOOL은 signed char).
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> u8;
    }

    pub fn mic_status() -> PermissionStatus {
        // Safety: read-only 조회. AVMediaTypeAudio 심볼이 부재하면 보수적으로 Denied 반환.
        let status = unsafe {
            let Some(media_type) = AVMediaTypeAudio else {
                return PermissionStatus::Denied;
            };
            AVCaptureDevice::authorizationStatusForMediaType(media_type)
        };
        map_av_status(status)
    }

    pub fn accessibility_status() -> PermissionStatus {
        // Safety: AXIsProcessTrusted는 prompt 없이 trusted 여부만 반환.
        // u8로 받아 0/1 외 비트 패턴에 대해서도 안전하게 비교한다.
        let trusted = unsafe { AXIsProcessTrusted() } != 0;
        if trusted {
            PermissionStatus::Granted
        } else {
            PermissionStatus::Denied
        }
    }

    pub async fn request_microphone() -> Result<PermissionStatus, String> {
        let (tx, rx) = oneshot::channel::<bool>();

        // RcBlock은 !Send라 future에 잔존시키면 안 된다. ObjC는 호출 시 자체 retain하므로
        // 호출 직후 로컬 RcBlock을 drop해도 안전 — 이후 await에서 Send 보장.
        // AVMediaTypeAudio 심볼 부재 시 즉시 Denied 폴백.
        {
            let tx_slot = std::sync::Mutex::new(Some(tx));
            let block = RcBlock::new(move |granted: Bool| {
                if let Ok(mut guard) = tx_slot.lock() {
                    if let Some(tx) = guard.take() {
                        let _ = tx.send(granted.as_bool());
                    }
                }
            });
            let media_type = match unsafe { AVMediaTypeAudio } {
                Some(m) => m,
                None => return Ok(PermissionStatus::Denied),
            };
            unsafe {
                AVCaptureDevice::requestAccessForMediaType_completionHandler(
                    media_type,
                    &block,
                );
            }
            // block (RcBlock)은 이 scope 끝에서 drop됨. ObjC는 자체 copy 보유.
        }

        // 타임아웃 없음(D2/C3). sender drop → Err → Denied 폴백.
        match rx.await {
            Ok(true) => Ok(PermissionStatus::Granted),
            Ok(false) => Ok(PermissionStatus::Denied),
            Err(_) => Ok(PermissionStatus::Denied),
        }
    }

    pub fn settings_url(kind: PermissionKind) -> String {
        match kind {
            PermissionKind::Microphone => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
                    .to_string()
            }
            PermissionKind::Accessibility => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
                    .to_string()
            }
            PermissionKind::Notification => {
                // macOS Ventura+ Notifications 설정 패널.
                "x-apple.systempreferences:com.apple.preference.notifications".to_string()
            }
        }
    }

    fn map_av_status(status: AVAuthorizationStatus) -> PermissionStatus {
        // 0 NotDetermined, 1 Restricted, 2 Denied, 3 Authorized.
        match status.0 {
            0 => PermissionStatus::NotDetermined,
            3 => PermissionStatus::Granted,
            _ => PermissionStatus::Denied,
        }
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::PermissionKind;
    use super::PermissionStatus;

    pub fn mic_status() -> PermissionStatus {
        PermissionStatus::Granted
    }

    pub fn accessibility_status() -> PermissionStatus {
        PermissionStatus::Granted
    }

    pub async fn request_microphone() -> Result<PermissionStatus, String> {
        Ok(PermissionStatus::Granted)
    }

    pub fn settings_url(kind: PermissionKind) -> String {
        match kind {
            PermissionKind::Microphone => "ms-settings:privacy-microphone".to_string(),
            PermissionKind::Accessibility => "ms-settings:privacy".to_string(),
            PermissionKind::Notification => "ms-settings:notifications".to_string(),
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    use super::PermissionKind;
    use super::PermissionStatus;

    pub fn mic_status() -> PermissionStatus {
        PermissionStatus::Granted
    }

    pub fn accessibility_status() -> PermissionStatus {
        PermissionStatus::Granted
    }

    pub async fn request_microphone() -> Result<PermissionStatus, String> {
        Ok(PermissionStatus::Granted)
    }

    pub fn settings_url(kind: PermissionKind) -> String {
        match kind {
            PermissionKind::Microphone => "ms-settings:privacy-microphone".to_string(),
            PermissionKind::Accessibility => "ms-settings:privacy".to_string(),
            PermissionKind::Notification => "ms-settings:notifications".to_string(),
        }
    }
}
