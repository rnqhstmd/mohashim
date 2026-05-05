mod permissions;
mod storage;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            permissions::permission_status,
            permissions::request_microphone_permission,
            permissions::request_accessibility_permission,
            permissions::open_permission_settings,
        ])
        .setup(|app| {
            if let Err(err) = storage::init(app.handle()) {
                eprintln!("[mohashim] storage init failed: {err}");
            }
            if let Err(err) = tray::init_tray(app.handle()) {
                eprintln!("[mohashim] tray init failed: {err}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
