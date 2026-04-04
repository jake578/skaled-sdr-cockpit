import { useState, useEffect } from "react";
const fmt = (n) => "$" + (n || 0).toLocaleString();
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");
const scoreColor = (s) => s >= 8 ? "#10B981" : s >= 5 ? "#F59E0B" : "#EF4444";

export default function Account360({ accountId, accountName, onClose, onScoreDeal, onEmailDeal, onDeepIntel }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("overview");
  const [showClosed, setShowClosed] = useState(false);
  const [timeline, setTimeline] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    fetch("/.netlify/functions/account-360", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, accountName }),
    }).then(r => r.json()).then(d => { if (d.error) setError(d.error); else setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [accountId, accountName]);

  // Load timeline when Activity tab is selected
  useEffect(() => {
    if (tab === "activity" && !timeline && !timelineLoading) {
      setTimelineLoading(true);
      fetch("/.netlify/functions/unified-timeline", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: data?.account?.name || accountName }),
      }).then(r => r.json()).then(d => { setTimeline(d); setTimelineLoading(false); })
        .catch(() => setTimelineLoading(false));
    }
  }, [tab]);

  const typeColor = { email: "#3B82F6", meeting: "#F59E0B", call: "#8B5CF6", task: "#64748B" };
  const typeIcon = { email: "\u2709", meeting: "\uD83D\uDCC5", call: "\uD83D\uDCDE", task: "\u2611" };

  return (
    <div style={{ position: "fixed", top: 0, right: 0, width: 580, height: "100vh", background: "#0F172A", borderLeft: "1px solid #1E293B", zIndex: 2000, display: "flex", flexDirection: "column", boxShadow: "-4px 0 40px rgba(0,0,0,0.6)" }}>
      {/* Header */}
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #1E293B", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {data && (
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: scoreColor(data.healthScore) + "20",
                border: `2px solid ${scoreColor(data.healthScore)}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 800, color: scoreColor(data.healthScore),
              }}>
                {data.healthScore}
              </div>
            )}
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9" }}>{accountName}</div>
              <div style={{ fontSize: 12, color: "#64748B" }}>
                {data ? `${data.account?.industry || "—"} · ${data.account?.employees || 0} employees` : "Loading..."}
              </div>
            </div>
          </div>
          <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 22 }} onClick={onClose}>x</button>
        </div>
        {data?.aiSummary && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#CBD5E1", lineHeight: 1.5 }}>{strip(data.aiSummary)}</div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, padding: "6px 18px", borderBottom: "1px solid #1E293B", flexShrink: 0 }}>
        {[
          ["overview", "Overview"],
          ["deals", `Deals (${data?.opps?.length || 0})`],
          ["people", `People (${data?.contacts?.length || 0})`],
          ["activity", "Activity"],
          ["documents", `Docs (${data?.documents?.length || 0})`],
        ].map(([k, l]) => (
          <button key={k} style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 11, fontWeight: 600, background: tab === k ? "#10B981" : "transparent", color: tab === k ? "#fff" : "#94A3B8" }} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 16, color: "#8B5CF6", fontWeight: 600, marginBottom: 8 }}>Building 360 view...</div>
            <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6 }}>
              Pulling SFDC opps + contacts → Searching Gmail →<br/>
              Scanning Calendar → Finding Chorus calls →<br/>
              Searching Drive → Generating AI summary...
            </div>
          </div>
        )}
        {error && <div style={{ color: "#EF4444", padding: 20, fontSize: 12 }}>{strip(typeof error === "string" ? error : JSON.stringify(error))}</div>}

        {data && (
          <>
            {/* OVERVIEW TAB */}
            {tab === "overview" && (
              <>
                {/* Health + AI summary */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 4, background: scoreColor(data.healthScore) + "20", color: scoreColor(data.healthScore), textTransform: "uppercase" }}>
                    Health: {data.healthScore}/10
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 4, background: "#1E293B", color: "#F1F5F9" }}>
                    {data.opps?.filter(o => !o.isClosed).length || 0} open deals
                  </span>
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: "#1E293B", color: "#94A3B8" }}>
                    {data.emailCount} emails (90d)
                  </span>
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: "#1E293B", color: "#94A3B8" }}>
                    {data.meetingCount} meetings
                  </span>
                </div>

                {/* Key metrics */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                  {[
                    { label: "Open Pipeline", value: fmt(data.opps?.filter(o => !o.isClosed).reduce((s, o) => s + o.amount, 0)), color: "#3B82F6" },
                    { label: "Won Revenue", value: fmt(data.opps?.filter(o => o.isWon).reduce((s, o) => s + o.amount, 0)), color: "#10B981" },
                    { label: "Contacts", value: data.contacts?.length || 0, color: "#F59E0B" },
                    { label: "Meetings (90d)", value: data.meetingCount, color: "#8B5CF6" },
                  ].map((m, i) => (
                    <div key={i} style={{ background: "#1E293B", borderRadius: 6, padding: 10, textAlign: "center", border: "1px solid #334155" }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: m.color }}>{m.value}</div>
                      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>{m.label}</div>
                    </div>
                  ))}
                </div>

                {/* Recommendations */}
                {data.recommendations?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981", marginBottom: 6, textTransform: "uppercase" }}>Recommendations</div>
                    {data.recommendations.map((r, i) => (
                      <div key={i} style={{ fontSize: 12, color: "#CBD5E1", marginBottom: 4, display: "flex", gap: 6 }}>
                        <span style={{ color: "#10B981", fontWeight: 700 }}>{i + 1}.</span><span>{strip(r)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recent emails */}
                {data.recentEmails?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#3B82F6", marginBottom: 6, textTransform: "uppercase" }}>Recent Emails</div>
                    {data.recentEmails.map((e, i) => (
                      <div key={i} style={{ background: "#1E293B", borderRadius: 4, padding: "6px 10px", marginBottom: 3, borderLeft: "2px solid #3B82F6" }}>
                        <div style={{ fontSize: 12, color: "#F1F5F9" }}>{e.subject}</div>
                        <div style={{ fontSize: 10, color: "#64748B" }}>{e.from} · {e.date}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recent meetings */}
                {data.recentMeetings?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", marginBottom: 6, textTransform: "uppercase" }}>Recent / Upcoming Meetings</div>
                    {data.recentMeetings.slice(0, 5).map((m, i) => (
                      <div key={i} style={{ background: "#1E293B", borderRadius: 4, padding: "6px 10px", marginBottom: 3, borderLeft: `2px solid ${m.isFuture ? "#10B981" : "#F59E0B"}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 12, color: "#F1F5F9" }}>{m.subject}</span>
                          {m.isFuture && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "#10B98120", color: "#10B981", fontWeight: 600 }}>UPCOMING</span>}
                        </div>
                        <div style={{ fontSize: 10, color: "#64748B" }}>{m.date} {m.time} · {m.attendees?.join(", ") || "—"}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Data sources */}
                <div style={{ background: "#0F1117", borderRadius: 6, padding: 10, fontSize: 10, color: "#64748B" }}>
                  Sources: {data.opps?.length || 0} opps · {data.contacts?.length || 0} contacts · {data.emailCount} emails · {data.meetingCount} meetings · {data.chorusCalls?.length || 0} calls · {data.documents?.length || 0} docs
                </div>
              </>
            )}

            {/* DEALS TAB */}
            {tab === "deals" && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <button style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 11, fontWeight: 600, background: !showClosed ? "#3B82F6" : "transparent", color: !showClosed ? "#fff" : "#94A3B8" }} onClick={() => setShowClosed(false)}>Open ({data.opps?.filter(o => !o.isClosed).length || 0})</button>
                  <button style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 11, fontWeight: 600, background: showClosed ? "#3B82F6" : "transparent", color: showClosed ? "#fff" : "#94A3B8" }} onClick={() => setShowClosed(true)}>Closed ({data.opps?.filter(o => o.isClosed).length || 0})</button>
                </div>

                {(data.opps || []).filter(o => showClosed ? o.isClosed : !o.isClosed).map((opp, i) => (
                  <div key={i} style={{ background: "#1E293B", borderRadius: 8, padding: "12px 14px", marginBottom: 6, border: "1px solid #334155", borderLeft: `3px solid ${opp.isWon ? "#10B981" : opp.isClosed ? "#EF4444" : "#3B82F6"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{opp.name}</div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>{opp.stage} · Close: {opp.closeDate} · {opp.probability}%</div>
                        {opp.nextStep !== "—" && <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>Next: {opp.nextStep}</div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{fmt(opp.amount)}</div>
                        <div style={{ fontSize: 10, color: "#64748B" }}>{opp.forecast}</div>
                      </div>
                    </div>
                    {/* Action buttons */}
                    {!opp.isClosed && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8, paddingTop: 8, borderTop: "1px solid #334155" }}>
                        {onScoreDeal && <button style={{ padding: "3px 10px", borderRadius: 4, border: "1px solid #334155", background: "#8B5CF620", color: "#8B5CF6", cursor: "pointer", fontSize: 10, fontWeight: 600 }} onClick={() => onScoreDeal(opp.id, opp.name)}>Score</button>}
                        {onDeepIntel && <button style={{ padding: "3px 10px", borderRadius: 4, border: "1px solid #334155", background: "#3B82F620", color: "#3B82F6", cursor: "pointer", fontSize: 10, fontWeight: 600 }} onClick={() => onDeepIntel(opp.id, opp.name, accountName)}>Deep Intel</button>}
                        {onEmailDeal && <button style={{ padding: "3px 10px", borderRadius: 4, border: "1px solid #334155", background: "#10B98120", color: "#10B981", cursor: "pointer", fontSize: 10, fontWeight: 600 }} onClick={() => onEmailDeal(opp.id, opp.name)}>Email</button>}
                      </div>
                    )}
                  </div>
                ))}

                {(data.opps || []).filter(o => showClosed ? o.isClosed : !o.isClosed).length === 0 && (
                  <div style={{ textAlign: "center", padding: 30, color: "#64748B", fontSize: 12 }}>No {showClosed ? "closed" : "open"} deals</div>
                )}
              </>
            )}

            {/* PEOPLE TAB */}
            {tab === "people" && (
              <>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 10, textTransform: "uppercase", fontWeight: 700 }}>
                  {data.contacts?.length || 0} contacts in SFDC
                </div>
                {(data.contacts || []).map((c, i) => (
                  <div key={i} style={{ background: "#1E293B", borderRadius: 6, padding: "10px 12px", marginBottom: 4, border: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{c.title}</div>
                      {c.email && <div style={{ fontSize: 10, color: "#3B82F6" }}>{c.email}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {c.phone && <div style={{ fontSize: 10, color: "#94A3B8" }}>{c.phone}</div>}
                      <div style={{ fontSize: 10, color: "#64748B" }}>Last: {c.lastActivity}</div>
                      <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: c.source === "SFDC" ? "#3B82F620" : "#F59E0B20", color: c.source === "SFDC" ? "#3B82F6" : "#F59E0B" }}>{c.source}</span>
                    </div>
                  </div>
                ))}

                {(data.contacts || []).length === 0 && (
                  <div style={{ textAlign: "center", padding: 30, color: "#64748B", fontSize: 12 }}>No contacts found</div>
                )}
              </>
            )}

            {/* ACTIVITY TAB */}
            {tab === "activity" && (
              <>
                {timelineLoading && (
                  <div style={{ textAlign: "center", padding: 30, color: "#8B5CF6" }}>Loading unified timeline...</div>
                )}
                {timeline && (
                  <ActivityFeed timeline={timeline.timeline || []} sources={timeline.sources} typeColor={typeColor} typeIcon={typeIcon} />
                )}
                {!timelineLoading && !timeline && (
                  <div style={{ textAlign: "center", padding: 30, color: "#64748B", fontSize: 12 }}>No activity data</div>
                )}
              </>
            )}

            {/* DOCUMENTS TAB */}
            {tab === "documents" && (
              <>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 10 }}>{data.documents?.length || 0} files found on Google Drive</div>
                {(data.documents || []).map((doc, i) => (
                  <a key={i} href={doc.link} target="_blank" rel="noreferrer" style={{ display: "block", background: "#1E293B", borderRadius: 6, padding: "10px 12px", marginBottom: 4, textDecoration: "none", border: "1px solid #334155", borderLeft: `3px solid ${doc.type?.includes("document") ? "#3B82F6" : doc.type?.includes("spreadsheet") ? "#10B981" : doc.type?.includes("presentation") ? "#F59E0B" : "#64748B"}` }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9" }}>{doc.name}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>{doc.owner} · Modified: {doc.modified}</div>
                  </a>
                ))}
                {(data.documents || []).length === 0 && (
                  <div style={{ textAlign: "center", padding: 30, color: "#64748B", fontSize: 12 }}>No documents found on Drive</div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Inline sub-component for the activity feed (used in Activity tab)
function ActivityFeed({ timeline, sources, typeColor, typeIcon }) {
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all" ? timeline : timeline.filter(t => t.type === filter);

  // Group by date
  const grouped = {};
  filtered.forEach(item => {
    const key = item.date || "Unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  return (
    <>
      {/* Source counts */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: "#3B82F620", color: "#3B82F6" }}>Gmail: {sources?.gmail || 0}</span>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: "#F59E0B20", color: "#F59E0B" }}>Calendar: {sources?.calendar || 0}</span>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: "#8B5CF620", color: "#8B5CF6" }}>Chorus: {sources?.chorus || 0}</span>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: "#64748B20", color: "#64748B" }}>SFDC: {sources?.sfdc || 0}</span>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {[["all", "All"], ["email", "Email"], ["meeting", "Meeting"], ["call", "Call"], ["task", "Task"]].map(([k, l]) => (
          <button key={k} style={{ padding: "3px 10px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 10, fontWeight: 600, background: filter === k ? (typeColor[k] || "#10B981") : "transparent", color: filter === k ? "#fff" : "#94A3B8" }} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      {/* Timeline feed */}
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 6, padding: "2px 0", borderBottom: "1px solid #1E293B" }}>{date}</div>
          {items.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid #1E293B10" }}>
              <div style={{ fontSize: 14, width: 20, textAlign: "center", flexShrink: 0 }}>{typeIcon[item.type] || "-"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: (typeColor[item.type] || "#64748B") + "20", color: typeColor[item.type] || "#64748B", textTransform: "uppercase" }}>{item.type}</span>
                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#334155", color: "#94A3B8" }}>{item.source}</span>
                  {item.direction && <span style={{ fontSize: 9, color: item.direction === "inbound" ? "#10B981" : "#64748B" }}>{item.direction}</span>}
                  {item.time && <span style={{ fontSize: 9, color: "#64748B", marginLeft: "auto" }}>{item.time}</span>}
                </div>
                <div style={{ fontSize: 12, color: "#F1F5F9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.subject}</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>{item.from}</div>
              </div>
            </div>
          ))}
        </div>
      ))}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 20, color: "#64748B", fontSize: 12 }}>No activity found</div>
      )}
    </>
  );
}
