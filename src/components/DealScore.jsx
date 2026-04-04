import { useState, useEffect } from "react";

const scoreColor = (s) => s >= 70 ? "#10B981" : s >= 40 ? "#F59E0B" : "#EF4444";
const gradeColor = { A: "#10B981", B: "#3B82F6", C: "#F59E0B", D: "#EF4444", F: "#EF4444" };
const momentumIcon = { accelerating: "↑", stable: "→", decelerating: "↓", no_activity: "✗" };
const momentumColor = { accelerating: "#10B981", stable: "#94A3B8", decelerating: "#EF4444", no_activity: "#EF4444" };
const sentimentColor = { positive: "#10B981", neutral: "#94A3B8", negative: "#EF4444" };
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");
const fmt = (n) => "$" + (n || 0).toLocaleString();

export default function DealScore({ oppId, oppName, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("score"); // score | engagement | people | activity

  useEffect(() => {
    fetch("/.netlify/functions/deal-score-v2", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oppId }),
    }).then(r => r.json()).then(d => { if (d.error) setError(d.error); else setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [oppId]);

  const m = data?.metrics || {};

  return (
    <div style={{ position: "fixed", top: 0, right: 0, width: 500, height: "100vh", background: "#0F172A", borderLeft: "1px solid #1E293B", zIndex: 2000, display: "flex", flexDirection: "column", boxShadow: "-4px 0 30px rgba(0,0,0,0.5)" }}>
      {/* Header */}
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>Deal Score</div>
          <div style={{ fontSize: 12, color: "#64748B" }}>{oppName}</div>
        </div>
        <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20 }} onClick={onClose}>x</button>
      </div>

      {/* Tabs */}
      {data && (
        <div style={{ display: "flex", gap: 2, padding: "8px 18px", borderBottom: "1px solid #1E293B", flexShrink: 0 }}>
          {[["score", "Score"], ["engagement", "Engagement"], ["people", "People"], ["activity", "Activity"]].map(([k, l]) => (
            <button key={k} style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 11, fontWeight: 600, background: tab === k ? "#10B981" : "transparent", color: tab === k ? "#fff" : "#94A3B8" }} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
        {loading && <div style={{ textAlign: "center", padding: 40, color: "#8B5CF6" }}>Scoring deal across Gmail, Calendar, Chorus, Drive...</div>}
        {error && <div style={{ color: "#EF4444", padding: 20, fontSize: 12 }}>{strip(typeof error === "string" ? error : JSON.stringify(error))}</div>}

        {data && (
          <>
            {/* Score header — always visible */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: scoreColor(data.score) + "20", border: `3px solid ${scoreColor(data.score)}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: scoreColor(data.score) }}>{data.score}</span>
              </div>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: gradeColor[data.grade] || "#94A3B8", background: (gradeColor[data.grade] || "#94A3B8") + "20", padding: "2px 10px", borderRadius: 6 }}>{data.grade}</span>
                  <span style={{ fontSize: 14, color: momentumColor[data.momentum] || "#94A3B8" }}>
                    {momentumIcon[data.momentum] || "→"} {data.momentum}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>
                  Confidence: {data.confidence}% · Last touch: {m.realDaysSince != null ? `${m.realDaysSince}d ago` : "—"}
                </div>
              </div>
            </div>

            {/* MEDDPICC checklist — always visible */}
            <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
              {[
                { label: "Champion", has: m.hasChampion },
                { label: "Econ Buyer", has: m.hasEconomicBuyer },
                { label: "Technical", has: m.hasTechnical },
                { label: "Next Step", has: m.hasNextStep },
                { label: "Meeting", has: m.hasUpcomingMeeting },
                { label: "Proposal", has: m.hasProposal },
              ].map((x, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: x.has ? "#10B98120" : "#EF444415", color: x.has ? "#10B981" : "#EF4444" }}>
                  {x.has ? "✓" : "✗"} {x.label}
                </span>
              ))}
            </div>

            {/* ── SCORE TAB ─────────────────────────────── */}
            {tab === "score" && (
              <>
                {data.signals?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#F1F5F9", marginBottom: 6, textTransform: "uppercase" }}>Signals</div>
                    {data.signals.map((sig, i) => (
                      <div key={i} style={{ background: "#1E293B", borderRadius: 5, padding: "6px 10px", marginBottom: 3, borderLeft: `3px solid ${sentimentColor[sig.sentiment] || "#94A3B8"}`, fontSize: 12 }}>
                        <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "#334155", color: "#94A3B8", marginRight: 6 }}>{sig.type}</span>
                        <span style={{ color: "#CBD5E1" }}>{strip(sig.text)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {data.risks?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", marginBottom: 6, textTransform: "uppercase" }}>Risks</div>
                    {data.risks.map((r, i) => (
                      <div key={i} style={{ background: "#EF444410", borderRadius: 5, padding: "6px 10px", marginBottom: 3, fontSize: 12, color: "#FCA5A5", borderLeft: "3px solid #EF4444" }}>{strip(r)}</div>
                    ))}
                  </div>
                )}
                {data.recommendations?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981", marginBottom: 6, textTransform: "uppercase" }}>Recommendations</div>
                    {data.recommendations.map((r, i) => (
                      <div key={i} style={{ fontSize: 12, color: "#CBD5E1", marginBottom: 4, display: "flex", gap: 6 }}>
                        <span style={{ color: "#10B981", fontWeight: 700 }}>{i + 1}.</span><span>{strip(r)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── ENGAGEMENT TAB ─────────────────────────── */}
            {tab === "engagement" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
                  {[
                    { label: "Emails (7d)", val: m.emailsLast7d, color: m.emailsLast7d > 0 ? "#3B82F6" : "#EF4444" },
                    { label: "Emails (30d)", val: m.emailsLast30d, color: m.emailsLast30d > 0 ? "#3B82F6" : "#EF4444" },
                    { label: "Email Trend", val: m.emailTrend, color: m.emailTrend === "accelerating" ? "#10B981" : m.emailTrend === "no_activity" ? "#EF4444" : "#94A3B8" },
                    { label: "Meetings (30d)", val: m.meetingsLast30d, color: m.meetingsLast30d > 0 ? "#F59E0B" : "#EF4444" },
                    { label: "Upcoming", val: m.meetingsUpcoming, color: m.meetingsUpcoming > 0 ? "#10B981" : "#EF4444" },
                    { label: "Next Meeting", val: m.nextMeeting || "None", color: m.nextMeeting ? "#10B981" : "#EF4444" },
                    { label: "Chorus Calls", val: m.chorusCallCount, color: "#8B5CF6" },
                    { label: "Drive Docs", val: m.docCount, color: m.docCount > 0 ? "#06B6D4" : "#64748B" },
                    { label: "Real Last Touch", val: m.realDaysSince != null ? `${m.realDaysSince}d` : "—", color: m.realDaysSince <= 7 ? "#10B981" : m.realDaysSince <= 14 ? "#F59E0B" : "#EF4444" },
                    { label: "Days in Pipeline", val: m.daysInPipeline, color: m.daysInPipeline > 90 ? "#EF4444" : "#94A3B8" },
                    { label: "Days to Close", val: m.daysToClose, color: m.daysToClose < 0 ? "#EF4444" : m.daysToClose <= 7 ? "#F59E0B" : "#94A3B8" },
                    { label: "Stage Changes", val: m.stageChanges, color: "#94A3B8" },
                  ].map((x, i) => (
                    <div key={i} style={{ background: "#1E293B", borderRadius: 4, padding: "8px", textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: x.color }}>{x.val ?? "—"}</div>
                      <div style={{ fontSize: 9, color: "#64748B" }}>{x.label}</div>
                    </div>
                  ))}
                </div>

                {/* Recent emails */}
                {data.recentEmails?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#3B82F6", marginBottom: 6, textTransform: "uppercase" }}>Recent Emails</div>
                    {data.recentEmails.map((e, i) => (
                      <div key={i} style={{ background: "#1E293B", borderRadius: 4, padding: "5px 10px", marginBottom: 2, fontSize: 11 }}>
                        <div style={{ color: "#F1F5F9" }}>{e.subject}</div>
                        <div style={{ color: "#64748B" }}>{e.from} · {e.date}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recent meetings */}
                {data.recentMeetings?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", marginBottom: 6, textTransform: "uppercase" }}>Meetings</div>
                    {data.recentMeetings.map((mt, i) => (
                      <div key={i} style={{ background: "#1E293B", borderRadius: 4, padding: "5px 10px", marginBottom: 2, fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#F1F5F9" }}>{mt.title}</span>
                        <span style={{ color: mt.isPast ? "#64748B" : "#10B981" }}>{mt.date} {mt.isPast ? "" : "(upcoming)"}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Chorus calls */}
                {data.chorusCalls?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#8B5CF6", marginBottom: 6, textTransform: "uppercase" }}>Chorus Calls</div>
                    {data.chorusCalls.map((c, i) => (
                      <div key={i} style={{ background: "#1E293B", borderRadius: 4, padding: "5px 10px", marginBottom: 2, fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#F1F5F9" }}>{c.subject}</span>
                        <span style={{ color: "#64748B" }}>{c.date} · {c.who || "—"}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Documents */}
                {data.documents?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#06B6D4", marginBottom: 6, textTransform: "uppercase" }}>Drive Documents</div>
                    {data.documents.map((d, i) => (
                      <div key={i} style={{ background: "#1E293B", borderRadius: 4, padding: "5px 10px", marginBottom: 2, fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#F1F5F9" }}>{d.name}</span>
                        <span style={{ color: "#64748B" }}>{d.modified}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── PEOPLE TAB ─────────────────────────────── */}
            {tab === "people" && (
              <>
                {data.contacts?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#F1F5F9", marginBottom: 6, textTransform: "uppercase" }}>On This Deal ({data.contacts.length})</div>
                    {data.contacts.map((c, i) => (
                      <div key={i} style={{ background: "#1E293B", borderRadius: 6, padding: "8px 12px", marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{c.name || "—"}</span>
                          {c.role && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "#3B82F620", color: "#3B82F6" }}>{c.role}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>{c.title || "—"} {c.email ? `· ${c.email}` : ""}</div>
                      </div>
                    ))}
                  </div>
                )}
                {data.allContacts?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 6, textTransform: "uppercase" }}>Other Contacts on Account ({data.allContacts.length})</div>
                    {data.allContacts.filter(c => !data.contacts?.some(dc => dc.email === c.email)).map((c, i) => (
                      <div key={i} style={{ background: "#0F172A", borderRadius: 4, padding: "5px 10px", marginBottom: 2, fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#CBD5E1" }}>{c.name}</span>
                        <span style={{ color: "#64748B" }}>{c.title || "—"}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(!data.contacts || data.contacts.length === 0) && (!data.allContacts || data.allContacts.length === 0) && (
                  <div style={{ textAlign: "center", padding: 20, color: "#64748B" }}>No contacts found on this deal or account</div>
                )}
              </>
            )}

            {/* ── ACTIVITY TAB ───────────────────────────── */}
            {tab === "activity" && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 6, textTransform: "uppercase" }}>Deal History</div>
                {/* Stage changes */}
                {data.metrics?.stageChanges > 0 && <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>Stage changed {data.metrics.stageChanges} time{data.metrics.stageChanges > 1 ? "s" : ""}</div>}
                {data.metrics?.closeDateMoves > 0 && <div style={{ fontSize: 11, color: "#F59E0B", marginBottom: 4 }}>Close date pushed {data.metrics.closeDateMoves} time{data.metrics.closeDateMoves > 1 ? "s" : ""}</div>}
                {data.metrics?.amountChanges > 0 && <div style={{ fontSize: 11, color: "#3B82F6", marginBottom: 4 }}>Amount changed {data.metrics.amountChanges} time{data.metrics.amountChanges > 1 ? "s" : ""}</div>}

                <div style={{ marginTop: 10 }}>
                  <a href={`https://skaled.my.salesforce.com/${oppId}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", padding: "8px 16px", borderRadius: 6, background: "#00A1E0", color: "#fff", textDecoration: "none", fontSize: 12, fontWeight: 600 }}>View Full History in SFDC</a>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
