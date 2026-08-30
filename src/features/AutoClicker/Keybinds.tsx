import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type KeybindAction = "toggleSimpleClicker" | "toggleRecording" | "playRecording";

interface ShortcutDef {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  code: string;
}

interface KeybindConfig {
  toggleSimpleClicker: ShortcutDef;
  toggleRecording: ShortcutDef;
  playRecording: ShortcutDef;
}

const ACTIONS: { id: KeybindAction; label: string; hint: string }[] = [
  {
    id: "toggleSimpleClicker",
    label: "Toggle Simple Clicker",
    hint: "Starts/stops the classic repeat-click mode above.",
  },
  {
    id: "toggleRecording",
    label: "Toggle Macro Recording",
    hint: "Starts/stops recording a new macro.",
  },
  {
    id: "playRecording",
    label: "Play Macro Recording",
    hint: "Plays back the last recorded macro once, at 1x speed.",
  },
];

// Keys that don't make sense as the "main" key of a shortcut on their own.
const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
]);

function formatShortcut(def: ShortcutDef): string {
  const parts: string[] = [];
  if (def.ctrl) parts.push("Ctrl");
  if (def.alt) parts.push("Alt");
  if (def.shift) parts.push("Shift");
  if (def.meta) parts.push("Meta");
  parts.push(def.code.replace(/^Key/, "").replace(/^Digit/, ""));
  return parts.join("+");
}

export default function Keybinds() {
  const [config, setConfig] = useState<KeybindConfig | null>(null);
  const [listeningFor, setListeningFor] = useState<KeybindAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<KeybindConfig>("get_keybinds")
      .then(setConfig)
      .catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    if (!listeningFor) return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      e.preventDefault();
      if (MODIFIER_CODES.has(e.code)) return; // wait for the real key

      const shortcut: ShortcutDef = {
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
        code: e.code,
      };

      const action = listeningFor;
      setListeningFor(null);
      setError(null);

      try {
        const updated = await invoke<KeybindConfig>("set_keybind", { action, shortcut });
        setConfig(updated);
      } catch (err) {
        setError(String(err));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [listeningFor]);

  const handleReset = async () => {
    setError(null);
    try {
      const updated = await invoke<KeybindConfig>("reset_keybinds");
      setConfig(updated);
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <section className="panel keybinds-panel">
      <h2 className="panel-title">Keybinds</h2>
      <p className="hint">
        These hotkeys work globally, even when Hac-Kit isn't focused. Click "Change" and press a
        new key combo to rebind an action.
      </p>

      <ul className="keybind-list">
        {ACTIONS.map(({ id, label, hint }) => (
          <li key={id} className="keybind-row">
            <div className="keybind-info">
              <span className="keybind-label">{label}</span>
              <span className="keybind-hint">{hint}</span>
            </div>
            <div className="keybind-control">
              {listeningFor === id ? (
                <span className="keybind-listening">Press a key…</span>
              ) : (
                <kbd className="keybind-combo">
                  {config ? formatShortcut(config[id]) : "…"}
                </kbd>
              )}
              <button
                type="button"
                className="link-button"
                onClick={() => setListeningFor(id)}
                disabled={listeningFor !== null}
              >
                Change
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button type="button" className="link-button" onClick={handleReset} disabled={listeningFor !== null}>
        Reset to defaults
      </button>

      {error && <p className="error-text">{error}</p>}
    </section>
  );
}
