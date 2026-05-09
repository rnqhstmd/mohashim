mod audio;
mod economy;
mod input;
mod insight;
mod mailbox;
mod logger;
mod permissions;
mod power;
pub mod score;
mod shop;
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
            permissions::restore_persisted_mic_interacted,
            permissions::open_permission_settings,
            timer::focus_start,
            timer::discard_session,
            storage::reset_all,
            storage::get_auto_launch,
            storage::set_auto_launch,
            storage::record_todo_completion,
            storage::undo_todo_completion,
            // Phase 22 FR-17 / BR-6: 출석 보상 IPC 단일 진입점.
            economy::record_todo_added,
            logger::open_log_dir,
            // Phase 23 FR-10~13: 편지함 IPC.
            mailbox::get_mailbox,
            mailbox::mark_all_mailbox_read,
            mailbox::mark_mailbox_letter_read,
            // Phase 24 FR-1, FR-4, FR-5, FR-8: shop IPC 4종.
            shop::purchase_item,
            shop::equip_item,
            shop::unequip_slot,
            shop::get_inventory,
        ])
        .setup(|app| {
            // setup 순서: storage 시드 → boot discard → power observer → tray → score.
            // boot discard는 score::start (tick 시작) 이전에 실행해야 한다 (DEC-11).
            if let Err(err) = storage::init(app.handle()) {
                eprintln!("[mohashim] storage init failed: {err}");
            }
            // Windows TOFU 영속 복원: disk 파일 또는 onboarding_completed=true 신호 중
            // 어느 하나라도 있으면 마이크 atomic을 복원한다. 한쪽이 손실되어도 영구 회귀가
            // 발생하지 않도록 두 신호를 병행 — disk 파일은 권한 부여 시점에, oc는 사용자가
            // 메인 진입한 시점에 각각 자연 영속됨.
            // score::start보다 먼저 호출하여 audio thread가 정상 기동되도록 한다.
            // macOS / Linux에서는 인자만 받고 no-op.
            let oc_signal = storage::get_onboarding_completed(app.handle());
            permissions::load_persisted_mic_grant_into_atomic(app.handle(), oc_signal);
            // Phase 18 FR-B2: 분석 로거 초기화. 실패 시 write no-op (BR-B3) — 앱 동작 무영향.
            // 내부에서 AppStart 이벤트 1건을 기록한다.
            if let Err(err) = logger::init(app.handle()) {
                eprintln!("[mohashim] logger init failed: {err}");
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
            // Phase 26 MA-3 / FR-14, FR-18: monthly_check + yearly_cleanup을 spawn으로 분리.
            // 부팅 메인 스레드 블로킹 회피. P-I2 / FR-18: monthly_check를 yearly_cleanup
            // 보다 먼저 실행하여 12월 데이터 삭제 전 분석을 보장한다 (1월 1일 첫 부팅 케이스).
            // 동일 연도 재기동 시 yearly_cleanup은 멱등 no-op (AC-16).
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(err) = insight::monthly_check(&app_handle) {
                    eprintln!("[mohashim] monthly_check failed: {err}");
                }
                if let Err(err) = storage::yearly_cleanup(&app_handle) {
                    eprintln!("[mohashim] yearly_cleanup failed: {err}");
                }
            });
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
            // Phase 23 FR-8: 알림 액션 타입 등록 + 딥링크 핸들러 설치.
            if let Err(err) = mailbox::register_notification_actions(app.handle()) {
                eprintln!("[mohashim] mailbox register_notification_actions failed: {err}");
            }
            mailbox::install_notification_action_handler(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            // Phase 18 (E, MA-2): 트레이 quit / Cmd+Q / 시스템 종료 모두 RunEvent::Exit로 통합 캡처.
            // AppQuit 이벤트 기록 후 BufWriter flush로 종료 race 방어.
            if let tauri::RunEvent::Exit = event {
                logger::write(logger::LogEvent::AppQuit);
                logger::flush();
            }
        });
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

/// 신규 인스톨 첫 부팅 시 트레이 클릭 유도 (Phase 21 사용자 피드백 반영).
///
/// 기존 동작: 윈도우를 화면 우상단에 자동 노출.
/// 문제: 트레이 아이콘 실제 위치는 클릭 이벤트로만 알 수 있어, 자동 노출 좌표가
/// 늘 추정값. 사용자가 "메뉴바의 아이콘 하단"을 기대하지만 멀게 떨어져 보임.
///
/// 새 동작: 윈도우를 띄우지 않고 토스트 알림으로 트레이 클릭 안내.
/// 사용자가 트레이 아이콘 클릭 → tray-click event → 정확한 위치로 표시.
/// 표준 macOS 트레이 앱 패턴 (Bartender, Stats, Rectangle 등 동일).
fn show_window_for_onboarding<R: Runtime>(app: &AppHandle<R>) {
    let onboarded = storage::get_onboarding_completed(app);
    if onboarded {
        return;
    }
    // 알림 권한이 있으면 안내 알림 송출. 없으면 silent (트레이 아이콘 자체가 indicator).
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title("모하심이 시작되었어요")
        .body("메뉴바 우상단의 부실감자 아이콘을 클릭해 시작해주세요!")
        .show();
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
