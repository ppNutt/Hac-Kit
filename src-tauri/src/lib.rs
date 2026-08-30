mod autoclicker;
mod keybinds;
mod recorder;

use autoclicker::{
    get_auto_clicker_status, get_cursor_position, start_auto_clicker, stop_auto_clicker,
    AutoClickerState,
};
use keybinds::{get_keybinds, reset_keybinds, set_keybind, KeybindsState};
use recorder::{
    get_recording_summary, play_recording, start_recording, stop_playback, stop_recording,
    RecorderState,
};
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AutoClickerState::default())
        .manage(RecorderState::default())
        .manage(KeybindsState::default());

    #[cfg(desktop)]
    {
        builder = builder.setup(|app| {
            use tauri_plugin_global_shortcut::ShortcutState;

            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, shortcut, event| {
                        if event.state() != ShortcutState::Pressed {
                            return;
                        }
                        let keybinds_state = app.state::<KeybindsState>();
                        let action = {
                            let guard = match keybinds_state.config.lock() {
                                Ok(g) => g,
                                Err(_) => return,
                            };
                            keybinds::action_for_shortcut(&guard, shortcut)
                        };
                        match action {
                            Some(keybinds::KeybindAction::ToggleSimpleClicker) => {
                                autoclicker::toggle_from_hotkey(app);
                            }
                            Some(keybinds::KeybindAction::ToggleRecording) => {
                                recorder::toggle_recording_from_hotkey(app);
                            }
                            Some(keybinds::KeybindAction::PlayRecording) => {
                                recorder::play_recording_from_hotkey(app);
                            }
                            None => {}
                        }
                    })
                    .build(),
            )?;

            // Load persisted keybinds (or defaults) and register them.
            let loaded = keybinds::load_keybinds(app.handle());
            keybinds::apply_keybinds(app.handle(), &loaded).map_err(std::io::Error::other)?;
            *app.state::<KeybindsState>().config.lock().unwrap() = loaded;

            // Start the single, app-lifetime input listener used by the macro
            // recorder. It only collects events while a recording is active.
            recorder::spawn_listener(app.handle().clone(), app.state::<RecorderState>().inner().clone());

            Ok(())
        });
    }

    builder
        .invoke_handler(tauri::generate_handler![
            greet,
            get_cursor_position,
            start_auto_clicker,
            stop_auto_clicker,
            get_auto_clicker_status,
            start_recording,
            stop_recording,
            get_recording_summary,
            play_recording,
            stop_playback,
            get_keybinds,
            set_keybind,
            reset_keybinds
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
