import { useState, useEffect } from "react";

const scoreColor = (s) => s >= 70 ? "#10B981" : s >= 40 ? "#F59E0B" : "#EF4444";
const gradeColor = { A: "#10B981", B: "#3B82F6", C: "#F59E0B", D: "#EF4444", F: "#EF4444" };
const momentumIcon = { accelerating: "↑", stable: "→", decelerating: "↓" };
const momentumColor = { accelerating: "#10B981", stable: "#94A3B8", decelerating: "#EF4444" };
const sentimentColor = { positive: "#10B981", neutral: "#94A3B8", negative: "#EF4444" };
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");

export default function DealScore({ oppId, oppName, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/.netlify/functions/deal-score-v2", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oppId }),
    }).then(r => r.json()).then(d => { if (d.error) setError(d.error); else setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [oppId]);

  return (
    <div style={{ position: "fixed", top: 0, right: 0, width: 460, height: "100vh", background: "#0F172A", borderLeft: "1px solid #1E293B", zIndex: 2000, display: "flex", flexDirection: "column", boxShadow: "-4px 0 30px rgba(0,0,0,0.5)" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>Deal Score</div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{oppName}</div>
        </div>
        <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20 }} onClick={onClose}>x</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {loading && <div style={{ textAlign: "center", padding: 40, color: "#8B5CF6" }}>Scoring deal...</div>}
        {error && <div style={{ color: "#EF4444", padding: 20 }}>{strip(typeof error === "string" ? error : JSON.stringify(error))}</div>}

        {data && (
          <>
            {/* Score + Grade + Momentum */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: scoreColor(data.score) + "20", border: `3px solid ${scoreColor(data.score)}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: scoreColor(data.score) }}>{data.score}</span>
              </div>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: gradeColor[data.grade] || "#94A3B8", background: (gradeColor[data.grade] || "#94A3B8") + "20", padding: "2px 12px", borderRadius: 6 }}>{data.grade}</span>
                  <span style={{ fontSize: 16, color: momentumColor[data.momentum] || "#94A3B8" }}>
                    {momentumIcon[data.momentum] || "→"} {data.momentum}
                  </span>
                </div>
                {data.confidence && <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>Confidence: {data.confidence}%</div>}
                {data.projectedCloseDate && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>Projected close: {data.projectedCloseDate}</div>}
              </div>
            </div>

            {/* Signals */}
            {data.signals?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#F1F5F9", marginBottom: 8, textTransform: "uppercase" }}>Signals</div>
                {data.signals.map((sig, i) => (
                  <div key={i} style={{ background: "#1E293B", borderRadius: 6, padding: "8px 12px", marginBottom: 4, borderLeft: `3px solid ${sentimentColor[sig.sentiment] || "#94A3B8"}` }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "#334155", color: "#94A3B8" }}>{sig.type}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#CBD5E1" }}>{strip(sig.text)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Risks */}
            {data.risks?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#EF4444", marginBottom: 8, textTransform: "uppercase" }}>Risks</div>
                {data.risks.map((r, i) => (
                  <div key={i} style={{ background: "#EF444410", borderRadius: 6, padding: "8px 12px", marginBottom: 4, fontSize: 12, color: "#FCA5A5", borderLeft: "3px solid #EF4444" }}>
                    {strip(r)}
                  </div>
                ))}
              </div>
            )}

            {/* Recommendations */}
            {data.recommendations?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#10B981", marginBottom: 8, textTransform: "uppercase" }}>Recommendations</div>
                {data.recommendations.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 12, color: "#CBD5E1" }}>
                    <span style={{ color: "#10B981", fontWeight: 700 }}>{i + 1}.</span>
                    <span>{strip(r)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Engagement Metrics */}
            {data.metrics && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 8, textTransform: "uppercase" }}>Engagement Metrics</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {[
                    { label: "Emails (7d)", val: data.metrics.emailsLast7d, color: "#3B82F6" },
                    { label: "Emails (30d)", val: data.metrics.emailsLast30d, color: "#3B82F6" },
                    { label: "Meetings (30d)", val: data.metrics.meetingsLast30d, color: "#F59E0B" },
                    { label: "Chorus Calls", val: data.metrics.chorusCallCount, color: "#8B5CF6" },
                    { label: "Stakeholders", val: data.metrics.stakeholderCount, color: "#10B981" },
                    { label: "Documents", val: data.metrics.docCount, color: "#06B6D4" },
                    { label: "Days in Pipeline", val: data.metrics.daysInPipeline, color: "#94A3B8" },
                    { label: "Days to Close", val: data.metrics.daysToClose, color: data.metrics.daysToClose < 0 ? "#EF4444" : "#94A3B8" },
                    { label: "Stage Changes", val: data.metrics.stageChanges, color: "#94A3B8" },
                  ].map((m, i) => (
                    <div key={i} style={{ background: "#0F172A", borderRadius: 4, padding: "6px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: m.color }}>{m.val ?? "—"}</div>
                      <div style={{ fontSize: 9, color: "#64748B" }}>{m.label}</div>
                    </div>
                  ))}
                </div>
                {/* MEDDPICC Checklist */}
                <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[
                    { label: "Champion", has: data.metrics.hasChampion },
                    { label: "Econ Buyer", has: data.metrics.hasEconomicBuyer },
                    { label: "Next Step", has: data.metrics.hasNextStep },
                    { label: "Next Meeting", has: data.metrics.hasUpcomingMeeting },
                    { label: "Proposal/Doc", has: data.metrics.hasProposal },
                  ].map((m, i) => (
                    <span key={i} style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: m.has ? "#10B98120" : "#EF444420", color: m.has ? "#10B981" : "#EF4444" }}>
                      {m.has ? "✓" : "✗"} {m.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Contacts on deal */}
            {data.contacts?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 6, textTransform: "uppercase" }}>Deal Contacts ({data.contacts.length})</div>
                {data.contacts.map((c, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", background: "#0F172A", borderRadius: 4, padding: "4px 10px", marginBottom: 2, fontSize: 11 }}>
                    <span style={{ color: "#F1F5F9" }}>{c.name || "—"}</span>
                    <span style={{ color: "#94A3B8" }}>{c.title || "—"}</span>
                    {c.role && <span style={{ color: "#3B82F6", fontSize: 10 }}>{c.role}</span>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
