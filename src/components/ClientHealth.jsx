import { useState, useEffect } from "react";

const fmt = (n) => "$" + (n || 0).toLocaleString();
const statusColors = { "Healthy": "#10B981", "Needs Attention": "#F59E0B", "At Risk": "#EF4444" };
const scoreColor = (s) => s >= 8 ? "#10B981" : s >= 5 ? "#F59E0B" : "#EF4444";

export default function ClientHealth() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score"); // score | revenue | activity
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch("/.netlify/functions/client-health")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

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
  if (sortBy === "score") clients.sort((a, b) => a.healthScore - b.healthScore);
  else if (sortBy === "revenue") clients.sort((a, b) => b.totalRevenue - a.totalRevenue);
  else if (sortBy === "activity") clients.sort((a, b) => a.daysSinceActivity - b.daysSinceActivity);

  const s = data.summary;

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total Clients", value: s.totalClients, color: "#F1F5F9" },
          { label: "Healthy", value: s.healthy, color: "#10B981" },
          { label: "Needs Attention", value: s.needsAttention, color: "#F59E0B" },
          { label: "At Risk", value: s.atRisk, color: "#EF4444" },
          { label: "Total Revenue", value: fmt(s.totalRevenue), color: "#F1F5F9" },
        ].map((card, i) => (
          <div key={i} style={{ background: "#1E293B", borderRadius: 8, padding: "12px 14px", textAlign: "center", border: "1px solid #334155" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 2, textTransform: "uppercase" }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Filters & Sort */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#64748B" }}>Filter:</span>
        {["all", "At Risk", "Needs Attention", "Healthy"].map(f => (
          <button key={f} style={{
            padding: "4px 12px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer",
            fontSize: 11, fontWeight: 600, textTransform: f === "all" ? "capitalize" : "none",
            background: filter === f ? (statusColors[f] || "#10B981") : "transparent",
            color: filter === f ? "#fff" : "#94A3B8",
          }} onClick={() => setFilter(f)}>{f === "all" ? "All" : f}</button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "#64748B" }}>Sort:</span>
        {[["score", "Health Score"], ["revenue", "Revenue"], ["activity", "Last Activity"]].map(([key, label]) => (
          <button key={key} style={{
            padding: "4px 12px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer",
            fontSize: 11, fontWeight: 600,
            background: sortBy === key ? "#334155" : "transparent", color: "#94A3B8",
          }} onClick={() => setSortBy(key)}>{label}</button>
        ))}
      </div>

      {/* Client cards */}
      {clients.map(client => {
        const isExpanded = expanded === client.id;
        return (
          <div key={client.id} style={{
            background: "#1E293B", borderRadius: 8, padding: "14px 16px", marginBottom: 8,
            border: "1px solid #334155", cursor: "pointer",
            borderLeft: `3px solid ${scoreColor(client.healthScore)}`,
          }} onClick={() => setExpanded(isExpanded ? null : client.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* Health score circle */}
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: scoreColor(client.healthScore) + "20",
                  border: `2px solid ${scoreColor(client.healthScore)}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 700, color: scoreColor(client.healthScore),
                }}>
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
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{fmt(client.totalRevenue)}</div>
                  <div style={{ fontSize: 10, color: "#64748B" }}>WON REVENUE</div>
                </div>
                <div style={{
                  padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: statusColors[client.status] + "20", color: statusColors[client.status],
                }}>{client.status}</div>
              </div>
            </div>

            {isExpanded && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #334155", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <div style={{ background: "#0F172A", borderRadius: 6, padding: 10, textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#3B82F6" }}>{client.meetingCount30d}</div>
                  <div style={{ fontSize: 10, color: "#64748B" }}>MEETINGS (30D)</div>
                </div>
                <div style={{ background: "#0F172A", borderRadius: 6, padding: 10, textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#8B5CF6" }}>{client.emailCount30d}</div>
                  <div style={{ fontSize: 10, color: "#64748B" }}>EMAILS (30D)</div>
                </div>
                <div style={{ background: "#0F172A", borderRadius: 6, padding: 10, textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: client.daysSinceActivity <= 7 ? "#10B981" : client.daysSinceActivity <= 14 ? "#F59E0B" : "#EF4444" }}>
                    {client.daysSinceActivity === 999 ? "—" : `${client.daysSinceActivity}d`}
                  </div>
                  <div style={{ fontSize: 10, color: "#64748B" }}>SINCE LAST TOUCH</div>
                </div>
                <div style={{ background: "#0F172A", borderRadius: 6, padding: 10, textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B" }}>{fmt(client.openPipeline)}</div>
                  <div style={{ fontSize: 10, color: "#64748B" }}>OPEN PIPELINE</div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
