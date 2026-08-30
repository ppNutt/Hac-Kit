// Configurable keybind system (Sprint 2 follow-up).
//
// Lets the user rebind the Auto Clicker's global hotkeys (classic clicker
// toggle, macro record toggle, macro play) instead of them being fixed to
// F6 / Ctrl+C / Ctrl+P. Bindings are persisted as a small JSON file in the
// app's config directory and re-applied to `tauri-plugin-global-shortcut`
// every time they change.

use rdev::Key as RdevKey;
use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

use crate::recorder::RecorderState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum KeybindAction {
    ToggleSimpleClicker,
    ToggleRecording,
    PlayRecording,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShortcutDef {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub meta: bool,
    /// A physical key code, using the same names as browser
    /// `KeyboardEvent.code` values (e.g. "KeyC", "F6", "Space").
    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeybindConfig {
    pub toggle_simple_clicker: ShortcutDef,
    pub toggle_recording: ShortcutDef,
    pub play_recording: ShortcutDef,
}

impl Default for KeybindConfig {
    fn default() -> Self {
        Self {
            toggle_simple_clicker: ShortcutDef {
                ctrl: false,
                alt: false,
                shift: false,
                meta: false,
                code: "F6".into(),
            },
            toggle_recording: ShortcutDef {
                ctrl: true,
                alt: false,
                shift: false,
                meta: false,
                code: "KeyC".into(),
            },
            play_recording: ShortcutDef {
                ctrl: true,
                alt: false,
                shift: false,
                meta: false,
                code: "KeyP".into(),
            },
        }
    }
}

impl KeybindConfig {
    fn set(&mut self, action: KeybindAction, def: ShortcutDef) {
        match action {
            KeybindAction::ToggleSimpleClicker => self.toggle_simple_clicker = def,
            KeybindAction::ToggleRecording => self.toggle_recording = def,
            KeybindAction::PlayRecording => self.play_recording = def,
        }
    }

    fn entries(&self) -> [(KeybindAction, &ShortcutDef); 3] {
        [
            (KeybindAction::ToggleSimpleClicker, &self.toggle_simple_clicker),
            (KeybindAction::ToggleRecording, &self.toggle_recording),
            (KeybindAction::PlayRecording, &self.play_recording),
        ]
    }
}

pub struct KeybindsState {
    pub config: Mutex<KeybindConfig>,
}

impl Default for KeybindsState {
    fn default() -> Self {
        Self {
            config: Mutex::new(KeybindConfig::default()),
        }
    }
}

fn config_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("keybinds.json"))
}

pub fn load_keybinds(app: &AppHandle) -> KeybindConfig {
    config_path(app)
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default()
}

fn save_keybinds(app: &AppHandle, config: &KeybindConfig) -> Result<(), String> {
    let path = config_path(app).ok_or("Could not resolve app config directory")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

/// Maps a `KeyboardEvent.code`-style string to the matching global-shortcut
/// `Code`. Covers letters, digits, function keys and the handful of common
/// named keys a user would realistically want to bind.
fn code_from_str(code: &str) -> Option<Code> {
    use Code::*;
    Some(match code {
        "KeyA" => KeyA, "KeyB" => KeyB, "KeyC" => KeyC, "KeyD" => KeyD, "KeyE" => KeyE,
        "KeyF" => KeyF, "KeyG" => KeyG, "KeyH" => KeyH, "KeyI" => KeyI, "KeyJ" => KeyJ,
        "KeyK" => KeyK, "KeyL" => KeyL, "KeyM" => KeyM, "KeyN" => KeyN, "KeyO" => KeyO,
        "KeyP" => KeyP, "KeyQ" => KeyQ, "KeyR" => KeyR, "KeyS" => KeyS, "KeyT" => KeyT,
        "KeyU" => KeyU, "KeyV" => KeyV, "KeyW" => KeyW, "KeyX" => KeyX, "KeyY" => KeyY,
        "KeyZ" => KeyZ,
        "Digit0" => Digit0, "Digit1" => Digit1, "Digit2" => Digit2, "Digit3" => Digit3,
        "Digit4" => Digit4, "Digit5" => Digit5, "Digit6" => Digit6, "Digit7" => Digit7,
        "Digit8" => Digit8, "Digit9" => Digit9,
        "F1" => F1, "F2" => F2, "F3" => F3, "F4" => F4, "F5" => F5, "F6" => F6,
        "F7" => F7, "F8" => F8, "F9" => F9, "F10" => F10, "F11" => F11, "F12" => F12,
        "Space" => Space, "Enter" => Enter, "Tab" => Tab, "Escape" => Escape,
        "Backspace" => Backspace, "Delete" => Delete, "Insert" => Insert,
        "Home" => Home, "End" => End, "PageUp" => PageUp, "PageDown" => PageDown,
        "ArrowUp" => ArrowUp, "ArrowDown" => ArrowDown, "ArrowLeft" => ArrowLeft,
        "ArrowRight" => ArrowRight,
        _ => return None,
    })
}

/// Matching mapping into `rdev`'s own `Key` enum, used to build the
/// recorder's "don't capture these keys" set. rdev merges left/right Alt
/// into a single `Alt` variant, so only one is added for that case.
fn code_to_rdev_key(code: &str) -> Option<RdevKey> {
    use RdevKey::*;
    Some(match code {
        "KeyA" => KeyA, "KeyB" => KeyB, "KeyC" => KeyC, "KeyD" => KeyD, "KeyE" => KeyE,
        "KeyF" => KeyF, "KeyG" => KeyG, "KeyH" => KeyH, "KeyI" => KeyI, "KeyJ" => KeyJ,
        "KeyK" => KeyK, "KeyL" => KeyL, "KeyM" => KeyM, "KeyN" => KeyN, "KeyO" => KeyO,
        "KeyP" => KeyP, "KeyQ" => KeyQ, "KeyR" => KeyR, "KeyS" => KeyS, "KeyT" => KeyT,
        "KeyU" => KeyU, "KeyV" => KeyV, "KeyW" => KeyW, "KeyX" => KeyX, "KeyY" => KeyY,
        "KeyZ" => KeyZ,
        "Digit0" => Num0, "Digit1" => Num1, "Digit2" => Num2, "Digit3" => Num3,
        "Digit4" => Num4, "Digit5" => Num5, "Digit6" => Num6, "Digit7" => Num7,
        "Digit8" => Num8, "Digit9" => Num9,
        "F1" => F1, "F2" => F2, "F3" => F3, "F4" => F4, "F5" => F5, "F6" => F6,
        "F7" => F7, "F8" => F8, "F9" => F9, "F10" => F10, "F11" => F11, "F12" => F12,
        "Space" => Space, "Enter" => Return, "Tab" => Tab, "Escape" => Escape,
        "Backspace" => Backspace, "Delete" => Delete, "Insert" => Insert,
        "Home" => Home, "End" => End, "PageUp" => PageUp, "PageDown" => PageDown,
        "ArrowUp" => UpArrow, "ArrowDown" => DownArrow, "ArrowLeft" => LeftArrow,
        "ArrowRight" => RightArrow,
        _ => return None,
    })
}

fn to_shortcut(def: &ShortcutDef) -> Option<Shortcut> {
    let mut mods = Modifiers::empty();
    if def.ctrl {
        mods |= Modifiers::CONTROL;
    }
    if def.alt {
        mods |= Modifiers::ALT;
    }
    if def.shift {
        mods |= Modifiers::SHIFT;
    }
    if def.meta {
        mods |= Modifiers::META;
    }
    let code = code_from_str(&def.code)?;
    Some(Shortcut::new(if mods.is_empty() { None } else { Some(mods) }, code))
}

fn reserved_keys_for(def: &ShortcutDef) -> Vec<RdevKey> {
    let mut keys = Vec::new();
    if def.ctrl {
        keys.push(RdevKey::ControlLeft);
        keys.push(RdevKey::ControlRight);
    }
    if def.alt {
        keys.push(RdevKey::Alt);
    }
    if def.shift {
        keys.push(RdevKey::ShiftLeft);
        keys.push(RdevKey::ShiftRight);
    }
    if def.meta {
        keys.push(RdevKey::MetaLeft);
        keys.push(RdevKey::MetaRight);
    }
    if let Some(key) = code_to_rdev_key(&def.code) {
        keys.push(key);
    }
    keys
}

/// Re-registers all three global shortcuts from `config` and refreshes the
/// recorder's reserved-key set to match. Called on startup and whenever a
/// keybind changes.
pub fn apply_keybinds(app: &AppHandle, config: &KeybindConfig) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    shortcuts.unregister_all().map_err(|e| e.to_string())?;

    let mut reserved = std::collections::HashSet::new();
    for (_, def) in config.entries() {
        if let Some(shortcut) = to_shortcut(def) {
            shortcuts.register(shortcut).map_err(|e| e.to_string())?;
        }
        for key in reserved_keys_for(def) {
            reserved.insert(key);
        }
    }

    if let Some(recorder) = app.try_state::<RecorderState>() {
        if let Ok(mut guard) = recorder.reserved_keys.lock() {
            *guard = reserved;
        }
    }

    Ok(())
}

/// Given a fired `Shortcut`, finds which configured action it matches.
pub fn action_for_shortcut(config: &KeybindConfig, fired: &Shortcut) -> Option<KeybindAction> {
    config
        .entries()
        .into_iter()
        .find(|(_, def)| to_shortcut(def).as_ref() == Some(fired))
        .map(|(action, _)| action)
}

#[tauri::command]
pub fn get_keybinds(state: tauri::State<KeybindsState>) -> Result<KeybindConfig, String> {
    state.config.lock().map(|c| c.clone()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_keybind(
    action: KeybindAction,
    shortcut: ShortcutDef,
    app: AppHandle,
    state: tauri::State<KeybindsState>,
) -> Result<KeybindConfig, String> {
    if code_from_str(&shortcut.code).is_none() {
        return Err(format!("Unsupported key: {}", shortcut.code));
    }

    let mut config = state.config.lock().map_err(|e| e.to_string())?;

    for (other_action, other_def) in config.entries() {
        if other_action != action && *other_def == shortcut {
            return Err("That shortcut is already used by another action".into());
        }
    }

    config.set(action, shortcut);
    apply_keybinds(&app, &config)?;
    save_keybinds(&app, &config)?;
    Ok(config.clone())
}

#[tauri::command]
pub fn reset_keybinds(
    app: AppHandle,
    state: tauri::State<KeybindsState>,
) -> Result<KeybindConfig, String> {
    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    *config = KeybindConfig::default();
    apply_keybinds(&app, &config)?;
    save_keybinds(&app, &config)?;
    Ok(config.clone())
}
