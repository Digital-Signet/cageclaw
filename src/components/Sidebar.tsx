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

function Sidebar({ activeView, onNavigate }: SidebarProps) {
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
          padding: "12px 16px",
          fontSize: 12,
          color: "var(--text-secondary)",
        }}
      >
        CageClaw v0.1.0
      </div>
    </nav>
  );
}

export default Sidebar;
