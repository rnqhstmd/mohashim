use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

use crate::score::phase::LiveState;

// Phase 0: 트레이 골격만. 5단계 표정 갱신/툴팁 시간 표시는 후속 Phase에서 구현.
//
// 트레이 핸들 수명: TrayIconBuilder::build()가 반환한 TrayIcon은 Drop 시 트레이를
// 제거할 수 있다. setup 함수가 종료된 후에도 트레이가 살아있도록 app state에
// manage하여 앱 수명과 동일한 retain을 보장한다.
pub fn init_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let quit_item = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quit_item])?;

    let tray = TrayIconBuilder::with_id("main")
        .tooltip("모하심")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            if event.id.as_ref() == "quit" {
                app.exit(0);
            }
        })
        .on_tray_icon_event(|tray, event| {
            // TODO(Phase 1+): 클릭 위치 기반 팝업 위치 계산 + PopupTail 좌표 emit
            if let TrayIconEvent::Click { .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    match window.is_visible() {
                        Ok(true) => {
                            let _ = window.hide();
                        }
                        _ => {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            }
        })
        .build(app)?;

    // Tauri State에 retain — Drop이 init_tray 종료와 함께 발생하지 않도록 보장.
    // score::tray::apply_state는 app.tray_by_id("main")로 동일 핸들에 접근.
    app.manage(tray);

    Ok(())
}

/// score tick에서 LiveState 변경 시 트레이 tooltip을 한국어 라벨로 교체한다 (Q5, Q6).
///
/// PNG 에셋 미존재로 본 Phase는 tooltip 텍스트만 갱신한다. 5단계 아이콘 교체는
/// 후속 에셋 Phase에서 추가한다 (AC-13).
pub fn apply_state<R: Runtime>(app: &AppHandle<R>, state: LiveState) -> Result<(), String> {
    let label = label_for(state);
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "tray 'main' not found".to_string())?;
    tray.set_tooltip(Some(format!("모하심 — {label}")))
        .map_err(|e| format!("set_tooltip failed: {e}"))
}

fn label_for(state: LiveState) -> &'static str {
    match state {
        LiveState::Focused => "집중",
        LiveState::Calm => "평온",
        LiveState::Distracted => "산만",
        LiveState::Covering => "가려짐",
        LiveState::Stressed => "과부하",
    }
}
