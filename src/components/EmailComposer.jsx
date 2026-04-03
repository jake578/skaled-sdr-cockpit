import { useState, useEffect, useRef, useCallback } from "react";

const TONES = ["Professional", "Casual", "Urgent", "Breakup"];

const s = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.6)", zIndex: 2000,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  modal: {
    background: "#0F172A", borderRadius: 12, padding: 24, width: 700, maxWidth: "95vw",
    border: "1px solid #334155", boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
    maxHeight: "92vh", overflowY: "auto",
  },
  input: {
    width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 6,
    padding: "10px 12px", color: "#E2E8F0", fontSize: 13, marginBottom: 8, boxSizing: "border-box",
  },
  textarea: {
    width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 6,
    padding: "10px 12px", color: "#E2E8F0", fontSize: 13, minHeight: 180,
    resize: "vertical", marginBottom: 8, lineHeight: 1.6, boxSizing: "border-box",
    fontFamily: "inherit",
  },
  btn: (bg) => ({
    padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer",
    fontSize: 13, fontWeight: 600, background: bg, color: "#fff",
  }),
  contextBox: {
    background: "#1E293B", borderRadius: 8, padding: 14, marginBottom: 14,
    border: "1px solid #334155", maxHeight: 200, overflowY: "auto", fontSize: 12,
    color: "#94A3B8", lineHeight: 1.5,
  },
};

export default function EmailComposer({ action, mode: initialMode, onSend, onClose, sendEmail }) {
  const [mode, setMode] = useState(initialMode || "manual");
  const [tone, setTone] = useState("Professional");
  const [to, setTo] = useState(action?.contact || "");
  const [subject, setSubject] = useState(`Re: ${action?.subtitle || action?.title || ""}`);
  const [body, setBody] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [contextUsed, setContextUsed] = useState([]);
  const [error, setError] = useState(null);
  const [emailContext, setEmailContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const didAutoRun = useRef(false);

  // Fetch email/call context for preview
  const fetchContext = useCallback(async () => {
    setContextLoading(true);
    try {
      const contactName = action?.contact || "";
      const accountName = action?.subtitle?.split("·")[0]?.trim() || "";
      const searchTerms = [contactName, accountName].filter(t => t && t !== "—" && t.length > 2);
      if (searchTerms.length === 0) { setContextLoading(false); return; }

      const res = await fetch("/.netlify/functions/gmail-activities");
      const data = await res.json();
      if (data.activities?.length) {
        const relevant = data.activities.filter(a => {
          const text = `${a.contact} ${a.subject} ${a.company}`.toLowerCase();
          return searchTerms.some(t => text.includes(t.toLowerCase()));
        }).slice(0, 5);
        if (relevant.length) setEmailContext(relevant);
      }
    } catch { /* ignore */ }
    setContextLoading(false);
  }, [action]);

  const handleAiDraft = useCallback(async (overrideTone) => {
    setAiLoading(true);
    setError(null);
    try {
      const res = await fetch("/.netlify/functions/ai-email-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action || {},
          tone: (overrideTone || tone).toLowerCase(),
          to,
          subject,
          context: action?.suggestedAction || "",
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        if (data.body) setBody(data.body);
        if (data.subject) setSubject(data.subject);
        if (data.context_used) setContextUsed(data.context_used);
      }
    } catch (e) {
      setError(e.message || "Failed to generate draft");
    }
    setAiLoading(false);
  }, [action, tone, to, subject]);

  // Auto-draft when opened in AI mode
  useEffect(() => {
    if (initialMode === "ai" && !didAutoRun.current) {
      didAutoRun.current = true;
      handleAiDraft();
    }
    fetchContext();
  }, []);  // eslint-disable-line

  const [sendError, setSendError] = useState(null);

  const handleSend = async () => {
    if (!to.trim() || !body.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const ok = await sendEmail({ to, subject, body });
      if (ok) {
        if (onSend) onSend();
      } else {
        setSendError("Send failed — check the email address and try again");
      }
    } catch (e) {
      setSendError(e.message || "Send failed");
    }
    setSending(false);
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>
            {action?.title ? `Email: ${action.title}` : "Compose Email"}
          </div>
          <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20 }} onClick={onClose}>x</button>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "#1E293B", borderRadius: 8, padding: 4 }}>
          <button style={{ flex: 1, padding: "8px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: mode === "manual" ? "#10B981" : "transparent", color: mode === "manual" ? "#fff" : "#94A3B8" }}
            onClick={() => setMode("manual")}>Manual</button>
          <button style={{ flex: 1, padding: "8px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: mode === "ai" ? "#8B5CF6" : "transparent", color: mode === "ai" ? "#fff" : "#94A3B8" }}
            onClick={() => setMode("ai")}>AI Draft</button>
        </div>

        {/* Context preview — show what you're responding to */}
        {emailContext && emailContext.length > 0 && (
          <div style={s.contextBox}>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Recent interactions</div>
            {emailContext.map((e, i) => (
              <div key={i} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: i < emailContext.length - 1 ? "1px solid #334155" : "none" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 10, background: e.type === "email" ? "#3B82F620" : e.type === "call" ? "#8B5CF620" : "#F59E0B20", color: e.type === "email" ? "#3B82F6" : e.type === "call" ? "#8B5CF6" : "#F59E0B", padding: "1px 6px", borderRadius: 3 }}>{e.type}</span>
                  <span style={{ fontSize: 11, color: "#F1F5F9" }}>{e.subject}</span>
                  <span style={{ fontSize: 10, color: "#64748B", marginLeft: "auto" }}>{e.date} {e.time}</span>
                </div>
                <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{e.direction === "inbound" ? "From" : "To"}: {e.contact}</div>
              </div>
            ))}
          </div>
        )}
        {contextLoading && (
          <div style={{ ...s.contextBox, textAlign: "center", color: "#64748B" }}>Loading interaction history...</div>
        )}

        {/* Tone selector (AI mode) */}
        {mode === "ai" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#64748B" }}>Tone:</span>
            {TONES.map(t => (
              <button key={t} style={{
                padding: "5px 12px", borderRadius: 6, border: "1px solid #334155", cursor: "pointer",
                fontSize: 12, fontWeight: 500,
                background: tone === t ? "#8B5CF6" : "transparent", color: tone === t ? "#fff" : "#94A3B8",
              }} onClick={() => setTone(t)}>{t}</button>
            ))}
          </div>
        )}

        {/* Fields */}
        <input style={s.input} placeholder="To (email address)" value={to} onChange={e => setTo(e.target.value)} />
        <input style={s.input} placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />

        {/* AI draft button (manual trigger) */}
        {mode === "ai" && !aiLoading && (
          <button style={{ ...s.btn("#8B5CF6"), marginBottom: 10, width: "100%", padding: "10px" }} onClick={() => handleAiDraft()}>
            {body ? "Re-draft with AI" : "Draft with AI"}
          </button>
        )}

        {/* Loading state */}
        {aiLoading && (
          <div style={{ background: "#1E293B", borderRadius: 8, padding: 16, marginBottom: 10, textAlign: "center", border: "1px solid #8B5CF630" }}>
            <div style={{ fontSize: 14, color: "#8B5CF6", fontWeight: 600, marginBottom: 4 }}>Drafting with AI...</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>Pulling email history, call context, deal details</div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: "#7F1D1D", borderRadius: 6, padding: "8px 12px", marginBottom: 10, fontSize: 12, color: "#FCA5A5" }}>
            Error: {typeof error === "string" ? error : JSON.stringify(error)}
          </div>
        )}

        {/* Body */}
        {!aiLoading && (
          <textarea style={s.textarea} placeholder="Message body..." value={body} onChange={e => setBody(e.target.value)} />
        )}

        {/* Context sources */}
        {contextUsed.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#64748B" }}>AI used:</span>
            {contextUsed.map((src, i) => (
              <span key={i} style={{ fontSize: 10, background: "#334155", color: "#94A3B8", padding: "2px 8px", borderRadius: 4 }}>{src}</span>
            ))}
          </div>
        )}

        {/* Send error */}
        {sendError && (
          <div style={{ background: "#7F1D1D", borderRadius: 6, padding: "8px 12px", marginBottom: 10, fontSize: 12, color: "#FCA5A5" }}>
            {sendError}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={{ ...s.btn("#10B981"), opacity: sending || !body.trim() || !to.trim() ? 0.6 : 1 }}
            disabled={sending || !body.trim() || !to.trim()}
            onClick={handleSend}
          >
            {sending ? "Sending..." : "Send Email"}
          </button>
          <button style={s.btn("#334155")} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
