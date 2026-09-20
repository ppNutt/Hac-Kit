import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import FeatureLayout from "../../components/ui/FeatureLayout";
import StateBlock from "../../components/ui/StateBlock";
import {
  detectHashFormats,
  hashText,
  normalizeHash,
  resolveRecoveryAlgorithm,
  type HashAlgorithm,
  type RecoveryAlgorithm,
} from "./hashUtils";
import "./HashCracker.css";

interface ImportedWordlist {
  fileName: string;
  sizeBytes: number;
  words: string[];
}

interface RecoveryResult {
  outcome: "matched" | "no-match" | "cancelled";
  matchedWord: string | null;
  attemptsDone: number;
  totalAttempts: number;
  elapsedMs: number;
  algorithm: HashAlgorithm;
}

const MAX_IMPORT_SIZE_BYTES = 2 * 1024 * 1024;
const CHUNK_SIZE = 120;

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function toDelayMs(attemptsPerSecond: number): number {
  const clamped = Math.max(1, Math.min(500, attemptsPerSecond));
  return Math.round(1000 / clamped);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export default function HashCracker() {
  const [generateInput, setGenerateInput] = useState("");
  const [generateAlgorithm, setGenerateAlgorithm] = useState<HashAlgorithm>("SHA-256");
  const [generatedHash, setGeneratedHash] = useState("");

  const [identifyInput, setIdentifyInput] = useState("");
  const [compareLeft, setCompareLeft] = useState("");
  const [compareRight, setCompareRight] = useState("");

  const [wordlist, setWordlist] = useState<ImportedWordlist | null>(null);
  const [recoveryTargetHash, setRecoveryTargetHash] = useState("");
  const [recoveryAlgorithm, setRecoveryAlgorithm] = useState<RecoveryAlgorithm>("auto");
  const [attemptsPerSecond, setAttemptsPerSecond] = useState(120);
  const [runningRecovery, setRunningRecovery] = useState(false);
  const [recoveryProgress, setRecoveryProgress] = useState(0);
  const [recoveryAttempts, setRecoveryAttempts] = useState(0);
  const [recoveryElapsedMs, setRecoveryElapsedMs] = useState(0);
  const [recoveryResult, setRecoveryResult] = useState<RecoveryResult | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");

  const cancelRecoveryRef = useRef(false);
  const recoveryStartRef = useRef(0);

  useEffect(() => {
    if (!runningRecovery) {
      return;
    }

    const timer = window.setInterval(() => {
      setRecoveryElapsedMs(Date.now() - recoveryStartRef.current);
    }, 150);

    return () => window.clearInterval(timer);
  }, [runningRecovery]);

  const hints = useMemo(() => detectHashFormats(identifyInput), [identifyInput]);

  const compareOutcome = useMemo(() => {
    const left = normalizeHash(compareLeft);
    const right = normalizeHash(compareRight);
    if (!left || !right) {
      return null;
    }
    return left === right;
  }, [compareLeft, compareRight]);

  const wordlistPreview = useMemo(() => wordlist?.words.slice(0, 6) ?? [], [wordlist]);

  const handleGenerate = async () => {
    setError(null);
    try {
      const hash = await hashText(generateInput, generateAlgorithm);
      setGeneratedHash(hash);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleCopy = async () => {
    if (!generatedHash) {
      return;
    }
    try {
      await navigator.clipboard.writeText(generatedHash);
      setCopyMessage("Copied hash to clipboard.");
      window.setTimeout(() => setCopyMessage(""), 1600);
    } catch {
      setCopyMessage("Clipboard permission denied.");
      window.setTimeout(() => setCopyMessage(""), 2000);
    }
  };

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("Only .txt wordlists are supported in this local demonstration mode.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_IMPORT_SIZE_BYTES) {
      setError("Wordlist is too large. Keep it under 2 MB.");
      event.target.value = "";
      return;
    }

    try {
      const content = await file.text();
      const words = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 50000);

      if (words.length === 0) {
        setError("Wordlist has no usable candidates.");
        event.target.value = "";
        return;
      }

      setWordlist({
        fileName: file.name,
        sizeBytes: file.size,
        words,
      });
    } catch (err) {
      setError(`Failed to read wordlist file: ${String(err)}`);
    }
  };

  const handleStopRecovery = () => {
    cancelRecoveryRef.current = true;
  };

  const handleStartRecovery = async () => {
    setError(null);
    setRecoveryResult(null);

    if (!wordlist) {
      setError("Import a wordlist before starting recovery.");
      return;
    }

    const target = normalizeHash(recoveryTargetHash);
    if (!target) {
      setError("Enter a target hash to recover.");
      return;
    }

    const algorithm = resolveRecoveryAlgorithm(recoveryAlgorithm, target);
    if (!algorithm) {
      setError(
        "Unable to resolve algorithm automatically. Choose SHA-1, SHA-256, SHA-384, or SHA-512 manually.",
      );
      return;
    }

    cancelRecoveryRef.current = false;
    setRunningRecovery(true);
    setRecoveryProgress(0);
    setRecoveryAttempts(0);
    recoveryStartRef.current = Date.now();
    setRecoveryElapsedMs(0);

    const delayMs = toDelayMs(attemptsPerSecond);
    const total = wordlist.words.length;
    let attempts = 0;
    let matchedWord: string | null = null;

    for (let i = 0; i < total; i += 1) {
      if (cancelRecoveryRef.current) {
        break;
      }

      const candidate = wordlist.words[i];
      const digest = await hashText(candidate, algorithm);
      attempts += 1;

      if (normalizeHash(digest) === target) {
        matchedWord = candidate;
      }

      if (matchedWord || attempts % CHUNK_SIZE === 0 || attempts === total) {
        const progress = clampPercent((attempts / total) * 100);
        setRecoveryAttempts(attempts);
        setRecoveryProgress(progress);
        setRecoveryElapsedMs(Date.now() - recoveryStartRef.current);
        await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
      }

      if (matchedWord) {
        break;
      }
    }

    const elapsedMs = Date.now() - recoveryStartRef.current;
    const outcome: RecoveryResult["outcome"] = cancelRecoveryRef.current
      ? "cancelled"
      : matchedWord
        ? "matched"
        : "no-match";

    const finalAttempts = attempts;
    setRecoveryAttempts(finalAttempts);
    setRecoveryProgress(total === 0 ? 0 : clampPercent((finalAttempts / total) * 100));
    setRecoveryElapsedMs(elapsedMs);
    setRecoveryResult({
      outcome,
      matchedWord,
      attemptsDone: finalAttempts,
      totalAttempts: total,
      elapsedMs,
      algorithm,
    });
    setRunningRecovery(false);
  };

  return (
    <FeatureLayout
      title="Hash Cracker"
      description="Generate, identify, compare, and locally test hashes with beginner-safe recovery demonstrations."
    >
      <div className="hash-layout">
        <section className="panel hash-panel-full">
          <div className="hash-warning">
            Hashes are not decrypted. Recovery demonstrations work by hashing many candidates and
            checking for a match.
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">Generate hash</h2>
          <div className="hash-stack">
            <div className="hash-field">
              <label htmlFor="hash-generate-input">Input text</label>
              <textarea
                id="hash-generate-input"
                value={generateInput}
                onChange={(event) => setGenerateInput(event.target.value)}
                placeholder="Enter text to hash"
              />
            </div>

            <div className="hash-field">
              <label htmlFor="hash-generate-algorithm">Algorithm</label>
              <select
                id="hash-generate-algorithm"
                value={generateAlgorithm}
                onChange={(event) => setGenerateAlgorithm(event.target.value as HashAlgorithm)}
              >
                <option value="SHA-1">SHA-1</option>
                <option value="SHA-256">SHA-256</option>
                <option value="SHA-384">SHA-384</option>
                <option value="SHA-512">SHA-512</option>
              </select>
            </div>

            <div className="hash-actions">
              <button type="button" className="primary-button" onClick={() => void handleGenerate()}>
                Generate
              </button>
              <button type="button" className="link-button" onClick={() => void handleCopy()} disabled={!generatedHash}>
                Copy
              </button>
            </div>
            {copyMessage && <p className="hash-muted">{copyMessage}</p>}

            {generatedHash ? (
              <div className="hash-output">{generatedHash}</div>
            ) : (
              <StateBlock title="No hash yet" description="Generate a hash to display output here." />
            )}
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">Identify and compare</h2>
          <div className="hash-stack">
            <div className="hash-field">
              <label htmlFor="hash-identify">Hash to identify</label>
              <input
                id="hash-identify"
                value={identifyInput}
                onChange={(event) => setIdentifyInput(event.target.value)}
                placeholder="Paste a hash value"
              />
            </div>

            {hints.length === 0 ? (
              <p className="hash-muted">No clear format hint yet.</p>
            ) : (
              <div className="hash-hints">
                {hints.map((hint) => (
                  <span
                    key={`${hint.name}-${hint.note}`}
                    className={`hash-hint${hint.confidence === "high" ? " hash-hint-high" : ""}`}
                    title={hint.note}
                  >
                    {hint.name}
                  </span>
                ))}
              </div>
            )}

            <div className="hash-field">
              <label htmlFor="hash-compare-left">Compare hash A</label>
              <input
                id="hash-compare-left"
                value={compareLeft}
                onChange={(event) => setCompareLeft(event.target.value)}
              />
            </div>

            <div className="hash-field">
              <label htmlFor="hash-compare-right">Compare hash B</label>
              <input
                id="hash-compare-right"
                value={compareRight}
                onChange={(event) => setCompareRight(event.target.value)}
              />
            </div>

            {compareOutcome !== null && (
              <div
                className={`hash-compare-result${compareOutcome ? " hash-compare-match" : " hash-compare-different"}`}
              >
                {compareOutcome
                  ? "These hashes match exactly."
                  : "These hashes are different after normalization."}
              </div>
            )}
          </div>
        </section>

        <section className="panel hash-panel-full">
          <h2 className="panel-title">Local wordlist recovery demonstration</h2>
          <div className="hash-stack">
            <div className="hash-field">
              <label htmlFor="hash-wordlist-file">Wordlist file (.txt)</label>
              <input
                id="hash-wordlist-file"
                type="file"
                accept=".txt,text/plain"
                onChange={(event) => {
                  void handleFileImport(event);
                }}
                disabled={runningRecovery}
              />
              <p className="hash-muted">Max file size: 2 MB. Local processing only.</p>
            </div>

            {wordlist && (
              <>
                <div className="hash-wordlist-summary">
                  <span>File: {wordlist.fileName}</span>
                  <span>Size: {formatBytes(wordlist.sizeBytes)}</span>
                  <span>Candidates: {wordlist.words.length}</span>
                </div>
                <ul className="hash-preview">
                  {wordlistPreview.map((word) => (
                    <li key={word}>{word}</li>
                  ))}
                </ul>
              </>
            )}

            <div className="hash-field">
              <label htmlFor="hash-target">Target hash</label>
              <input
                id="hash-target"
                value={recoveryTargetHash}
                onChange={(event) => setRecoveryTargetHash(event.target.value)}
                placeholder="Paste hash to test against wordlist"
                disabled={runningRecovery}
              />
            </div>

            <div className="hash-field">
              <label htmlFor="hash-recovery-algo">Recovery algorithm</label>
              <select
                id="hash-recovery-algo"
                value={recoveryAlgorithm}
                onChange={(event) => setRecoveryAlgorithm(event.target.value as RecoveryAlgorithm)}
                disabled={runningRecovery}
              >
                <option value="auto">Auto detect (supported hex lengths only)</option>
                <option value="SHA-1">SHA-1</option>
                <option value="SHA-256">SHA-256</option>
                <option value="SHA-384">SHA-384</option>
                <option value="SHA-512">SHA-512</option>
              </select>
            </div>

            <div className="hash-field">
              <label htmlFor="hash-rate">Attempt rate: {attemptsPerSecond}/second</label>
              <input
                id="hash-rate"
                type="range"
                min={1}
                max={500}
                value={attemptsPerSecond}
                onChange={(event) => setAttemptsPerSecond(Number(event.target.value))}
                disabled={runningRecovery}
              />
            </div>

            <div className="hash-actions">
              {!runningRecovery ? (
                <button type="button" className="primary-button" onClick={() => void handleStartRecovery()}>
                  Start local recovery demo
                </button>
              ) : (
                <button type="button" className="danger-button" onClick={handleStopRecovery}>
                  Stop
                </button>
              )}
            </div>

            {error && <p className="error-text">{error}</p>}

            <div className="hash-progress-track" aria-hidden="true">
              <div className="hash-progress-fill" style={{ width: `${recoveryProgress}%` }} />
            </div>
            <p className="hash-muted">
              Attempts: {recoveryAttempts} | Elapsed: {formatDuration(recoveryElapsedMs)}
            </p>

            {recoveryResult ? (
              <ul className="hash-result-list">
                <li>Outcome: {recoveryResult.outcome}</li>
                <li>Algorithm: {recoveryResult.algorithm}</li>
                <li>
                  Matched candidate: {recoveryResult.matchedWord ? recoveryResult.matchedWord : "No match"}
                </li>
                <li>
                  Attempts: {recoveryResult.attemptsDone} / {recoveryResult.totalAttempts}
                </li>
                <li>Elapsed: {formatDuration(recoveryResult.elapsedMs)}</li>
              </ul>
            ) : (
              <StateBlock
                title="No recovery result yet"
                description="Import a wordlist and run a local demonstration to see progress and outcomes."
              />
            )}
          </div>
        </section>
      </div>
    </FeatureLayout>
  );
}
