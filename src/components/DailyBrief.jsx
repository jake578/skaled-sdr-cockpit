import { useState, useEffect } from "react";
const fmt = (n) => "$" + (n || 0).toLocaleString();
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");
const TYPE_COLORS = { "follow-up": "#3B82F6", call: "#8B5CF6", email: "#3B82F6", meeting: "#F59E0B", deal: "#10B981", pipeline: "#10B981", admin: "#64748B" };
const btn = (bg) => ({ padding: "6px 14px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: bg, color: "#fff" });

export default function DailyBrief({ onClose, onStart, onScoreDeal, onEmailDeal, onDelegateDeal, onInspectDeal }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [completed, setCompleted] = useState(new Set());

  useEffect(() => {
    fetch("/.netlify/functions/ai-prioritize")
      .then(r => { if (!r.ok) throw new Error(`Status ${r.status}`); return r.json(); })
      .then(d => { if (d.error) { setError(d.error); setLoading(false); return; } setData(d); setLoading(false); })
      .catch(e => { setError("Failed: " + e.message); setLoading(false); });
  }, []);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
  const actions = (data?.topActions || data?.actions || []).filter(a => !completed.has(a.title));

  const sendChat = async (msg) => {
    setChatMsgs(prev => [...prev, { role: "user", content: msg }]);
    setChatLoading(true);
    setChatInput("");
    try {
      const res = await fetch("/.netlify/functions/claude-chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: chatMsgs }),
      });
      const d = await res.json();
      setChatMsgs(prev => [...prev, { role: "assistant", content: strip(d.reply || d.error || "Error") }]);
    } catch { setChatMsgs(prev => [...prev, { role: "assistant", content: "Failed to reach Claude" }]); }
    setChatLoading(false);
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex" }} onClick={onClose}>
      {/* Main panel */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }} onClick={e => e.stopPropagation()}>
        <div style={{ background: "#0F172A", borderRadius: 14, width: chatOpen ? 650 : 700, maxWidth: "95vw", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid #334155", boxShadow: "0 12px 50px rgba(0,0,0,0.6)" }}>

          {/* Header */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>Daily Brief</div>
              <div style={{ fontSize: 12, color: "#64748B" }}>{today} · {actions.length} priorities · Click any to take action</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={btn(chatOpen ? "#8B5CF6" : "#334155")} onClick={() => setChatOpen(!chatOpen)}>
                {chatOpen ? "Close Chat" : "Ask Claude"}
              </button>
              <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 22 }} onClick={onClose}>x</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {loading && (
              <div style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 14, color: "#8B5CF6", fontWeight: 600, marginBottom: 8 }}>Analyzing pipeline, calendar, inbox...</div>
                {[...Array(5)].map((_, i) => <div key={i} style={{ background: "#1E293B", borderRadius: 6, height: 50, marginBottom: 6, animation: "fadeIn 1s infinite alternate" }} />)}
              </div>
            )}
            {error && <div style={{ color: "#EF4444", padding: 20 }}>{error}</div>}

            {data && !loading && (
              <>
                {/* Day summary */}
                {data.daySummary && (
                  <div style={{ background: "#1E293B", borderRadius: 8, padding: "12px 16px", marginBottom: 16, border: "1px solid #334155", fontSize: 13, color: "#CBD5E1", lineHeight: 1.6 }}>
                    {strip(data.daySummary)}
                  </div>
                )}

                {/* Action cards */}
                {actions.slice(0, 10).map((item, i) => {
                  const isExpanded = expanded === i;
                  const typeColor = TYPE_COLORS[item.type] || "#64748B";
                  return (
                    <div key={i} style={{
                      background: "#1E293B", borderRadius: 8, padding: "12px 16px", marginBottom: 6,
                      border: `1px solid ${isExpanded ? typeColor + "60" : "#334155"}`, cursor: "pointer",
                      borderLeft: `3px solid ${i < 3 ? "#10B981" : i < 6 ? "#3B82F6" : "#334155"}`,
                    }} onClick={() => setExpanded(isExpanded ? null : i)}>
                      {/* Card header */}
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                          background: i < 3 ? "linear-gradient(135deg, #10B981, #059669)" : i < 6 ? "linear-gradient(135deg, #3B82F6, #1D4ED8)" : "#334155",
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff",
                        }}>{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#F1F5F9" }}>{strip(item.title)}</div>
                          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2, lineHeight: 1.4 }}>{strip(item.reason)}</div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: typeColor + "20", color: typeColor }}>{item.type}</span>
                            {item.estimatedMinutes && <span style={{ fontSize: 10, color: "#64748B" }}>~{item.estimatedMinutes} min</span>}
                          </div>
                        </div>
                      </div>

                      {/* Expanded actions */}
                      {isExpanded && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #334155" }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                            {/* AI Email */}
                            {onEmailDeal && (
                              <button style={btn("#3B82F6")} onClick={() => onEmailDeal({ id: `brief-${i}`, title: item.title, subtitle: item.reason, suggestedAction: item.reason })}>AI Email</button>
                            )}
                            {/* Score Deal — if title looks like a deal name */}
                            {onScoreDeal && (
                              <button style={btn("#8B5CF6")} onClick={() => {
                                sendChat(`What is the SFDC opportunity ID for "${item.title}"? I want to score this deal.`);
                                setChatOpen(true);
                              }}>Score Deal</button>
                            )}
                            {/* Delegate */}
                            {onDelegateDeal && (
                              <button style={btn("#06B6D4")} onClick={() => onDelegateDeal({ id: `brief-${i}`, title: item.title, subtitle: item.reason, suggestedAction: item.reason })}>Delegate</button>
                            )}
                            {/* Inspect */}
                            {onInspectDeal && (
                              <button style={btn("#10B981")} onClick={() => {
                                sendChat(`Tell me everything about "${item.title}" — deal status, recent interactions, next steps, and any risks.`);
                                setChatOpen(true);
                              }}>Inspect</button>
                            )}
                            {/* Ask Claude about this */}
                            <button style={btn("#334155")} onClick={() => {
                              sendChat(`For action #${i + 1} "${item.title}": ${item.reason}. What specifically should I do and say?`);
                              setChatOpen(true);
                            }}>Ask Claude</button>
                            {/* Mark done */}
                            <button style={btn("#10B981")} onClick={() => setCompleted(prev => new Set([...prev, item.title]))}>Done</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {actions.length === 0 && (
                  <div style={{ textAlign: "center", padding: 30, color: "#10B981", fontSize: 14, fontWeight: 600 }}>
                    All priorities handled. You're clear.
                  </div>
                )}

                <button style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, background: "#10B981", color: "#fff", marginTop: 12 }} onClick={onStart || onClose}>
                  Start My Day →
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Chat sidebar */}
      {chatOpen && (
        <div style={{ width: 380, background: "#0F172A", borderLeft: "1px solid #1E293B", display: "flex", flexDirection: "column", height: "100vh" }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>Claude</div>
              <div style={{ fontSize: 10, color: "#64748B" }}>Ask about any action, deal, or priority</div>
            </div>
            <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 16 }} onClick={() => setChatOpen(false)}>x</button>
          </div>

          {/* Quick prompts */}
          <div style={{ padding: "6px 12px", borderBottom: "1px solid #1E293B", display: "flex", gap: 4, flexWrap: "wrap" }}>
            {["What's my biggest risk today?", "Which deal needs me most?", "Draft a plan for today"].map(q => (
              <button key={q} style={{ padding: "3px 8px", borderRadius: 10, border: "1px solid #334155", background: "transparent", color: "#94A3B8", fontSize: 10, cursor: "pointer" }} onClick={() => sendChat(q)}>{q}</button>
            ))}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {chatMsgs.length === 0 && <div style={{ textAlign: "center", color: "#475569", fontSize: 12, marginTop: 30 }}>Ask about any action or deal</div>}
            {chatMsgs.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "90%",
                background: m.role === "user" ? "#1E40AF" : "#1E293B",
                borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#E2E8F0", lineHeight: 1.5, whiteSpace: "pre-wrap",
              }}>{m.content}</div>
            ))}
            {chatLoading && <div style={{ alignSelf: "flex-start", background: "#1E293B", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#64748B" }}>Thinking...</div>}
          </div>

          {/* Input */}
          <div style={{ padding: 10, borderTop: "1px solid #1E293B", display: "flex", gap: 6 }}>
            <input style={{ flex: 1, background: "#1E293B", border: "1px solid #334155", borderRadius: 6, padding: "8px 12px", color: "#E2E8F0", fontSize: 12 }}
              placeholder="Ask about any deal or action..."
              value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && chatInput.trim() && !chatLoading) sendChat(chatInput.trim()); }}
            />
            <button style={btn("#8B5CF6")} disabled={!chatInput.trim() || chatLoading} onClick={() => chatInput.trim() && sendChat(chatInput.trim())}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}
