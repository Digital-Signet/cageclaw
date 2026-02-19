import { useState } from "react";
import Dashboard from "./views/Dashboard";
import NetworkView from "./views/NetworkView";
import FilesView from "./views/FilesView";
import SettingsView from "./views/SettingsView";
import AgentView from "./views/AgentView";
import Sidebar from "./components/Sidebar";

type View = "dashboard" | "agent" | "network" | "files" | "settings";

function App() {
  const [activeView, setActiveView] = useState<View>("dashboard");

  const renderView = () => {
    switch (activeView) {
      case "dashboard":
        return <Dashboard />;
      case "agent":
        return <AgentView />;
      case "network":
        return <NetworkView />;
      case "files":
        return <FilesView />;
      case "settings":
        return <SettingsView />;
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      <main style={{ flex: 1, overflow: "auto", padding: "24px" }}>
        {renderView()}
      </main>
    </div>
  );
}

export default App;
