use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

const NMAP_STATUS_EVENT: &str = "nmap://status";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NmapAvailability {
    pub available: bool,
    pub version: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NmapScanRequest {
    pub target: String,
    /// "quick" | "service" | "intense"
    pub preset: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NmapScanStatus {
    pub running: bool,
    pub phase: String,
    pub target: String,
    pub preset: String,
    pub progress_percent: f32,
    pub message: String,
}

impl Default for NmapScanStatus {
    fn default() -> Self {
        Self {
            running: false,
            phase: "idle".into(),
            target: String::new(),
            preset: "quick".into(),
            progress_percent: 0.0,
            message: "Ready to scan an authorized target.".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NmapPortResult {
    pub port: u16,
    pub protocol: String,
    pub state: String,
    pub service: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NmapHostResult {
    pub host: String,
    pub status: String,
    pub ports: Vec<NmapPortResult>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NmapScanResult {
    pub target: String,
    pub preset: String,
    pub finished_at_unix: u64,
    pub hosts: Vec<NmapHostResult>,
    pub open_port_count: u32,
    pub summary: String,
}

pub struct NmapState {
    pub running: Arc<AtomicBool>,
    pub cancel_requested: Arc<AtomicBool>,
    child: Arc<Mutex<Option<Arc<Mutex<Child>>>>>,
    status: Arc<Mutex<NmapScanStatus>>,
    result: Arc<Mutex<Option<NmapScanResult>>>,
}

impl Default for NmapState {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            cancel_requested: Arc::new(AtomicBool::new(false)),
            child: Arc::new(Mutex::new(None)),
            status: Arc::new(Mutex::new(NmapScanStatus::default())),
            result: Arc::new(Mutex::new(None)),
        }
    }
}

fn emit_status(app: &AppHandle, state: &Arc<Mutex<NmapScanStatus>>) {
    if let Ok(status) = state.lock() {
        let _ = app.emit(NMAP_STATUS_EVENT, status.clone());
    }
}

fn set_status(
    app: &AppHandle,
    state: &Arc<Mutex<NmapScanStatus>>,
    running: bool,
    phase: &str,
    target: &str,
    preset: &str,
    progress_percent: f32,
    message: &str,
) {
    if let Ok(mut status) = state.lock() {
        status.running = running;
        status.phase = phase.to_string();
        status.target = target.to_string();
        status.preset = preset.to_string();
        status.progress_percent = progress_percent.clamp(0.0, 100.0);
        status.message = message.to_string();
    }
    emit_status(app, state);
}

fn is_valid_domain(target: &str) -> bool {
    if target.is_empty() || target.len() > 253 {
        return false;
    }
    if target.contains(" ") || target.starts_with('.') || target.ends_with('.') {
        return false;
    }

    let labels: Vec<&str> = target.split('.').collect();
    if labels.is_empty() {
        return false;
    }

    labels.iter().all(|label| {
        !label.is_empty()
            && label.len() <= 63
            && !label.starts_with('-')
            && !label.ends_with('-')
            && label
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
    })
}

fn validate_target(target: &str) -> Result<String, String> {
    let trimmed = target.trim().to_lowercase();
    if trimmed.is_empty() {
        return Err("Target is required.".into());
    }
    if trimmed.contains('/') {
        return Err("CIDR ranges are disabled in this beginner mode. Use one host or domain.".into());
    }
    if trimmed == "localhost" {
        return Ok(trimmed);
    }
    if trimmed.parse::<std::net::IpAddr>().is_ok() || is_valid_domain(&trimmed) {
        return Ok(trimmed);
    }
    Err("Enter a valid IPv4/IPv6 address or domain (single target only).".into())
}

fn preset_args(preset: &str) -> Result<Vec<String>, String> {
    match preset {
        "quick" => Ok(vec!["-T3".into(), "-F".into()]),
        "service" => Ok(vec!["-T3".into(), "-sV".into(), "--top-ports".into(), "1000".into()]),
        "intense" => Ok(vec!["-T4".into(), "-A".into(), "--top-ports".into(), "1000".into()]),
        _ => Err("Unsupported scan preset. Allowed: quick, service, intense".into()),
    }
}

fn check_nmap() -> NmapAvailability {
    let output = Command::new("nmap").arg("--version").output();
    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            let version_line = text.lines().next().unwrap_or("Nmap is installed").to_string();
            NmapAvailability {
                available: true,
                version: version_line,
                message: "Nmap detected. You can run authorized scans.".into(),
            }
        }
        _ => NmapAvailability {
            available: false,
            version: String::new(),
            message: "Nmap was not detected. Install Nmap and ensure it is available in PATH.".into(),
        },
    }
}

fn parse_progress_percent(line: &str) -> Option<f32> {
    let marker = "% done";
    let end = line.find(marker)?;
    let prefix = &line[..end];
    let token = prefix.split_whitespace().last()?;
    token.parse::<f32>().ok().map(|v| v.clamp(0.0, 100.0))
}

fn parse_host_line(line: &str) -> Option<NmapHostResult> {
    if !line.starts_with("Host: ") {
        return None;
    }

    let rest = &line[6..];
    let host = rest.split_whitespace().next()?.to_string();
    let status = if line.contains("Status: Up") {
        "up".to_string()
    } else {
        "unknown".to_string()
    };

    let mut ports: Vec<NmapPortResult> = Vec::new();
    if let Some(idx) = line.find("Ports:") {
        let ports_raw = &line[idx + "Ports:".len()..].trim();
        for entry in ports_raw.split(',') {
            let trimmed = entry.trim();
            if trimmed.is_empty() {
                continue;
            }
            let fields: Vec<&str> = trimmed.split('/').collect();
            if fields.len() < 5 {
                continue;
            }
            let port = match fields[0].trim().parse::<u16>() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let state = fields[1].trim().to_string();
            let protocol = fields[2].trim().to_string();
            let service = fields[4].trim().to_string();
            ports.push(NmapPortResult {
                port,
                protocol,
                state,
                service,
            });
        }
    }

    Some(NmapHostResult { host, status, ports })
}

fn parse_scan_result(target: &str, preset: &str, stdout: &str) -> NmapScanResult {
    let mut hosts: Vec<NmapHostResult> = Vec::new();
    for line in stdout.lines() {
        if let Some(host) = parse_host_line(line) {
            hosts.push(host);
        }
    }

    let open_port_count = hosts
        .iter()
        .flat_map(|host| host.ports.iter())
        .filter(|port| port.state == "open")
        .count() as u32;

    let summary = if hosts.is_empty() {
        "No hosts were parsed from the scan output. The target might be unreachable or filtered."
            .to_string()
    } else {
        format!(
            "Scan finished for {} host(s). Found {} open port(s).",
            hosts.len(),
            open_port_count
        )
    };

    NmapScanResult {
        target: target.to_string(),
        preset: preset.to_string(),
        finished_at_unix: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
        hosts,
        open_port_count,
        summary,
    }
}

#[tauri::command]
pub fn check_nmap_availability() -> NmapAvailability {
    check_nmap()
}

#[tauri::command]
pub fn get_nmap_status(state: State<NmapState>) -> NmapScanStatus {
    state
        .status
        .lock()
        .map(|status| status.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_last_nmap_result(state: State<NmapState>) -> Option<NmapScanResult> {
    state.result.lock().ok().and_then(|result| result.clone())
}

#[tauri::command]
pub fn cancel_nmap_scan(app: AppHandle, state: State<NmapState>) -> Result<(), String> {
    if !state.running.load(Ordering::SeqCst) {
        return Err("No scan is currently running.".into());
    }

    state.cancel_requested.store(true, Ordering::SeqCst);

    if let Ok(guard) = state.child.lock() {
        if let Some(child_ref) = guard.as_ref() {
            if let Ok(mut child) = child_ref.lock() {
                let _ = child.kill();
            }
        }
    }

    set_status(
        &app,
        &state.status,
        false,
        "cancelled",
        "",
        "quick",
        0.0,
        "Scan cancelled by user.",
    );

    state.running.store(false, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn start_nmap_scan(request: NmapScanRequest, app: AppHandle, state: State<NmapState>) -> Result<(), String> {
    if state.running.load(Ordering::SeqCst) {
        return Err("A scan is already running. Cancel it before starting another.".into());
    }

    let availability = check_nmap();
    if !availability.available {
        return Err(availability.message);
    }

    let target = validate_target(&request.target)?;
    let mut args = preset_args(&request.preset)?;

    args.push("--stats-every".into());
    args.push("2s".into());
    args.push("-oG".into());
    args.push("-".into());
    args.push(target.clone());

    let mut command = Command::new("nmap");
    command.args(&args);
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to launch nmap process: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture nmap stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Failed to capture nmap stderr".to_string())?;

    let child_ref = Arc::new(Mutex::new(child));

    {
        let mut holder = state.child.lock().map_err(|e| e.to_string())?;
        *holder = Some(child_ref.clone());
    }

    state.running.store(true, Ordering::SeqCst);
    state.cancel_requested.store(false, Ordering::SeqCst);
    if let Ok(mut result) = state.result.lock() {
        *result = None;
    }

    set_status(
        &app,
        &state.status,
        true,
        "running",
        &target,
        &request.preset,
        0.0,
        "Scan started. Gathering host and port information...",
    );

    let running = state.running.clone();
    let cancel_requested = state.cancel_requested.clone();
    let child_holder = state.child.clone();
    let status_state = state.status.clone();
    let result_state = state.result.clone();
    let app_handle = app.clone();
    let preset = request.preset.clone();

    std::thread::spawn(move || {
        let stdout_buffer = Arc::new(Mutex::new(String::new()));
        let stderr_buffer = Arc::new(Mutex::new(String::new()));

        let stdout_buffer_reader = stdout_buffer.clone();
        let stdout_reader = std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) => break,
                    Ok(_) => {
                        if let Ok(mut buf) = stdout_buffer_reader.lock() {
                            buf.push_str(&line);
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        let stderr_buffer_reader = stderr_buffer.clone();
        let app_progress = app_handle.clone();
        let status_progress = status_state.clone();
        let target_progress = target.clone();
        let preset_progress = preset.clone();
        let stderr_reader = std::thread::spawn(move || {
            let mut reader = BufReader::new(stderr);
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) => break,
                    Ok(_) => {
                        let captured = line.trim().to_string();
                        if let Ok(mut buf) = stderr_buffer_reader.lock() {
                            buf.push_str(&captured);
                            buf.push('\n');
                        }
                        if let Some(progress) = parse_progress_percent(&captured) {
                            set_status(
                                &app_progress,
                                &status_progress,
                                true,
                                "running",
                                &target_progress,
                                &preset_progress,
                                progress,
                                "Scan is in progress...",
                            );
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        let mut was_cancelled = false;
        let exit_status = loop {
            let maybe_status = if let Ok(mut child_guard) = child_ref.lock() {
                child_guard.try_wait().ok().flatten()
            } else {
                None
            };

            if let Some(status) = maybe_status {
                break status;
            }

            if cancel_requested.load(Ordering::SeqCst) {
                was_cancelled = true;
                let waited = if let Ok(mut child_guard) = child_ref.lock() {
                    child_guard.wait().ok()
                } else {
                    None
                };
                if let Some(status) = waited {
                    break status;
                }
                break if let Ok(mut child_guard) = child_ref.lock() {
                    match child_guard.try_wait() {
                        Ok(Some(status)) => status,
                        _ => {
                            running.store(false, Ordering::SeqCst);
                            cancel_requested.store(false, Ordering::SeqCst);
                            if let Ok(mut holder) = child_holder.lock() {
                                *holder = None;
                            }
                            set_status(
                                &app_handle,
                                &status_state,
                                false,
                                "cancelled",
                                &target,
                                &preset,
                                0.0,
                                "Scan cancelled by user.",
                            );
                            return;
                        }
                    }
                } else {
                    running.store(false, Ordering::SeqCst);
                    cancel_requested.store(false, Ordering::SeqCst);
                    if let Ok(mut holder) = child_holder.lock() {
                        *holder = None;
                    }
                    set_status(
                        &app_handle,
                        &status_state,
                        false,
                        "cancelled",
                        &target,
                        &preset,
                        0.0,
                        "Scan cancelled by user.",
                    );
                    return;
                };
            }

            std::thread::sleep(std::time::Duration::from_millis(180));
        };

        let _ = stdout_reader.join();
        let _ = stderr_reader.join();

        let stdout_text = stdout_buffer.lock().map(|b| b.clone()).unwrap_or_default();
        let stderr_text = stderr_buffer.lock().map(|b| b.clone()).unwrap_or_default();

        if cancel_requested.load(Ordering::SeqCst) || was_cancelled {
            set_status(
                &app_handle,
                &status_state,
                false,
                "cancelled",
                &target,
                &preset,
                0.0,
                "Scan cancelled by user.",
            );
        } else if exit_status.success() {
            let result = parse_scan_result(&target, &preset, &stdout_text);
            if let Ok(mut slot) = result_state.lock() {
                *slot = Some(result.clone());
            }
            set_status(
                &app_handle,
                &status_state,
                false,
                "completed",
                &target,
                &preset,
                100.0,
                &result.summary,
            );
        } else {
            let message = if stderr_text.trim().is_empty() {
                "Nmap scan failed. Check target availability and permissions.".to_string()
            } else {
                format!("Nmap scan failed: {}", stderr_text.lines().last().unwrap_or("unknown error"))
            };
            set_status(
                &app_handle,
                &status_state,
                false,
                "error",
                &target,
                &preset,
                0.0,
                &message,
            );
        }

        running.store(false, Ordering::SeqCst);
        cancel_requested.store(false, Ordering::SeqCst);

        if let Ok(mut holder) = child_holder.lock() {
            *holder = None;
        }
    });

    Ok(())
}
