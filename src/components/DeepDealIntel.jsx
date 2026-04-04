import { useState, useEffect } from "react";
const fmt = (n) => "$" + (n || 0).toLocaleString();
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");
const healthColor = { healthy: "#10B981", at_risk: "#F59E0B", critical: "#EF4444", unknown: "#64748B" };
const sentColor = { positive: "#10B981", warming: "#10B981", neutral: "#94A3B8", stable: "#94A3B8", negative: "#EF4444", cooling: "#EF4444", mixed: "#F59E0B", no_data: "#64748B" };

export default function DeepDealIntel({ oppId, oppName, accountName, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("overview"); // overview | emails | calls | docs

  useEffect(() => {
    fetch("/.netlify/functions/deep-deal-intelligence", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oppId, accountName }),
    }).then(r => r.json()).then(d => { if (d.error) setError(d.error); else setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [oppId, accountName]);

  const ma = data?.masterAnalysis || {};
  const ei = data?.emailIntelligence || {};
  const ci = data?.callIntelligence || {};

  return (
    <div style={{ position: "fixed", top: 0, right: 0, width: 560, height: "100vh", background: "#0F172A", borderLeft: "1px solid #1E293B", zIndex: 2000, display: "flex", flexDirection: "column", boxShadow: "-4px 0 40px rgba(0,0,0,0.6)" }}>
      {/* Header */}
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9" }}>Deep Intelligence</div>
          <div style={{ fontSize: 12, color: "#64748B" }}>{oppName || accountName} · Emails + Docs + Calls + SFDC</div>
        </div>
        <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 22 }} onClick={onClose}>x</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, padding: "6px 18px", borderBottom: "1px solid #1E293B", flexShrink: 0 }}>
        {[["overview", "Overview"], ["emails", `Emails (${ei.totalEmails || 0})`], ["calls", `Calls (${ci.totalCalls || 0})`], ["docs", `Docs (${(ei.googleDocsRead || 0) + (ei.gammaDecksFound || 0)})`]].map(([k, l]) => (
          <button key={k} style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 11, fontWeight: 600, background: tab === k ? "#10B981" : "transparent", color: tab === k ? "#fff" : "#94A3B8" }} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 16, color: "#8B5CF6", fontWeight: 600, marginBottom: 8 }}>Deep analyzing...</div>
            <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6 }}>
              Reading emails → Following links → Reading Google Docs →<br/>
              Finding Gamma decks → Pulling Chorus transcripts →<br/>
              Analyzing sentiment → Scoring deal → Synthesizing...
            </div>
          </div>
        )}
        {error && <div style={{ color: "#EF4444", padding: 20, fontSize: 12 }}>{strip(typeof error === "string" ? error : JSON.stringify(error))}</div>}

        {data && (
          <>
            {/* OVERVIEW TAB */}
            {tab === "overview" && (
              <>
                {/* Health strip */}
                <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                  {ma.dealHealth && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 4, background: (healthColor[ma.dealHealth] || "#64748B") + "20", color: healthColor[ma.dealHealth] || "#64748B", textTransform: "uppercase" }}>{ma.dealHealth}</span>}
                  {ma.winProbability != null && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 4, background: "#1E293B", color: "#F1F5F9" }}>Win: {ma.winProbability}%</span>}
                  {data.dealScore && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 4, background: "#8B5CF620", color: "#8B5CF6" }}>Score: {data.dealScore.score} ({data.dealScore.grade})</span>}
                  {ma.emailSentiment && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: (sentColor[ma.emailSentiment] || "#64748B") + "20", color: sentColor[ma.emailSentiment] || "#64748B" }}>Email: {ma.emailSentiment}</span>}
                  {ma.callSentiment && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: (sentColor[ma.callSentiment] || "#64748B") + "20", color: sentColor[ma.callSentiment] || "#64748B" }}>Calls: {ma.callSentiment}</span>}
                  {ma.stakeholderAssessment && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: "#334155", color: "#94A3B8" }}>{ma.stakeholderAssessment}</span>}
                </div>

                {/* Executive brief */}
                {ma.executiveBrief && (
                  <div style={{ background: "#1E293B", borderRadius: 8, padding: 14, marginBottom: 12, border: "1px solid #334155" }}>
                    <div style={{ fontSize: 11, color: "#8B5CF6", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>Executive Brief</div>
                    <div style={{ fontSize: 13, color: "#F1F5F9", lineHeight: 1.6 }}>{strip(ma.executiveBrief)}</div>
                  </div>
                )}

                {/* Key insight */}
                {ma.keyInsight && (
                  <div style={{ background: "#F59E0B15", borderRadius: 8, padding: 12, marginBottom: 12, border: "1px solid #F59E0B30" }}>
                    <div style={{ fontSize: 11, color: "#F59E0B", fontWeight: 700, marginBottom: 4 }}>KEY INSIGHT</div>
                    <div style={{ fontSize: 13, color: "#FCD34D", lineHeight: 1.5 }}>{strip(ma.keyInsight)}</div>
                  </div>
                )}

                {/* Next conversation */}
                {ma.nextConversation && (
                  <div style={{ background: "#10B98115", borderRadius: 8, padding: 12, marginBottom: 12, border: "1px solid #10B98130" }}>
                    <div style={{ fontSize: 11, color: "#10B981", fontWeight: 700, marginBottom: 4 }}>NEXT CONVERSATION</div>
                    <div style={{ fontSize: 12, color: "#6EE7B7", lineHeight: 1.5 }}>{strip(ma.nextConversation)}</div>
                  </div>
                )}

                {/* Recommended actions */}
                {ma.recommendedActions?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#3B82F6", marginBottom: 6, textTransform: "uppercase" }}>Recommended Actions</div>
                    {ma.recommendedActions.map((a, i) => (
                      <div key={i} style={{ fontSize: 12, color: "#CBD5E1", marginBottom: 4, display: "flex", gap: 6 }}>
                        <span style={{ color: "#3B82F6", fontWeight: 700 }}>{i + 1}.</span><span>{strip(a)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Deal killers + win accelerators */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {ma.dealKillers?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", marginBottom: 4 }}>DEAL KILLERS</div>
                      {ma.dealKillers.map((d, i) => (
                        <div key={i} style={{ background: "#EF444410", borderRadius: 4, padding: "4px 8px", marginBottom: 2, fontSize: 11, color: "#FCA5A5" }}>{strip(d)}</div>
                      ))}
                    </div>
                  )}
                  {ma.winAccelerators?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981", marginBottom: 4 }}>WIN ACCELERATORS</div>
                      {ma.winAccelerators.map((w, i) => (
                        <div key={i} style={{ background: "#10B98110", borderRadius: 4, padding: "4px 8px", marginBottom: 2, fontSize: 11, color: "#6EE7B7" }}>{strip(w)}</div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Data sources summary */}
                <div style={{ background: "#0F1117", borderRadius: 6, padding: 10, fontSize: 10, color: "#64748B" }}>
                  Sources: {ei.totalEmails || 0} emails analyzed · {ei.googleDocsRead || 0} Google Docs read · {ei.gammaDecksFound || 0} Gamma decks found · {ci.totalCalls || 0} Chorus calls · {ei.linksSummary?.total || 0} links extracted
                </div>
              </>
            )}

            {/* EMAILS TAB */}
            {tab === "emails" && (
              <>
                {ei.analysis && (
                  <div style={{ background: "#1E293B", borderRadius: 8, padding: 12, marginBottom: 12, border: "1px solid #334155" }}>
                    <div style={{ fontSize: 11, color: "#3B82F6", fontWeight: 700, marginBottom: 4 }}>EMAIL ANALYSIS</div>
                    <div style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.5 }}>{strip(ei.analysis)}</div>
                  </div>
                )}
                {ei.documents?.googleDocs?.map((d, i) => (
                  <a key={i} href={`https://docs.google.com/document/d/${d.id || ""}/edit`} target="_blank" rel="noreferrer" style={{ display: "block", background: "#1E293B", borderRadius: 6, padding: "8px 12px", marginBottom: 4, textDecoration: "none", borderLeft: "3px solid #3B82F6" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#3B82F6" }}>{d.title}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>{d.wordCount} words · Found in: {(d.foundIn || []).join(", ")}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4, whiteSpace: "pre-wrap" }}>{(d.text || "").slice(0, 300)}...</div>
                  </a>
                ))}
                {ei.documents?.gammaDecks?.map((d, i) => (
                  <a key={i} href={d.url} target="_blank" rel="noreferrer" style={{ display: "block", background: "#1E293B", borderRadius: 6, padding: "8px 12px", marginBottom: 4, textDecoration: "none", borderLeft: "3px solid #F59E0B" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#F59E0B" }}>{d.title}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>Shared by {d.sharedBy} · {d.sharedDate}</div>
                  </a>
                ))}
                {ei.documents?.otherLinks?.map((l, i) => (
                  <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{ display: "block", background: "#0F1117", borderRadius: 4, padding: "5px 10px", marginBottom: 2, textDecoration: "none", fontSize: 11 }}>
                    <span style={{ color: "#3B82F6" }}>{l.type}</span>: <span style={{ color: "#94A3B8" }}>{l.url.slice(0, 60)}...</span>
                  </a>
                ))}
              </>
            )}

            {/* CALLS TAB */}
            {tab === "calls" && (
              <>
                {ci.sentiment && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 4, background: (sentColor[ci.sentiment.overallSentiment] || "#64748B") + "20", color: sentColor[ci.sentiment.overallSentiment] || "#64748B" }}>Sentiment: {ci.sentiment.overallSentiment}</span>
                      <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 4, background: "#334155", color: "#94A3B8" }}>Momentum: {ci.sentiment.dealMomentum}</span>
                    </div>
                    {ci.sentiment.overallAnalysis && <div style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.5, marginBottom: 10 }}>{strip(ci.sentiment.overallAnalysis)}</div>}

                    {/* Key moments */}
                    {ci.sentiment.keyMoments?.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#F1F5F9", marginBottom: 4 }}>KEY MOMENTS</div>
                        {ci.sentiment.keyMoments.map((m, i) => (
                          <div key={i} style={{ background: "#1E293B", borderRadius: 4, padding: "6px 10px", marginBottom: 3, borderLeft: `2px solid ${m.type === "buying_signal" ? "#10B981" : m.type === "objection" ? "#EF4444" : m.type === "commitment" ? "#3B82F6" : "#F59E0B"}` }}>
                            <div style={{ fontSize: 10, color: sentColor[m.type === "buying_signal" ? "positive" : m.type === "objection" ? "negative" : "neutral"] || "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>{m.type} — {m.speaker}</div>
                            <div style={{ fontSize: 11, color: "#CBD5E1", fontStyle: "italic" }}>"{strip(m.quote)}"</div>
                            {m.significance && <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>{strip(m.significance)}</div>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Speaker sentiment */}
                    {ci.sentiment.speakers?.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#F1F5F9", marginBottom: 4 }}>SPEAKER ANALYSIS</div>
                        {ci.sentiment.speakers.map((sp, i) => (
                          <div key={i} style={{ background: "#1E293B", borderRadius: 6, padding: "8px 10px", marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9" }}>{sp.name}</span>
                              <div style={{ display: "flex", gap: 4 }}>
                                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: (sentColor[sp.sentiment] || "#64748B") + "20", color: sentColor[sp.sentiment] || "#64748B" }}>{sp.sentiment}</span>
                                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "#334155", color: "#94A3B8" }}>{sp.engagement} engagement</span>
                              </div>
                            </div>
                            {sp.buyingSignals?.length > 0 && <div style={{ fontSize: 10, color: "#10B981", marginTop: 3 }}>Buying: {sp.buyingSignals.map(s => strip(s)).join(", ")}</div>}
                            {sp.concerns?.length > 0 && <div style={{ fontSize: 10, color: "#EF4444", marginTop: 2 }}>Concerns: {sp.concerns.map(s => strip(s)).join(", ")}</div>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Objections */}
                    {ci.sentiment.objections?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", marginBottom: 4 }}>OBJECTIONS</div>
                        {ci.sentiment.objections.map((o, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", background: "#EF444410", borderRadius: 4, padding: "4px 10px", marginBottom: 2, fontSize: 11 }}>
                            <span style={{ color: "#FCA5A5" }}>{strip(o.topic)} — {o.speaker}</span>
                            <span style={{ color: o.status === "resolved" ? "#10B981" : o.status === "addressed" ? "#F59E0B" : "#EF4444", fontWeight: 600 }}>{o.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Call list */}
                {ci.calls?.map((call, i) => (
                  <div key={i} style={{ background: "#1E293B", borderRadius: 6, padding: "8px 12px", marginBottom: 4, borderLeft: "3px solid #8B5CF6" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9" }}>{call.subject}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>{call.date} · {call.durationMinutes}min · {call.participants?.length} participants</div>
                    {call.summary && <div style={{ fontSize: 11, color: "#CBD5E1", marginTop: 4 }}>{strip(call.summary).slice(0, 200)}</div>}
                  </div>
                ))}
              </>
            )}

            {/* DOCS TAB */}
            {tab === "docs" && (
              <>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 10 }}>
                  Links extracted from emails: {ei.linksSummary?.total || 0} total · {ei.linksSummary?.googleDocs || 0} Google Docs · {ei.linksSummary?.gamma || 0} Gamma · {ei.linksSummary?.sheets || 0} Sheets · {ei.linksSummary?.slides || 0} Slides
                </div>

                {ei.documents?.googleDocs?.map((d, i) => (
                  <div key={i} style={{ background: "#1E293B", borderRadius: 8, padding: 12, marginBottom: 8, border: "1px solid #334155" }}>
                    <a href={`https://docs.google.com/document/d/${d.id}/edit`} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 600, color: "#3B82F6", textDecoration: "none" }}>{d.title}</a>
                    <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>{d.wordCount} words · Found in emails: {(d.foundIn || []).join(", ")}</div>
                    <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto", background: "#0F172A", borderRadius: 4, padding: 8 }}>{(d.text || "").slice(0, 1000)}</div>
                  </div>
                ))}

                {ei.documents?.gammaDecks?.map((d, i) => (
                  <div key={i} style={{ background: "#1E293B", borderRadius: 8, padding: 12, marginBottom: 8, border: "1px solid #F59E0B30" }}>
                    <a href={d.url} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 600, color: "#F59E0B", textDecoration: "none" }}>{d.title}</a>
                    <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>Shared by {d.sharedBy} · {d.sharedDate}</div>
                    {d.description && <div style={{ fontSize: 11, color: "#CBD5E1", marginTop: 4 }}>{strip(d.description)}</div>}
                    {d.emailSnippet && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4, fontStyle: "italic" }}>Email context: {strip(d.emailSnippet)}</div>}
                  </div>
                ))}

                {ei.documents?.sheets?.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{ display: "block", background: "#1E293B", borderRadius: 6, padding: "8px 12px", marginBottom: 4, textDecoration: "none", borderLeft: "3px solid #10B981" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#10B981" }}>Google Sheet</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>Found in: {(s.foundIn || []).join(", ")}</div>
                  </a>
                ))}

                {(!ei.documents?.googleDocs?.length && !ei.documents?.gammaDecks?.length) && (
                  <div style={{ textAlign: "center", padding: 30, color: "#64748B" }}>No documents found in email threads</div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
