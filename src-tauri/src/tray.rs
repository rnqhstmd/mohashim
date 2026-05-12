use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
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
    // 사용자 피드백: 트레이 우클릭이 "종료"만 노출되어 발견성이 낮음. 자주 쓰는 액션을
    // 펼쳐 우클릭만으로도 팝업 열기 / 자동 시작 토글 / (Windows) 작업표시줄 고정 안내 /
    // 종료를 모두 처리할 수 있게 한다. 자동 시작은 CheckMenuItem으로 현재 상태 표시 +
    // 토글 즉시 동기화 (트레이 자체 변경 한정 — 설정 화면 변경의 역방향 동기화는 후속 작업).
    let open_item = MenuItem::with_id(app, "open", "모하 열기", true, None::<&str>)?;
    let separator_top = PredefinedMenuItem::separator(app)?;

    #[cfg(target_os = "windows")]
    let pin_guide_item = MenuItem::with_id(
        app,
        "pin_guide",
        "Windows 사용 팁",
        true,
        None::<&str>,
    )?;

    let separator_bottom = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;

    // 자동 시작 메뉴 항목 제거 — 설정 화면의 자동 시작 토글로 일원화 (사용자 피드백).
    #[cfg(target_os = "windows")]
    let menu = Menu::with_items(
        app,
        &[
            &open_item,
            &separator_top,
            &pin_guide_item,
            &separator_bottom,
            &quit_item,
        ],
    )?;
    #[cfg(not(target_os = "windows"))]
    let menu = Menu::with_items(
        app,
        &[&open_item, &separator_top, &separator_bottom, &quit_item],
    )?;

    // FR-1/BR-2/AC-4: TrayIconBuilder 빌드 시점에 초기 아이콘 설정.
    // `.icon()`을 체이닝하지 않으면 score 첫 tick에서 apply_icon이 호출될 때까지
    // 트레이가 빈 상태로 메뉴바에 노출되지 않는다 (특히 LSUIElement=true 환경에서
    // Dock 미노출이라 유일한 진입점이 사라진다). placeholder는 LiveState::Calm —
    // score 첫 tick에서 실제 상태로 즉시 덮어쓰여진다.
    //
    // FR-3/AC-3: 로드 실패 시 경로 포함 에러를 stderr로 명시 로깅한 뒤 에러를 전파한다.
    // silent fail이 아니라 console.app/콘솔 로그에서 즉시 진단 가능. `?`로 전파된 에러는
    // lib.rs 호출부의 eprintln!("tray init failed: ...")에서 추가 컨텍스트와 함께 출력된다.
    let initial_state = LiveState::Calm;
    let initial_path = icon_path_for(app, initial_state).map_err(|e| {
        eprintln!(
            "[mohashim] tray initial icon path resolution failed for {initial_state:?}: {e}"
        );
        // tauri::Error는 String→Error 변환을 직접 지원하지 않으므로 io::Error를 경유한다.
        tauri::Error::Io(std::io::Error::new(std::io::ErrorKind::NotFound, e))
    })?;
    let initial_image = Image::from_path(&initial_path).map_err(|e| {
        // Privacy: 절대 경로 노출 회피 — file_name만 출력해 어느 PNG가 누락됐는지만 식별.
        // macOS unified log/MDM 수집 시 사용자명(`/Users/<name>/...`) 노출을 차단한다.
        let fname = initial_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("<unknown>");
        eprintln!(
            "[mohashim] tray initial icon load failed: Image::from_path(file={fname}): {e}"
        );
        e
    })?;

    let tray = TrayIconBuilder::with_id("main")
        .icon(initial_image)
        .tooltip("모하심")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open" => {
                if let Some(win) = app.get_webview_window("main") {
                    show_at_tray_position(app, &win);
                }
            }
            // "autostart" 메뉴 항목 제거됨 — 설정 화면 자동 시작 토글로 일원화.
            #[cfg(target_os = "windows")]
            "pin_guide" => {
                // 모달은 메인 팝업 내부에 렌더되므로 팝업이 hide 상태였다면 함께 노출.
                // 트레이 좌클릭과 동일한 위치 계산을 적용해 default 좌표(화면 중앙)
                // 노출 회귀를 차단한다.
                if let Some(win) = app.get_webview_window("main") {
                    show_at_tray_position(app, &win);
                }
                if let Err(e) = app.emit("show-pin-guide", ()) {
                    eprintln!("[mohashim] show-pin-guide emit failed: {e}");
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
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
                // Phase 21 사용자 피드백 (재개정): 팝업이 화면 중앙에서 잠깐 보였다가
                // 트레이 아이콘 아래로 이동하던 회귀 — show 직전 Rust에서 직접 위치를
                // 계산/적용하여 default 좌표 노출 자체를 차단한다. JS listener는 보수적인
                // re-position 백업으로만 동작 (모니터 매핑 변경 등 edge case).
                //
                // 동작:
                //   visible=true   → hide
                //   visible=false  → set_position(컴퓨트) + show + set_focus
                if let Some(win) = app.get_webview_window("main") {
                    match win.is_visible() {
                        Ok(true) => {
                            eprintln!("[mohashim] window visible → hide");
                            let _ = win.hide();
                        }
                        Ok(false) => {
                            eprintln!("[mohashim] window hidden → reposition + show");
                            apply_initial_position(app, &win, &rect);
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                        Err(e) => {
                            eprintln!("[mohashim] is_visible err: {e} → fallback show");
                            apply_initial_position(app, &win, &rect);
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

/// 메뉴 경로(우클릭 → 모하 열기 / Windows 사용 팁)에서 사용한다.
///
/// `on_tray_icon_event`와 달리 `on_menu_event`는 클릭 rect를 직접 받지 않는다.
/// `TrayIcon::rect()`로 현재 트레이 아이콘 rect를 조회해 좌클릭과 동일한 위치
/// 계산(`apply_initial_position`)을 적용한 뒤 show 한다. rect 조회 실패 시
/// default 좌표 폴백 — 일부 환경(예: macOS minimize 직후) 대비.
fn show_at_tray_position<R: Runtime>(app: &AppHandle<R>, win: &tauri::WebviewWindow<R>) {
    if let Some(tray) = app.tray_by_id("main") {
        match tray.rect() {
            Ok(Some(rect)) => apply_initial_position(app, win, &rect),
            Ok(None) => eprintln!("[mohashim] tray.rect() returned None — default position"),
            Err(e) => eprintln!("[mohashim] tray.rect() err: {e} — default position"),
        }
    }
    let _ = win.show();
    let _ = win.set_focus();
}

/// Phase 21 (사용자 피드백 재개정): 팝업 좌측 선을 트레이 아이콘의 좌측 끝과
/// 정확히 맞춘다 — `popup_left = icon_left_logical`. 메뉴바에서 다른 앱 아이콘이
/// 추가/제거되어 우상단 트레이 위치가 바뀌어도 팝업의 좌측 정렬이 일관 유지된다.
///
/// 좌표 산출:
/// - tray rect의 물리 좌표/크기를 클릭한 모니터의 sf로 logical 변환.
/// - popup_left = icon_left_logical (clamp 후 조정될 수 있음).
/// - tail은 아이콘 중심 (icon_center - popup_left) 위치를 가리켜야 자연스럽다 —
///   JS 측 tray-click listener가 이 값으로 PopupTail의 tailX를 동기화한다.
/// - macOS: 메뉴바 하단 = icon_bottom_y. Windows: icon_top_y - popup_height.
/// - 모니터 작업 영역으로 clamp.
///
/// 실패는 swallow — 위치 보정 불가 시 default 위치로 떨어져도 가시성은 유지.
fn apply_initial_position<R: Runtime>(
    app: &AppHandle<R>,
    win: &tauri::WebviewWindow<R>,
    rect: &tauri::Rect,
) {
    const POPUP_W: f64 = 320.0;
    const POPUP_H: f64 = 470.0;

    let monitors = match app.available_monitors() {
        Ok(m) => m,
        Err(e) => {
            eprintln!("[mohashim] apply_initial_position: available_monitors err: {e}");
            return;
        }
    };

    // rect.position을 physical px으로 정규화 (Logical 분기에서는 매칭 모니터의 sf로 변환).
    let primary_sf = win.scale_factor().ok().unwrap_or(1.0);
    let icon_pos_phys = match rect.position {
        tauri::Position::Physical(p) => p,
        tauri::Position::Logical(l) => monitors
            .iter()
            .find_map(|m| {
                let p = l.to_physical::<i32>(m.scale_factor());
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
            .unwrap_or_else(|| l.to_physical(primary_sf)),
    };
    let icon_size_phys = match rect.size {
        tauri::Size::Physical(s) => s,
        tauri::Size::Logical(s) => s.to_physical(primary_sf),
    };

    // 클릭 모니터 매칭. 매칭 실패 시 첫 모니터 폴백.
    let monitor = monitors
        .iter()
        .find(|m| {
            let mp = m.position();
            let ms = m.size();
            icon_pos_phys.x >= mp.x
                && icon_pos_phys.x < mp.x.saturating_add(ms.width as i32)
                && icon_pos_phys.y >= mp.y
                && icon_pos_phys.y < mp.y.saturating_add(ms.height as i32)
        })
        .or_else(|| monitors.first());
    let monitor = match monitor {
        Some(m) => m,
        None => {
            eprintln!("[mohashim] apply_initial_position: no monitors");
            return;
        }
    };

    let sf = monitor.scale_factor_or_1();
    let icon_left_logical = icon_pos_phys.x as f64 / sf;
    let icon_right_logical = (icon_pos_phys.x as f64 + icon_size_phys.width as f64) / sf;
    let icon_bottom_y_logical = (icon_pos_phys.y as f64 + icon_size_phys.height as f64) / sf;
    let icon_top_y_logical = icon_pos_phys.y as f64 / sf;

    let mon_left_logical = monitor.position().x as f64 / sf;
    let mon_top_logical = monitor.position().y as f64 / sf;
    let mon_right_logical = mon_left_logical + monitor.size().width as f64 / sf;
    let mon_bottom_logical = mon_top_logical + monitor.size().height as f64 / sf;

    // 사용자 피드백: 팝업 중심을 아이콘 중심에 맞춘다.
    // popup_center_x = icon_center_x → popup_left = icon_center_x - POPUP_W/2.
    // 모니터 경계 clamp는 아래에서 별도 처리 (`max(mon_left)`, `min(mon_right - POPUP_W)`).
    let icon_center_x = (icon_left_logical + icon_right_logical) / 2.0;
    let mut x = (icon_center_x - POPUP_W / 2.0).round();
    #[cfg(target_os = "macos")]
    let mut y = icon_bottom_y_logical.round();
    #[cfg(not(target_os = "macos"))]
    let mut y = (icon_top_y_logical - POPUP_H).round();
    // 컴파일러 경고 회피: 사용되지 않을 수 있는 변수.
    let _ = icon_top_y_logical;
    let _ = icon_bottom_y_logical;

    x = x.max(mon_left_logical).min(mon_right_logical - POPUP_W);
    y = y.max(mon_top_logical).min(mon_bottom_logical - POPUP_H);

    if let Err(e) = win.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y })) {
        eprintln!("[mohashim] apply_initial_position: set_position err: {e}");
    }
}

/// 모니터 sf 안전 추출 — Tauri Monitor::scale_factor가 panic하지 않도록 1.0 폴백 트레잇.
trait MonitorScaleFactorExt {
    fn scale_factor_or_1(&self) -> f64;
}
impl MonitorScaleFactorExt for tauri::Monitor {
    fn scale_factor_or_1(&self) -> f64 {
        let sf = self.scale_factor();
        if sf.is_finite() && sf > 0.0 {
            sf
        } else {
            1.0
        }
    }
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

/// 한국어 라벨 tooltip. tray_state 또는 시간 변경 시 호출.
///
/// Issue #26: Windows 시스템 트레이는 아이콘 옆 텍스트 라벨을 지원하지 않으므로
/// (macOS NSStatusItem 전용 API) mm:ss를 호버 툴팁에 포함시켜 가시성을 확보한다.
/// `time_suffix`가 Some이면 `"모하심 — 집중 중 25:00"` 형태로 표시.
pub fn apply_tooltip_label<R: Runtime>(
    app: &AppHandle<R>,
    state: LiveState,
    time_suffix: Option<&str>,
) -> Result<(), String> {
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "tray 'main' not found".to_string())?;
    let label = label_for(state);
    let tooltip = match time_suffix {
        Some(t) if !t.is_empty() => format!("모하심 — {label} {t}"),
        _ => format!("모하심 — {label}"),
    };
    tray.set_tooltip(Some(tooltip))
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
