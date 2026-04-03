import { useState, useEffect, useRef } from "react";

const styles = {
  panel: {
    position: "fixed", top: 0, right: 0, width: 400, height: "100vh",
    background: "#0F172A", borderLeft: "1px solid #1E293B",
    display: "flex", flexDirection: "column", zIndex: 1000,
    boxShadow: "-4px 0 20px rgba(0,0,0,0.4)",
  },
  header: {
    padding: "14px 16px", borderBottom: "1px solid #1E293B",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 8 },
  avatar: {
    width: 28, height: 28, borderRadius: 6,
    background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 14, color: "#fff",
  },
  titleText: { fontSize: 14, fontWeight: 700, color: "#F1F5F9" },
  subtitleText: { fontSize: 10, color: "#64748B" },
  closeBtn: {
    background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 18,
  },
  prompts: {
    padding: "8px 12px", borderBottom: "1px solid #1E293B",
    display: "flex", gap: 4, flexWrap: "wrap",
  },
  promptBtn: {
    padding: "4px 10px", borderRadius: 12, border: "1px solid #334155",
    background: "transparent", color: "#94A3B8", fontSize: 11, cursor: "pointer",
  },
  messages: {
    flex: 1, overflowY: "auto", padding: 12,
    display: "flex", flexDirection: "column", gap: 10,
  },
  emptyState: {
    textAlign: "center", color: "#475569", fontSize: 13, marginTop: 40,
  },
  userMsg: {
    alignSelf: "flex-end", maxWidth: "85%",
    background: "#1E40AF", borderRadius: 10, padding: "10px 14px",
    fontSize: 13, color: "#E2E8F0", lineHeight: 1.5,
  },
  assistantMsg: {
    alignSelf: "flex-start", maxWidth: "85%",
    background: "#1E293B", borderRadius: 10, padding: "10px 14px",
    fontSize: 13, color: "#E2E8F0", lineHeight: 1.5,
  },
  loadingMsg: {
    alignSelf: "flex-start", background: "#1E293B", borderRadius: 10,
    padding: "10px 14px", fontSize: 13, color: "#8B5CF6",
    display: "flex", alignItems: "center", gap: 8,
  },
  inputWrap: {
    padding: 12, borderTop: "1px solid #1E293B", display: "flex", gap: 8,
  },
  input: {
    flex: 1, background: "#1E293B", border: "1px solid #334155", borderRadius: 8,
    padding: "10px 14px", color: "#E2E8F0", fontSize: 13,
  },
  sendBtn: (disabled) => ({
    padding: "10px 16px", borderRadius: 6, border: "none", cursor: disabled ? "default" : "pointer",
    fontSize: 12, fontWeight: 600, background: "#8B5CF6", color: "#fff",
    opacity: disabled ? 0.6 : 1, transition: "all .15s",
  }),
};

// Simple markdown-like rendering: **bold**, *italic*, - lists
function renderContent(text) {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, i) => {
    // List items
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      const content = line.trim().slice(2);
      return (
        <div key={i} style={{ display: "flex", gap: 6, marginLeft: 4, marginBottom: 2 }}>
          <span style={{ color: "#10B981", flexShrink: 0 }}>&#x2022;</span>
          <span>{formatInline(content)}</span>
        </div>
      );
    }
    // Numbered list
    const numMatch = line.trim().match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      return (
        <div key={i} style={{ display: "flex", gap: 6, marginLeft: 4, marginBottom: 2 }}>
          <span style={{ color: "#10B981", fontWeight: 600, flexShrink: 0 }}>{numMatch[1]}.</span>
          <span>{formatInline(numMatch[2])}</span>
        </div>
      );
    }
    // Regular text
    if (line.trim() === "") return <div key={i} style={{ height: 8 }} />;
    return <div key={i}>{formatInline(line)}</div>;
  });
}

function formatInline(text) {
  // Bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "#F1F5F9", fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

const VIEW_PROMPTS = {
  actions: [
    "Summarize my action queue",
    "What should I prioritize today?",
    "Draft a check-in email",
    "Any deals at risk?",
  ],
  outreach: [
    "Which sequences are underperforming?",
    "Suggest A/B test ideas",
    "What's my best performing channel?",
    "Draft a new sequence step",
  ],
  pipeline: [
    "Summarize my pipeline",
    "What needs follow-up?",
    "Which opps are stalled?",
    "What's on my calendar?",
  ],
};

export default function ClaudeSidebar({ open, onClose, view }) {
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const currentPrompts = VIEW_PROMPTS[view] || VIEW_PROMPTS.actions;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs, chatLoading]);

  const sendMessage = (msg) => {
    if (!msg.trim() || chatLoading) return;
    setChatInput("");
    const newMsgs = [...chatMsgs, { role: "user", content: msg.trim() }];
    setChatMsgs(newMsgs);
    setChatLoading(true);
    fetch("/.netlify/functions/claude-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg.trim(), history: chatMsgs }),
    })
      .then(r => r.json())
      .then(data => {
        setChatMsgs(prev => [...prev, { role: "assistant", content: data.reply || data.error || "Error" }]);
        setChatLoading(false);
      })
      .catch(() => {
        setChatMsgs(prev => [...prev, { role: "assistant", content: "Failed to reach Claude" }]);
        setChatLoading(false);
      });
  };

  if (!open) return null;

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.avatar}>C</div>
          <div>
            <div style={styles.titleText}>Claude</div>
            <div style={styles.subtitleText}>Has access to SFDC, Gmail, Calendar</div>
          </div>
        </div>
        <button style={styles.closeBtn} onClick={onClose}>x</button>
      </div>

      {/* Suggested prompts */}
      <div style={styles.prompts}>
        {currentPrompts.map(q => (
          <button key={q} style={styles.promptBtn} onClick={() => sendMessage(q)}>{q}</button>
        ))}
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {chatMsgs.length === 0 && (
          <div style={styles.emptyState}>
            Ask me about your pipeline, emails, calendar, or anything else.
          </div>
        )}
        {chatMsgs.map((m, i) => (
          <div key={i} style={m.role === "user" ? styles.userMsg : styles.assistantMsg}>
            {m.role === "user" ? m.content : renderContent(m.content)}
          </div>
        ))}
        {chatLoading && (
          <div style={styles.loadingMsg}>
            <span style={{
              display: "inline-block", width: 8, height: 8, borderRadius: "50%",
              background: "#8B5CF6", animation: "fadeIn 0.8s infinite alternate",
            }} />
            Analyzing{view === "pipeline" ? " your pipeline" : view === "outreach" ? " your outreach data" : ""}...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={styles.inputWrap}>
        <input
          style={styles.input}
          placeholder="Ask Claude..."
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && chatInput.trim() && !chatLoading) {
              sendMessage(chatInput);
            }
          }}
        />
        <button
          style={styles.sendBtn(chatLoading || !chatInput.trim())}
          disabled={chatLoading || !chatInput.trim()}
          onClick={() => sendMessage(chatInput)}
        >Send</button>
      </div>
    </div>
  );
}
