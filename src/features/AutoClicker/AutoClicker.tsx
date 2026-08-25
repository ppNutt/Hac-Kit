import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./AutoClicker.css";

type MouseButtonOption = "left" | "right" | "middle";
type ClickType = "single" | "double";
type RepeatMode = "infinite" | "fixed";
type PositionMode = "current" | "sequence";

interface AutoClickConfig {
  intervalMs: number;
  button: MouseButtonOption;
  clickType: ClickType;
  repeatMode: RepeatMode;
  count: number;
  positions: [number, number][];
}

interface AutoClickerStatus {
  running: boolean;
  clicksDone: number;
}

const STATUS_EVENT = "autoclicker://status";

export default function AutoClicker() {
  const [intervalMs, setIntervalMs] = useState(100);
  const [button, setButton] = useState<MouseButtonOption>("left");
  const [clickType, setClickType] = useState<ClickType>("single");
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("infinite");
  const [count, setCount] = useState(10);
  const [positionMode, setPositionMode] = useState<PositionMode>("current");
  const [positions, setPositions] = useState<[number, number][]>([]);

  const [running, setRunning] = useState(false);
  const [clicksDone, setClicksDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const runningRef = useRef(running);
  runningRef.current = running;

  // Keep the UI in sync even if the clicker is toggled via the F6 hotkey
  // instead of the on-screen Start/Stop button.
  useEffect(() => {
    const unlistenPromise = listen<AutoClickerStatus>(STATUS_EVENT, (event) => {
      setRunning(event.payload.running);
      setClicksDone(event.payload.clicksDone);
    });

    invoke<AutoClickerStatus>("get_auto_clicker_status")
      .then((status) => {
        setRunning(status.running);
        setClicksDone(status.clicksDone);
      })
      .catch(() => {
        /* backend not reachable yet during first paint - safe to ignore */
      });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const captureCurrentPosition = useCallback(async () => {
    try {
      setCapturing(true);
      const [x, y] = await invoke<[number, number]>("get_cursor_position");
      setPositions((prev) => [...prev, [x, y]]);
    } catch (err) {
      setError(String(err));
    } finally {
      setCapturing(false);
    }
  }, []);

  const removePosition = (index: number) => {
    setPositions((prev) => prev.filter((_, i) => i !== index));
  };

  const clearPositions = () => setPositions([]);

  const handleStart = async () => {
    setError(null);
    const config: AutoClickConfig = {
      intervalMs,
      button,
      clickType,
      repeatMode,
      count,
      positions: positionMode === "sequence" ? positions : [],
    };

    if (positionMode === "sequence" && positions.length === 0) {
      setError("Add at least one position before starting a click sequence.");
      return;
    }

    try {
      await invoke("start_auto_clicker", { config });
      setRunning(true);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleStop = async () => {
    try {
      await invoke("stop_auto_clicker");
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div className="feature-page">
      <header className="feature-header">
        <h1>Auto Clicker</h1>
        <p className="feature-description">
          Automate repeated mouse clicks at a configurable interval, position and speed.
        </p>
      </header>

      <div className="autoclicker-grid">
        <section className="panel">
          <h2 className="panel-title">Click Settings</h2>

          <div className="field-row">
            <label htmlFor="interval">Interval (ms)</label>
            <input
              id="interval"
              type="number"
              min={1}
              value={intervalMs}
              disabled={running}
              onChange={(e) => setIntervalMs(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          <div className="field-row">
            <label htmlFor="button">Mouse button</label>
            <select
              id="button"
              value={button}
              disabled={running}
              onChange={(e) => setButton(e.target.value as MouseButtonOption)}
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="middle">Middle</option>
            </select>
          </div>

          <div className="field-row">
            <label htmlFor="clickType">Click type</label>
            <select
              id="clickType"
              value={clickType}
              disabled={running}
              onChange={(e) => setClickType(e.target.value as ClickType)}
            >
              <option value="single">Single click</option>
              <option value="double">Double click</option>
            </select>
          </div>

          <div className="field-row">
            <label>Repeat</label>
            <div className="segmented">
              <button
                type="button"
                className={repeatMode === "infinite" ? "segmented-active" : ""}
                disabled={running}
                onClick={() => setRepeatMode("infinite")}
              >
                Until stopped
              </button>
              <button
                type="button"
                className={repeatMode === "fixed" ? "segmented-active" : ""}
                disabled={running}
                onClick={() => setRepeatMode("fixed")}
              >
                Fixed count
              </button>
            </div>
          </div>

          {repeatMode === "fixed" && (
            <div className="field-row">
              <label htmlFor="count">Number of clicks</label>
              <input
                id="count"
                type="number"
                min={1}
                value={count}
                disabled={running}
                onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          )}
        </section>

        <section className="panel">
          <h2 className="panel-title">Click Position</h2>

          <div className="segmented">
            <button
              type="button"
              className={positionMode === "current" ? "segmented-active" : ""}
              disabled={running}
              onClick={() => setPositionMode("current")}
            >
              Current cursor position
            </button>
            <button
              type="button"
              className={positionMode === "sequence" ? "segmented-active" : ""}
              disabled={running}
              onClick={() => setPositionMode("sequence")}
            >
              Recorded sequence
            </button>
          </div>

          {positionMode === "current" ? (
            <p className="hint">
              The clicker will click wherever your mouse cursor happens to be when it fires.
            </p>
          ) : (
            <div className="sequence-editor">
              <p className="hint">
                Move your mouse to a spot, then capture it. Positions play back in order, looping
                until stopped.
              </p>
              <button type="button" onClick={captureCurrentPosition} disabled={running || capturing}>
                {capturing ? "Capturing…" : "Capture current position"}
              </button>

              {positions.length > 0 ? (
                <ul className="position-list">
                  {positions.map(([x, y], i) => (
                    <li key={i}>
                      <span>
                        #{i + 1} — x: {x}, y: {y}
                      </span>
                      <button
                        type="button"
                        className="link-button"
                        disabled={running}
                        onClick={() => removePosition(i)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint muted">No positions recorded yet.</p>
              )}

              {positions.length > 0 && (
                <button type="button" className="link-button" disabled={running} onClick={clearPositions}>
                  Clear all
                </button>
              )}
            </div>
          )}
        </section>

        <section className="panel autoclicker-status">
          <h2 className="panel-title">Status</h2>

          <div className={`status-pill${running ? " status-pill-running" : ""}`}>
            {running ? "Running" : "Stopped"}
          </div>

          <p className="click-counter">
            <span>{clicksDone}</span> clicks sent
          </p>

          <div className="autoclicker-actions">
            {!running ? (
              <button type="button" className="primary-button" onClick={handleStart}>
                Start
              </button>
            ) : (
              <button type="button" className="danger-button" onClick={handleStop}>
                Stop
              </button>
            )}
          </div>

          <p className="hint muted">
            Tip: press <kbd>F6</kbd> anywhere to start/stop instantly, even if the app isn't focused.
          </p>

          {error && <p className="error-text">{error}</p>}
        </section>
      </div>
    </div>
  );
}
