const PRIORITY_COLORS = { critical: "#EF4444", high: "#F59E0B", medium: "#3B82F6", low: "#64748B" };
const ACTION_TYPE_ICONS = {
  "follow-up": "\u21A9", call: "\uD83D\uDCDE", sequence: "\uD83D\uDCCB", linkedin: "\uD83D\uDCAC", admin: "\uD83D\uDCC1",
};
const CHANNEL_COLORS = { email: "#3B82F6", phone: "#8B5CF6", outreach: "#F59E0B", linkedin: "#06B6D4", salesforce: "#00A1E0" };

const styles = {
  card: {
    background: "#1E293B", borderRadius: 8, padding: "16px", marginBottom: 10,
    border: "1px solid #334155", cursor: "pointer", transition: "all .15s",
  },
  badge: (color) => ({
    display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
    background: color + "20", color: color,
  }),
  btn: (bg) => ({
    padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
    fontSize: 12, fontWeight: 600, background: bg, color: "#fff", transition: "all .15s",
  }),
  expandedPanel: {
    marginTop: 12, paddingTop: 12, borderTop: "1px solid #334155", animation: "fadeIn .2s",
  },
  suggestedAction: {
    background: "#0F172A", borderRadius: 6, padding: 12, fontSize: 13, color: "#CBD5E1",
    lineHeight: 1.5, marginBottom: 12,
  },
  suggestedLabel: {
    fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600, textTransform: "uppercase",
  },
};

export default function ActionCard({
  action, expanded, onToggle, onMarkDone, onSkip, onReopen,
  onCompose, onDelegate, onInspect, isLive, status,
  showCheckbox, checked, onCheck, copyText,
}) {
  const done = status === "done";
  const skipped = status === "skipped";
  const pending = status === "pending";

  return (
    <div
      className="card-hover"
      style={{
        ...styles.card,
        borderLeft: `3px solid ${PRIORITY_COLORS[action.priority] || "#64748B"}`,
        opacity: done || skipped ? 0.5 : 1,
      }}
      onClick={onToggle}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        {showCheckbox && (
          <input type="checkbox" style={{ accentColor: "#10B981", marginTop: 4, marginRight: 8 }}
            checked={checked}
            onClick={e => e.stopPropagation()}
            onChange={onCheck}
          />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>{ACTION_TYPE_ICONS[action.type] || "\u25B8"}</span>
            <span style={{ fontSize: 11, color: CHANNEL_COLORS[action.channel] || "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>{action.channel}</span>
            <span style={{ fontSize: 11, color: "#64748B" }}>{action.dueTime}</span>
            {done && <span style={styles.badge("#10B981")}>Done</span>}
            {skipped && <span style={styles.badge("#64748B")}>Skipped</span>}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: done ? "#64748B" : "#F1F5F9", textDecoration: done ? "line-through" : "none" }}>
            {action.title}
          </div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{action.subtitle}</div>
        </div>
        <span style={{ color: "#64748B", fontSize: 18, transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s" }}>{"\u25B8"}</span>
      </div>

      {expanded && (
        <div style={styles.expandedPanel} onClick={e => e.stopPropagation()}>
          <div style={styles.suggestedAction}>
            <div style={styles.suggestedLabel}>Suggested Action</div>
            {action.suggestedAction}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {pending && (
              <>
                <button style={styles.btn("#10B981")} onClick={onMarkDone}>Mark Done</button>
                <button style={styles.btn("#64748B")} onClick={onSkip}>Skip</button>
              </>
            )}
            {(done || skipped) && (
              <button style={styles.btn("#334155")} onClick={onReopen}>Reopen</button>
            )}
            <button style={styles.btn("#3B82F6")} onClick={() => onCompose && onCompose("manual")}>
              Send Email
            </button>
            <button style={{ ...styles.btn("#8B5CF6"), display: "flex", alignItems: "center", gap: 4 }}
              onClick={() => onCompose && onCompose("ai")}>
              AI Email
            </button>
            {onDelegate && (
              <button style={styles.btn("#F59E0B")} onClick={onDelegate}>
                Delegate
              </button>
            )}
            {action.id?.startsWith("opp-") && onInspect && (
              <button style={{ ...styles.btn("#06B6D4"), display: "flex", alignItems: "center", gap: 4 }}
                onClick={onInspect}>
                Inspect
              </button>
            )}
            <button style={styles.btn("#1E293B")} onClick={() => copyText && copyText(action.suggestedAction, "suggested action")}>
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
