import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type RecorderMode = "idle" | "recording" | "playing";

interface RecorderStatus {
  mode: RecorderMode;
  eventCount: number;
}

interface PlaybackSettings {
  speed: number;
  loopPlayback: boolean;
}

const RECORDER_STATUS_EVENT = "recorder://status";

export default function MacroRecorder() {
  const [mode, setMode] = useState<RecorderMode>("idle");
  const [eventCount, setEventCount] = useState(0);
  const [settings, setSettings] = useState<PlaybackSettings | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settingsSync = useRef<{
    queue: Promise<void>;
    revision: number;
    confirmed: PlaybackSettings | null;
  }>({
    queue: Promise.resolve(),
    revision: 0,
    confirmed: null,
  });

  useEffect(() => {
    const unlistenPromise = listen<RecorderStatus>(RECORDER_STATUS_EVENT, (event) => {
      setMode(event.payload.mode);
      setEventCount(event.payload.eventCount);
    });
    const unlistenErrorPromise = listen<string>("recorder://error", (event) => {
      setError(event.payload);
    });

    invoke<PlaybackSettings>("get_playback_settings")
      .then((loaded) => {
        settingsSync.current.confirmed = loaded;
        setSettings(loaded);
      })
      .catch((err) => setError(String(err)));

    invoke<number>("get_recording_summary")
      .then((count) => setEventCount(count))
      .catch((err) => setError(String(err)));

    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch((err) => setError(String(err)));
      unlistenErrorPromise.then((unlisten) => unlisten()).catch((err) => setError(String(err)));
    };
  }, []);

  const updateSettings = (updated: PlaybackSettings) => {
    setError(null);
    setSettings(updated);
    setIsSavingSettings(true);
    const sync = settingsSync.current;
    const revision = ++sync.revision;
    // Serialize saves so rapid slider changes cannot overwrite newer settings.
    sync.queue = sync.queue.then(async () => {
      try {
        sync.confirmed = await invoke<PlaybackSettings>("set_playback_settings", { settings: updated });
      } catch (err) {
        setError(String(err));
      } finally {
        if (revision === sync.revision) {
          setSettings(sync.confirmed);
          setIsSavingSettings(false);
        }
      }
    });
  };

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
        await invoke("play_recording");
      }
    } catch (err) {
      setError(String(err));
    }
  };

  const isRecording = mode === "recording";
  const isPlaying = mode === "playing";
  const canPlay = eventCount > 0 && !isRecording && settings !== null && !isSavingSettings;
  const settingsDisabled = isRecording || isPlaying || settings === null;

  return (
    <section className="panel macro-recorder">
      <h2 className="panel-title">Record and play</h2>
      <p className="hint">Record mouse movement, clicks, and keyboard actions, then replay them.</p>

      <div className={`status-pill${isRecording ? " status-pill-recording" : ""}${isPlaying ? " status-pill-running" : ""}`}>
        {isRecording ? "Recording…" : isPlaying ? "Playing…" : "Idle"}
      </div>

      <p className="click-counter macro-counter">
        <span>{eventCount}</span> recorded actions
      </p>

      <div className="macro-actions">
        <button
          type="button"
          className={isRecording ? "danger-button" : "primary-button"}
          onClick={handleRecordToggle}
          disabled={isPlaying}
        >
          {isRecording ? "Stop recording" : "Record"}
        </button>
        <button
          type="button"
          className={isPlaying ? "danger-button" : "primary-button"}
          onClick={handlePlayToggle}
          disabled={!isPlaying && !canPlay}
        >
          {isPlaying ? "Stop" : "Start"}
        </button>
      </div>

      <div className="field-row speed-row">
        <label htmlFor="speed-slider">Movement speed</label>
        <span className="speed-readout">{settings ? `${settings.speed.toFixed(1)}x` : "..."}</span>
      </div>
      <input
        id="speed-slider"
        type="range"
        min={0.1}
        max={10}
        step={0.1}
        value={settings?.speed ?? 1}
        disabled={settingsDisabled}
        onChange={(e) => {
          if (settings) updateSettings({ ...settings, speed: Number(e.target.value) });
        }}
        className="speed-slider"
      />

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings?.loopPlayback ?? false}
          disabled={settingsDisabled}
          onChange={(e) => {
            if (settings) updateSettings({ ...settings, loopPlayback: e.target.checked });
          }}
        />
        Loop movement until stopped
      </label>

      {error && <p className="error-text">{error}</p>}
    </section>
  );
}
