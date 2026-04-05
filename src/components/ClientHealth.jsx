import { useState, useEffect, useMemo } from "react";

const fmt = (n) => "$" + (n || 0).toLocaleString();
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");
const statusColors = { "Healthy": "#10B981", "Needs Attention": "#F59E0B", "At Risk": "#EF4444" };
const scoreColor = (s) => s >= 8 ? "#10B981" : s >= 5 ? "#F59E0B" : "#EF4444";

function formatDate(d) {
  if (!d || d === "—") return "—";
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return d; }
}

function ScoreBreakdown({ client, onClose }) {
  const factors = [
    { label: "Meeting Frequency (30d)", value: client.meetingCount30d || 0, max: 10, weight: 25, score: Math.min((client.meetingCount30d || 0) / 4, 1) * 25 },
    { label: "Email Engagement (30d)", value: client.emailCount30d || 0, max: 20, weight: 25, score: Math.min((client.emailCount30d || 0) / 8, 1) * 25 },
    { label: "Days Since Activity", value: client.daysSinceActivity === 999 ? "None" : `${client.daysSinceActivity}d`, max: "0d", weight: 25, score: client.daysSinceActivity <= 7 ? 25 : client.daysSinceActivity <= 14 ? 18 : client.daysSinceActivity <= 30 ? 10 : 0 },
    { label: "Open Pipeline", value: fmt(client.openPipeline || 0), max: "Active", weight: 15, score: client.activeOpps > 0 ? 15 : client.openPipeline > 0 ? 10 : 0 },
    { label: "Contact Coverage", value: `${client.contactCount || 0} contacts`, max: "5+", weight: 10, score: Math.min((client.contactCount || 0) / 3, 1) * 10 },
  ];
  const totalScore = factors.reduce((s, f) => s + f.score, 0);
  const normalizedScore = Math.round(totalScore / 10);

  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      background: "#0F172A", borderRadius: 10, padding: "14px 16px",
      border: "1px solid #334155", marginTop: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9" }}>Health Score Breakdown</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 14 }}>x</button>
      </div>
      {factors.map((f, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: "#94A3B8" }}>{f.label}: <span style={{ color: "#E2E8F0", fontWeight: 600 }}>{f.value}</span></span>
            <span style={{ fontSize: 11, color: "#64748B" }}>{Math.round(f.score)}/{f.weight}</span>
          </div>
          <div style={{ height: 4, background: "#1E293B", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2, transition: "width .5s",
              width: `${(f.score / f.weight) * 100}%`,
              background: f.score / f.weight >= 0.7 ? "#10B981" : f.score / f.weight >= 0.4 ? "#F59E0B" : "#EF4444",
            }} />
          </div>
        </div>
      ))}
      <div style={{ borderTop: "1px solid #334155", paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8" }}>Computed Score</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: scoreColor(normalizedScore) }}>{normalizedScore}/10</span>
      </div>
    </div>
  );
}

export default function ClientHealth({ onAccount360, onEmail, onDeepIntel, onDealClick }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score");
  const [expanded, setExpanded] = useState(null);
  const [scoreBreakdown, setScoreBreakdown] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [hoveredCard, setHoveredCard] = useState(null);
  const [hoveredMetric, setHoveredMetric] = useState(null);
  const [clientOps, setClientOps] = useState({});
  const [clientEmails, setClientEmails] = useState({});
  const [clientContacts, setClientContacts] = useState({});
  const [loadingDetail, setLoadingDetail] = useState(null);

  useEffect(() => {
    fetch("/.netlify/functions/client-health")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Load detail data when expanding a client
  const loadClientDetail = async (client) => {
    if (clientOps[client.id]) return;
    setLoadingDetail(client.id);
    try {
      const res = await fetch("/.netlify/functions/unified-timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: client.name }),
      });
      const timeline = await res.json();
      if (timeline.timeline) {
        const emails = timeline.timeline.filter(t => t.type === "email").slice(0, 3);
        const contacts = timeline.timeline
          .map(t => t.contact).filter(Boolean).filter(c => c !== "—")
          .filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
        setClientEmails(prev => ({ ...prev, [client.id]: emails }));
        setClientContacts(prev => ({ ...prev, [client.id]: contacts }));
      }
    } catch {}
    setLoadingDetail(null);
  };

  const handleExpand = (clientId, client) => {
    const isOpen = expanded === clientId;
    setExpanded(isOpen ? null : clientId);
    if (!isOpen) loadClientDetail(client);
  };

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60, color: "#64748B" }}>
      <div style={{ fontSize: 14, marginBottom: 8 }}>Analyzing client health...</div>
      <div style={{ fontSize: 12 }}>Cross-referencing SFDC, Gmail, Calendar</div>
    </div>
  );

  if (!data || !data.clients) return (
    <div style={{ textAlign: "center", padding: 40, color: "#64748B" }}>Connect Salesforce to view client health</div>
  );

  let clients = [...data.clients];
  if (filter !== "all") clients = clients.filter(c => c.status === filter);
  if (searchText) {
    const q = searchText.toLowerCase();
    clients = clients.filter(c => c.name.toLowerCase().includes(q) || (c.industry || "").toLowerCase().includes(q));
  }
  if (sortBy === "score") clients.sort((a, b) => a.healthScore - b.healthScore);
  else if (sortBy === "revenue") clients.sort((a, b) => b.totalRevenue - a.totalRevenue);
  else if (sortBy === "activity") clients.sort((a, b) => a.daysSinceActivity - b.daysSinceActivity);
  else if (sortBy === "name") clients.sort((a, b) => a.name.localeCompare(b.name));

  const s = data.summary;
  const statusCounts = {
    "At Risk": data.clients.filter(c => c.status === "At Risk").length,
    "Needs Attention": data.clients.filter(c => c.status === "Needs Attention").length,
    "Healthy": data.clients.filter(c => c.status === "Healthy").length,
  };

  return (
    <div>
      {/* Summary cards - clickable */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total Clients", value: s.totalClients, color: "#F1F5F9", filterVal: "all" },
          { label: `Healthy (${statusCounts["Healthy"]})`, value: s.healthy, color: "#10B981", filterVal: "Healthy" },
          { label: `Needs Attention (${statusCounts["Needs Attention"]})`, value: s.needsAttention, color: "#F59E0B", filterVal: "Needs Attention" },
          { label: `At Risk (${statusCounts["At Risk"]})`, value: s.atRisk, color: "#EF4444", filterVal: "At Risk" },
          { label: "Total Revenue", value: fmt(s.totalRevenue), color: "#F1F5F9", filterVal: null },
        ].map((card, i) => (
          <div
            key={i}
            onMouseEnter={() => setHoveredMetric(i)}
            onMouseLeave={() => setHoveredMetric(null)}
            onClick={() => { if (card.filterVal !== null) setFilter(card.filterVal); }}
            style={{
              background: hoveredMetric === i ? "#2D3B4F" : "#1E293B",
              borderRadius: 8, padding: "12px 14px", textAlign: "center",
              border: `1px solid ${filter === card.filterVal ? card.color : "#334155"}`,
              cursor: card.filterVal !== null ? "pointer" : "default",
              transition: "all .15s",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color, cursor: "pointer" }}>{card.value}</div>
            <div style={{ fontSize: 10, color: "#64748B", marginTop: 2, textTransform: "uppercase" }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Filters, Sort & Search */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#64748B" }}>Filter:</span>
        {["all", "At Risk", "Needs Attention", "Healthy"].map(f => (
          <button key={f} style={{
            padding: "4px 12px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer",
            fontSize: 11, fontWeight: 600, textTransform: f === "all" ? "capitalize" : "none",
            background: filter === f ? (statusColors[f] || "#10B981") : "transparent",
            color: filter === f ? "#fff" : "#94A3B8",
          }} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f}
            {f !== "all" && <span style={{ marginLeft: 4, opacity: 0.7 }}>({statusCounts[f] || 0})</span>}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <input
          placeholder="Search clients..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{
            background: "#1E293B", border: "1px solid #334155", borderRadius: 6,
            padding: "5px 10px", color: "#E2E8F0", fontSize: 12, width: 160,
          }}
        />
        <span style={{ fontSize: 12, color: "#64748B" }}>Sort:</span>
        {[["score", "Health Score"], ["revenue", "Revenue"], ["activity", "Last Activity"], ["name", "Name"]].map(([key, label]) => (
          <button key={key} style={{
            padding: "4px 12px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer",
            fontSize: 11, fontWeight: 600,
            background: sortBy === key ? "#334155" : "transparent", color: "#94A3B8",
          }} onClick={() => setSortBy(key)}>{label}</button>
        ))}
      </div>

      {/* Client cards - fully interactive */}
      {clients.map(client => {
        const isExpanded = expanded === client.id;
        const isHovered = hoveredCard === client.id;
        const emails = clientEmails[client.id] || [];
        const contacts = clientContacts[client.id] || [];

        return (
          <div key={client.id} style={{
            background: isHovered ? "#243044" : "#1E293B", borderRadius: 10, padding: "14px 16px", marginBottom: 8,
            border: `1px solid ${isExpanded ? "#475569" : "#334155"}`, cursor: "pointer",
            borderLeft: `4px solid ${scoreColor(client.healthScore)}`,
            transition: "all .2s",
          }}
            onMouseEnter={() => setHoveredCard(client.id)}
            onMouseLeave={() => setHoveredCard(null)}
            onClick={() => handleExpand(client.id, client)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* Health score circle - clickable for breakdown */}
                <div
                  onClick={(e) => { e.stopPropagation(); setScoreBreakdown(scoreBreakdown === client.id ? null : client.id); }}
                  style={{
                    width: 42, height: 42, borderRadius: "50%",
                    background: scoreColor(client.healthScore) + "20",
                    border: `2px solid ${scoreColor(client.healthScore)}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, fontWeight: 700, color: scoreColor(client.healthScore),
                    cursor: "pointer", transition: "all .2s",
                    transform: scoreBreakdown === client.id ? "scale(1.1)" : "scale(1)",
                    boxShadow: scoreBreakdown === client.id ? `0 0 12px ${scoreColor(client.healthScore)}40` : "none",
                  }}
                  title="Click for score breakdown"
                >
                  {client.healthScore}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#F1F5F9" }}>{client.name}</div>
                  <div style={{ fontSize: 12, color: "#94A3B8" }}>
                    {client.industry} · {client.contactCount} contacts · {client.activeOpps} open opp{client.activeOpps !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, textAlign: "right" }}>
                <div>
                  <div
                    style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9", cursor: "pointer" }}
                    onClick={(e) => { e.stopPropagation(); onDealClick?.({ account: client.name }); }}
                    title="Click for pipeline details"
                  >{fmt(client.totalRevenue)}</div>
                  <div style={{ fontSize: 10, color: "#64748B" }}>WON REVENUE</div>
                </div>
                <div style={{
                  padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: statusColors[client.status] + "20", color: statusColors[client.status],
                }}>{client.status}</div>
                <div style={{
                  width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#64748B", fontSize: 10, transition: "transform .2s",
                  transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                }}>▼</div>
              </div>
            </div>

            {/* Score Breakdown */}
            {scoreBreakdown === client.id && (
              <ScoreBreakdown client={client} onClose={() => setScoreBreakdown(null)} />
            )}

            {isExpanded && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #334155" }}>
                {/* Stats row - all clickable */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ background: "#0F172A", borderRadius: 6, padding: 10, textAlign: "center", cursor: "pointer", border: "1px solid transparent", transition: "all .15s" }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = "#3B82F6"}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = "transparent"}
                  >
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#3B82F6" }}>{client.meetingCount30d}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>MEETINGS (30D)</div>
                  </div>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ background: "#0F172A", borderRadius: 6, padding: 10, textAlign: "center", cursor: "pointer", border: "1px solid transparent", transition: "all .15s" }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = "#8B5CF6"}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = "transparent"}
                  >
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#8B5CF6" }}>{client.emailCount30d}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>EMAILS (30D)</div>
                  </div>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ background: "#0F172A", borderRadius: 6, padding: 10, textAlign: "center", border: "1px solid transparent", transition: "all .15s" }}
                  >
                    <div style={{ fontSize: 20, fontWeight: 700, color: client.daysSinceActivity <= 7 ? "#10B981" : client.daysSinceActivity <= 14 ? "#F59E0B" : "#EF4444" }}>
                      {client.daysSinceActivity === 999 ? "—" : `${client.daysSinceActivity}d`}
                    </div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>SINCE LAST TOUCH</div>
                  </div>
                  <div
                    onClick={(e) => { e.stopPropagation(); onDealClick?.({ account: client.name }); }}
                    style={{ background: "#0F172A", borderRadius: 6, padding: 10, textAlign: "center", cursor: "pointer", border: "1px solid transparent", transition: "all .15s" }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = "#F59E0B"}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = "transparent"}
                  >
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#F59E0B" }}>{fmt(client.openPipeline)}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>OPEN PIPELINE</div>
                  </div>
                </div>

                {/* Open Opps for this client */}
                {client.opps && client.opps.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 6, textTransform: "uppercase" }}>Open Opportunities</div>
                    {client.opps.map((opp, i) => (
                      <div
                        key={i}
                        onClick={(e) => { e.stopPropagation(); onDealClick?.(opp); }}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "6px 10px", background: "#0F172A", borderRadius: 4,
                          marginBottom: 3, border: "1px solid #1E293B", cursor: "pointer",
                          transition: "all .1s",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = "#475569"}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = "#1E293B"}
                      >
                        <div>
                          <span style={{ fontSize: 12, color: "#E2E8F0", fontWeight: 500 }}>{strip(opp.name || opp.Name)}</span>
                          <span style={{ fontSize: 10, color: "#64748B", marginLeft: 6 }}>{opp.stage || opp.StageName}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#F1F5F9" }}>{fmt(opp.amount || opp.Amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recent Emails */}
                {emails.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 6, textTransform: "uppercase" }}>Recent Emails</div>
                    {emails.map((em, i) => (
                      <div key={i} style={{
                        padding: "5px 10px", background: "#0F172A", borderRadius: 4,
                        marginBottom: 3, border: "1px solid #1E293B", fontSize: 11,
                      }}>
                        <div style={{ color: "#E2E8F0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {strip(em.subject || "No subject")}
                        </div>
                        <div style={{ color: "#64748B", fontSize: 10, marginTop: 1 }}>
                          {em.from || "—"} · {formatDate(em.date)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Key Contacts */}
                {contacts.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 6, textTransform: "uppercase" }}>Key Contacts</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {contacts.map((c, i) => (
                        <span key={i} style={{
                          padding: "3px 8px", borderRadius: 4, fontSize: 11,
                          background: "#0F172A", color: "#CBD5E1", border: "1px solid #334155",
                        }}>{c}</span>
                      ))}
                    </div>
                  </div>
                )}

                {loadingDetail === client.id && (
                  <div style={{ fontSize: 11, color: "#64748B", padding: "8px 0" }}>Loading client details...</div>
                )}

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {onAccount360 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onAccount360({ accountId: client.id, accountName: client.name }); }}
                      style={actionBtnStyle("#EC4899")}
                    >Account 360</button>
                  )}
                  {onEmail && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEmail({ account: client.name, accountName: client.name }); }}
                      style={actionBtnStyle("#10B981")}
                    >AI Email</button>
                  )}
                  {onDeepIntel && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeepIntel({ accountName: client.name }); }}
                      style={actionBtnStyle("#8B5CF6")}
                    >Deep Intel</button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); window.open(`https://skaled.lightning.force.com/lightning/r/Account/${client.id}/view`, "_blank"); }}
                    style={actionBtnStyle("#00A1E0")}
                  >Open in SFDC</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {clients.length === 0 && (
        <div style={{ textAlign: "center", padding: 30, color: "#64748B", fontSize: 13 }}>
          No clients match your filters
        </div>
      )}
    </div>
  );
}

const actionBtnStyle = (color) => ({
  padding: "5px 12px", borderRadius: 5, border: "none", cursor: "pointer",
  fontSize: 11, fontWeight: 600, background: color + "20", color,
  transition: "all .15s",
});
