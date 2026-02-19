import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Dashboard from "./views/Dashboard";
import NetworkView from "./views/NetworkView";
import FilesView from "./views/FilesView";
import SettingsView from "./views/SettingsView";
import AgentView from "./views/AgentView";
import Sidebar from "./components/Sidebar";
import BlockedToast from "./components/BlockedToast";
import SetupWizard from "./components/SetupWizard";

type View = "dashboard" | "agent" | "network" | "files" | "settings";

function App() {
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [showSetup, setShowSetup] = useState<boolean | null>(null);

  useEffect(() => {
    invoke<any>("get_config").then((config) => {
      setShowSetup(!config.setup_completed);
    }).catch(() => {
      setShowSetup(true);
    });
  }, []);

  if (showSetup === null) return null; // loading config

  if (showSetup) {
    return <SetupWizard onComplete={() => setShowSetup(false)} />;
  }

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
      <BlockedToast onNavigate={(v) => setActiveView(v as View)} />
    </div>
  );
}

export default App;
