import { useState, useEffect } from "react";

const fmt = (n) => "$" + (n || 0).toLocaleString();
const CAT_COLORS = { "Commit": "#3B82F6", "Best Case": "#F59E0B", "Pipeline": "#8B5CF6", "Omitted": "#64748B", "No Category": "#475569" };
const CAT_BG = { "Commit": "#3B82F620", "Best Case": "#F59E0B20", "Pipeline": "#8B5CF620", "Omitted": "#64748B20", "No Category": "#47556920" };

export default function PipelineDetail({ onClose, onEditOpp, onInspectOpp }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState("category"); // category | stage | timeline | health
  const [expandedCat, setExpandedCat] = useState(null);
  const [expandedDeal, setExpandedDeal] = useState(null);

  useEffect(() => {
    fetch("/.netlify/functions/pipeline-detail")
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ padding: 60, textAlign: "center", color: "#64748B" }}>
          <div style={{ fontSize: 16, marginBottom: 8, color: "#8B5CF6", fontWeight: 600 }}>Building pipeline view...</div>
          <div style={{ fontSize: 12 }}>Pulling all opportunities from Salesforce</div>
        </div>
      </div>
    </div>
  );

  if (!data) return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ padding: 40, textAlign: "center", color: "#EF4444" }}>Failed to load pipeline data</div>
      </div>
    </div>
  );

  const s = data.summary;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={header}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>Pipeline</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{s.totalDeals} deals · {s.quarterLabel}</div>
          </div>
          <button style={closeBtn} onClick={onClose}>x</button>
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, padding: "12px 20px" }}>
          <SummaryCard label="Total Pipeline" value={fmt(s.totalPipeline)} color="#F1F5F9" />
          <SummaryCard label="Weighted" value={fmt(s.totalWeighted)} color="#10B981" />
          <SummaryCard label="Avg Deal Size" value={fmt(s.avgDealSize)} color="#3B82F6" />
          <SummaryCard label="Win Rate (90d)" value={`${s.winRate}%`} sub={`${s.wonCount}W / ${s.lostCount}L`} color={s.winRate >= 40 ? "#10B981" : "#F59E0B"} />
        </div>

        {/* Health warnings */}
        {(s.pastDueCount > 0 || s.noAmount > 0 || s.noCategory > 0) && (
          <div style={{ display: "flex", gap: 8, padding: "0 20px 12px", flexWrap: "wrap" }}>
            {s.pastDueCount > 0 && <WarningBadge text={`${s.pastDueCount} past due`} color="#EF4444" />}
            {s.noAmount > 0 && <WarningBadge text={`${s.noAmount} no amount`} color="#F59E0B" />}
            {s.noCategory > 0 && <WarningBadge text={`${s.noCategory} no forecast category`} color="#F59E0B" />}
            <span style={{ fontSize: 11, color: "#64748B", display: "flex", alignItems: "center" }}>Avg age: {s.avgAge}d</span>
          </div>
        )}

        {/* View tabs */}
        <div style={{ display: "flex", gap: 2, padding: "0 20px 12px" }}>
          {[
            ["category", "By Forecast"],
            ["stage", "By Stage"],
            ["timeline", "Timeline"],
            ["health", "Won/Lost"],
          ].map(([key, label]) => (
            <button key={key} style={{
              padding: "6px 14px", borderRadius: 6, border: "1px solid #334155", cursor: "pointer",
              fontSize: 12, fontWeight: 600,
              background: activeView === key ? "#10B981" : "transparent",
              color: activeView === key ? "#fff" : "#94A3B8",
            }} onClick={() => setActiveView(key)}>{label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: "0 20px 20px", maxHeight: "50vh", overflowY: "auto" }}>

          {/* BY FORECAST CATEGORY */}
          {activeView === "category" && data.categories.map(cat => {
            const isExpanded = expandedCat === cat.name;
            const pct = s.totalPipeline > 0 ? Math.round((cat.total / s.totalPipeline) * 100) : 0;
            const color = CAT_COLORS[cat.name] || "#64748B";
            return (
              <div key={cat.name} style={{ marginBottom: 8 }}>
                {/* Category bar */}
                <div style={{
                  background: "#1E293B", borderRadius: 8, padding: "12px 16px", cursor: "pointer",
                  border: `1px solid ${isExpanded ? color : "#334155"}`,
                }} onClick={() => setExpandedCat(isExpanded ? null : cat.name)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color }}>{cat.name}</span>
                      <span style={{ fontSize: 11, color: "#64748B" }}>{cat.count} deal{cat.count !== 1 ? "s" : ""}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>{fmt(cat.total)}</div>
                        <div style={{ fontSize: 10, color: "#64748B" }}>Weighted: {fmt(Math.round(cat.weighted))}</div>
                      </div>
                      <span style={{ color: "#64748B", fontSize: 14, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ background: "#0F172A", borderRadius: 4, height: 8, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, minWidth: pct > 0 ? 4 : 0, transition: "width .3s" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#64748B", marginTop: 4 }}>{pct}% of pipeline</div>
                </div>

                {/* Expanded deal list */}
                {isExpanded && (
                  <div style={{ marginTop: 4, marginLeft: 12 }}>
                    {cat.deals.map(deal => (
                      <DealRow key={deal.id} deal={deal} expanded={expandedDeal === deal.id}
                        onToggle={() => setExpandedDeal(expandedDeal === deal.id ? null : deal.id)}
                        onEdit={onEditOpp} onInspect={onInspectOpp} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* BY STAGE */}
          {activeView === "stage" && data.stages.map(stage => {
            const pct = s.totalPipeline > 0 ? Math.round((stage.total / s.totalPipeline) * 100) : 0;
            return (
              <div key={stage.name} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{ width: 130, fontSize: 12, color: "#CBD5E1", fontWeight: 500, flexShrink: 0 }}>{stage.name}</div>
                <div style={{ flex: 1, background: "#0F172A", borderRadius: 4, height: 24, overflow: "hidden", position: "relative" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "#3B82F6", borderRadius: 4, minWidth: pct > 0 ? 4 : 0, transition: "width .3s" }} />
                  <span style={{ position: "absolute", right: 8, top: 4, fontSize: 10, color: "#94A3B8" }}>{pct}%</span>
                </div>
                <div style={{ width: 90, textAlign: "right", fontSize: 13, color: "#F1F5F9", fontWeight: 600 }}>{fmt(stage.total)}</div>
                <div style={{ width: 40, textAlign: "right", fontSize: 11, color: "#64748B" }}>{stage.count}</div>
              </div>
            );
          })}

          {/* TIMELINE */}
          {activeView === "timeline" && (
            <div>
              {data.months.map(m => {
                const pct = s.totalPipeline > 0 ? Math.round((m.total / s.totalPipeline) * 100) : 0;
                const isPast = m.month < new Date().toISOString().substring(0, 7);
                return (
                  <div key={m.month} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <div style={{ width: 80, fontSize: 12, color: isPast ? "#EF4444" : "#CBD5E1", fontWeight: 600, flexShrink: 0 }}>
                      {m.month}{isPast ? " ⚠" : ""}
                    </div>
                    <div style={{ flex: 1, background: "#0F172A", borderRadius: 4, height: 28, overflow: "hidden", display: "flex" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: isPast ? "#EF444480" : "#10B981", borderRadius: 4, minWidth: pct > 0 ? 4 : 0 }} />
                    </div>
                    <div style={{ width: 90, textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{fmt(m.total)}</div>
                      <div style={{ fontSize: 10, color: "#64748B" }}>{m.count} deal{m.count !== 1 ? "s" : ""}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* WON/LOST */}
          {activeView === "health" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div style={{ background: "#10B98120", borderRadius: 8, padding: 16, textAlign: "center", border: "1px solid #10B98140" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#10B981" }}>{fmt(s.wonAmount)}</div>
                  <div style={{ fontSize: 12, color: "#10B981", marginTop: 2 }}>{s.wonCount} Won (90d)</div>
                </div>
                <div style={{ background: "#EF444420", borderRadius: 8, padding: 16, textAlign: "center", border: "1px solid #EF444440" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#EF4444" }}>{fmt(s.lostAmount)}</div>
                  <div style={{ fontSize: 12, color: "#EF4444", marginTop: 2 }}>{s.lostCount} Lost (90d)</div>
                </div>
              </div>
              <div style={{ background: "#1E293B", borderRadius: 8, padding: 16, textAlign: "center", border: "1px solid #334155" }}>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8, textTransform: "uppercase" }}>Win Rate</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
                  <div style={{ fontSize: 48, fontWeight: 800, color: s.winRate >= 40 ? "#10B981" : s.winRate >= 25 ? "#F59E0B" : "#EF4444" }}>
                    {s.winRate}%
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ background: "#0F172A", borderRadius: 6, width: 200, height: 12, overflow: "hidden" }}>
                      <div style={{ width: `${s.winRate}%`, height: "100%", background: "#10B981", borderRadius: 6 }} />
                    </div>
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>
                      {s.wonCount + s.lostCount} decisions · last 90 days
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function SummaryCard({ label, value, sub, color }) {
  return (
    <div style={{ background: "#1E293B", borderRadius: 8, padding: "10px 12px", textAlign: "center", border: "1px solid #334155" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#64748B", marginTop: 2, textTransform: "uppercase" }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function WarningBadge({ text, color }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4, background: color + "20", color }}>
      {text}
    </span>
  );
}

function DealRow({ deal, expanded, onToggle, onEdit, onInspect }) {
  const btn = (bg) => ({
    padding: "4px 10px", borderRadius: 4, border: "none", cursor: "pointer",
    fontSize: 11, fontWeight: 600, background: bg, color: "#fff",
  });
  return (
    <div style={{
      background: "#0F172A", borderRadius: 6, padding: "10px 14px", marginBottom: 4,
      border: deal.pastDue ? "1px solid #EF444440" : "1px solid #1E293B", cursor: "pointer",
    }} onClick={onToggle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{deal.name}</div>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>{deal.account} · {deal.stage} · Close: {deal.closeDate}{deal.pastDue ? " ⚠ PAST DUE" : ""}</div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9", marginLeft: 12 }}>{fmt(deal.amount)}</div>
      </div>
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1E293B" }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8, fontSize: 11 }}>
            <div><span style={{ color: "#64748B" }}>Source:</span> <span style={{ color: "#CBD5E1" }}>{deal.source}</span></div>
            <div><span style={{ color: "#64748B" }}>Prob:</span> <span style={{ color: "#CBD5E1" }}>{deal.probability}%</span></div>
            <div><span style={{ color: "#64748B" }}>Age:</span> <span style={{ color: "#CBD5E1" }}>{deal.daysInPipeline}d</span></div>
            <div><span style={{ color: "#64748B" }}>Owner:</span> <span style={{ color: "#CBD5E1" }}>{deal.owner}</span></div>
            <div><span style={{ color: "#64748B" }}>Last Activity:</span> <span style={{ color: "#CBD5E1" }}>{deal.lastActivity}</span></div>
            <div><span style={{ color: "#64748B" }}>Next Step:</span> <span style={{ color: "#CBD5E1" }}>{deal.nextStep}</span></div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <a href={`https://skaled.my.salesforce.com/${deal.id}`} target="_blank" rel="noreferrer" style={{ ...btn("#00A1E0"), textDecoration: "none" }}>SFDC</a>
            {onInspect && <button style={btn("#10B981")} onClick={() => onInspect({ oppId: deal.id, oppName: deal.name })}>Inspect</button>}
            {onEdit && <button style={btn("#F59E0B")} onClick={() => onEdit(deal.id)}>Edit</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const overlay = {
  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
  background: "rgba(0,0,0,0.7)", zIndex: 2000,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const modal = {
  background: "#0F172A", borderRadius: 16, width: 750, maxWidth: "95vw",
  border: "1px solid #334155", boxShadow: "0 12px 50px rgba(0,0,0,0.6)",
  maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column",
};

const header = {
  padding: "18px 20px 14px", borderBottom: "1px solid #1E293B",
  display: "flex", justifyContent: "space-between", alignItems: "center",
  flexShrink: 0,
};

const closeBtn = {
  background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 22, padding: 4,
};
