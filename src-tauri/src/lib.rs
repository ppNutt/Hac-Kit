mod autoclicker;

use autoclicker::{
    get_auto_clicker_status, get_cursor_position, start_auto_clicker, stop_auto_clicker,
    AutoClickerState,
};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AutoClickerState::default());

    #[cfg(desktop)]
    {
        builder = builder.setup(|app| {
            use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

            let toggle_shortcut = Shortcut::new(None, Code::F6);
            let handler_shortcut = toggle_shortcut;

            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |app, shortcut, event| {
                        if shortcut == &handler_shortcut && event.state() == ShortcutState::Pressed {
                            autoclicker::toggle_from_hotkey(app);
                        }
                    })
                    .build(),
            )?;
            app.global_shortcut().register(toggle_shortcut)?;
            Ok(())
        });
    }

    builder
        .invoke_handler(tauri::generate_handler![
            greet,
            get_cursor_position,
            start_auto_clicker,
            stop_auto_clicker,
            get_auto_clicker_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
