import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type RecorderMode = "idle" | "recording" | "playing";

interface RecorderStatus {
  mode: RecorderMode;
  eventCount: number;
  elapsedMs: number;
}

const RECORDER_STATUS_EVENT = "recorder://status";
const SPEED_PRESETS = [0.5, 1, 2, 5];

function formatElapsed(ms: number): string {
  const totalSeconds = ms / 1000;
  return `${totalSeconds.toFixed(1)}s`;
}

export default function MacroRecorder() {
  const [mode, setMode] = useState<RecorderMode>("idle");
  const [eventCount, setEventCount] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loopPlayback, setLoopPlayback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unlistenPromise = listen<RecorderStatus>(RECORDER_STATUS_EVENT, (event) => {
      setMode(event.payload.mode);
      setEventCount(event.payload.eventCount);
      setElapsedMs(event.payload.elapsedMs);
    });

    invoke<number>("get_recording_summary")
      .then((count) => setEventCount(count))
      .catch(() => {
        /* backend not reachable yet during first paint - safe to ignore */
      });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const handleRecordToggle = async () => {
    setError(null);
    try {
      if (mode === "recording") {
        await invoke("stop_recording");
      } else {
        await invoke("start_recording");
      }
    } catch (err) {
      setError(String(err));
    }
  };

  const handlePlayToggle = async () => {
    setError(null);
    try {
      if (mode === "playing") {
        await invoke("stop_playback");
      } else {
        await invoke("play_recording", { speed, loopPlayback });
      }
    } catch (err) {
      setError(String(err));
    }
  };

  const isRecording = mode === "recording";
  const isPlaying = mode === "playing";
  const canPlay = eventCount > 0 && !isRecording;

  return (
    <section className="panel macro-recorder">
      <h2 className="panel-title">Macro Recorder</h2>
      <p className="hint">
        Record your real mouse movement, clicks and keyboard actions, then play the exact
        sequence back at any speed.
      </p>

      <div className={`status-pill${isRecording ? " status-pill-recording" : ""}${isPlaying ? " status-pill-running" : ""}`}>
        {isRecording ? "Recording…" : isPlaying ? "Playing…" : "Idle"}
      </div>

      <p className="click-counter macro-counter">
        <span>{eventCount}</span> events{" "}
        {(isRecording || isPlaying) && <span className="muted-inline">· {formatElapsed(elapsedMs)}</span>}
      </p>

      <div className="macro-actions">
        <button
          type="button"
          className={isRecording ? "danger-button" : "primary-button"}
          onClick={handleRecordToggle}
          disabled={isPlaying}
        >
          {isRecording ? "Stop Recording" : "Record"}
        </button>
        <button
          type="button"
          className={isPlaying ? "danger-button" : "primary-button"}
          onClick={handlePlayToggle}
          disabled={!isPlaying && !canPlay}
        >
          {isPlaying ? "Stop Playback" : "Play"}
        </button>
      </div>

      <div className="field-row speed-row">
        <label htmlFor="speed-slider">Playback speed</label>
        <span className="speed-readout">{speed.toFixed(1)}x</span>
      </div>
      <input
        id="speed-slider"
        type="range"
        min={0.1}
        max={10}
        step={0.1}
        value={speed}
        disabled={isRecording || isPlaying}
        onChange={(e) => setSpeed(Number(e.target.value))}
        className="speed-slider"
      />
      <div className="speed-presets">
        {SPEED_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`link-button${speed === preset ? " speed-preset-active" : ""}`}
            disabled={isRecording || isPlaying}
            onClick={() => setSpeed(preset)}
          >
            {preset}x
          </button>
        ))}
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={loopPlayback}
          disabled={isRecording || isPlaying}
          onChange={(e) => setLoopPlayback(e.target.checked)}
        />
        Loop playback until stopped
      </label>

      {error && <p className="error-text">{error}</p>}
    </section>
  );
}
