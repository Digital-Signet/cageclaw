import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface BlockedToastProps {
  onNavigate: (view: string) => void;
}

interface ToastItem {
  host: string;
  id: number;
}

let nextId = 0;

function BlockedToast({ onNavigate }: BlockedToastProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const sinceRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    const poll = async () => {
      try {
        const hosts = await invoke<string[]>("get_recent_blocked", {
          since: sinceRef.current,
        });
        const newHosts = hosts.filter((h) => !seenRef.current.has(h));
        if (newHosts.length > 0) {
          const items = newHosts.map((host) => ({ host, id: nextId++ }));
          setToasts((prev) => [...items, ...prev].slice(0, 5));
          newHosts.forEach((h) => seenRef.current.add(h));
        }
        sinceRef.current = new Date().toISOString();
      } catch {
        // ignore
      }
    };
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, []);

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const allowDomain = async (host: string, id: number) => {
    try {
      const config = await invoke<any>("get_config");
      config.allowed_domains.push({ pattern: host, allowed: true });
      await invoke("update_config", { config });
      window.dispatchEvent(new CustomEvent("domain-allowed", { detail: host }));
      dismiss(id);
    } catch (e) {
      console.error("Failed to allow domain:", e);
    }
  };

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 380,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            background: "var(--bg-card)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            borderRadius: "var(--radius-lg)",
            padding: "12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
            animation: "slideIn 0.2s ease-out",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                display: "inline-block",
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                background: "rgba(239, 68, 68, 0.15)",
                color: "var(--blocked)",
              }}
            >
              Blocked
            </span>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 13,
                color: "var(--text-primary)",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {toast.host}
            </span>
            <button
              onClick={() => dismiss(toast.id)}
              style={{
                background: "none",
                color: "var(--text-secondary)",
                fontSize: 16,
                padding: 0,
                lineHeight: 1,
              }}
            >
              x
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => allowDomain(toast.host, toast.id)}
              style={{
                flex: 1,
                padding: "6px 12px",
                background: "var(--accent)",
                color: "#fff",
                borderRadius: "var(--radius)",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Allow
            </button>
            <button
              onClick={() => {
                dismiss(toast.id);
                onNavigate("network");
              }}
              style={{
                padding: "6px 12px",
                background: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                fontSize: 12,
              }}
            >
              View
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default BlockedToast;
