import { useState, useEffect, useRef } from "react";

const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");

const QUICK_PROMPTS = {
  deal: [
    "What's the risk level on this deal?",
    "Summarize the last 5 interactions",
    "Draft a follow-up email",
    "Who else should we bring into this deal?",
    "What's the best next step?",
  ],
  lead: [
    "Research this company and tell me if it's a fit",
    "Draft a personalized outreach email",
    "What do we know about this person?",
    "Find any mutual connections",
    "What's their likely pain point?",
  ],
  account: [
    "Summarize our relationship with this account",
    "What upsell opportunities exist?",
    "Draft a check-in email",
    "Who are the key stakeholders?",
    "What's the churn risk?",
  ],
  general: [
    "What should I focus on today?",
    "Summarize my pipeline",
    "What deals are at risk?",
    "Draft a board update on revenue",
    "What's our win rate trend?",
  ],
  meeting: [
    "Give me a 90-second prep brief",
    "What was last discussed with this person?",
    "Draft talking points",
    "What should I avoid bringing up?",
    "Post-meeting: summarize action items",
  ],
};

export default function InlineChat({ initialMessage, context, onClose, compact = false, contextType = "general" }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPrompts, setShowPrompts] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-send initial message if provided
  useEffect(() => {
    if (initialMessage) {
      sendMessage(initialMessage);
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!loading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [loading]);

  const sendMessage = async (text) => {
    if (!text.trim()) return;

    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setShowPrompts(false);
    setError(null);

    try {
      const res = await fetch("/.netlify/functions/claude-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: context ? `[Context: ${context}]\n\n${text}` : text,
          history: newMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      setMessages(prev => [...prev, { role: "assistant", content: data.response || data.message || "No response" }]);
    } catch (e) {
      setError(e.message);
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}. Try again.`, isError: true }]);
    }

    setLoading(false);
  };

  const copyMessage = (text, idx) => {
    navigator.clipboard.writeText(strip(text));
    setCopied(idx);
    setTimeout(() => setCopied(null), 1500);
  };

  const height = compact ? 220 : 420;
  const prompts = QUICK_PROMPTS[contextType] || QUICK_PROMPTS.general;

  // Compact inline mode
  if (compact) {
    return (
      <div style={{
        background: "#0F172A", borderRadius: 8, border: "1px solid #334155",
        height, display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Mini header */}
        <div style={{
          padding: "6px 10px", borderBottom: "1px solid #1E293B",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "#1E293B", flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: loading ? "#F59E0B" : "#10B981" }} />
            Claude
          </span>
          {onClose && (
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 14, padding: 0 }}>x</button>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "6px 10px" }}>
          {messages.length === 0 && showPrompts && (
            <div style={{ padding: "4px 0" }}>
              {prompts.slice(0, 3).map((p, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(p)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "4px 8px", marginBottom: 3, borderRadius: 4,
                    border: "1px solid #334155", background: "transparent",
                    color: "#94A3B8", fontSize: 10, cursor: "pointer",
                    transition: "all .1s",
                  }}
                >{p}</button>
              ))}
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{
              marginBottom: 6, display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}>
              <div style={{
                maxWidth: "85%", padding: "4px 8px", borderRadius: 6,
                fontSize: 11, lineHeight: 1.4,
                background: msg.role === "user" ? "#3B82F6" : msg.isError ? "#EF444420" : "#1E293B",
                color: msg.role === "user" ? "#fff" : msg.isError ? "#EF4444" : "#E2E8F0",
                border: msg.role === "assistant" ? "1px solid #334155" : "none",
              }}>
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{strip(msg.content).substring(0, 600)}</div>
                {msg.role === "assistant" && !msg.isError && (
                  <button
                    onClick={() => copyMessage(msg.content, i)}
                    style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 9, padding: "2px 0", marginTop: 2 }}
                  >{copied === i ? "Copied!" : "Copy"}</button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ padding: "4px 8px", fontSize: 11, color: "#64748B" }}>Thinking...</div>
          )}
        </div>

        {/* Input */}
        <div style={{ padding: "4px 6px", borderTop: "1px solid #1E293B", display: "flex", gap: 4, flexShrink: 0 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && input.trim()) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Ask..."
            disabled={loading}
            style={{
              flex: 1, background: "#1E293B", border: "1px solid #334155", borderRadius: 4,
              padding: "4px 8px", color: "#E2E8F0", fontSize: 11, outline: "none",
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            style={{
              padding: "4px 8px", borderRadius: 4, border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: 600, background: "#10B981", color: "#fff",
              opacity: loading || !input.trim() ? 0.5 : 1,
            }}
          >Send</button>
        </div>
      </div>
    );
  }

  // Full modal mode
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.6)", zIndex: 4000,
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "fadeIn .2s",
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#0F172A", borderRadius: 14, width: "90%", maxWidth: 600,
        height: height + 80, maxHeight: "80vh",
        display: "flex", flexDirection: "column",
        border: "1px solid #1E293B", boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 18px", borderBottom: "1px solid #1E293B",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: "linear-gradient(135deg, #8B5CF6, #A855F7)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff",
            }}>C</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>Claude Assistant</div>
              <div style={{ fontSize: 10, color: "#64748B" }}>
                {context ? `Context: ${context.substring(0, 50)}...` : "Connected to SFDC, Gmail, Calendar"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: loading ? "#F59E0B" : "#10B981",
            }} />
            <span style={{ fontSize: 10, color: loading ? "#F59E0B" : "#10B981" }}>{loading ? "Thinking" : "Ready"}</span>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20, marginLeft: 8 }}>x</button>
          </div>
        </div>

        {/* Messages area */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 18px" }}>
          {messages.length === 0 && showPrompts && (
            <div>
              <div style={{ fontSize: 12, color: "#64748B", marginBottom: 10 }}>Quick prompts:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {prompts.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(p)}
                    style={{
                      display: "block", textAlign: "left",
                      padding: "8px 12px", borderRadius: 6,
                      border: "1px solid #334155", background: "#1E293B",
                      color: "#94A3B8", fontSize: 12, cursor: "pointer",
                      transition: "all .15s",
                    }}
                    onMouseEnter={(e) => { e.target.style.borderColor = "#8B5CF6"; e.target.style.color = "#E2E8F0"; }}
                    onMouseLeave={(e) => { e.target.style.borderColor = "#334155"; e.target.style.color = "#94A3B8"; }}
                  >{p}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{
              marginBottom: 12,
              display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}>
              <div style={{
                maxWidth: "80%", padding: "10px 14px", borderRadius: 10,
                fontSize: 13, lineHeight: 1.5,
                background: msg.role === "user" ? "#3B82F6" : msg.isError ? "#EF444420" : "#1E293B",
                color: msg.role === "user" ? "#fff" : msg.isError ? "#EF4444" : "#E2E8F0",
                border: msg.role === "assistant" ? "1px solid #334155" : "none",
                borderBottomRightRadius: msg.role === "user" ? 2 : 10,
                borderBottomLeftRadius: msg.role === "assistant" ? 2 : 10,
              }}>
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{strip(msg.content)}</div>
                {msg.role === "assistant" && !msg.isError && (
                  <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                    <button
                      onClick={() => copyMessage(msg.content, i)}
                      style={{
                        background: "#0F172A", border: "1px solid #334155", borderRadius: 4,
                        color: copied === i ? "#10B981" : "#64748B", cursor: "pointer",
                        fontSize: 10, padding: "2px 8px",
                      }}
                    >{copied === i ? "Copied!" : "Copy"}</button>
                    <button
                      onClick={() => {
                        window.open(`mailto:?body=${encodeURIComponent(strip(msg.content))}`);
                      }}
                      style={{
                        background: "#0F172A", border: "1px solid #334155", borderRadius: 4,
                        color: "#64748B", cursor: "pointer", fontSize: 10, padding: "2px 8px",
                      }}
                    >Email</button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", background: "#1E293B", borderRadius: 10,
              border: "1px solid #334155", width: "fit-content",
            }}>
              <div style={{ display: "flex", gap: 3 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: "50%", background: "#8B5CF6",
                    animation: `pulse 1.2s infinite ${i * 0.2}s`,
                    opacity: 0.4,
                  }} />
                ))}
              </div>
              <span style={{ fontSize: 12, color: "#64748B" }}>Analyzing...</span>
            </div>
          )}
        </div>

        {/* Input area */}
        <div style={{
          padding: "12px 18px", borderTop: "1px solid #1E293B",
          display: "flex", gap: 8, alignItems: "flex-end", flexShrink: 0,
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && input.trim()) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Ask Claude anything..."
            disabled={loading}
            rows={2}
            style={{
              flex: 1, background: "#1E293B", border: "1px solid #334155", borderRadius: 8,
              padding: "10px 12px", color: "#E2E8F0", fontSize: 13, outline: "none",
              resize: "none", fontFamily: "inherit", lineHeight: 1.4,
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            style={{
              padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 700,
              background: loading || !input.trim() ? "#334155" : "linear-gradient(135deg, #8B5CF6, #A855F7)",
              color: "#fff", opacity: loading || !input.trim() ? 0.5 : 1,
              transition: "all .15s",
            }}
          >Send</button>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

// ── Conversation Templates ──────────────────────────────────────
export function ConversationStarter({ onSelect, contextType = "general" }) {
  const [hoveredTemplate, setHoveredTemplate] = useState(null);

  const templates = {
    deal: [
      { title: "Deal Risk Analysis", prompt: "Analyze this deal's risk factors. What could go wrong? What should I watch for?", icon: "⚠", color: "#EF4444" },
      { title: "Competitive Intel", prompt: "What competitors might be in this deal? How should I position Skaled?", icon: "🏁", color: "#F59E0B" },
      { title: "Next Steps Strategy", prompt: "What's the optimal next step for this deal? Give me 3 options ranked by impact.", icon: "🎯", color: "#10B981" },
      { title: "Stakeholder Map", prompt: "Who are the key stakeholders I need to engage? What's each person's role in the decision?", icon: "🕸", color: "#8B5CF6" },
      { title: "Closing Strategy", prompt: "Draft a closing strategy. What needs to happen to get this deal signed?", icon: "🤝", color: "#3B82F6" },
    ],
    lead: [
      { title: "Company Research", prompt: "Research this company. What do they do, how big are they, and are they a fit for Skaled?", icon: "🔍", color: "#3B82F6" },
      { title: "Personalized Opener", prompt: "Draft 3 personalized opening lines for cold outreach to this person.", icon: "✉", color: "#10B981" },
      { title: "Pain Point Analysis", prompt: "Based on their title and company, what are their likely sales pain points?", icon: "🎯", color: "#F59E0B" },
      { title: "Mutual Connections", prompt: "Who in my network might be connected to this person or company?", icon: "🤝", color: "#8B5CF6" },
    ],
    account: [
      { title: "Expansion Playbook", prompt: "What upsell or cross-sell opportunities exist with this account?", icon: "📈", color: "#10B981" },
      { title: "Churn Risk Assessment", prompt: "What's the churn risk for this account? What signals should I watch?", icon: "⚠", color: "#EF4444" },
      { title: "QBR Prep", prompt: "Help me prepare a QBR agenda for this account. What should I cover?", icon: "📋", color: "#3B82F6" },
      { title: "Champion Development", prompt: "Who could be our champion at this account and how do I develop them?", icon: "🌟", color: "#F59E0B" },
    ],
    meeting: [
      { title: "90-Second Prep", prompt: "Give me a 90-second prep brief for this meeting.", icon: "⚡", color: "#F59E0B" },
      { title: "Discovery Questions", prompt: "Draft 5 strategic discovery questions for this meeting.", icon: "❓", color: "#3B82F6" },
      { title: "Objection Prep", prompt: "What objections might come up and how should I handle them?", icon: "🛡", color: "#EF4444" },
      { title: "Post-Meeting Summary", prompt: "Help me draft a post-meeting summary with action items.", icon: "📝", color: "#10B981" },
    ],
    general: [
      { title: "Pipeline Review", prompt: "Review my pipeline. What's healthy, what's at risk, and what needs attention?", icon: "📊", color: "#3B82F6" },
      { title: "Weekly Planning", prompt: "Help me plan my week. What should I prioritize based on my pipeline and calendar?", icon: "📅", color: "#10B981" },
      { title: "Board Update Draft", prompt: "Draft a brief board update on our sales pipeline and revenue forecast.", icon: "📋", color: "#8B5CF6" },
      { title: "Team Coaching", prompt: "Based on our pipeline data, what coaching points should I bring up with the team?", icon: "🎓", color: "#F59E0B" },
      { title: "Revenue Strategy", prompt: "Analyze our revenue mix and suggest strategies for next quarter growth.", icon: "💰", color: "#10B981" },
    ],
  };

  const selected = templates[contextType] || templates.general;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
      {selected.map((t, i) => (
        <div
          key={i}
          onClick={() => onSelect(t.prompt)}
          onMouseEnter={() => setHoveredTemplate(i)}
          onMouseLeave={() => setHoveredTemplate(null)}
          style={{
            background: hoveredTemplate === i ? "#1E293B" : "#0F172A",
            borderRadius: 8, padding: "10px 12px",
            border: `1px solid ${hoveredTemplate === i ? t.color + "40" : "#1E293B"}`,
            cursor: "pointer", transition: "all .15s",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: t.color }}>{t.title}</span>
          </div>
          <div style={{ fontSize: 10, color: "#64748B", lineHeight: 1.4 }}>{t.prompt.substring(0, 60)}...</div>
        </div>
      ))}
    </div>
  );
}

// ── Chat Action Buttons (for message actions) ───────────────────
export function ChatActions({ message, onAction }) {
  const [hoveredAction, setHoveredAction] = useState(null);

  if (!message || message.role !== "assistant") return null;

  const actions = [
    { id: "copy", label: "Copy", icon: "📋", color: "#64748B" },
    { id: "email", label: "Email This", icon: "✉", color: "#3B82F6" },
    { id: "task", label: "Create Task", icon: "📋", color: "#10B981" },
    { id: "followup", label: "Follow Up", icon: "↩", color: "#F59E0B" },
    { id: "refine", label: "Refine", icon: "✏", color: "#8B5CF6" },
  ];

  return (
    <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
      {actions.map(a => (
        <button
          key={a.id}
          onClick={() => onAction?.(a.id, message.content)}
          onMouseEnter={() => setHoveredAction(a.id)}
          onMouseLeave={() => setHoveredAction(null)}
          style={{
            padding: "2px 8px", borderRadius: 3,
            border: `1px solid ${hoveredAction === a.id ? a.color + "40" : "#334155"}`,
            cursor: "pointer", fontSize: 9, fontWeight: 600,
            background: hoveredAction === a.id ? a.color + "15" : "transparent",
            color: hoveredAction === a.id ? a.color : "#64748B",
            transition: "all .1s",
            display: "flex", alignItems: "center", gap: 3,
          }}
        >
          <span style={{ fontSize: 10 }}>{a.icon}</span> {a.label}
        </button>
      ))}
    </div>
  );
}
