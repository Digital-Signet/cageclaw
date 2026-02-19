import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

function AgentView() {
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);

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
    const interval = setInterval(loadUrl, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const host = (e as CustomEvent).detail as string;
      setAllowedDomains((prev) => [host, ...prev.filter((d) => d !== host)]);
    };
    window.addEventListener("domain-allowed", handler);
    return () => window.removeEventListener("domain-allowed", handler);
  }, []);

  const dismissAllowed = (host: string) => {
    setAllowedDomains((prev) => prev.filter((d) => d !== host));
  };

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

      {allowedDomains.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 12,
            flexShrink: 0,
          }}
        >
          {allowedDomains.map((host) => (
            <div
              key={host}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                background: "rgba(34, 197, 94, 0.1)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "var(--radius)",
                fontSize: 12,
                animation: "slideIn 0.2s ease-out",
              }}
            >
              <span style={{ color: "var(--success)", fontWeight: 600 }}>
                &#10003; {host}
              </span>
              <span style={{ color: "var(--text-secondary)" }}>
                now allowed — tell the agent to retry
              </span>
              <button
                onClick={() => dismissAllowed(host)}
                style={{
                  background: "none",
                  color: "var(--text-secondary)",
                  fontSize: 14,
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

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
