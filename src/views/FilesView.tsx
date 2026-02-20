import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface FileMount {
  host_path: string;
  container_path: string;
  read_only: boolean;
  blocked: boolean;
}

interface AppConfig {
  openclaw_image: string | null;
  openclaw_tag: string | null;
  file_mounts: FileMount[];
  allowed_domains: { pattern: string; allowed: boolean }[];
  env_vars: [string, string][];
  resource_limits: { memory_mb: number | null; cpu_cores: number | null };
}

const DENIED_PATHS = [
  ".ssh", ".aws", ".azure", ".gcp", ".config/gcloud", ".env", ".npmrc",
  ".pypirc", ".docker/config.json", ".kube",
  "AppData/Local/Google/Chrome", "AppData/Local/Microsoft/Edge",
  "AppData/Roaming/Mozilla/Firefox", "AppData/Local/BraveSoftware",
  "AppData/Roaming/1Password", "AppData/Local/1Password",
  ".gnupg", ".pgpass", "ntuser.dat", ".credentials", ".netrc",
];

function isPathDenied(path: string): string | null {
  const normalised = path.replace(/\\/g, "/").toLowerCase();
  const match = DENIED_PATHS.find((d) => normalised.includes(d.toLowerCase()));
  return match ? match : null;
}

function FilesView() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [newPath, setNewPath] = useState("");
  const [newContainerPath, setNewContainerPath] = useState("/workspace");
  const [readOnly, setReadOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const addMount = async () => {
    if (!config || !newPath) return;
    setError(null);

    const denied = isPathDenied(newPath);
    if (denied) {
      setError(`Blocked: path contains '${denied}' which is on the sensitive path deny list.`);
      return;
    }

    const updated: AppConfig = {
      ...config,
      file_mounts: [
        ...config.file_mounts,
        {
          host_path: newPath,
          container_path: newContainerPath,
          read_only: readOnly,
          blocked: false,
        },
      ],
    };

    try {
      await invoke("update_config", { config: updated });
      setConfig(updated);
      setNewPath("");
      setNewContainerPath("/workspace");
    } catch (e) {
      setError(String(e));
    }
  };

  const removeMount = async (index: number) => {
    if (!config) return;
    const updated: AppConfig = {
      ...config,
      file_mounts: config.file_mounts.filter((_, i) => i !== index),
    };
    try {
      await invoke("update_config", { config: updated });
      setConfig(updated);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>
        File Mounts
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
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          background: "var(--bg-card)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          padding: 20,
          marginBottom: 20,
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 12,
            color: "var(--text-secondary)",
          }}
        >
          Add Folder Mount
        </h3>
        <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
          <div style={{ flex: 1 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 4,
              }}
            >
              Host Path
            </label>
            <input
              type="text"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="C:\Projects\my-project"
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div style={{ width: 200 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 4,
              }}
            >
              Container Path
            </label>
            <input
              type="text"
              value={newContainerPath}
              onChange={(e) => setNewContainerPath(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: "var(--text-secondary)",
              whiteSpace: "nowrap",
              paddingBottom: 4,
            }}
          >
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
            />
            Read-only
          </label>
          <button
            onClick={addMount}
            style={{
              padding: "8px 20px",
              background: "var(--accent)",
              color: "#fff",
              borderRadius: "var(--radius)",
              fontWeight: 600,
            }}
          >
            Add
          </button>
        </div>
      </div>

      <div
        style={{
          background: "var(--bg-card)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr
              style={{
                background: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                textAlign: "left",
              }}
            >
              <th style={{ padding: "10px 12px" }}>Host Path</th>
              <th style={{ padding: "10px 12px" }}>Container Path</th>
              <th style={{ padding: "10px 12px" }}>Access</th>
              <th style={{ padding: "10px 12px", width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {(!config || config.file_mounts.length === 0) ? (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    padding: 40,
                    textAlign: "center",
                    color: "var(--text-secondary)",
                  }}
                >
                  No folders mounted. Add a folder above to give OpenClaw
                  access to your files.
                </td>
              </tr>
            ) : (
              config.file_mounts.map((mount, i) => (
                <tr
                  key={i}
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <td
                    style={{
                      padding: "8px 12px",
                      fontFamily: "monospace",
                      fontSize: 12,
                    }}
                  >
                    {mount.host_path}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontFamily: "monospace",
                      fontSize: 12,
                    }}
                  >
                    {mount.container_path}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: mount.read_only
                          ? "rgba(79, 143, 247, 0.15)"
                          : "rgba(251, 191, 36, 0.15)",
                        color: mount.read_only
                          ? "var(--accent)"
                          : "var(--warning)",
                      }}
                    >
                      {mount.read_only ? "READ" : "READ/WRITE"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    <button
                      onClick={() => removeMount(i)}
                      style={{
                        padding: "4px 10px",
                        background: "rgba(248, 113, 113, 0.1)",
                        color: "var(--danger)",
                        borderRadius: "var(--radius)",
                        fontSize: 12,
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default FilesView;
