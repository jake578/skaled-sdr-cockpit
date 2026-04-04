import { useEffect } from "react";

const GROUPS = [
  {
    label: "Navigation",
    shortcuts: [
      { keys: ["1"], desc: "Action Queue — Follow-ups" },
      { keys: ["2"], desc: "Action Queue — Calls" },
      { keys: ["3"], desc: "Action Queue — Outreach" },
      { keys: ["4"], desc: "Action Queue — Admin" },
    ],
  },
  {
    label: "Views",
    shortcuts: [
      { keys: ["P"], desc: "Pipeline Detail" },
      { keys: ["F"], desc: "Cash Flow" },
      { keys: ["B"], desc: "AI Brief" },
      { keys: ["W"], desc: "Weekly Digest" },
    ],
  },
  {
    label: "Actions",
    shortcuts: [
      { keys: ["N"], desc: "New Task" },
      { keys: ["C"], desc: "Claude Chat" },
      { keys: ["/"], desc: "Global Search" },
    ],
  },
  {
    label: "Quick Access",
    shortcuts: [
      { keys: ["?"], desc: "Show Shortcuts" },
      { keys: ["Esc"], desc: "Close Modal / Panel" },
    ],
  },
];

export default function KeyboardShortcuts({ onClose }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9" }}>Keyboard Shortcuts</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>Navigate faster with these shortcuts</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>x</button>
        </div>

        {/* Shortcut groups */}
        <div style={styles.body}>
          <div style={styles.grid}>
            {GROUPS.map(group => (
              <div key={group.label} style={styles.group}>
                <div style={styles.groupLabel}>{group.label}</div>
                {group.shortcuts.map(s => (
                  <div key={s.desc} style={styles.row}>
                    <div style={styles.keys}>
                      {s.keys.map(k => (
                        <kbd key={k} style={styles.kbd}>{k}</kbd>
                      ))}
                    </div>
                    <span style={styles.desc}>{s.desc}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          Press <kbd style={{ ...styles.kbd, margin: "0 4px" }}>?</kbd> anytime to toggle this overlay
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.7)", zIndex: 10000,
    display: "flex", alignItems: "center", justifyContent: "center",
    backdropFilter: "blur(4px)",
  },
  modal: {
    width: "100%", maxWidth: 520,
    background: "#0F172A",
    borderRadius: 12,
    border: "1px solid #334155",
    boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
    overflow: "hidden",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "20px 24px 16px",
    borderBottom: "1px solid #1E293B",
  },
  closeBtn: {
    background: "#1E293B", border: "1px solid #334155", borderRadius: 6,
    color: "#94A3B8", fontSize: 14, fontWeight: 700, cursor: "pointer",
    width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
  },
  body: {
    padding: "20px 24px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 24,
  },
  group: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  groupLabel: {
    fontSize: 11, fontWeight: 700, color: "#8B5CF6", textTransform: "uppercase",
    letterSpacing: "0.5px", marginBottom: 4,
  },
  row: {
    display: "flex", alignItems: "center", gap: 12,
  },
  keys: {
    display: "flex", gap: 4, minWidth: 40,
  },
  kbd: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: 26, height: 26, padding: "0 8px",
    borderRadius: 6, fontSize: 12, fontWeight: 700,
    background: "#1E293B", color: "#E2E8F0",
    border: "1px solid #334155",
    boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
    fontFamily: "monospace",
  },
  desc: {
    fontSize: 13, color: "#CBD5E1",
  },
  footer: {
    padding: "12px 24px",
    borderTop: "1px solid #1E293B",
    fontSize: 12, color: "#64748B", textAlign: "center",
  },
};
