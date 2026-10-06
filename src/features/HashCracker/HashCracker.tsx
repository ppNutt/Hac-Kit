import { useMemo, useRef, useState, type ChangeEvent } from "react";
import FeatureLayout from "../../components/ui/FeatureLayout";
import {
  hashText,
  normalizeHash,
  resolveRecoveryAlgorithm,
  type HashAlgorithm,
  type RecoveryAlgorithm,
} from "./hashUtils";
import "./HashCracker.css";

interface RecoveryResult {
  matchedWord: string | null;
  attempts: number;
  algorithm: HashAlgorithm;
  cancelled: boolean;
}

const MAX_IMPORT_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_CANDIDATES = 50000;
const CHUNK_SIZE = 120;

export default function HashCracker() {
  const [generateInput, setGenerateInput] = useState("");
  const [generateAlgorithm, setGenerateAlgorithm] = useState<HashAlgorithm>("SHA-256");
  const [generatedHash, setGeneratedHash] = useState("");
  const [wordlistSource, setWordlistSource] = useState<"custom" | "file">("custom");
  const [customWords, setCustomWords] = useState([{ id: 0, value: "" }]);
  const nextWordId = useRef(1);
  const [fileWords, setFileWords] = useState<string[]>([]);
  const [wordlistName, setWordlistName] = useState("");
  const [recoveryTargetHash, setRecoveryTargetHash] = useState("");
  const [recoveryAlgorithm, setRecoveryAlgorithm] = useState<RecoveryAlgorithm>("auto");
  const [runningRecovery, setRunningRecovery] = useState(false);
  const [recoveryProgress, setRecoveryProgress] = useState(0);
  const [recoveryResult, setRecoveryResult] = useState<RecoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const cancelRecoveryRef = useRef(false);

  const candidates = useMemo(
    () => wordlistSource === "file"
      ? fileWords
      : customWords.map((word) => word.value.trim()).filter(Boolean),
    [wordlistSource, fileWords, customWords],
  );

  const clearRecoveryResult = () => {
    setRecoveryResult(null);
    setRecoveryProgress(0);
  };

  const handleGenerate = async () => {
    setError(null);
    try {
      setGeneratedHash(await hashText(generateInput, generateAlgorithm));
    } catch (err) {
      setError(`Could not generate hash: ${String(err)}`);
    }
  };

  const handleCopy = async () => {
    if (!generatedHash) {
      return;
    }
    try {
      await navigator.clipboard.writeText(generatedHash);
      setCopyMessage("Hash copied.");
    } catch {
      setCopyMessage("Could not copy hash. Check clipboard permissions.");
    }
  };

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("Choose a .txt wordlist.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_IMPORT_SIZE_BYTES) {
      setError("Wordlist is too large. Keep it under 2 MB.");
      event.target.value = "";
      return;
    }

    try {
      const words = (await file.text()).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (words.length === 0 || words.length > MAX_CANDIDATES) {
        setError(`Choose a wordlist with 1 to ${MAX_CANDIDATES.toLocaleString()} non-empty candidates.`);
        event.target.value = "";
        return;
      }
      setFileWords(words);
      setWordlistName(file.name);
      setRecoveryResult(null);
      setRecoveryProgress(0);
    } catch (err) {
      setError(`Could not read wordlist file: ${String(err)}`);
      event.target.value = "";
    }
  };

  const handleStartRecovery = async () => {
    setError(null);
    setRecoveryResult(null);
    setRecoveryProgress(0);

    const target = normalizeHash(recoveryTargetHash);
    if (!target) {
      setError("Enter a target hash.");
      return;
    }
    if (candidates.length === 0) {
      setError("Enter candidate words or choose a .txt wordlist.");
      return;
    }
    if (candidates.length > MAX_CANDIDATES) {
      setError(`Keep the wordlist to ${MAX_CANDIDATES.toLocaleString()} candidates or fewer.`);
      return;
    }

    const algorithm = resolveRecoveryAlgorithm(recoveryAlgorithm, target);
    if (!algorithm) {
      setError("Could not detect the hash algorithm. Choose SHA-1, SHA-256, SHA-384, or SHA-512.");
      return;
    }

    cancelRecoveryRef.current = false;
    setRunningRecovery(true);
    let matchedWord: string | null = null;
    let attempts = 0;

    try {
      for (let i = 0; i < candidates.length; i += 1) {
        if (cancelRecoveryRef.current) {
          break;
        }

        if (normalizeHash(await hashText(candidates[i], algorithm)) === target) {
          matchedWord = candidates[i];
          attempts = i + 1;
          break;
        }
        attempts = i + 1;

        if (attempts % CHUNK_SIZE === 0 || attempts === candidates.length) {
          setRecoveryProgress((attempts / candidates.length) * 100);
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }

      setRecoveryProgress((attempts / candidates.length) * 100);
      setRecoveryResult({
        matchedWord,
        attempts,
        algorithm,
        cancelled: cancelRecoveryRef.current,
      });
    } catch (err) {
      setError(`Could not check candidates: ${String(err)}`);
    } finally {
      setRunningRecovery(false);
    }
  };

  return (
    <FeatureLayout
      title="Hash Cracker"
      description="Generate a hash or check a target hash against your own wordlist."
    >
      <div className="hash-layout">
        <section className="panel">
          <h2 className="panel-title">Generate a hash</h2>
          <div className="hash-stack">
            <div className="hash-field">
              <label htmlFor="hash-generate-input">Text to hash</label>
              <input
                id="hash-generate-input"
                value={generateInput}
                onChange={(event) => setGenerateInput(event.target.value)}
                placeholder="Type text"
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
              <button type="button" onClick={() => void handleCopy()} disabled={!generatedHash}>
                Copy
              </button>
            </div>
            {copyMessage && <p className="hash-muted" role="status">{copyMessage}</p>}
            {generatedHash && <output className="hash-output">{generatedHash}</output>}
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">Match a target hash</h2>
          <div className="hash-stack">
            <div className="hash-field">
              <label htmlFor="hash-target">Target hash</label>
              <input
                id="hash-target"
                value={recoveryTargetHash}
                onChange={(event) => setRecoveryTargetHash(event.target.value)}
                placeholder="Paste the hash to check"
                disabled={runningRecovery}
              />
            </div>
            <fieldset className="hash-wordlist-source" disabled={runningRecovery}>
              <legend>Wordlist source</legend>
              {(["custom", "file"] as const).map((source) => (
                <label key={source}>
                  <input
                    type="radio"
                    name="hash-wordlist-source"
                    checked={wordlistSource === source}
                    onChange={() => {
                      setWordlistSource(source);
                      clearRecoveryResult();
                    }}
                  />
                  {source === "custom" ? "Write my own" : "Upload .txt file"}
                </label>
              ))}
            </fieldset>
            {wordlistSource === "custom" ? (
              <div className="hash-stack">
                {customWords.map((word, index) => (
                  <div className="hash-field" key={word.id}>
                    <label htmlFor={`hash-word-${word.id}`}>Word {index + 1}</label>
                    <div className="hash-word-row">
                      <input
                        id={`hash-word-${word.id}`}
                        value={word.value}
                        placeholder="Enter a candidate word"
                        disabled={runningRecovery}
                        onChange={(event) => {
                          const value = event.target.value;
                          setCustomWords((words) => words.map((item) =>
                            item.id === word.id ? { ...item, value } : item));
                          clearRecoveryResult();
                        }}
                      />
                      <button
                        type="button"
                        aria-label={`Remove word ${index + 1}`}
                        disabled={runningRecovery}
                        onClick={() => {
                          setCustomWords((words) => words.filter((item) => item.id !== word.id));
                          clearRecoveryResult();
                        }}
                      >
                        x
                      </button>
                    </div>
                  </div>
                ))}
                <div className="hash-actions">
                  <button
                    type="button"
                    disabled={runningRecovery || customWords.length >= MAX_CANDIDATES}
                    onClick={() => {
                      const id = nextWordId.current++;
                      setCustomWords((words) => [...words, { id, value: "" }]);
                      clearRecoveryResult();
                    }}
                  >
                    + Add word
                  </button>
                  <button
                    type="button"
                    disabled={runningRecovery || customWords.length === 0}
                    onClick={() => {
                      setCustomWords([]);
                      clearRecoveryResult();
                    }}
                  >
                    Delete all
                  </button>
                </div>
                <p className="hash-muted">Empty fields are skipped.</p>
              </div>
            ) : (
              <div className="hash-field">
                <label htmlFor="hash-wordlist-file">Wordlist file (.txt)</label>
                <input
                  id="hash-wordlist-file"
                  type="file"
                  accept=".txt,text/plain"
                  onChange={(event) => void handleFileImport(event)}
                  disabled={runningRecovery}
                />
                <p className="hash-muted">One candidate per line. Maximum file size: 2 MB.</p>
                {wordlistName && <p className="hash-muted">Loaded: {wordlistName}</p>}
              </div>
            )}
            <p className="hash-muted">
              {candidates.length} candidate{candidates.length === 1 ? "" : "s"} selected.
            </p>
            <div className="hash-field">
              <label htmlFor="hash-recovery-algo">Algorithm</label>
              <select
                id="hash-recovery-algo"
                value={recoveryAlgorithm}
                onChange={(event) => setRecoveryAlgorithm(event.target.value as RecoveryAlgorithm)}
                disabled={runningRecovery}
              >
                <option value="auto">Auto detect</option>
                <option value="SHA-1">SHA-1</option>
                <option value="SHA-256">SHA-256</option>
                <option value="SHA-384">SHA-384</option>
                <option value="SHA-512">SHA-512</option>
              </select>
            </div>
            <p className="hash-muted">
              Hashes cannot be decrypted. Candidates are hashed locally and compared to the target.
            </p>
            <div className="hash-actions">
              {!runningRecovery ? (
                <button type="button" className="primary-button" onClick={() => void handleStartRecovery()}>
                  Start
                </button>
              ) : (
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    cancelRecoveryRef.current = true;
                  }}
                >
                  Stop
                </button>
              )}
            </div>
            {error && <p className="error-text" role="alert">{error}</p>}
            {runningRecovery && (
              <div
                className="hash-progress-track"
                role="progressbar"
                aria-label="Checking wordlist"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(recoveryProgress)}
              >
                <div className="hash-progress-fill" style={{ width: `${recoveryProgress}%` }} />
              </div>
            )}
            {recoveryResult && (
              <div
                className={`hash-result${recoveryResult.matchedWord ? " hash-result-match" : ""}`}
                role="status"
              >
                {recoveryResult.matchedWord ? (
                  <>
                    <strong>Match found</strong>
                    <code>{recoveryResult.matchedWord}</code>
                  </>
                ) : recoveryResult.cancelled ? (
                  <strong>Stopped after checking {recoveryResult.attempts} candidates.</strong>
                ) : (
                  <strong>No match found in {recoveryResult.attempts} candidates.</strong>
                )}
                <span>Checked with {recoveryResult.algorithm}.</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </FeatureLayout>
  );
}
