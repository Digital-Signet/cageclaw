import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface NetworkEvent {
  id: number;
  timestamp: string;
  direction: string;
  method: string;
  url: string;
  host: string;
  status_code: number | null;
  action: string;
  bytes_sent: number | null;
  bytes_received: number | null;
}

function NetworkView() {
  const [events, setEvents] = useState<NetworkEvent[]>([]);
  const [filter, setFilter] = useState<"all" | "allowed" | "blocked">("all");

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchEvents = async () => {
    try {
      const data = await invoke<NetworkEvent[]>("get_network_events", {
        limit: 200,
        offset: 0,
      });
      setEvents(data);
    } catch {
      // DB may not have events yet
    }
  };

  const filtered =
    filter === "all" ? events : events.filter((e) => e.action === filter);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Network Activity</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {(["all", "allowed", "blocked"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 14px",
                borderRadius: "var(--radius)",
                background:
                  filter === f ? "var(--accent)" : "var(--bg-card)",
                color:
                  filter === f ? "#fff" : "var(--text-secondary)",
                border: "1px solid var(--border)",
                fontSize: 13,
                textTransform: "capitalize",
              }}
            >
              {f}
            </button>
          ))}
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
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr
              style={{
                background: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                textAlign: "left",
              }}
            >
              <th style={{ padding: "10px 12px" }}>Time</th>
              <th style={{ padding: "10px 12px" }}>Action</th>
              <th style={{ padding: "10px 12px" }}>Method</th>
              <th style={{ padding: "10px 12px" }}>Host</th>
              <th style={{ padding: "10px 12px" }}>URL</th>
              <th style={{ padding: "10px 12px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: 40,
                    textAlign: "center",
                    color: "var(--text-secondary)",
                  }}
                >
                  No network events yet. Start the container to begin
                  monitoring.
                </td>
              </tr>
            ) : (
              filtered.map((event) => (
                <tr
                  key={event.id}
                  style={{
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <td
                    style={{
                      padding: "8px 12px",
                      color: "var(--text-secondary)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        background:
                          event.action === "allowed"
                            ? "rgba(34, 197, 94, 0.15)"
                            : "rgba(239, 68, 68, 0.15)",
                        color:
                          event.action === "allowed"
                            ? "var(--allowed)"
                            : "var(--blocked)",
                      }}
                    >
                      {event.action}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontFamily: "monospace",
                    }}
                  >
                    {event.method}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontFamily: "monospace",
                    }}
                  >
                    {event.host}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      maxWidth: 300,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontFamily: "monospace",
                      fontSize: 12,
                    }}
                  >
                    {event.url}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontFamily: "monospace",
                    }}
                  >
                    {event.status_code ?? "--"}
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

export default NetworkView;
