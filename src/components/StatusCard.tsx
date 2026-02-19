interface StatusCardProps {
  label: string;
  value: string;
  color?: string;
}

function StatusCard({ label, value, color }: StatusCardProps) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border)",
        padding: "16px 20px",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: color ?? "var(--text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default StatusCard;
