import MacroRecorder from "./MacroRecorder";
import Keybinds from "./Keybinds";
import "./AutoClicker.css";

export default function AutoClicker() {
  return (
    <div className="feature-page">
      <header className="feature-header">
        <h1>Auto Clicker</h1>
        <p className="feature-description">
          Record mouse movement and replay it at your chosen speed, once or on a loop.
        </p>
      </header>

      <div className="autoclicker-grid">
        <MacroRecorder />
        <Keybinds />
      </div>
    </div>
  );
}
