import { useState, useEffect, useRef } from "react";

const MODES = {
  general: {
    key: "general",
    label: "General",
    icon: "\u2728",
    accent: "#8B5CF6",
    subtitle: "CEO Assistant — SFDC, Gmail, Calendar",
    prompts: [
      "Summarize pipeline",
      "What needs follow-up?",
      "Draft email",
    ],
  },
  deal_navigator: {
    key: "deal_navigator",
    label: "Deal Navigator",
    icon: "\uD83C\uDFAF",
    accent: "#F59E0B",
    subtitle: "Decode deal politics and stakeholder dynamics",
    prompts: [
      "Map stakeholders on [deal]",
      "Who\u2019s the real decision maker?",
      "What\u2019s the political risk?",
    ],
  },
  sales_coach: {
    key: "sales_coach",
    label: "Sales Coach",
    icon: "\uD83E\uDD4A",
    accent: "#EF4444",
    subtitle: "Push back, ask hard questions, find blind spots",
    prompts: [
      "This deal is stuck, help me think through it",
      "Am I multi-threaded enough?",
      "Is my champion strong enough?",
    ],
  },
  account_strategist: {
    key: "account_strategist",
    label: "Account Strategy",
    icon: "\uD83D\uDDFA\uFE0F",
    accent: "#10B981",
    subtitle: "Stakeholder maps, risk analysis, action plans",
    prompts: [
      "Build a 3-month plan for [account]",
      "What expansion opportunities exist?",
      "What\u2019s the renewal risk?",
    ],
  },
};

const MODE_KEYS = Object.keys(MODES);

// Simple markdown-like rendering: **bold**, *italic*, - lists
function renderContent(text) {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      const content = line.trim().slice(2);
      return (
        <div key={i} style={{ display: "flex", gap: 6, marginLeft: 4, marginBottom: 2 }}>
          <span style={{ color: "#10B981", flexShrink: 0 }}>{"\u2022"}</span>
          <span>{formatInline(content)}</span>
        </div>
      );
    }
    const numMatch = line.trim().match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      return (
        <div key={i} style={{ display: "flex", gap: 6, marginLeft: 4, marginBottom: 2 }}>
          <span style={{ color: "#10B981", fontWeight: 600, flexShrink: 0 }}>{numMatch[1]}.</span>
          <span>{formatInline(numMatch[2])}</span>
        </div>
      );
    }
    if (line.trim() === "") return <div key={i} style={{ height: 8 }} />;
    return <div key={i}>{formatInline(line)}</div>;
  });
}

function formatInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "#F1F5F9", fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export default function EnhancedChat({ open, onClose, initialMessage, initialMode }) {
  const [mode, setMode] = useState(initialMode || "general");
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const initialSent = useRef(false);

  const currentMode = MODES[mode] || MODES.general;

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs, chatLoading]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Handle initialMessage
  useEffect(() => {
    if (open && initialMessage && !initialSent.current) {
      initialSent.current = true;
      sendMessage(initialMessage);
    }
    if (!open) {
      initialSent.current = false;
    }
  }, [open, initialMessage]);

  // Update mode if initialMode changes
  useEffect(() => {
    if (initialMode && MODES[initialMode]) {
      setMode(initialMode);
    }
  }, [initialMode]);

  const switchMode = (newMode) => {
    setMode(newMode);
    setChatMsgs([]);
    setChatLoading(false);
  };

  const sendMessage = (msg) => {
    if (!msg.trim() || chatLoading) return;
    setChatInput("");
    const newMsgs = [...chatMsgs, { role: "user", content: msg.trim() }];
    setChatMsgs(newMsgs);
    setChatLoading(true);
    fetch("/.netlify/functions/claude-enhanced", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: msg.trim(),
        history: chatMsgs,
        mode,
      }),
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
    <div style={s.panel}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={{ ...s.avatar, background: `linear-gradient(135deg, ${currentMode.accent}, ${currentMode.accent}cc)` }}>
            {currentMode.icon}
          </div>
          <div>
            <div style={s.titleText}>Claude — {currentMode.label}</div>
            <div style={s.subtitleText}>{currentMode.subtitle}</div>
          </div>
        </div>
        <button style={s.closeBtn} onClick={onClose}>{"\u2715"}</button>
      </div>

      {/* Mode selector */}
      <div style={s.modeBar}>
        {MODE_KEYS.map(k => {
          const m = MODES[k];
          const active = k === mode;
          return (
            <button
              key={k}
              onClick={() => switchMode(k)}
              style={{
                ...s.modeBtn,
                background: active ? m.accent + "22" : "transparent",
                borderColor: active ? m.accent : "#334155",
                color: active ? m.accent : "#64748B",
              }}
            >
              <span style={{ fontSize: 12 }}>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Quick prompts */}
      <div style={s.prompts}>
        {currentMode.prompts.map(q => (
          <button
            key={q}
            style={{ ...s.promptBtn, borderColor: currentMode.accent + "44", color: currentMode.accent + "cc" }}
            onClick={() => sendMessage(q)}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={s.messages}>
        {chatMsgs.length === 0 && (
          <div style={s.emptyState}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{currentMode.icon}</div>
            <div style={{ fontWeight: 600, color: "#94A3B8", marginBottom: 4 }}>{currentMode.label} Mode</div>
            <div>{currentMode.subtitle}</div>
          </div>
        )}
        {chatMsgs.map((m, i) => (
          <div
            key={i}
            style={m.role === "user"
              ? { ...s.userMsg, background: currentMode.accent + "33" }
              : s.assistantMsg
            }
          >
            {m.role === "user" ? m.content : renderContent(m.content)}
          </div>
        ))}
        {chatLoading && (
          <div style={s.loadingMsg}>
            <span style={s.dot(currentMode.accent)} />
            <span style={{ ...s.dot(currentMode.accent), animationDelay: "0.2s" }} />
            <span style={{ ...s.dot(currentMode.accent), animationDelay: "0.4s" }} />
            <span style={{ marginLeft: 4 }}>Thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={s.inputWrap}>
        <input
          ref={inputRef}
          style={{ ...s.input, borderColor: chatInput ? currentMode.accent + "66" : "#334155" }}
          placeholder={`Ask ${currentMode.label}...`}
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && chatInput.trim() && !chatLoading) {
              sendMessage(chatInput);
            }
          }}
        />
        <button
          style={{
            ...s.sendBtn,
            background: currentMode.accent,
            opacity: chatLoading || !chatInput.trim() ? 0.5 : 1,
            cursor: chatLoading || !chatInput.trim() ? "default" : "pointer",
          }}
          disabled={chatLoading || !chatInput.trim()}
          onClick={() => sendMessage(chatInput)}
        >
          Send
        </button>
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes ecPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

const s = {
  panel: {
    position: "fixed", top: 0, right: 0, width: 400, height: "100vh",
    background: "#0F172A", borderLeft: "1px solid #1E293B",
    display: "flex", flexDirection: "column", zIndex: 1000,
    boxShadow: "-4px 0 20px rgba(0,0,0,0.4)",
  },
  header: {
    padding: "12px 16px", borderBottom: "1px solid #1E293B",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  avatar: {
    width: 32, height: 32, borderRadius: 8,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 16,
  },
  titleText: { fontSize: 14, fontWeight: 700, color: "#F1F5F9" },
  subtitleText: { fontSize: 10, color: "#64748B" },
  closeBtn: {
    background: "none", border: "none", color: "#64748B", cursor: "pointer",
    fontSize: 16, padding: 4,
  },
  modeBar: {
    padding: "8px 12px", borderBottom: "1px solid #1E293B",
    display: "flex", gap: 4,
  },
  modeBtn: {
    flex: 1, padding: "6px 4px", borderRadius: 6,
    border: "1px solid #334155", background: "transparent",
    color: "#64748B", fontSize: 10, fontWeight: 600, cursor: "pointer",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
    transition: "all .15s",
  },
  prompts: {
    padding: "8px 12px", borderBottom: "1px solid #1E293B",
    display: "flex", gap: 4, flexWrap: "wrap",
  },
  promptBtn: {
    padding: "4px 10px", borderRadius: 12, border: "1px solid #334155",
    background: "transparent", fontSize: 11, cursor: "pointer",
    transition: "all .15s",
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
    borderRadius: 10, padding: "10px 14px",
    fontSize: 13, color: "#E2E8F0", lineHeight: 1.5,
  },
  assistantMsg: {
    alignSelf: "flex-start", maxWidth: "85%",
    background: "#1E293B", borderRadius: 10, padding: "10px 14px",
    fontSize: 13, color: "#E2E8F0", lineHeight: 1.5,
  },
  loadingMsg: {
    alignSelf: "flex-start", background: "#1E293B", borderRadius: 10,
    padding: "10px 14px", fontSize: 13, color: "#94A3B8",
    display: "flex", alignItems: "center", gap: 4,
  },
  dot: (color) => ({
    display: "inline-block", width: 6, height: 6, borderRadius: "50%",
    background: color, animation: "ecPulse 1s infinite ease-in-out",
  }),
  inputWrap: {
    padding: 12, borderTop: "1px solid #1E293B", display: "flex", gap: 8,
  },
  input: {
    flex: 1, background: "#1E293B", border: "1px solid #334155", borderRadius: 8,
    padding: "10px 14px", color: "#E2E8F0", fontSize: 13, outline: "none",
    transition: "border-color .15s",
  },
  sendBtn: {
    padding: "10px 16px", borderRadius: 6, border: "none",
    fontSize: 12, fontWeight: 600, color: "#fff",
    transition: "all .15s",
  },
};
