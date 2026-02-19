import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AppConfig {
  openclaw_image: string | null;
  openclaw_tag: string | null;
  file_mounts: { host_path: string; container_path: string; read_only: boolean; blocked: boolean }[];
  allowed_domains: { pattern: string; allowed: boolean }[];
  env_vars: [string, string][];
  resource_limits: { memory_mb: number | null; cpu_cores: number | null };
}

function SettingsView() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  const [showValues, setShowValues] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const c = await invoke<AppConfig>("get_config");
      setConfig(c);
    } catch (e) {
      console.error(e);
    }
  };

  const saveConfig = async () => {
    if (!config) return;
    try {
      await invoke("update_config", { config });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const addDomain = () => {
    if (!config || !newDomain) return;
    setConfig({
      ...config,
      allowed_domains: [
        ...config.allowed_domains,
        { pattern: newDomain, allowed: true },
      ],
    });
    setNewDomain("");
  };

  const removeDomain = (index: number) => {
    if (!config) return;
    setConfig({
      ...config,
      allowed_domains: config.allowed_domains.filter((_, i) => i !== index),
    });
  };

  const addEnvVar = () => {
    if (!config || !newEnvKey) return;
    setConfig({
      ...config,
      env_vars: [...config.env_vars, [newEnvKey, newEnvValue]],
    });
    setNewEnvKey("");
    setNewEnvValue("");
  };

  const removeEnvVar = (index: number) => {
    if (!config) return;
    setConfig({
      ...config,
      env_vars: config.env_vars.filter((_, i) => i !== index),
    });
  };

  if (!config) return <div>Loading...</div>;

  const sectionStyle = {
    background: "var(--bg-card)" as const,
    borderRadius: "var(--radius-lg)" as const,
    border: "1px solid var(--border)" as const,
    padding: 20,
    marginBottom: 20,
  };

  const labelStyle = {
    display: "block" as const,
    fontSize: 12,
    color: "var(--text-secondary)" as const,
    marginBottom: 4,
  };

  const inputStyle = {
    width: "100%" as const,
    padding: "8px 12px",
    background: "var(--bg-primary)" as const,
    border: "1px solid var(--border)" as const,
    borderRadius: "var(--radius)" as const,
    color: "var(--text-primary)" as const,
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Settings</h1>
        <button
          onClick={saveConfig}
          style={{
            padding: "8px 24px",
            background: saved ? "var(--success)" : "var(--accent)",
            color: "#fff",
            borderRadius: "var(--radius)",
            fontWeight: 600,
            transition: "background 0.2s",
          }}
        >
          {saved ? "Saved!" : "Save"}
        </button>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text-secondary)" }}>
          Container Image
        </h3>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Image</label>
            <input
              type="text"
              value={config.openclaw_image ?? "openclaw/openclaw"}
              onChange={(e) => setConfig({ ...config, openclaw_image: e.target.value || null })}
              style={inputStyle}
            />
          </div>
          <div style={{ width: 150 }}>
            <label style={labelStyle}>Tag</label>
            <input
              type="text"
              value={config.openclaw_tag ?? "latest"}
              onChange={(e) => setConfig({ ...config, openclaw_tag: e.target.value || null })}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text-secondary)" }}>
          Resource Limits
        </h3>
        <div style={{ display: "flex", gap: 12 }}>
          <div>
            <label style={labelStyle}>Memory (MB)</label>
            <input
              type="number"
              value={config.resource_limits.memory_mb ?? 2048}
              onChange={(e) =>
                setConfig({
                  ...config,
                  resource_limits: {
                    ...config.resource_limits,
                    memory_mb: parseInt(e.target.value) || null,
                  },
                })
              }
              style={{ ...inputStyle, width: 120 }}
            />
          </div>
          <div>
            <label style={labelStyle}>CPU Cores</label>
            <input
              type="number"
              step="0.5"
              value={config.resource_limits.cpu_cores ?? 2}
              onChange={(e) =>
                setConfig({
                  ...config,
                  resource_limits: {
                    ...config.resource_limits,
                    cpu_cores: parseFloat(e.target.value) || null,
                  },
                })
              }
              style={{ ...inputStyle, width: 120 }}
            />
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "var(--text-secondary)" }}>
          Allowed Domains (default-deny)
        </h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="e.g. api.anthropic.com or *.googleapis.com"
            style={{ ...inputStyle, flex: 1 }}
            onKeyDown={(e) => e.key === "Enter" && addDomain()}
          />
          <button
            onClick={addDomain}
            style={{
              padding: "8px 16px",
              background: "var(--accent)",
              color: "#fff",
              borderRadius: "var(--radius)",
              fontWeight: 600,
            }}
          >
            Add
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {config.allowed_domains.map((domain, i) => (
            <span
              key={i}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                background: "rgba(34, 197, 94, 0.1)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "var(--radius)",
                fontSize: 12,
                fontFamily: "monospace",
                color: "var(--allowed)",
              }}
            >
              {domain.pattern}
              <button
                onClick={() => removeDomain(i)}
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
            </span>
          ))}
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>
            Environment Variables
          </h3>
          <button
            onClick={() => setShowValues(!showValues)}
            style={{
              background: "none",
              color: "var(--text-secondary)",
              fontSize: 12,
              padding: "2px 8px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}
          >
            {showValues ? "Hide values" : "Show values"}
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
          Passed into the container. Add ANTHROPIC_API_KEY here to enable OpenClaw.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={newEnvKey}
            onChange={(e) => setNewEnvKey(e.target.value)}
            placeholder="KEY"
            style={{ ...inputStyle, flex: 1, fontFamily: "monospace" }}
            onKeyDown={(e) => e.key === "Enter" && addEnvVar()}
          />
          <input
            type={showValues ? "text" : "password"}
            value={newEnvValue}
            onChange={(e) => setNewEnvValue(e.target.value)}
            placeholder="value"
            style={{ ...inputStyle, flex: 2, fontFamily: "monospace" }}
            onKeyDown={(e) => e.key === "Enter" && addEnvVar()}
          />
          <button
            onClick={addEnvVar}
            style={{
              padding: "8px 16px",
              background: "var(--accent)",
              color: "#fff",
              borderRadius: "var(--radius)",
              fontWeight: 600,
            }}
          >
            Add
          </button>
        </div>
        {config.env_vars.map(([key, value], i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              background: "var(--bg-primary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              marginBottom: 6,
              fontFamily: "monospace",
              fontSize: 12,
            }}
          >
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{key}</span>
            <span style={{ color: "var(--text-secondary)" }}>=</span>
            <span style={{ color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
              {showValues ? value : "••••••••"}
            </span>
            <button
              onClick={() => removeEnvVar(i)}
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
    </div>
  );
}

export default SettingsView;
