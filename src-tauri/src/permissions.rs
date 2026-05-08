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
    // Phase 21 (Windows): mic privacy 다이얼로그가 없으므로 Settings deep-link로
    // 사용자가 직접 활성화하도록 안내. macOS는 platform::request_microphone이
    // AVCaptureDevice.requestAccess로 다이얼로그를 트리거하므로 별도 deep-link 불필요.
    #[cfg(target_os = "windows")]
    {
        let _ = app
            .opener()
            .open_url("ms-settings:privacy-microphone", None::<&str>);
    }
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

/// 설계 §6.1/C2: macOS는 AX 다이얼로그를 트리거하지 않는다 (status 조회만 수행).
/// Windows는 OS에 "접근성 권한"이라는 개념 자체가 없으므로, 사용자의 토글 클릭을
/// 의도 표시로 받아들여 INTERACTED 마킹 → 즉시 Granted 반환 (BR-9 TOFU 일관성).
/// 시스템 설정 페이지를 열지 않는다 — Windows의 "개인 정보 및 보안"에는 접근성
/// 항목이 없어 사용자가 혼란스러워하던 문제 해결.
#[tauri::command]
pub async fn request_accessibility_permission(
    app: AppHandle,
) -> Result<PermissionStatus, String> {
    #[cfg(target_os = "windows")]
    {
        use std::sync::atomic::Ordering::Relaxed;
        platform::AX_INTERACTED.store(true, Relaxed);
    }
    let status = platform::accessibility_status();
    sync_runtime_grants(&app, platform::mic_status(), status);
    Ok(status)
}

#[tauri::command]
pub async fn open_permission_settings(
    app: AppHandle,
    kind: PermissionKind,
) -> Result<(), String> {
    // Phase 21 사용자 피드백 (Windows): 사용자가 Settings를 한 번이라도 열면 해당 권한을
    // INTERACTED로 마킹하여 후속 permission_status가 granted를 반환하도록 한다 — Windows는
    // OS API로 권한 검증이 불가하므로 trust-on-first-use 정책 (BR-9). macOS는 변경 없음.
    #[cfg(target_os = "windows")]
    {
        use std::sync::atomic::Ordering::Relaxed;
        match kind {
            PermissionKind::Microphone => platform::MIC_INTERACTED.store(true, Relaxed),
            PermissionKind::Accessibility => platform::AX_INTERACTED.store(true, Relaxed),
            PermissionKind::Notification => {
                // 알림은 Tauri plugin (web Notification API)이 별도로 status를 관리.
            }
        }
    }
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
    use std::sync::atomic::{AtomicBool, Ordering::Relaxed};

    use super::PermissionKind;
    use super::PermissionStatus;

    /// Phase 21 사용자 피드백 (Windows): mic 권한은 OS API로 직접 검증할 수 없으므로
    /// trust-on-first-use로 동작 — 사용자가 토글을 눌러 Settings를 열면 INTERACTED
    /// 플래그를 set하고, 후속 status 조회는 granted를 반환한다.
    pub static MIC_INTERACTED: AtomicBool = AtomicBool::new(false);

    /// Windows에는 OS 레벨에 "접근성 권한"이라는 개념 자체가 없어 사용자가 시스템 설정
    /// 어딘가에서 켤 수 있는 토글이 부재한다. 따라서 부팅 시점부터 granted로 간주하여
    /// 온보딩 화면의 접근성 토글이 처음부터 ON+disabled로 노출되게 한다 — 사용자가
    /// 빈 설정 페이지를 보고 혼란스러워하던 회귀 영구 해결.
    pub static AX_INTERACTED: AtomicBool = AtomicBool::new(true);

    pub fn mic_status() -> PermissionStatus {
        if MIC_INTERACTED.load(Relaxed) {
            PermissionStatus::Granted
        } else {
            PermissionStatus::NotDetermined
        }
    }

    pub fn accessibility_status() -> PermissionStatus {
        if AX_INTERACTED.load(Relaxed) {
            PermissionStatus::Granted
        } else {
            PermissionStatus::NotDetermined
        }
    }

    pub async fn request_microphone() -> Result<PermissionStatus, String> {
        // Windows는 mic privacy 다이얼로그를 앱에서 트리거할 수 없다. 토글 호출 자체를
        // 사용자 의도 표시로 받아들여 INTERACTED를 마킹 → 후속 status가 granted.
        // 호출자(request_microphone_permission Tauri command)에서 Settings deep-link를
        // 별도로 연다.
        MIC_INTERACTED.store(true, Relaxed);
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
