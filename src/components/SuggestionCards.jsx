import { useState, useEffect } from "react";

const fmt = (n) => "$" + (n || 0).toLocaleString();
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");

const triggerConfig = {
  time_based: { icon: "⏰", color: "#F59E0B", bg: "#F59E0B15", label: "Time" },
  context_based: { icon: "🔍", color: "#3B82F6", bg: "#3B82F615", label: "Context" },
  event_based: { icon: "📅", color: "#10B981", bg: "#10B98115", label: "Event" },
  pattern_based: { icon: "📊", color: "#8B5CF6", bg: "#8B5CF615", label: "Pattern" },
};

const priorityConfig = {
  urgent: { color: "#EF4444", bg: "#EF444420", border: "#EF4444" },
  high: { color: "#F59E0B", bg: "#F59E0B20", border: "#F59E0B" },
  medium: { color: "#3B82F6", bg: "#3B82F620", border: "#3B82F6" },
  low: { color: "#64748B", bg: "#64748B20", border: "#64748B" },
};

export default function SuggestionCards({ onAction, onDismiss, onScoreDeal, onEmailDeal, onDelegateDeal }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(new Set());
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch("/.netlify/functions/proactive-suggestions")
      .then(r => r.json())
      .then(d => { if (d.suggestions) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 30, color: "#8B5CF6", fontSize: 13 }}>Analyzing pipeline for suggestions...</div>;
  if (!data?.suggestions?.length) return <div style={{ textAlign: "center", padding: 30, color: "#64748B", fontSize: 13 }}>No suggestions right now. Your pipeline is clean.</div>;

  const suggestions = data.suggestions.filter(s => !dismissed.has(s.id));
  const filtered = filter === "all" ? suggestions : suggestions.filter(s => s.priority === filter);

  const handleDismiss = (id) => {
    setDismissed(prev => new Set([...prev, id]));
    onDismiss?.(id);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>Proactive Suggestions</div>
          <div style={{ fontSize: 11, color: "#64748B" }}>
            AI-detected actions based on pipeline analysis ·{" "}
            {data.counts?.urgent > 0 && <span style={{ color: "#EF4444" }}>{data.counts.urgent} urgent</span>}
            {data.counts?.urgent > 0 && data.counts?.high > 0 && " · "}
            {data.counts?.high > 0 && <span style={{ color: "#F59E0B" }}>{data.counts.high} high</span>}
          </div>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {[
          { key: "all", label: `All (${suggestions.length})` },
          { key: "urgent", label: `Urgent (${suggestions.filter(s => s.priority === "urgent").length})`, color: "#EF4444" },
          { key: "high", label: `High (${suggestions.filter(s => s.priority === "high").length})`, color: "#F59E0B" },
          { key: "medium", label: `Medium (${suggestions.filter(s => s.priority === "medium").length})`, color: "#3B82F6" },
        ].map(f => (
          <button key={f.key} style={{
            padding: "4px 10px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer",
            fontSize: 11, fontWeight: 600,
            background: filter === f.key ? (f.color || "#10B981") : "transparent",
            color: filter === f.key ? "#fff" : "#94A3B8",
          }} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      {/* Cards */}
      {filtered.map(s => {
        const tc = triggerConfig[s.type] || triggerConfig.context_based;
        const pc = priorityConfig[s.priority] || priorityConfig.medium;
        const isExpanded = expanded === s.id;

        return (
          <div key={s.id} style={{
            background: "#1E293B", borderRadius: 8, padding: "12px 16px", marginBottom: 6,
            border: `1px solid ${pc.border}30`, borderLeft: `3px solid ${pc.border}`,
            cursor: "pointer", transition: "all .15s",
          }} onClick={() => setExpanded(isExpanded ? null : s.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }}>{tc.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: tc.bg, color: tc.color }}>{tc.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: pc.bg, color: pc.color }}>{s.priority}</span>
                  {s.score && <span style={{ fontSize: 10, color: "#64748B" }}>Score: {s.score}</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{s.title}</div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{s.description}</div>
              </div>
              {s.amount > 0 && (
                <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginLeft: 12, whiteSpace: "nowrap" }}>{fmt(s.amount)}</div>
              )}
            </div>

            {isExpanded && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #334155" }} onClick={e => e.stopPropagation()}>
                <div style={{ background: "#0F172A", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#CBD5E1", lineHeight: 1.5, marginBottom: 10 }}>
                  {strip(s.action)}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {s.oppId && onScoreDeal && (
                    <button style={btn("#8B5CF6")} onClick={() => onScoreDeal({ oppId: s.oppId, oppName: s.title })}>Score Deal</button>
                  )}
                  {s.oppId && onEmailDeal && (
                    <button style={btn("#3B82F6")} onClick={() => onEmailDeal({ id: `opp-${s.oppId}`, title: s.title, subtitle: s.description })}>AI Email</button>
                  )}
                  {s.oppId && onDelegateDeal && (
                    <button style={btn("#06B6D4")} onClick={() => onDelegateDeal({ id: `opp-${s.oppId}`, title: s.title, subtitle: s.description, suggestedAction: s.action })}>Delegate</button>
                  )}
                  {s.oppId && (
                    <a href={`https://skaled.my.salesforce.com/${s.oppId}`} target="_blank" rel="noreferrer" style={{ ...btn("#00A1E0"), textDecoration: "none" }}>SFDC</a>
                  )}
                  <button style={btn("#10B981")} onClick={() => { handleDismiss(s.id); onAction?.(s); }}>Done</button>
                  <button style={btn("#334155")} onClick={() => handleDismiss(s.id)}>Dismiss</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const btn = (bg) => ({
  padding: "5px 12px", borderRadius: 5, border: "none", cursor: "pointer",
  fontSize: 11, fontWeight: 600, background: bg, color: "#fff",
});
