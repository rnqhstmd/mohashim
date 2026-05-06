mod audio;
mod input;
mod permissions;
mod power;
pub mod score;
mod storage;
mod timer;
mod tray;

use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            permissions::permission_status,
            permissions::request_microphone_permission,
            permissions::request_accessibility_permission,
            permissions::open_permission_settings,
            timer::focus_start,
            timer::discard_session,
            storage::reset_all,
            storage::get_auto_launch,
            storage::set_auto_launch,
        ])
        .setup(|app| {
            // setup 순서: storage 시드 → boot discard → power observer → tray → score.
            // boot discard는 score::start (tick 시작) 이전에 실행해야 한다 (DEC-11).
            if let Err(err) = storage::init(app.handle()) {
                eprintln!("[mohashim] storage init failed: {err}");
            }
            // FR-18 / BR-5: 메인 윈도우 X 클릭 시 종료 대신 hide. 트레이 클릭으로 재노출.
            install_main_window_close_guard(app.handle());
            // FR-9 / DEC-9-1: store ↔ OS launcher 정합. 실패는 eprintln 후 진행 (DEC-9-2).
            if let Err(err) = sync_autolaunch(app.handle()) {
                eprintln!("[mohashim] autolaunch sync failed: {err}");
            }
            if let Err(err) = timer::auto_discard_on_boot(app.handle()) {
                eprintln!("[mohashim] timer auto_discard_on_boot failed: {err}");
            }
            if let Err(err) = power::start(app.handle()) {
                eprintln!("[mohashim] power start failed: {err}");
            }
            if let Err(err) = tray::init_tray(app.handle()) {
                eprintln!("[mohashim] tray init failed: {err}");
            }
            // FR-14 / DEC-9-5: 신규 인스톨(onboarding_completed=false) 첫 부팅에서만
            // 메인 윈도우를 명시적으로 노출. 이후 부팅은 트레이 클릭으로만 노출 (FR-15).
            show_window_for_onboarding(app.handle());
            if let Err(err) = score::start(app.handle()) {
                // PRD에 startup 실패 정책 명시 없음. 본 Phase는 eprintln 후 계속 구동.
                // tick 미시작 시 score-tick 이벤트 미발생 + focus_start는 atomic 갱신만 발생하여
                // 카운트다운 부재. 후속 Phase에서 시각적 fallback 검토 필요.
                eprintln!("[mohashim] score start failed: {err}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// store `auto_launch_enabled` ↔ OS launcher 정합 (FR-9, DEC-9-1).
///
/// store read만 수행하고 store write는 하지 않는다 — `set_auto_launch` IPC 단일 writer
/// 정책 유지. is_enabled 실패 시 false로 폴백하여 want=true일 때 enable 시도, false일 때 no-op.
fn sync_autolaunch<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let want = storage::get_auto_launch_enabled(app);
    let manager = app.autolaunch();
    let is_enabled = manager.is_enabled().unwrap_or(false);
    if want == is_enabled {
        return Ok(());
    }
    let res = if want {
        manager.enable()
    } else {
        manager.disable()
    };
    res.map_err(|e| format!("autolaunch sync failed: {e}"))
}

/// 신규 인스톨 첫 부팅 시 메인 윈도우 자동 노출 (FR-14, DEC-9-5, DEC-9-9).
///
/// `onboarding_completed=true`(기존 사용자)면 즉시 return — 부팅 시 윈도우가 자동으로
/// 떠오르지 않도록 한다 (FR-15). false 또는 누락(신규 인스톨) 시 `attempt_show`를
/// 호출해 None 폴백 재시도 1회까지 시도한다 (DEC-9-6). store open 실패 시
/// `get_onboarding_completed`가 default `false`를 반환하므로 conservative fallback으로
/// 윈도우 노출을 시도해 신규 인스톨 첫 부팅의 영구 invisible 위험을 차단한다.
fn show_window_for_onboarding<R: Runtime>(app: &AppHandle<R>) {
    let onboarded = storage::get_onboarding_completed(app);
    if onboarded {
        return;
    }
    attempt_show(app.clone(), 1);
}

/// 메인 윈도우 핸들 획득 후 show + set_focus. None일 때 100ms 후 1회 재시도 (DEC-9-6).
fn attempt_show<R: Runtime>(app: AppHandle<R>, retries_left: u32) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.show() {
            eprintln!("[mohashim] show_window: window.show failed: {e}");
        }
        if let Err(e) = window.set_focus() {
            eprintln!("[mohashim] show_window: window.set_focus failed: {e}");
        }
        return;
    }
    if retries_left == 0 {
        eprintln!(
            "[mohashim] show_window_for_onboarding: main window unavailable after retry"
        );
        return;
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;
        attempt_show(app, retries_left - 1);
    });
}

/// 메인 윈도우 X 클릭(CloseRequested) 시 종료 차단 + hide (FR-18, BR-5, BR-7).
///
/// `app.get_webview_window("main")`로 메인 라벨 한정 핸들러 등록 (BR-5). None 폴백
/// 재시도 1회 (DEC-9-6). 단순 hide만 수행하며 모달/세션 가드는 본 Phase 범위 외 (BR-7).
/// macOS Cmd+Q는 본 핸들러로 차단되지 않으며 (DEC-9-4), 트레이 메뉴 "종료"의 `app.exit(0)`만
/// 명시 종료 경로로 유지된다.
fn install_main_window_close_guard<R: Runtime>(app: &AppHandle<R>) {
    attempt_install_close_guard(app.clone(), 1);
}

fn attempt_install_close_guard<R: Runtime>(app: AppHandle<R>, retries_left: u32) {
    if let Some(window) = app.get_webview_window("main") {
        let win_clone = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = win_clone.hide();
            }
        });
        return;
    }
    if retries_left == 0 {
        eprintln!(
            "[mohashim] install_main_window_close_guard: main window unavailable after retry"
        );
        return;
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;
        attempt_install_close_guard(app, retries_left - 1);
    });
}
