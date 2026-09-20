use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

const WORDLIST_STATUS_EVENT: &str = "bruteforce://status";
const MAX_WORDS: usize = 50_000;
const MAX_WORD_LENGTH: usize = 128;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordlistScenario {
    pub id: String,
    pub label: String,
    pub username: String,
    pub description: String,
    pub safety_note: String,
}

#[derive(Debug, Clone)]
struct ScenarioSecret {
    id: &'static str,
    label: &'static str,
    username: &'static str,
    password: &'static str,
    description: &'static str,
    safety_note: &'static str,
}

const SCENARIOS: [ScenarioSecret; 3] = [
    ScenarioSecret {
        id: "demo-admin",
        label: "Admin Dashboard Demo",
        username: "admin.demo",
        password: "Summer2026!",
        description: "Simulates a local admin login where weak password reuse can be demonstrated.",
        safety_note: "Local demonstration only. No external systems are contacted.",
    },
    ScenarioSecret {
        id: "demo-helpdesk",
        label: "Helpdesk Portal Demo",
        username: "helpdesk.demo",
        password: "HelpDesk#42",
        description: "Shows how predictable role-based passwords can be guessed quickly.",
        safety_note: "Use this to teach stronger password policy and MFA requirements.",
    },
    ScenarioSecret {
        id: "demo-mail",
        label: "Mail Access Demo",
        username: "mail.demo",
        password: "InboxSafe@123",
        description: "Demonstrates risk of common password patterns in mailbox accounts.",
        safety_note: "Never run against real third-party accounts.",
    },
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordlistTestRequest {
    pub scenario_id: String,
    pub words: Vec<String>,
    pub delay_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordlistStatus {
    pub running: bool,
    pub phase: String,
    pub scenario_id: String,
    pub progress_percent: f32,
    pub attempts_done: u64,
    pub total_attempts: u64,
    pub message: String,
}

impl Default for WordlistStatus {
    fn default() -> Self {
        Self {
            running: false,
            phase: "idle".to_string(),
            scenario_id: String::new(),
            progress_percent: 0.0,
            attempts_done: 0,
            total_attempts: 0,
            message: "Ready for a local authorized wordlist demonstration.".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordlistResult {
    pub scenario_id: String,
    pub username: String,
    pub attempts_done: u64,
    pub total_attempts: u64,
    pub elapsed_ms: u64,
    pub matched_word: Option<String>,
    pub outcome: String,
    pub message: String,
}

pub struct WordlistTestingState {
    pub running: Arc<AtomicBool>,
    pub cancel_requested: Arc<AtomicBool>,
    pub attempts_done: Arc<AtomicU64>,
    status: Arc<Mutex<WordlistStatus>>,
    result: Arc<Mutex<Option<WordlistResult>>>,
}

impl Default for WordlistTestingState {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            cancel_requested: Arc::new(AtomicBool::new(false)),
            attempts_done: Arc::new(AtomicU64::new(0)),
            status: Arc::new(Mutex::new(WordlistStatus::default())),
            result: Arc::new(Mutex::new(None)),
        }
    }
}

fn emit_status(app: &AppHandle, state: &Arc<Mutex<WordlistStatus>>) {
    if let Ok(status) = state.lock() {
        let _ = app.emit(WORDLIST_STATUS_EVENT, status.clone());
    }
}

fn set_status(
    app: &AppHandle,
    state: &Arc<Mutex<WordlistStatus>>,
    next: WordlistStatus,
) {
    if let Ok(mut status) = state.lock() {
        *status = next;
    }
    emit_status(app, state);
}

fn validate_words(words: Vec<String>) -> Result<Vec<String>, String> {
    if words.is_empty() {
        return Err("Wordlist is empty. Import a .txt file with candidate passwords.".into());
    }
    if words.len() > MAX_WORDS {
        return Err(format!(
            "Wordlist contains too many entries (max {}). Reduce file size for controlled demos.",
            MAX_WORDS
        ));
    }

    let mut sanitized: Vec<String> = Vec::with_capacity(words.len());
    for word in words {
        let trimmed = word.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.len() > MAX_WORD_LENGTH {
            return Err(format!(
                "A wordlist entry exceeded {} characters. Please normalize the file.",
                MAX_WORD_LENGTH
            ));
        }
        if !trimmed.is_ascii() {
            return Err("Wordlist entries must be ASCII for this training mode.".into());
        }
        sanitized.push(trimmed.to_string());
    }

    if sanitized.is_empty() {
        return Err("Wordlist has no usable lines after cleanup.".into());
    }

    Ok(sanitized)
}

fn find_scenario(id: &str) -> Option<&'static ScenarioSecret> {
    SCENARIOS.iter().find(|scenario| scenario.id == id)
}

#[tauri::command]
pub fn get_wordlist_scenarios() -> Vec<WordlistScenario> {
    SCENARIOS
        .iter()
        .map(|item| WordlistScenario {
            id: item.id.to_string(),
            label: item.label.to_string(),
            username: item.username.to_string(),
            description: item.description.to_string(),
            safety_note: item.safety_note.to_string(),
        })
        .collect()
}

#[tauri::command]
pub fn get_wordlist_status(state: State<WordlistTestingState>) -> WordlistStatus {
    state.status.lock().map(|status| status.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn get_last_wordlist_result(state: State<WordlistTestingState>) -> Option<WordlistResult> {
    state.result.lock().ok().and_then(|result| result.clone())
}

#[tauri::command]
pub fn stop_wordlist_test(app: AppHandle, state: State<WordlistTestingState>) -> Result<(), String> {
    if !state.running.load(Ordering::SeqCst) {
        return Err("No local test is currently running.".into());
    }
    state.cancel_requested.store(true, Ordering::SeqCst);

    let status = WordlistStatus {
        running: false,
        phase: "cancelled".to_string(),
        scenario_id: state
            .status
            .lock()
            .map(|current| current.scenario_id.clone())
            .unwrap_or_default(),
        progress_percent: 0.0,
        attempts_done: state.attempts_done.load(Ordering::SeqCst),
        total_attempts: state
            .status
            .lock()
            .map(|current| current.total_attempts)
            .unwrap_or(0),
        message: "Test cancellation requested.".to_string(),
    };
    set_status(&app, &state.status, status);
    Ok(())
}

#[tauri::command]
pub fn start_wordlist_test(
    request: WordlistTestRequest,
    app: AppHandle,
    state: State<WordlistTestingState>,
) -> Result<(), String> {
    if state.running.load(Ordering::SeqCst) {
        return Err("A local demonstration is already running. Stop it first.".into());
    }

    let scenario = find_scenario(&request.scenario_id)
        .ok_or("Invalid scenario. Select one of the authorized local training scenarios.")?;
    let words = validate_words(request.words)?;
    let delay_ms = request.delay_ms.clamp(10, 1000);

    state.running.store(true, Ordering::SeqCst);
    state.cancel_requested.store(false, Ordering::SeqCst);
    state.attempts_done.store(0, Ordering::SeqCst);

    if let Ok(mut result) = state.result.lock() {
        *result = None;
    }

    let total = words.len() as u64;

    set_status(
        &app,
        &state.status,
        WordlistStatus {
            running: true,
            phase: "running".to_string(),
            scenario_id: request.scenario_id.clone(),
            progress_percent: 0.0,
            attempts_done: 0,
            total_attempts: total,
            message: "Local controlled test started.".to_string(),
        },
    );

    let running = state.running.clone();
    let cancel_requested = state.cancel_requested.clone();
    let attempts_done = state.attempts_done.clone();
    let status_state = state.status.clone();
    let result_state = state.result.clone();
    let app_handle = app.clone();
    let scenario_id = request.scenario_id.clone();
    let username = scenario.username.to_string();
    let expected_password = scenario.password.to_string();

    std::thread::spawn(move || {
        let started = Instant::now();
        let mut matched_word: Option<String> = None;

        for candidate in words.iter() {
            if cancel_requested.load(Ordering::SeqCst) {
                break;
            }

            std::thread::sleep(Duration::from_millis(delay_ms));

            let current = attempts_done.fetch_add(1, Ordering::SeqCst) + 1;
            let progress = ((current as f32 / total as f32) * 100.0).clamp(0.0, 100.0);

            set_status(
                &app_handle,
                &status_state,
                WordlistStatus {
                    running: true,
                    phase: "running".to_string(),
                    scenario_id: scenario_id.clone(),
                    progress_percent: progress,
                    attempts_done: current,
                    total_attempts: total,
                    message: format!("Attempt {} of {}", current, total),
                },
            );

            if candidate == &expected_password {
                matched_word = Some(candidate.clone());
                break;
            }
        }

        let final_attempts = attempts_done.load(Ordering::SeqCst);
        let elapsed_ms = started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;

        let (outcome, message, phase) = if cancel_requested.load(Ordering::SeqCst) {
            (
                "cancelled".to_string(),
                "Demonstration cancelled by user.".to_string(),
                "cancelled".to_string(),
            )
        } else if matched_word.is_some() {
            (
                "matched".to_string(),
                "A matching candidate was found in the local demo dataset.".to_string(),
                "completed".to_string(),
            )
        } else {
            (
                "no-match".to_string(),
                "No candidate matched in this local demonstration run.".to_string(),
                "completed".to_string(),
            )
        };

        if let Ok(mut slot) = result_state.lock() {
            *slot = Some(WordlistResult {
                scenario_id: scenario_id.clone(),
                username,
                attempts_done: final_attempts,
                total_attempts: total,
                elapsed_ms,
                matched_word,
                outcome,
                message: message.clone(),
            });
        }

        set_status(
            &app_handle,
            &status_state,
            WordlistStatus {
                running: false,
                phase,
                scenario_id,
                progress_percent: if total == 0 {
                    0.0
                } else {
                    ((final_attempts as f32 / total as f32) * 100.0).clamp(0.0, 100.0)
                },
                attempts_done: final_attempts,
                total_attempts: total,
                message,
            },
        );

        running.store(false, Ordering::SeqCst);
        cancel_requested.store(false, Ordering::SeqCst);
    });

    Ok(())
}
