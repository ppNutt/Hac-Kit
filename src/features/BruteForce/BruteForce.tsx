import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import FeatureLayout from "../../components/ui/FeatureLayout";
import StateBlock from "../../components/ui/StateBlock";
import "./BruteForce.css";

interface WordlistScenario {
  id: string;
  label: string;
  username: string;
  description: string;
  safetyNote: string;
}

interface WordlistStatus {
  running: boolean;
  phase: "idle" | "running" | "completed" | "cancelled" | "error";
  scenarioId: string;
  progressPercent: number;
  attemptsDone: number;
  totalAttempts: number;
  message: string;
}

interface WordlistResult {
  scenarioId: string;
  username: string;
  attemptsDone: number;
  totalAttempts: number;
  elapsedMs: number;
  matchedWord: string | null;
  outcome: "matched" | "no-match" | "cancelled";
  message: string;
}

interface WordlistTestRequest {
  scenarioId: string;
  words: string[];
  delayMs: number;
}

interface ImportedWordlist {
  fileName: string;
  sizeBytes: number;
  words: string[];
}

const STATUS_EVENT = "bruteforce://status";
const MAX_IMPORT_SIZE_BYTES = 2 * 1024 * 1024;

function statusLabel(phase: WordlistStatus["phase"]): string {
  switch (phase) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function toDelayMs(attemptsPerSecond: number): number {
  const clamped = Math.min(100, Math.max(1, attemptsPerSecond));
  return Math.round(1000 / clamped);
}

export default function BruteForce() {
  const [scenarios, setScenarios] = useState<WordlistScenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState("");
  const [attemptsPerSecond, setAttemptsPerSecond] = useState(10);
  const [consentChecked, setConsentChecked] = useState(false);
  const [imported, setImported] = useState<ImportedWordlist | null>(null);
  const [status, setStatus] = useState<WordlistStatus>({
    running: false,
    phase: "idle",
    scenarioId: "",
    progressPercent: 0,
    attemptsDone: 0,
    totalAttempts: 0,
    message: "Ready for a local authorized wordlist demonstration.",
  });
  const [result, setResult] = useState<WordlistResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unlistenPromise = listen<WordlistStatus>(STATUS_EVENT, (event) => {
      setStatus(event.payload);
      if (event.payload.phase === "completed" || event.payload.phase === "cancelled") {
        invoke<WordlistResult | null>("get_last_wordlist_result")
          .then(setResult)
          .catch(() => {
            /* best effort */
          });
      }
    });

    invoke<WordlistScenario[]>("get_wordlist_scenarios")
      .then((items) => {
        setScenarios(items);
        if (items.length > 0) {
          setSelectedScenario(items[0].id);
        }
      })
      .catch((err) => setError(String(err)));

    invoke<WordlistStatus>("get_wordlist_status")
      .then(setStatus)
      .catch(() => {
        /* no-op */
      });

    invoke<WordlistResult | null>("get_last_wordlist_result")
      .then(setResult)
      .catch(() => {
        /* no-op */
      });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const activeScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenario) ?? null,
    [scenarios, selectedScenario],
  );

  const previewWords = useMemo(() => imported?.words.slice(0, 6) ?? [], [imported]);

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("Only .txt wordlist files are supported in this training mode.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_IMPORT_SIZE_BYTES) {
      setError("Wordlist file is too large. Use a file smaller than 2 MB for controlled demos.");
      event.target.value = "";
      return;
    }

    try {
      const contents = await file.text();
      const words = contents
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 50000);

      if (words.length === 0) {
        setError("Wordlist has no usable entries after parsing.");
        event.target.value = "";
        return;
      }

      setImported({
        fileName: file.name,
        sizeBytes: file.size,
        words,
      });
    } catch (err) {
      setError(`Failed to read file: ${String(err)}`);
    }
  };

  const handleStart = async () => {
    setError(null);
    if (!imported) {
      setError("Import a .txt wordlist before starting.");
      return;
    }
    if (!selectedScenario) {
      setError("Select a local training scenario.");
      return;
    }
    if (!consentChecked) {
      setError("Confirm authorized local use before starting.");
      return;
    }

    const request: WordlistTestRequest = {
      scenarioId: selectedScenario,
      words: imported.words,
      delayMs: toDelayMs(attemptsPerSecond),
    };

    try {
      await invoke("start_wordlist_test", { request });
    } catch (err) {
      setError(String(err));
    }
  };

  const handleStop = async () => {
    setError(null);
    try {
      await invoke("stop_wordlist_test");
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <FeatureLayout
      title="Brute Force"
      description="Controlled local wordlist testing for beginner security demonstrations only."
    >
      <div className="wordlist-layout">
        <section className="panel wordlist-panel-full">
          <div className="wordlist-warning">
            This module is restricted to authorized local training scenarios. Do not use it against
            real third-party systems or accounts.
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">1) Import wordlist (.txt)</h2>
          <div className="wordlist-form-stack">
            <div className="wordlist-field">
              <label htmlFor="wordlist-file">Wordlist file</label>
              <input
                id="wordlist-file"
                type="file"
                accept=".txt,text/plain"
                onChange={(event) => {
                  void handleFileImport(event);
                }}
                disabled={status.running}
              />
              <p className="wordlist-muted">Max file size: 2 MB. Plain text only.</p>
            </div>

            {imported ? (
              <>
                <div className="wordlist-file-summary">
                  <span>File: {imported.fileName}</span>
                  <span>Size: {formatBytes(imported.sizeBytes)}</span>
                  <span>Entries: {imported.words.length}</span>
                </div>

                <ul className="wordlist-preview" aria-label="Wordlist preview">
                  {previewWords.map((word) => (
                    <li key={word}>{word}</li>
                  ))}
                </ul>
              </>
            ) : (
              <StateBlock
                title="No wordlist loaded"
                description="Import a .txt file to begin the local demonstration flow."
              />
            )}
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">2) Configure local test</h2>
          <div className="wordlist-form-stack">
            <div className="wordlist-field">
              <label htmlFor="wordlist-scenario">Training scenario</label>
              <select
                id="wordlist-scenario"
                value={selectedScenario}
                onChange={(event) => setSelectedScenario(event.target.value)}
                disabled={status.running}
              >
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.label}
                  </option>
                ))}
              </select>
              {activeScenario && (
                <>
                  <p className="wordlist-muted">Username: {activeScenario.username}</p>
                  <p className="wordlist-muted">{activeScenario.description}</p>
                  <p className="wordlist-muted">{activeScenario.safetyNote}</p>
                </>
              )}
            </div>

            <div className="wordlist-field">
              <label htmlFor="attempt-rate">Attempt rate: {attemptsPerSecond}/second</label>
              <input
                id="attempt-rate"
                type="range"
                min={1}
                max={100}
                value={attemptsPerSecond}
                onChange={(event) => setAttemptsPerSecond(Number(event.target.value))}
                disabled={status.running}
              />
            </div>

            <label className="wordlist-consent">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(event) => setConsentChecked(event.target.checked)}
                disabled={status.running}
              />
              <span>
                I confirm this run is an authorized local demonstration for awareness/training only.
              </span>
            </label>

            <div className="wordlist-actions">
              {!status.running ? (
                <button type="button" className="primary-button" onClick={handleStart}>
                  Start local test
                </button>
              ) : (
                <button type="button" className="danger-button" onClick={handleStop}>
                  Stop test
                </button>
              )}
            </div>

            {error && <p className="error-text">{error}</p>}
          </div>
        </section>

        <section className="panel wordlist-panel-full">
          <h2 className="panel-title">3) Progress and outcome</h2>
          <div className="wordlist-status-stack">
            <div className={`status-pill${status.running ? " status-pill-running" : ""}`}>
              {statusLabel(status.phase)}
            </div>
            <div className="wordlist-progress-track" aria-hidden="true">
              <div className="wordlist-progress-fill" style={{ width: `${status.progressPercent}%` }} />
            </div>
            <p className="wordlist-status-metric">Attempts: {status.attemptsDone} / {status.totalAttempts}</p>
            <p className="wordlist-status-metric">{status.message}</p>
          </div>
        </section>

        <section className="panel wordlist-panel-full">
          <h2 className="panel-title">Result summary</h2>
          {!result ? (
            <StateBlock
              title="No results yet"
              description="Run the controlled test to review attempts, elapsed time, and local outcome."
            />
          ) : (
            <ul className="wordlist-result-list">
              <li>Scenario: {result.scenarioId}</li>
              <li>Username: {result.username}</li>
              <li>Outcome: {result.outcome}</li>
              <li>Attempts: {result.attemptsDone} / {result.totalAttempts}</li>
              <li>Elapsed: {(result.elapsedMs / 1000).toFixed(2)}s</li>
              <li>
                Matched candidate: {result.matchedWord ? result.matchedWord : "No match found"}
              </li>
              <li>{result.message}</li>
            </ul>
          )}
        </section>
      </div>
    </FeatureLayout>
  );
}
