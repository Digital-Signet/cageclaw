import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import logo from "../assets/logo.png";

type View = "dashboard" | "agent" | "network" | "files" | "settings";

interface SidebarProps {
  activeView: View;
  onNavigate: (view: View) => void;
}

const navItems: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "\u25A3" },
  { id: "agent", label: "Agent", icon: "\uD83E\uDD9E" },
  { id: "network", label: "Network", icon: "\u21C4" },
  { id: "files", label: "Files", icon: "\u2637" },
  { id: "settings", label: "Settings", icon: "\u2699" },
];

type ContainerStatus = "running" | "stopped" | "starting" | "notcreated" | { error: string };

const STATUS_DISPLAY: Record<string, { color: string; label: string }> = {
  running: { color: "var(--success)", label: "Running" },
  stopped: { color: "var(--text-secondary)", label: "Stopped" },
  starting: { color: "var(--warning)", label: "Starting" },
  notcreated: { color: "var(--text-secondary)", label: "Not created" },
};

function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const [dockerOk, setDockerOk] = useState<boolean | null>(null);
  const [containerStatus, setContainerStatus] = useState<string>("notcreated");

  useEffect(() => {
    const check = async () => {
      try {
        await invoke("detect_runtime");
        setDockerOk(true);
      } catch {
        setDockerOk(false);
      }
      try {
        const s = await invoke<ContainerStatus>("get_container_status");
        setContainerStatus(typeof s === "string" ? s : "error");
      } catch {
        setContainerStatus("notcreated");
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  const display = STATUS_DISPLAY[containerStatus] ?? {
    color: "var(--danger)",
    label: "Error",
  };

  return (
    <nav
      style={{
        width: 200,
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: "16px 0",
      }}
    >
      <div
        style={{
          padding: "0 16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <img src={logo} alt="CageClaw" style={{ width: 36, height: 36 }} />
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--accent)",
            letterSpacing: "-0.5px",
          }}
        >
          CageClaw
        </span>
      </div>

      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 16px",
            background:
              activeView === item.id
                ? "rgba(79, 143, 247, 0.12)"
                : "transparent",
            color:
              activeView === item.id
                ? "var(--accent)"
                : "var(--text-secondary)",
            borderLeft:
              activeView === item.id
                ? "3px solid var(--accent)"
                : "3px solid transparent",
            textAlign: "left",
            transition: "all 0.15s",
          }}
        >
          <span style={{ fontSize: 18 }}>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}

      <div style={{ flex: 1 }} />

      <div
        style={{
          padding: "8px 16px",
          margin: "0 12px 8px",
          background: "var(--bg-card)",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: dockerOk === false ? "var(--danger)" : display.color,
              boxShadow:
                containerStatus === "running"
                  ? `0 0 6px ${display.color}`
                  : "none",
            }}
          />
          <span style={{ color: "var(--text-secondary)" }}>
            {dockerOk === false ? "Docker offline" : display.label}
          </span>
        </div>
      </div>

      <div
        style={{
          padding: "4px 16px",
          fontSize: 11,
          color: "var(--text-secondary)",
        }}
      >
        CageClaw v0.1.0
      </div>
    </nav>
  );
}

export default Sidebar;
