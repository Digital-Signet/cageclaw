import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import StatusCard from "../components/StatusCard";
import ContainerControls from "../components/ContainerControls";

interface RuntimeInfo {
  name: string;
  version: string;
  api_version: string;
}

interface ContainerStats {
  cpu_percent: number;
  memory_mb: number;
  memory_limit_mb: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
  uptime_seconds: number;
}

type ContainerStatus = "running" | "stopped" | "starting" | "notcreated" | { error: string };

function Dashboard() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [status, setStatus] = useState<ContainerStatus>("notcreated");
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    detectRuntime();
  }, []);

  useEffect(() => {
    if (!runtime) return;
    refreshStatus();
    const interval = setInterval(refreshStatus, 3000);
    return () => clearInterval(interval);
  }, [runtime]);

  useEffect(() => {
    if (status !== "running") {
      setStats(null);
      return;
    }
    const fetchStats = async () => {
      try {
        const s = await invoke<ContainerStats>("get_container_stats");
        setStats(s);
      } catch {
        // container may have just stopped
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [status]);

  const detectRuntime = async () => {
    try {
      const info = await invoke<RuntimeInfo>("detect_runtime");
      setRuntime(info);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const refreshStatus = async () => {
    try {
      const s = await invoke<ContainerStatus>("get_container_status");
      setStatus(s);
    } catch {
      setStatus("notcreated");
    }
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      await invoke("start_container");
      await refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await invoke("stop_container");
      await refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    setLoading(true);
    try {
      await invoke("restart_container");
      await refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const statusLabel =
    typeof status === "object" ? `Error: ${status.error}` : status;
  const isRunning = status === "running";

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>
        Dashboard
      </h1>

      {error && (
        <div
          style={{
            background: "rgba(248, 113, 113, 0.1)",
            border: "1px solid var(--danger)",
            borderRadius: "var(--radius)",
            padding: "12px 16px",
            marginBottom: 16,
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatusCard
          label="Runtime"
          value={runtime ? `${runtime.name} ${runtime.version}` : "Not detected"}
          color={runtime ? "var(--success)" : "var(--danger)"}
        />
        <StatusCard
          label="Container"
          value={statusLabel}
          color={isRunning ? "var(--success)" : "var(--text-secondary)"}
        />
        <StatusCard
          label="CPU"
          value={stats ? `${stats.cpu_percent.toFixed(1)}%` : "--"}
        />
        <StatusCard
          label="Memory"
          value={
            stats
              ? `${stats.memory_mb.toFixed(0)} / ${stats.memory_limit_mb.toFixed(0)} MB`
              : "--"
          }
        />
      </div>

      <ContainerControls
        status={status}
        loading={loading}
        onStart={handleStart}
        onStop={handleStop}
        onRestart={handleRestart}
      />
    </div>
  );
}

export default Dashboard;
