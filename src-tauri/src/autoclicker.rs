// Core Auto Clicker engine (Sprint 2).
//
// Simulates mouse clicks at a configurable interval using `enigo`, either at
// whatever position the cursor currently sits at, or by cycling through a
// recorded sequence of positions. A global hotkey (F6) can toggle the last
// used configuration on/off even when the app window isn't focused.

use enigo::{Button, Coordinate, Direction, Enigo, Mouse, Settings};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoClickConfig {
    pub interval_ms: u64,
    /// "left" | "right" | "middle"
    pub button: String,
    /// "single" | "double"
    pub click_type: String,
    /// "fixed" | "infinite"
    pub repeat_mode: String,
    pub count: u64,
    /// Recorded (x, y) positions to cycle through. Empty means "click at
    /// wherever the cursor currently is" (classic auto-clicker behaviour).
    pub positions: Vec<(i32, i32)>,
}

impl Default for AutoClickConfig {
    fn default() -> Self {
        Self {
            interval_ms: 100,
            button: "left".into(),
            click_type: "single".into(),
            repeat_mode: "infinite".into(),
            count: 0,
            positions: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoClickerStatus {
    pub running: bool,
    pub clicks_done: u64,
}

pub struct AutoClickerState {
    pub running: Arc<AtomicBool>,
    pub clicks_done: Arc<AtomicU64>,
    pub last_config: Mutex<AutoClickConfig>,
}

impl Default for AutoClickerState {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            clicks_done: Arc::new(AtomicU64::new(0)),
            last_config: Mutex::new(AutoClickConfig::default()),
        }
    }
}

fn to_button(name: &str) -> Button {
    match name {
        "right" => Button::Right,
        "middle" => Button::Middle,
        _ => Button::Left,
    }
}

const STATUS_EVENT: &str = "autoclicker://status";

fn emit_status(app: &AppHandle, running: bool, clicks_done: u64) {
    let _ = app.emit(STATUS_EVENT, AutoClickerStatus { running, clicks_done });
}

/// Returns the current mouse cursor position in screen pixels, used by the
/// UI's "capture position" button when recording a click sequence.
#[tauri::command]
pub fn get_cursor_position() -> Result<(i32, i32), String> {
    let enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.location().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_auto_clicker_status(state: State<AutoClickerState>) -> AutoClickerStatus {
    AutoClickerStatus {
        running: state.running.load(Ordering::SeqCst),
        clicks_done: state.clicks_done.load(Ordering::SeqCst),
    }
}

#[tauri::command]
pub fn start_auto_clicker(
    config: AutoClickConfig,
    app: AppHandle,
    state: State<AutoClickerState>,
) -> Result<(), String> {
    if state.running.load(Ordering::SeqCst) {
        return Err("Auto clicker is already running".into());
    }
    if config.interval_ms == 0 {
        return Err("Interval must be greater than 0ms".into());
    }

    *state.last_config.lock().map_err(|e| e.to_string())? = config.clone();
    state.running.store(true, Ordering::SeqCst);
    state.clicks_done.store(0, Ordering::SeqCst);
    emit_status(&app, true, 0);

    let running = state.running.clone();
    let clicks_done = state.clicks_done.clone();
    let app_handle = app.clone();

    std::thread::spawn(move || {
        let mut enigo = match Enigo::new(&Settings::default()) {
            Ok(e) => e,
            Err(_) => {
                running.store(false, Ordering::SeqCst);
                emit_status(&app_handle, false, 0);
                return;
            }
        };

        let button = to_button(&config.button);
        let double_click = config.click_type == "double";
        let is_infinite = config.repeat_mode != "fixed";
        let target_count = config.count.max(1);
        let mut position_index: usize = 0;

        while running.load(Ordering::SeqCst) {
            if !config.positions.is_empty() {
                let (x, y) = config.positions[position_index % config.positions.len()];
                let _ = enigo.move_mouse(x, y, Coordinate::Abs);
                position_index += 1;
            }

            let _ = enigo.button(button, Direction::Click);
            if double_click {
                std::thread::sleep(Duration::from_millis(35));
                let _ = enigo.button(button, Direction::Click);
            }

            let done = clicks_done.fetch_add(1, Ordering::SeqCst) + 1;
            emit_status(&app_handle, true, done);

            if !is_infinite && done >= target_count {
                break;
            }

            std::thread::sleep(Duration::from_millis(config.interval_ms));
        }

        running.store(false, Ordering::SeqCst);
        emit_status(&app_handle, false, clicks_done.load(Ordering::SeqCst));
    });

    Ok(())
}

#[tauri::command]
pub fn stop_auto_clicker(state: State<AutoClickerState>, app: AppHandle) {
    state.running.store(false, Ordering::SeqCst);
    emit_status(&app, false, state.clicks_done.load(Ordering::SeqCst));
}

/// Invoked by the global F6 hotkey handler registered in `lib.rs`. Starts the
/// clicker using the last configuration submitted from the UI, or stops it if
/// it is already running.
pub fn toggle_from_hotkey(app: &AppHandle) {
    let is_running = app.state::<AutoClickerState>().running.load(Ordering::SeqCst);
    if is_running {
        stop_auto_clicker(app.state::<AutoClickerState>(), app.clone());
    } else {
        let config = app
            .state::<AutoClickerState>()
            .last_config
            .lock()
            .map(|c| c.clone())
            .unwrap_or_default();
        let _ = start_auto_clicker(config, app.clone(), app.state::<AutoClickerState>());
    }
}
