mod audio;
mod input;
mod permissions;
mod power;
pub mod score;
mod storage;
mod timer;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            permissions::permission_status,
            permissions::request_microphone_permission,
            permissions::request_accessibility_permission,
            permissions::open_permission_settings,
            timer::focus_start,
            timer::discard_session,
            storage::reset_all,
        ])
        .setup(|app| {
            // setup 순서: storage 시드 → boot discard → power observer → tray → score.
            // boot discard는 score::start (tick 시작) 이전에 실행해야 한다 (DEC-11).
            if let Err(err) = storage::init(app.handle()) {
                eprintln!("[mohashim] storage init failed: {err}");
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
