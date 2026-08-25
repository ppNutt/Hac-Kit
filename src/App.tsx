import { useState } from "react";
import Sidebar from "./components/Sidebar";
import { features } from "./features";
import type { FeatureId } from "./features";
import "./App.css";

function App() {
  const [activeId, setActiveId] = useState<FeatureId>(features[0].id);
  const ActiveComponent = features.find((f) => f.id === activeId)?.component ?? features[0].component;

  return (
    <div className="app-shell">
      <Sidebar activeId={activeId} onSelect={setActiveId} />
      <main className="app-content">
        <ActiveComponent />
      </main>
    </div>
  );
}

export default App;

