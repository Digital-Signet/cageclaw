import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

function AgentView() {
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUrl = async () => {
    try {
      const url = await invoke<string | null>("get_gateway_url");
      setGatewayUrl(url);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUrl();
    // Poll for gateway URL in case the container is starting
    const interval = setInterval(loadUrl, 3000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
        <div style={{ color: "var(--text-secondary)" }}>Connecting...</div>
      </div>
    );
  }

  if (!gatewayUrl) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>
            {"\u2699"}
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Container not running
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            Start the container from the Dashboard to access OpenClaw.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          flexShrink: 0,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>OpenClaw Agent</h1>
        <button
          onClick={() => {
            setLoading(true);
            loadUrl();
          }}
          style={{
            padding: "6px 14px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            color: "var(--text-secondary)",
            fontSize: 12,
          }}
        >
          Reload
        </button>
      </div>
      <div
        style={{
          flex: 1,
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        <iframe
          src={gatewayUrl}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            background: "#000",
          }}
          allow="clipboard-write"
        />
      </div>
    </div>
  );
}

export default AgentView;
