import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import logo from "../assets/logo.png";

interface RuntimeInfo {
  name: string;
  version: string;
  api_version: string;
}

interface AppConfig {
  setup_completed: boolean;
  openclaw_image: string | null;
  openclaw_tag: string | null;
  file_mounts: { host_path: string; container_path: string; read_only: boolean; blocked: boolean }[];
  allowed_domains: { pattern: string; allowed: boolean }[];
  env_vars: [string, string][];
  resource_limits: { memory_mb: number | null; cpu_cores: number | null };
}

interface SetupWizardProps {
  onComplete: () => void;
}

type Step = "welcome" | "docker" | "apikey" | "done";

const STEPS: Step[] = ["welcome", "docker", "apikey", "done"];

function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [dockerError, setDockerError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  const next = () => {
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]);
  };

  const back = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  };

  const detectDocker = async () => {
    setDetecting(true);
    setDockerError(null);
    try {
      const info = await invoke<RuntimeInfo>("detect_runtime");
      setRuntime(info);
    } catch (e) {
      setDockerError(String(e));
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    if (step === "docker") detectDocker();
  }, [step]);

  const finish = async () => {
    setSaving(true);
    try {
      const config = await invoke<AppConfig>("get_config");
      if (apiKey.trim()) {
        const existing = config.env_vars.findIndex(([k]) => k === "ANTHROPIC_API_KEY");
        if (existing >= 0) {
          config.env_vars[existing] = ["ANTHROPIC_API_KEY", apiKey.trim()];
        } else {
          config.env_vars.push(["ANTHROPIC_API_KEY", apiKey.trim()]);
        }
      }
      config.setup_completed = true;
      await invoke("update_config", { config });
      onComplete();
    } catch (e) {
      console.error("Failed to save setup:", e);
    } finally {
      setSaving(false);
    }
  };

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: "var(--bg-primary)",
    padding: 32,
  };

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    padding: 40,
    maxWidth: 520,
    width: "100%",
    textAlign: "center",
  };

  const btnPrimary: React.CSSProperties = {
    padding: "10px 32px",
    background: "var(--accent)",
    color: "#fff",
    borderRadius: "var(--radius)",
    fontWeight: 600,
    fontSize: 14,
  };

  const btnSecondary: React.CSSProperties = {
    padding: "10px 24px",
    background: "var(--bg-secondary)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    fontSize: 14,
  };

  const progressDots = (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 32 }}>
      {STEPS.map((s, i) => (
        <div
          key={s}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: i <= stepIndex ? "var(--accent)" : "var(--border)",
            transition: "background 0.2s",
          }}
        />
      ))}
    </div>
  );

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {progressDots}

        {step === "welcome" && (
          <>
            <img
              src={logo}
              alt="CageClaw"
              style={{ width: 72, height: 72, marginBottom: 20 }}
            />
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
              Welcome to CageClaw
            </h1>
            <p style={{ color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.6 }}>
              Run AI coding agents safely in an isolated Docker container with
              full network control.
            </p>
            <p style={{ color: "var(--text-secondary)", marginBottom: 32, fontSize: 13 }}>
              This wizard will help you get set up in a minute.
            </p>
            <button onClick={next} style={btnPrimary}>
              Get Started
            </button>
          </>
        )}

        {step === "docker" && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>
              Docker Runtime
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: 24, fontSize: 13 }}>
              CageClaw needs Docker (or Podman) to run the isolated container.
            </p>

            {detecting && (
              <div style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
                Detecting...
              </div>
            )}

            {runtime && !detecting && (
              <div
                style={{
                  background: "rgba(34, 197, 94, 0.1)",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                  borderRadius: "var(--radius)",
                  padding: "12px 16px",
                  marginBottom: 24,
                }}
              >
                <span style={{ color: "var(--success)", fontWeight: 600 }}>
                  {runtime.name} {runtime.version}
                </span>
                <span style={{ color: "var(--text-secondary)", marginLeft: 8, fontSize: 12 }}>
                  detected
                </span>
              </div>
            )}

            {dockerError && !detecting && (
              <div
                style={{
                  background: "rgba(248, 113, 113, 0.1)",
                  border: "1px solid var(--danger)",
                  borderRadius: "var(--radius)",
                  padding: "12px 16px",
                  marginBottom: 16,
                  color: "var(--danger)",
                  fontSize: 13,
                  textAlign: "left",
                }}
              >
                {dockerError}
              </div>
            )}

            {dockerError && !detecting && (
              <p style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 24 }}>
                Please install and start Docker Desktop, then click Retry.
              </p>
            )}

            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={back} style={btnSecondary}>
                Back
              </button>
              {dockerError && (
                <button onClick={detectDocker} style={btnSecondary}>
                  Retry
                </button>
              )}
              <button
                onClick={next}
                disabled={!runtime}
                style={{
                  ...btnPrimary,
                  opacity: runtime ? 1 : 0.4,
                  cursor: runtime ? "pointer" : "not-allowed",
                }}
              >
                Next
              </button>
            </div>
          </>
        )}

        {step === "apikey" && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>
              API Key
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: 24, fontSize: 13 }}>
              Enter your Anthropic API key to enable the AI agent. You can also
              add it later in Settings.
            </p>

            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                color: "var(--text-primary)",
                fontFamily: "monospace",
                fontSize: 13,
                marginBottom: 24,
              }}
            />

            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={back} style={btnSecondary}>
                Back
              </button>
              <button onClick={next} style={btnPrimary}>
                {apiKey.trim() ? "Next" : "Skip"}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "rgba(34, 197, 94, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                fontSize: 28,
              }}
            >
              &#10003;
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>
              You're all set!
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: 8, fontSize: 13 }}>
              CageClaw is ready. Start the container from the Dashboard to begin.
            </p>
            <p style={{ color: "var(--text-secondary)", marginBottom: 32, fontSize: 12 }}>
              You can adjust domains, env vars, and mounts in Settings at any time.
            </p>

            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={back} style={btnSecondary}>
                Back
              </button>
              <button onClick={finish} disabled={saving} style={btnPrimary}>
                {saving ? "Saving..." : "Launch CageClaw"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SetupWizard;
