type ContainerStatus = "running" | "stopped" | "starting" | "notcreated" | { error: string };

interface ContainerControlsProps {
  status: ContainerStatus;
  loading: boolean;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
}

function ContainerControls({
  status,
  loading,
  onStart,
  onStop,
  onRestart,
}: ContainerControlsProps) {
  const isRunning = status === "running";
  const isStopped = status === "stopped" || status === "notcreated";

  const btnBase = {
    padding: "10px 24px",
    borderRadius: "var(--radius)",
    fontWeight: 600 as const,
    fontSize: 14,
    transition: "opacity 0.15s",
    opacity: loading ? 0.6 : 1,
  };

  return (
    <div
      style={{
        background: "var(--bg-card)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border)",
        padding: 20,
      }}
    >
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 16,
          color: "var(--text-secondary)",
        }}
      >
        Container Controls
      </h3>
      <div style={{ display: "flex", gap: 12 }}>
        {isStopped && (
          <button
            onClick={onStart}
            disabled={loading}
            style={{
              ...btnBase,
              background: "var(--success)",
              color: "#fff",
            }}
          >
            {loading ? "Starting..." : "Start OpenClaw"}
          </button>
        )}
        {isRunning && (
          <>
            <button
              onClick={onStop}
              disabled={loading}
              style={{
                ...btnBase,
                background: "var(--danger)",
                color: "#fff",
              }}
            >
              {loading ? "Stopping..." : "Stop"}
            </button>
            <button
              onClick={onRestart}
              disabled={loading}
              style={{
                ...btnBase,
                background: "var(--warning)",
                color: "#000",
              }}
            >
              {loading ? "Restarting..." : "Restart"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default ContainerControls;
