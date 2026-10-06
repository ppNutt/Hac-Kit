// Macro Recorder engine (Sprint 2 follow-up).
//
// Captures real mouse movement, clicks and keyboard actions as the user
// performs them (via `rdev::listen`, a global, passive input observer) and
// plays the exact sequence back later (via `rdev::simulate`) at an
// adjustable speed. A single recording is kept in memory for the current
// app session only.
//
// The global `rdev::listen` hook is started once for the lifetime of the
// app (see `spawn_listener`) and simply ignores events while not actively
// recording — `rdev` provides no clean way to stop/restart the OS-level
// hook itself, so gating what gets *collected* is done with an atomic flag
// instead.

use rdev::{listen, simulate, Event, EventType, Key};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

/// Minimum time between two recorded `MouseMove` samples. Real mouse-move
/// hook callbacks can fire hundreds of times a second; without throttling a
/// short recording would balloon into tens of thousands of near-identical
/// events.
const MOUSE_MOVE_THROTTLE: Duration = Duration::from_millis(15);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordedEvent {
    /// Time since the previous recorded event, in milliseconds.
    pub delay_ms: u64,
    pub event: EventType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RecorderMode {
    Idle,
    Recording,
    Playing,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecorderStatus {
    pub mode: RecorderMode,
    pub event_count: u64,
    pub elapsed_ms: u64,
}

const RECORDER_STATUS_EVENT: &str = "recorder://status";
const RECORDER_ERROR_EVENT: &str = "recorder://error";

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackSettings {
    pub speed: f64,
    pub loop_playback: bool,
}

impl Default for PlaybackSettings {
    fn default() -> Self {
        Self {
            speed: 1.0,
            loop_playback: false,
        }
    }
}

impl PlaybackSettings {
    fn scaled_delay(self, delay_ms: u64) -> u64 {
        ((delay_ms as f64) / self.speed).round().max(0.0) as u64
    }
}

fn emit_status(app: &AppHandle, mode: RecorderMode, event_count: u64, elapsed_ms: u64) {
    let _ = app.emit(
        RECORDER_STATUS_EVENT,
        RecorderStatus {
            mode,
            event_count,
            elapsed_ms,
        },
    );
}

#[derive(Clone)]
pub struct RecorderState {
    pub is_recording: Arc<AtomicBool>,
    pub is_playing: Arc<AtomicBool>,
    pub buffer: Arc<Mutex<Vec<RecordedEvent>>>,
    /// Keys belonging to the currently-bound record/play/etc. global
    /// shortcuts. Key presses/releases for these are never captured into a
    /// recording, so pressing e.g. Ctrl+C to stop recording doesn't tack a
    /// stray Ctrl+C onto the end of your macro.
    pub reserved_keys: Arc<Mutex<HashSet<Key>>>,
    playback_settings: Arc<Mutex<PlaybackSettings>>,
    /// Timing state for the *current* recording. Reset every time
    /// `start_recording` runs so a second recording in the same app session
    /// doesn't inherit stale timestamps from the previous one.
    last_event_time: Arc<Mutex<Instant>>,
    last_move_time: Arc<Mutex<Instant>>,
    is_first_event: Arc<AtomicBool>,
}

impl Default for RecorderState {
    fn default() -> Self {
        Self {
            is_recording: Arc::new(AtomicBool::new(false)),
            is_playing: Arc::new(AtomicBool::new(false)),
            buffer: Arc::new(Mutex::new(Vec::new())),
            reserved_keys: Arc::new(Mutex::new(HashSet::new())),
            playback_settings: Arc::new(Mutex::new(PlaybackSettings::default())),
            last_event_time: Arc::new(Mutex::new(Instant::now())),
            last_move_time: Arc::new(Mutex::new(Instant::now())),
            is_first_event: Arc::new(AtomicBool::new(true)),
        }
    }
}

impl RecorderState {
    fn playback_settings(&self) -> Result<PlaybackSettings, String> {
        self.playback_settings.lock().map(|settings| *settings).map_err(|e| e.to_string())
    }

    fn set_playback_settings(&self, settings: PlaybackSettings) -> Result<PlaybackSettings, String> {
        if !settings.speed.is_finite() || !(0.1..=10.0).contains(&settings.speed) {
            return Err("Playback speed must be between 0.1 and 10".into());
        }
        *self.playback_settings.lock().map_err(|e| e.to_string())? = settings;
        Ok(settings)
    }
}

/// Starts the single, app-lifetime `rdev::listen` hook. Must only be called
/// once. Events are only ever pushed into the shared buffer while
/// `is_recording` is true.
pub fn spawn_listener(app: AppHandle, state: RecorderState) {
    std::thread::spawn(move || {
        let is_recording = state.is_recording;
        let buffer = state.buffer;
        let reserved_keys = state.reserved_keys;
        let last_event_time = state.last_event_time;
        let last_move_time = state.last_move_time;
        let is_first_event = state.is_first_event;

        let callback = move |event: Event| {
            if !is_recording.load(Ordering::SeqCst) {
                return;
            }

            if let EventType::KeyPress(key) | EventType::KeyRelease(key) = &event.event_type {
                if let Ok(reserved) = reserved_keys.lock() {
                    if reserved.contains(key) {
                        return;
                    }
                }
            }

            let now = Instant::now();

            if let EventType::MouseMove { .. } = event.event_type {
                let mut last_move = last_move_time.lock().unwrap();
                if now.duration_since(*last_move) < MOUSE_MOVE_THROTTLE {
                    return;
                }
                *last_move = now;
            }

            let delay_ms = if is_first_event.swap(false, Ordering::SeqCst) {
                0
            } else {
                let last = *last_event_time.lock().unwrap();
                now.duration_since(last).as_millis().min(u128::from(u64::MAX)) as u64
            };
            *last_event_time.lock().unwrap() = now;

            if let Ok(mut buf) = buffer.lock() {
                buf.push(RecordedEvent {
                    delay_ms,
                    event: event.event_type,
                });
            }
        };

        // `listen` blocks for the lifetime of the app; errors here usually
        // mean the OS denied us permission to install the input hook.
        if let Err(err) = listen(callback) {
            eprintln!("Hac-Kit: failed to start input listener: {err:?}");
        }
        let _ = app; // kept for future status reporting on hook failure
    });
}

#[tauri::command]
pub fn start_recording(app: AppHandle, state: State<RecorderState>) -> Result<(), String> {
    if state.is_playing.load(Ordering::SeqCst) {
        return Err("Stop playback before recording a new macro".into());
    }
    if state.is_recording.load(Ordering::SeqCst) {
        return Err("Already recording".into());
    }

    state.buffer.lock().map_err(|e| e.to_string())?.clear();
    // Reset timing state so this recording's first event always has a
    // delay of 0, regardless of any previous recording in this session.
    *state.last_event_time.lock().map_err(|e| e.to_string())? = Instant::now();
    *state.last_move_time.lock().map_err(|e| e.to_string())? = Instant::now();
    state.is_first_event.store(true, Ordering::SeqCst);
    state.is_recording.store(true, Ordering::SeqCst);
    emit_status(&app, RecorderMode::Recording, 0, 0);
    Ok(())
}

#[tauri::command]
pub fn stop_recording(app: AppHandle, state: State<RecorderState>) -> Result<u64, String> {
    state.is_recording.store(false, Ordering::SeqCst);
    let count = state.buffer.lock().map_err(|e| e.to_string())?.len() as u64;
    emit_status(&app, RecorderMode::Idle, count, 0);
    Ok(count)
}

#[tauri::command]
pub fn get_recording_summary(state: State<RecorderState>) -> Result<u64, String> {
    Ok(state.buffer.lock().map_err(|e| e.to_string())?.len() as u64)
}

#[tauri::command]
pub fn get_playback_settings(state: State<RecorderState>) -> Result<PlaybackSettings, String> {
    state.playback_settings()
}

#[tauri::command]
pub fn set_playback_settings(
    settings: PlaybackSettings,
    state: State<RecorderState>,
) -> Result<PlaybackSettings, String> {
    state.set_playback_settings(settings)
}

#[tauri::command]
pub fn play_recording(
    app: AppHandle,
    state: State<RecorderState>,
) -> Result<(), String> {
    if state.is_recording.load(Ordering::SeqCst) {
        return Err("Stop recording before playing a macro".into());
    }
    if state.is_playing.load(Ordering::SeqCst) {
        return Err("Already playing".into());
    }
    let settings = state.playback_settings()?;

    let events = state.buffer.lock().map_err(|e| e.to_string())?.clone();
    if events.is_empty() {
        return Err("No recording to play. Record a macro first.".into());
    }

    state.is_playing.store(true, Ordering::SeqCst);
    emit_status(&app, RecorderMode::Playing, events.len() as u64, 0);

    let is_playing = state.is_playing.clone();
    let app_handle = app.clone();
    let total = events.len() as u64;

    std::thread::spawn(move || {
        let start = Instant::now();
        'playback: loop {
            for recorded in events.iter() {
                if !is_playing.load(Ordering::SeqCst) {
                    break 'playback;
                }

                let scaled_delay = settings.scaled_delay(recorded.delay_ms);
                if scaled_delay > 0 {
                    std::thread::sleep(Duration::from_millis(scaled_delay));
                }
                if !is_playing.load(Ordering::SeqCst) {
                    break 'playback;
                }

                let _ = simulate(&recorded.event);
                emit_status(
                    &app_handle,
                    RecorderMode::Playing,
                    total,
                    start.elapsed().as_millis() as u64,
                );
            }

            if !settings.loop_playback {
                break;
            }
        }

        is_playing.store(false, Ordering::SeqCst);
        emit_status(&app_handle, RecorderMode::Idle, total, start.elapsed().as_millis() as u64);
    });

    Ok(())
}

#[tauri::command]
pub fn stop_playback(app: AppHandle, state: State<RecorderState>) {
    state.is_playing.store(false, Ordering::SeqCst);
    let count = state.buffer.lock().map(|b| b.len() as u64).unwrap_or(0);
    emit_status(&app, RecorderMode::Idle, count, 0);
}

/// Invoked by the configured "toggle recording" global hotkey.
pub fn toggle_recording_from_hotkey(app: &AppHandle) {
    let state = app.state::<RecorderState>();
    if state.is_recording.load(Ordering::SeqCst) {
        let _ = stop_recording(app.clone(), state);
    } else {
        let _ = start_recording(app.clone(), state);
    }
}

/// Toggles playback using the same settings and Start/Stop commands as the UI.
pub fn play_recording_from_hotkey(app: &AppHandle) {
    let state = app.state::<RecorderState>();
    if state.is_playing.load(Ordering::SeqCst) {
        stop_playback(app.clone(), state);
        return;
    }
    if let Err(err) = play_recording(app.clone(), state) {
        eprintln!("Hac-Kit: failed to play recording from hotkey: {err}");
        if let Err(emit_err) = app.emit(RECORDER_ERROR_EVENT, &err) {
            eprintln!("Hac-Kit: failed to report playback error: {emit_err}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn playback_defaults_to_normal_speed_without_looping() {
        assert_eq!(
            RecorderState::default().playback_settings().unwrap(),
            PlaybackSettings { speed: 1.0, loop_playback: false }
        );
    }

    #[test]
    fn playback_uses_shared_speed_and_loop_settings() {
        let state = RecorderState::default();
        let shared_state = state.clone();
        let settings = PlaybackSettings { speed: 2.5, loop_playback: true };
        state.set_playback_settings(settings).unwrap();

        let playback = shared_state.playback_settings().unwrap();
        assert_eq!(playback, settings);
        assert_eq!(playback.scaled_delay(1000), 400);

        state.set_playback_settings(PlaybackSettings::default()).unwrap();
        assert_eq!(shared_state.playback_settings().unwrap(), PlaybackSettings::default());
        assert_eq!(playback, settings);
    }

    #[test]
    fn playback_speed_limits_scale_delays() {
        for (speed, expected) in [(0.1, 10000), (1.0, 1000), (10.0, 100)] {
            let state = RecorderState::default();
            state.set_playback_settings(PlaybackSettings { speed, loop_playback: false }).unwrap();
            assert_eq!(state.playback_settings().unwrap().scaled_delay(1000), expected);
        }
    }

    #[test]
    fn invalid_speed_does_not_replace_playback_settings() {
        let state = RecorderState::default();
        for speed in [0.0, -1.0, 0.09, 10.1, f64::NAN, f64::INFINITY] {
            assert!(state.set_playback_settings(PlaybackSettings { speed, loop_playback: true }).is_err());
            assert_eq!(state.playback_settings().unwrap(), PlaybackSettings::default());
        }
    }
}
