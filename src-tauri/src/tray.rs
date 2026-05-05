use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

use crate::score::phase::{LiveState, Phase};

static ICON_CACHE: OnceLock<HashMap<LiveState, Image<'static>>> = OnceLock::new();

#[derive(serde::Serialize, Clone)]
struct TrayClickPayload {
    x: f64,
    y: f64,
    #[serde(rename = "iconWidth")]
    icon_width: f64,
    #[serde(rename = "iconHeight")]
    icon_height: f64,
}

fn file_stem_for(s: LiveState) -> &'static str {
    match s {
        LiveState::Focused => "potato-focused",
        LiveState::Calm => "potato-calm",
        LiveState::Distracted => "potato-distracted",
        LiveState::Covering => "potato-covering",
        LiveState::Stressed => "potato-stressed",
    }
}

/// macOS는 모니터 scale_factor 분기로 @1x/@2x 선택. (MUST-ADDRESS B)
/// init_tray 시점 1회 결정. 멀티 모니터 동적 교체는 비범위.
fn icon_path_for<R: Runtime>(app: &AppHandle<R>, s: LiveState) -> Result<PathBuf, String> {
    let stem = file_stem_for(s);
    let res_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir: {e}"))?;
    if cfg!(target_os = "macos") {
        let sf = app
            .get_webview_window("main")
            .and_then(|w| w.scale_factor().ok())
            .unwrap_or(1.0);
        let suffix = if sf >= 3.0 {
            "@3x"
        } else if sf >= 2.0 {
            "@2x"
        } else {
            "@1x"
        };
        Ok(res_dir.join(format!("icons/tray/mac/{stem}{suffix}.png")))
    } else {
        Ok(res_dir.join(format!("icons/tray/win/{stem}.ico")))
    }
}

fn load_icons<R: Runtime>(app: &AppHandle<R>) -> Result<HashMap<LiveState, Image<'static>>, String> {
    use LiveState::*;
    let mut map = HashMap::new();
    for s in [Focused, Calm, Distracted, Covering, Stressed] {
        let path = icon_path_for(app, s)?;
        let img = Image::from_path(&path)
            .map_err(|e| format!("Image::from_path({path:?}): {e}"))?;
        map.insert(s, img);
    }
    Ok(map)
}

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
            use tauri::tray::{MouseButton, MouseButtonState};
            // FR-E1: 클릭 위치를 PhysicalPosition으로 변환 후 tray-click emit.
            // hide/show 토글은 React 측이 인계받음 (사용자 결정: 토글 유지).
            // 좌클릭 + Up(release) 상태만 처리 — Down/Up 모두 emit 시 중복 토글 방지.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                let app = tray.app_handle();
                emit_tray_click(app, &rect);
            }
        })
        .build(app)?;

    app.manage(tray);

    // FR-B1: 5장 PNG/ICO 메모리 캐시.
    match load_icons(app) {
        Ok(cache) => {
            if ICON_CACHE.set(cache).is_err() {
                eprintln!("[mohashim] tray icon cache: ICON_CACHE already initialized (init_tray called twice?)");
            }
        }
        Err(e) => {
            eprintln!("[mohashim] tray icon cache init failed: {e}");
        }
    }

    // FR-B3: macOS template 모드.
    // 컴파일타임 cfg로 분기하여 비-macOS 타겟에서 set_icon_as_template 심볼 미존재로 인한
    // 빌드 실패를 차단한다 (apply_icon과 동일 패턴).
    #[cfg(target_os = "macos")]
    if let Some(t) = app.tray_by_id("main") {
        if let Err(e) = t.set_icon_as_template(true) {
            eprintln!("[mohashim] set_icon_as_template failed: {e}");
        }
    }

    Ok(())
}

/// rect를 PhysicalPosition / PhysicalSize 단위로 변환 후 emit. (MUST-ADDRESS D)
/// scale_factor 미획득 시 1.0 폴백 + 경고 로그.
fn emit_tray_click<R: Runtime>(app: &AppHandle<R>, rect: &tauri::Rect) {
    let sf = app
        .get_webview_window("main")
        .and_then(|w| w.scale_factor().ok())
        .unwrap_or_else(|| {
            eprintln!("[mohashim] tray-click: scale_factor unavailable, fallback 1.0");
            1.0
        });

    // Tauri v2: Position/Size는 Logical/Physical variant를 가지며 to_physical(sf)로 변환.
    let pos = match rect.position {
        tauri::Position::Physical(p) => p,
        tauri::Position::Logical(l) => l.to_physical(sf),
    };
    let size = match rect.size {
        tauri::Size::Physical(s) => s,
        tauri::Size::Logical(s) => s.to_physical(sf),
    };

    let payload = TrayClickPayload {
        x: pos.x as f64,
        y: pos.y as f64,
        icon_width: size.width as f64,
        icon_height: size.height as f64,
    };
    if let Err(e) = app.emit("tray-click", &payload) {
        eprintln!("[mohashim] tray-click emit failed: {e}");
    }
}

/// FR-B2: 캐시된 아이콘으로 즉시 교체. 호출자가 prev_tray_state 비교 후 호출.
///
/// macOS NSStatusItem.button.image의 isTemplate 속성은 set_icon이 새 NSImage를
/// 설정할 때 reset될 수 있으므로, set_icon 직후 매번 set_icon_as_template(true)를
/// 호출하여 라이트/다크 자동 반전을 보장한다 (FR-B3, AC-T8).
pub fn apply_icon<R: Runtime>(
    app: &AppHandle<R>,
    state: LiveState,
) -> Result<(), String> {
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "tray 'main' not found".to_string())?;
    let cache = ICON_CACHE
        .get()
        .ok_or_else(|| "icon cache not initialized".to_string())?;
    let img = cache
        .get(&state)
        .ok_or_else(|| format!("icon missing for {state:?}"))?;
    tray.set_icon(Some(img.clone()))
        .map_err(|e| format!("set_icon failed: {e}"))?;
    #[cfg(target_os = "macos")]
    if let Err(e) = tray.set_icon_as_template(true) {
        eprintln!("[mohashim] set_icon_as_template failed: {e}");
    }
    Ok(())
}

/// FR-C1, C2, C3, BR-T3, BR-T4: title을 직접 받아 갱신. 호출자가 prev_title 비교 후 호출.
pub fn apply_title<R: Runtime>(
    app: &AppHandle<R>,
    title: Option<&str>,
) -> Result<(), String> {
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "tray 'main' not found".to_string())?;
    tray.set_title(title)
        .map_err(|e| format!("set_title failed: {e}"))
}

/// 한국어 라벨 tooltip. tray_state 변경 시 호출.
pub fn apply_tooltip_label<R: Runtime>(
    app: &AppHandle<R>,
    state: LiveState,
) -> Result<(), String> {
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "tray 'main' not found".to_string())?;
    let label = label_for(state);
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

/// BR-T3, BR-T4: phase=Focus|Break && time_left>0일 때만 mm:ss.
pub fn format_title(phase: Phase, time_left: u64) -> Option<String> {
    if !matches!(phase, Phase::Focus | Phase::Break) {
        return None;
    }
    if time_left == 0 {
        return None;
    }
    let mm = time_left / 60;
    let ss = time_left % 60;
    Some(format!("{mm:02}:{ss:02}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ac_t13_focus_90s_to_01_30() {
        assert_eq!(format_title(Phase::Focus, 90).as_deref(), Some("01:30"));
    }
    #[test]
    fn ac_t14_break_5s_to_00_05() {
        assert_eq!(format_title(Phase::Break, 5).as_deref(), Some("00:05"));
    }
    #[test]
    fn ac_t15_focus_zero_is_none() {
        assert_eq!(format_title(Phase::Focus, 0), None);
    }
    #[test]
    fn ac_t16_idle_zero_is_none() {
        assert_eq!(format_title(Phase::Idle, 0), None);
    }
    #[test]
    fn over_one_hour_no_truncation() {
        // BR-T3 예시: 3661초 → "61:01"
        assert_eq!(format_title(Phase::Focus, 3661).as_deref(), Some("61:01"));
    }
}
