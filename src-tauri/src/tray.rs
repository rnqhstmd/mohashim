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
        // init_tray가 main 윈도우 생성 전에 호출될 가능성 대비:
        // get_webview_window 실패 시 primary_monitor의 scale_factor를 폴백으로 사용하여
        // Retina 환경에서 @1x로 폴백되는 화질 저하를 방지한다.
        let sf = app
            .get_webview_window("main")
            .and_then(|w| w.scale_factor().ok())
            .or_else(|| app.primary_monitor().ok().flatten().map(|m| m.scale_factor()))
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
            // 좌클릭 + Up(release) 상태만 처리 — Down/Up 모두 emit 시 중복 토글 방지.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                let app = tray.app_handle();
                eprintln!("[mohashim] tray clicked, emitting tray-click");
                emit_tray_click(app, &rect);
                // Phase 21 사용자 피드백: 트레이 클릭해도 팝업 안 뜸. Rust 측에서
                // 가시성을 직접 보장한다. JS listener(trayPopup.ts)는 위치 정밀화만
                // 담당 (toggle 로직 제거됨, 충돌 방지).
                //
                // 동작:
                //   visible=true   → hide (토글로 닫기 — 가벼운 dismiss)
                //   visible=false  → show + set_focus (창 띄우기)
                //   is_visible 에러 → 보호적으로 show 시도
                //
                // 위치 보정: JS가 emit된 tray-click 이벤트를 받아 setPosition 호출.
                // setPosition은 hidden/visible 무관하게 동작하므로 Rust show보다
                // 늦게 와도 정상 적용 (창이 잠시 default 위치에 떴다가 이동할 수
                // 있으나 사용자에게는 거의 즉시 정렬).
                if let Some(win) = app.get_webview_window("main") {
                    match win.is_visible() {
                        Ok(true) => {
                            eprintln!("[mohashim] window visible → hide");
                            let _ = win.hide();
                        }
                        Ok(false) => {
                            eprintln!("[mohashim] window hidden → show");
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                        Err(e) => {
                            eprintln!("[mohashim] is_visible err: {e} → fallback show");
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                } else {
                    eprintln!("[mohashim] main window unavailable on tray click");
                }
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
    // main 윈도우가 hide 상태이거나 모니터 간 이동한 경우에 대비해 primary_monitor 폴백.
    let sf = app
        .get_webview_window("main")
        .and_then(|w| w.scale_factor().ok())
        .or_else(|| app.primary_monitor().ok().flatten().map(|m| m.scale_factor()))
        .unwrap_or_else(|| {
            eprintln!("[mohashim] tray-click: scale_factor unavailable, fallback 1.0");
            1.0
        });

    // Tauri v2: Position/Size는 Logical/Physical variant를 가지며 to_physical(sf)로 변환.
    //
    // Phase 19 cross-review W1: 혼합 DPI 듀얼 모니터에서 main/primary sf로 변환하면 클릭
    // 모니터 배율이 다를 때 좌표가 빗나간다. Logical 분기에서 모든 모니터에 대해 각 sf로
    // 변환을 시도하고 어느 모니터의 물리 영역에 들어가는지 매칭하여 매칭된 sf 결과 사용.
    // 매칭 실패 시 main/primary sf 폴백 (단일 DPI 환경 동일 동작 보존).
    let pos = match rect.position {
        tauri::Position::Physical(p) => p,
        tauri::Position::Logical(l) => app
            .available_monitors()
            .ok()
            .into_iter()
            .flatten()
            .find_map(|m| {
                let p = l.to_physical(m.scale_factor());
                let mp = m.position();
                let ms = m.size();
                let in_x = p.x >= mp.x && p.x < mp.x.saturating_add(ms.width as i32);
                let in_y = p.y >= mp.y && p.y < mp.y.saturating_add(ms.height as i32);
                if in_x && in_y {
                    Some(p)
                } else {
                    None
                }
            })
            .unwrap_or_else(|| l.to_physical(sf)),
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
///
/// Phase 21 사용자 피드백: 세션 포기 시 메뉴바 타이머가 안 사라지는 버그.
/// Tauri 2의 `set_title(None)`이 일부 환경에서 이전 title을 그대로 남기는 경우가
/// 있어, None은 빈 문자열로 명시적 clear한다.
pub fn apply_title<R: Runtime>(
    app: &AppHandle<R>,
    title: Option<&str>,
) -> Result<(), String> {
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "tray 'main' not found".to_string())?;
    let normalized = title.unwrap_or("");
    tray.set_title(Some(normalized))
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
