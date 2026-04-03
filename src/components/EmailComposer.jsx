import { useState } from "react";

const TONES = ["Professional", "Casual", "Urgent", "Breakup"];

const styles = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.6)", zIndex: 2000,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  modal: {
    background: "#0F172A", borderRadius: 12, padding: 24, width: 560, maxWidth: "90vw",
    border: "1px solid #334155", boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
    maxHeight: "90vh", overflowY: "auto",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16,
  },
  title: { fontSize: 16, fontWeight: 700, color: "#F1F5F9" },
  closeBtn: {
    background: "none", border: "none", color: "#64748B", cursor: "pointer",
    fontSize: 20, padding: 4,
  },
  modeToggle: {
    display: "flex", gap: 4, marginBottom: 16, background: "#1E293B",
    borderRadius: 8, padding: 4,
  },
  modeBtn: (active) => ({
    flex: 1, padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer",
    fontSize: 13, fontWeight: 600,
    background: active ? "#10B981" : "transparent",
    color: active ? "#fff" : "#94A3B8",
    transition: "all .15s",
  }),
  input: {
    width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 6,
    padding: "10px 12px", color: "#E2E8F0", fontSize: 13, marginBottom: 8,
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 6,
    padding: "10px 12px", color: "#E2E8F0", fontSize: 13, minHeight: 160,
    resize: "vertical", marginBottom: 8, lineHeight: 1.5, boxSizing: "border-box",
  },
  toneWrap: {
    display: "flex", gap: 6, marginBottom: 12, alignItems: "center",
  },
  toneLabel: { fontSize: 12, color: "#64748B", marginRight: 4 },
  toneBtn: (active) => ({
    padding: "5px 12px", borderRadius: 6, border: "1px solid #334155", cursor: "pointer",
    fontSize: 11, fontWeight: 600,
    background: active ? "#8B5CF6" : "transparent",
    color: active ? "#fff" : "#94A3B8",
    transition: "all .15s",
  }),
  actions: { display: "flex", gap: 8, marginTop: 4 },
  btn: (bg) => ({
    padding: "8px 18px", borderRadius: 6, border: "none", cursor: "pointer",
    fontSize: 13, fontWeight: 600, background: bg, color: "#fff", transition: "all .15s",
  }),
  aiDraftBtn: {
    padding: "8px 18px", borderRadius: 6, border: "1px solid #8B5CF6", cursor: "pointer",
    fontSize: 13, fontWeight: 600, background: "transparent", color: "#8B5CF6",
    transition: "all .15s", display: "flex", alignItems: "center", gap: 6,
  },
  loadingBar: {
    background: "#1E293B", borderRadius: 8, padding: 20, textAlign: "center",
    marginBottom: 8, border: "1px solid #334155",
  },
};

export default function EmailComposer({ action, onSend, onClose, sendEmail }) {
  const [mode, setMode] = useState("manual");
  const [tone, setTone] = useState("Professional");
  const [to, setTo] = useState(action?.contact || "");
  const [subject, setSubject] = useState(`Re: ${action?.subtitle || action?.title || ""}`);
  const [body, setBody] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const handleAiDraft = async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/.netlify/functions/ai-email-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          tone: tone.toLowerCase(),
          to,
          subject,
          context: action?.suggestedAction || "",
        }),
      });
      const data = await res.json();
      if (data.body) setBody(data.body);
      if (data.subject) setSubject(data.subject);
    } catch {
      setBody("[AI draft failed - please write manually]");
    }
    setAiLoading(false);
  };

  const handleSend = async () => {
    setSending(true);
    const ok = await sendEmail({ to, subject, body });
    setSending(false);
    if (ok && onSend) onSend();
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.title}>Compose Email</div>
          <button style={styles.closeBtn} onClick={onClose}>x</button>
        </div>

        {/* Mode toggle */}
        <div style={styles.modeToggle}>
          <button style={styles.modeBtn(mode === "manual")} onClick={() => setMode("manual")}>Manual</button>
          <button style={styles.modeBtn(mode === "ai")} onClick={() => setMode("ai")}>AI Assisted</button>
        </div>

        {/* Tone selector (AI mode) */}
        {mode === "ai" && (
          <div style={styles.toneWrap}>
            <span style={styles.toneLabel}>Tone:</span>
            {TONES.map(t => (
              <button key={t} style={styles.toneBtn(tone === t)} onClick={() => setTone(t)}>{t}</button>
            ))}
          </div>
        )}

        {/* Fields */}
        <input
          style={styles.input}
          placeholder="To (email address)"
          value={to}
          onChange={e => setTo(e.target.value)}
        />
        <input
          style={styles.input}
          placeholder="Subject"
          value={subject}
          onChange={e => setSubject(e.target.value)}
        />

        {/* AI draft button */}
        {mode === "ai" && !aiLoading && (
          <button style={styles.aiDraftBtn} onClick={handleAiDraft}>
            <span style={{ fontSize: 14 }}>&#x2728;</span> Draft with AI
          </button>
        )}

        {/* Loading state */}
        {aiLoading && (
          <div style={styles.loadingBar}>
            <div style={{ fontSize: 13, color: "#8B5CF6", fontWeight: 600, marginBottom: 4 }}>
              Drafting with AI...
            </div>
            <div style={{ fontSize: 11, color: "#64748B" }}>
              Tone: {tone} | Analyzing context...
            </div>
          </div>
        )}

        {/* Body */}
        {!aiLoading && (
          <textarea
            style={styles.textarea}
            placeholder="Message body..."
            value={body}
            onChange={e => setBody(e.target.value)}
          />
        )}

        {/* Action buttons */}
        <div style={styles.actions}>
          <button
            style={{ ...styles.btn("#10B981"), opacity: sending || !body.trim() ? 0.6 : 1 }}
            disabled={sending || !body.trim()}
            onClick={handleSend}
          >
            {sending ? "Sending..." : "Send"}
          </button>
          <button style={styles.btn("#334155")} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
