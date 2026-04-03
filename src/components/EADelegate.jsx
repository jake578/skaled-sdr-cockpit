import { useState } from "react";

const styles = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.6)", zIndex: 2000,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  modal: {
    background: "#0F172A", borderRadius: 12, padding: 24, width: 480, maxWidth: "90vw",
    border: "1px solid #334155", boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20,
  },
  title: { fontSize: 16, fontWeight: 700, color: "#F1F5F9" },
  subtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  closeBtn: {
    background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20,
  },
  label: {
    fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.5px",
  },
  field: { marginBottom: 14 },
  input: {
    width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 6,
    padding: "10px 12px", color: "#E2E8F0", fontSize: 13, boxSizing: "border-box",
  },
  textarea: {
    width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 6,
    padding: "10px 12px", color: "#E2E8F0", fontSize: 13, minHeight: 80,
    resize: "vertical", boxSizing: "border-box",
  },
  select: {
    width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 6,
    padding: "10px 12px", color: "#E2E8F0", fontSize: 13, boxSizing: "border-box",
  },
  priorityWrap: { display: "flex", gap: 6 },
  priorityBtn: (active, color) => ({
    flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid #334155",
    cursor: "pointer", fontSize: 12, fontWeight: 600, textAlign: "center",
    background: active ? color : "transparent",
    color: active ? "#fff" : "#94A3B8",
    transition: "all .15s",
  }),
  actionDetail: {
    background: "#1E293B", borderRadius: 8, padding: "12px 14px", marginBottom: 16,
    border: "1px solid #334155",
  },
  actions: { display: "flex", gap: 8, marginTop: 8 },
  btn: (bg) => ({
    padding: "10px 20px", borderRadius: 6, border: "none", cursor: "pointer",
    fontSize: 13, fontWeight: 600, background: bg, color: "#fff", transition: "all .15s",
  }),
  success: {
    textAlign: "center", padding: "32px 20px",
  },
  successIcon: {
    width: 56, height: 56, borderRadius: 14,
    background: "linear-gradient(135deg, #10B981, #059669)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 28, color: "#fff", margin: "0 auto 16px",
  },
};

const PRIORITIES = [
  { key: "urgent", label: "Urgent", color: "#EF4444" },
  { key: "high", label: "High", color: "#F59E0B" },
  { key: "normal", label: "Normal", color: "#3B82F6" },
];

export default function EADelegate({ action, onClose, onDelegated }) {
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await fetch("/.netlify/functions/ea-delegate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionTitle: action?.title || "",
          actionDetails: action?.suggestedAction || action?.subtitle || "",
          priority,
          dueDate,
          notes,
          actionId: action?.id,
        }),
      });
      const data = await res.json();
      if (data.success !== false) {
        setSent(true);
        if (onDelegated) onDelegated(action);
      }
    } catch {
      // silent fail
    }
    setSending(false);
  };

  if (sent) {
    return (
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.modal} onClick={e => e.stopPropagation()}>
          <div style={styles.success}>
            <div style={styles.successIcon}>&#x2713;</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9", marginBottom: 4 }}>
              Delegated to Wendy
            </div>
            <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 20 }}>
              {action?.title}
            </div>
            <button style={styles.btn("#10B981")} onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>Delegate to EA</div>
            <div style={styles.subtitle}>Send to Wendy for handling</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>x</button>
        </div>

        {/* Action preview */}
        <div style={styles.actionDetail}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9", marginBottom: 4 }}>
            {action?.title}
          </div>
          <div style={{ fontSize: 12, color: "#94A3B8" }}>
            {action?.subtitle || action?.suggestedAction}
          </div>
        </div>

        {/* Priority */}
        <div style={styles.field}>
          <div style={styles.label}>Priority</div>
          <div style={styles.priorityWrap}>
            {PRIORITIES.map(p => (
              <button
                key={p.key}
                style={styles.priorityBtn(priority === p.key, p.color)}
                onClick={() => setPriority(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Due date */}
        <div style={styles.field}>
          <div style={styles.label}>Due Date</div>
          <input
            type="date"
            style={styles.input}
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
          />
        </div>

        {/* Notes */}
        <div style={styles.field}>
          <div style={styles.label}>Additional Notes</div>
          <textarea
            style={styles.textarea}
            placeholder="Any extra context for Wendy..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button
            style={{ ...styles.btn("#10B981"), opacity: sending ? 0.6 : 1 }}
            disabled={sending}
            onClick={handleSend}
          >
            {sending ? "Sending..." : "Send to Wendy"}
          </button>
          <button style={styles.btn("#334155")} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
