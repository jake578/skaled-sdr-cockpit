import { useState, useEffect } from "react";

const fmt = (n) => "$" + (n || 0).toLocaleString();
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");
const categoryColors = { "Closed": "#10B981", "Commit": "#3B82F6", "Best Case": "#F59E0B", "Pipeline": "#8B5CF6", "Omitted": "#64748B" };
const STAGE_COLORS = {
  Prospecting: "#3B82F6", Qualification: "#06B6D4", "Needs Analysis": "#8B5CF6",
  "Value Proposition": "#A855F7", "Proposal/Price Quote": "#F97316",
  "Negotiation/Review": "#EF4444", "Closed Won": "#10B981", "Closed Lost": "#64748B",
};

function formatDate(d) {
  if (!d || d === "—") return "—";
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return d; }
}

function isPastDue(closeDate) {
  if (!closeDate || closeDate === "—") return false;
  return new Date(closeDate) < new Date();
}

function BarChart({ data, labelKey, valueKey, maxH = 120, color = "#3B82F6", onBarClick }) {
  const [hoveredBar, setHoveredBar] = useState(null);
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: maxH }}>
      {data.map((d, i) => {
        const h = ((d[valueKey] || 0) / max) * maxH;
        const isHovered = hoveredBar === i;
        return (
          <div
            key={i}
            onClick={() => onBarClick?.(d)}
            onMouseEnter={() => setHoveredBar(i)}
            onMouseLeave={() => setHoveredBar(null)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1,
              cursor: onBarClick ? "pointer" : "default",
              transform: isHovered ? "translateY(-2px)" : "translateY(0)",
              transition: "all .15s",
            }}
          >
            <div style={{ fontSize: 10, color: isHovered ? "#F1F5F9" : "#94A3B8", whiteSpace: "nowrap", fontWeight: isHovered ? 700 : 400 }}>{fmt(d[valueKey])}</div>
            <div style={{
              width: "100%", height: Math.max(h, 2), borderRadius: 4,
              background: isHovered ? color : `${color}CC`,
              minWidth: 20, transition: "all .15s",
              boxShadow: isHovered ? `0 4px 12px ${color}40` : "none",
            }} />
            <div style={{ fontSize: 10, color: "#64748B", whiteSpace: "nowrap" }}>{d[labelKey]}</div>
            {isHovered && d.count !== undefined && (
              <div style={{ fontSize: 9, color: color, fontWeight: 600 }}>{d.count} deals</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DealListPanel({ title, deals, onClose, onDealClick, onWinLoss }) {
  const [expandedDeal, setExpandedDeal] = useState(null);
  const [hoveredDeal, setHoveredDeal] = useState(null);
  const total = deals.reduce((s, d) => s + (d.amount || d.Amount || 0), 0);

  return (
    <div style={{
      background: "#0F172A", borderRadius: 10, padding: "14px 16px",
      border: "1px solid #334155", marginTop: 12, maxHeight: 400, display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9" }}>{title}</div>
          <div style={{ fontSize: 11, color: "#64748B" }}>{deals.length} deals · {fmt(total)}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 16 }}>x</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {deals.map((deal, i) => {
          const isExpanded = expandedDeal === i;
          const amount = deal.amount || deal.Amount || 0;
          const name = deal.name || deal.Name || "—";
          const account = deal.account || deal.Account?.Name || "—";
          const stage = deal.stage || deal.StageName || "—";
          const closeDate = deal.closeDate || deal.CloseDate || "—";
          const fc = deal.forecastCategory || deal.Group_Forecast_Category__c || "—";
          const pastDue = isPastDue(closeDate);

          return (
            <div key={i}>
              <div
                onMouseEnter={() => setHoveredDeal(i)}
                onMouseLeave={() => setHoveredDeal(null)}
                onClick={() => setExpandedDeal(isExpanded ? null : i)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                  background: hoveredDeal === i ? "#1E293B" : "transparent",
                  borderBottom: "1px solid #1E293B", cursor: "pointer",
                  borderLeft: pastDue ? "3px solid #EF4444" : "3px solid transparent",
                  transition: "all .1s",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {strip(name)}
                  </div>
                  <div style={{ fontSize: 10, color: "#64748B", marginTop: 1 }}>
                    {account} · {stage}
                    {pastDue && <span style={{ color: "#EF4444", fontWeight: 600, marginLeft: 4 }}>PAST DUE</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div
                    style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9", cursor: "pointer" }}
                    onClick={(e) => { e.stopPropagation(); onDealClick?.(deal); }}
                  >{fmt(amount)}</div>
                  <span style={{
                    fontSize: 9, padding: "1px 5px", borderRadius: 2, fontWeight: 600,
                    background: (categoryColors[fc] || "#64748B") + "20",
                    color: categoryColors[fc] || "#64748B",
                  }}>{fc}</span>
                </div>
              </div>
              {isExpanded && (
                <div style={{ padding: "8px 10px 8px 20px", background: "#1E293B", borderBottom: "1px solid #334155" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    {[
                      { l: "Close", v: formatDate(closeDate) },
                      { l: "Prob", v: `${deal.probability || deal.Probability || 0}%` },
                      { l: "Source", v: deal.source || deal.LeadSource || "—" },
                    ].map((s, j) => (
                      <span key={j} style={{ background: "#0F172A", borderRadius: 3, padding: "2px 6px", fontSize: 10, border: "1px solid #334155" }}>
                        <span style={{ color: "#64748B" }}>{s.l}: </span>
                        <span style={{ color: "#E2E8F0", fontWeight: 600 }}>{s.v}</span>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {onDealClick && <button onClick={(e) => { e.stopPropagation(); onDealClick(deal); }} style={actionBtnStyle("#3B82F6")}>Inspect</button>}
                    <button onClick={(e) => { e.stopPropagation(); window.open(`https://skaled.lightning.force.com/lightning/r/Opportunity/${deal.id || deal.Id}/view`, "_blank"); }} style={actionBtnStyle("#00A1E0")}>SFDC</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RevenueForecast({ onDealClick, onWinLoss, onCashFlow }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("overview");
  const [drillCategory, setDrillCategory] = useState(null);
  const [drillStage, setDrillStage] = useState(null);
  const [drillMonth, setDrillMonth] = useState(null);
  const [expandedDeal, setExpandedDeal] = useState(null);
  const [hoveredMetric, setHoveredMetric] = useState(null);
  const [hoveredCategory, setHoveredCategory] = useState(null);
  const [hoveredStage, setHoveredStage] = useState(null);
  const [compareLastQ, setCompareLastQ] = useState(false);

  useEffect(() => {
    fetch("/.netlify/functions/revenue-forecast")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60, color: "#64748B" }}>
      <div style={{ fontSize: 14, marginBottom: 8 }}>Building revenue forecast...</div>
    </div>
  );

  if (!data || data.error) return (
    <div style={{ textAlign: "center", padding: 40, color: "#64748B" }}>Connect Salesforce to view forecast</div>
  );

  const cardStyle = { background: "#1E293B", borderRadius: 8, padding: "16px", border: "1px solid #334155" };

  // Get deals for a specific category
  const dealsForCategory = (catName) => {
    if (!data.topDeals) return [];
    return data.topDeals.filter(d => d.forecastCategory === catName);
  };

  // Get deals for a specific stage
  const dealsForStage = (stageName) => {
    if (!data.topDeals) return [];
    return data.topDeals.filter(d => d.stage === stageName);
  };

  // Get deals for a specific month
  const dealsForMonth = (month) => {
    if (!data.topDeals) return [];
    return data.topDeals.filter(d => {
      if (!d.closeDate) return false;
      const m = new Date(d.closeDate).toLocaleString("en-US", { month: "short" });
      return m === month;
    });
  };

  return (
    <div>
      {/* View tabs + compare toggle */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, alignItems: "center" }}>
        {[["overview", "Overview"], ["monthly", "Monthly"], ["deals", "Top Deals"]].map(([key, label]) => (
          <button key={key} style={{
            padding: "6px 14px", borderRadius: 6, border: "1px solid #334155", cursor: "pointer",
            fontSize: 12, fontWeight: 600,
            background: view === key ? "#10B981" : "transparent", color: view === key ? "#fff" : "#94A3B8",
          }} onClick={() => { setView(key); setDrillCategory(null); setDrillStage(null); setDrillMonth(null); }}>{label}</button>
        ))}
        <span style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: "#94A3B8" }}>
          <input
            type="checkbox" checked={compareLastQ}
            onChange={() => setCompareLastQ(!compareLastQ)}
            style={{ accentColor: "#10B981" }}
          />
          Compare to last quarter
        </label>
        {onWinLoss && (
          <button onClick={onWinLoss} style={{
            padding: "5px 12px", borderRadius: 5, border: "1px solid #334155", cursor: "pointer",
            fontSize: 11, fontWeight: 600, background: "#F59E0B20", color: "#F59E0B",
          }}>Win/Loss Patterns</button>
        )}
      </div>

      {view === "overview" && (
        <div>
          {/* Key metrics - all clickable */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
            {[
              { label: "TOTAL PIPELINE", value: fmt(data.totalPipeline), sub: `${data.totalOpps} deals`, color: "#F1F5F9", action: () => onCashFlow?.() },
              { label: "WEIGHTED FORECAST", value: fmt(data.totalWeighted), sub: "Click for cash flow", color: "#10B981", action: () => onCashFlow?.() },
              { label: `${data.quarter.label} CLOSED`, value: fmt(data.quarter.closed), sub: `of ${fmt(data.quarter.weighted)} weighted`, color: "#3B82F6", action: () => setView("deals") },
              { label: "WIN RATE (90D)", value: `${data.winLoss.winRate}%`, sub: `${data.winLoss.won}W / ${data.winLoss.lost}L`, color: data.winLoss.winRate >= 40 ? "#10B981" : "#F59E0B", action: () => onWinLoss?.() },
            ].map((m, i) => (
              <div
                key={i}
                onMouseEnter={() => setHoveredMetric(i)}
                onMouseLeave={() => setHoveredMetric(null)}
                onClick={m.action}
                style={{
                  ...cardStyle, textAlign: "center", cursor: "pointer",
                  border: `1px solid ${hoveredMetric === i ? m.color + "60" : "#334155"}`,
                  transform: hoveredMetric === i ? "translateY(-2px)" : "translateY(0)",
                  transition: "all .15s",
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 700, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{m.label}</div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{m.sub}</div>
                {compareLastQ && data.lastQuarter && i < 2 && (
                  <div style={{ marginTop: 6, fontSize: 10, color: "#64748B" }}>
                    Last Q: {i === 0 ? fmt(data.lastQuarter.pipeline || 0) : fmt(data.lastQuarter.weighted || 0)}
                    {(() => {
                      const curr = i === 0 ? data.totalPipeline : data.totalWeighted;
                      const prev = i === 0 ? (data.lastQuarter.pipeline || 1) : (data.lastQuarter.weighted || 1);
                      const change = ((curr - prev) / prev * 100).toFixed(0);
                      return (
                        <span style={{ marginLeft: 4, color: change >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>
                          {change >= 0 ? "+" : ""}{change}%
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Forecast categories - clickable */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>Pipeline by Forecast Category</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {data.categories.map(cat => {
                const isHovered = hoveredCategory === cat.name;
                const isDrilled = drillCategory === cat.name;
                return (
                  <div
                    key={cat.name}
                    onMouseEnter={() => setHoveredCategory(cat.name)}
                    onMouseLeave={() => setHoveredCategory(null)}
                    onClick={() => setDrillCategory(isDrilled ? null : cat.name)}
                    style={{
                      flex: "1 1 150px", background: isHovered ? "#1E293B" : "#0F172A",
                      borderRadius: 8, padding: "12px 14px", cursor: "pointer",
                      borderLeft: `3px solid ${categoryColors[cat.name] || "#64748B"}`,
                      border: isDrilled ? `1px solid ${categoryColors[cat.name] || "#64748B"}` : "1px solid transparent",
                      borderLeftWidth: 3,
                      transition: "all .15s",
                      transform: isHovered ? "translateY(-1px)" : "translateY(0)",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: categoryColors[cat.name] || "#94A3B8" }}>{cat.name}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#F1F5F9", marginTop: 4, cursor: "pointer" }}>{fmt(cat.total)}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: "#64748B" }}>{cat.count} deals</span>
                      <span style={{ fontSize: 11, color: "#10B981" }}>Weighted: {fmt(cat.weighted)}</span>
                    </div>
                    {isHovered && <div style={{ fontSize: 10, color: "#64748B", marginTop: 4 }}>Click to see deals</div>}
                  </div>
                );
              })}
            </div>

            {/* Drill into category */}
            {drillCategory && (
              <DealListPanel
                title={`${drillCategory} Deals`}
                deals={dealsForCategory(drillCategory)}
                onClose={() => setDrillCategory(null)}
                onDealClick={onDealClick}
              />
            )}
          </div>

          {/* Stage breakdown - clickable bars */}
          <div style={{ ...cardStyle }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>Pipeline by Stage</div>
            {data.stages.map((stage, i) => {
              const pct = data.totalPipeline > 0 ? (stage.total / data.totalPipeline) * 100 : 0;
              const isHovered = hoveredStage === stage.name;
              const isDrilled = drillStage === stage.name;
              const stageColor = STAGE_COLORS[stage.name] || "#3B82F6";
              return (
                <div
                  key={i}
                  onMouseEnter={() => setHoveredStage(stage.name)}
                  onMouseLeave={() => setHoveredStage(null)}
                  onClick={() => setDrillStage(isDrilled ? null : stage.name)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, marginBottom: 8,
                    padding: "4px 8px", borderRadius: 6, cursor: "pointer",
                    background: isHovered ? "#0F172A" : "transparent",
                    border: isDrilled ? `1px solid ${stageColor}40` : "1px solid transparent",
                    transition: "all .1s",
                  }}
                >
                  <div style={{ width: 140, fontSize: 12, color: isHovered ? "#F1F5F9" : "#CBD5E1", fontWeight: isHovered ? 600 : 500 }}>{stage.name}</div>
                  <div style={{ flex: 1, background: "#0F172A", borderRadius: 4, height: 22, overflow: "hidden" }}>
                    <div style={{
                      width: `${pct}%`, height: "100%", background: stageColor,
                      borderRadius: 4, minWidth: pct > 0 ? 2 : 0,
                      transition: "all .3s",
                      opacity: isHovered ? 1 : 0.8,
                    }} />
                  </div>
                  <div style={{ width: 100, textAlign: "right", fontSize: 12, color: "#F1F5F9", fontWeight: 600 }}>{fmt(stage.total)}</div>
                  <div style={{ width: 50, textAlign: "right", fontSize: 11, color: "#64748B" }}>{stage.count}</div>
                </div>
              );
            })}

            {/* Drill into stage */}
            {drillStage && (
              <DealListPanel
                title={`${drillStage} Deals`}
                deals={dealsForStage(drillStage)}
                onClose={() => setDrillStage(null)}
                onDealClick={onDealClick}
              />
            )}
          </div>
        </div>
      )}

      {view === "monthly" && (
        <div>
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 16 }}>Monthly Pipeline</div>
            {data.monthlyData.length > 0 ? (
              <BarChart
                data={data.monthlyData}
                labelKey="month" valueKey="pipeline" color="#3B82F6"
                onBarClick={(d) => setDrillMonth(drillMonth === d.month ? null : d.month)}
              />
            ) : (
              <div style={{ color: "#64748B", textAlign: "center", padding: 20 }}>No monthly data</div>
            )}
            {drillMonth && (
              <DealListPanel
                title={`${drillMonth} Deals`}
                deals={dealsForMonth(drillMonth)}
                onClose={() => setDrillMonth(null)}
                onDealClick={onDealClick}
              />
            )}
          </div>
          <div style={{ ...cardStyle }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 16 }}>Monthly Weighted Forecast</div>
            {data.monthlyData.length > 0 ? (
              <BarChart data={data.monthlyData} labelKey="month" valueKey="weighted" color="#10B981" />
            ) : (
              <div style={{ color: "#64748B", textAlign: "center", padding: 20 }}>No monthly data</div>
            )}
          </div>

          {/* Quarterly comparison */}
          {compareLastQ && data.lastQuarter && (
            <div style={{ ...cardStyle, marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>Quarter-over-Quarter</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {[
                  { label: "Pipeline", curr: data.totalPipeline, prev: data.lastQuarter.pipeline || 0 },
                  { label: "Weighted", curr: data.totalWeighted, prev: data.lastQuarter.weighted || 0 },
                  { label: "Closed Won", curr: data.quarter.closed, prev: data.lastQuarter.closed || 0 },
                ].map((q, i) => {
                  const change = q.prev > 0 ? ((q.curr - q.prev) / q.prev * 100).toFixed(0) : "N/A";
                  return (
                    <div key={i} style={{ background: "#0F172A", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>{q.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{fmt(q.curr)}</div>
                      <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>vs {fmt(q.prev)}</div>
                      {change !== "N/A" && (
                        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2, color: change >= 0 ? "#10B981" : "#EF4444" }}>
                          {change >= 0 ? "+" : ""}{change}%
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {view === "deals" && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>Top 10 Deals by Amount</div>
          {data.topDeals.map((deal, i) => {
            const isExpanded = expandedDeal === i;
            const pastDue = isPastDue(deal.closeDate);
            return (
              <div key={deal.id || i}>
                <div
                  onClick={() => setExpandedDeal(isExpanded ? null : i)}
                  style={{
                    ...cardStyle, marginBottom: 8, display: "flex", alignItems: "center", gap: 14,
                    cursor: "pointer", transition: "all .15s",
                    borderLeft: pastDue ? "3px solid #EF4444" : `3px solid ${categoryColors[deal.forecastCategory] || "#64748B"}`,
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", background: i < 3 ? "#F59E0B20" : "#1E293B",
                    border: `1px solid ${i < 3 ? "#F59E0B" : "#334155"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 700, color: i < 3 ? "#F59E0B" : "#64748B",
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{deal.name}</span>
                      {pastDue && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 2, background: "#EF444420", color: "#EF4444", fontWeight: 700 }}>PAST DUE</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>{deal.account} · {deal.stage} · Close: {formatDate(deal.closeDate)}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div
                      style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9", cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); onDealClick?.(deal); }}
                      title="Click for actions"
                    >{fmt(deal.amount)}</div>
                    <div style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
                      background: (categoryColors[deal.forecastCategory] || "#64748B") + "20",
                      color: categoryColors[deal.forecastCategory] || "#64748B",
                      display: "inline-block",
                    }}>{deal.forecastCategory}</div>
                  </div>
                </div>

                {/* Expanded deal actions */}
                {isExpanded && (
                  <div style={{
                    background: "#0F172A", borderRadius: 8, padding: "12px 16px",
                    marginTop: -4, marginBottom: 12, border: "1px solid #334155",
                  }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                      {[
                        { l: "Probability", v: `${deal.probability || 0}%` },
                        { l: "Source", v: deal.source || deal.LeadSource || "—" },
                        { l: "Days Open", v: deal.daysInStage || "—" },
                        { l: "Weighted", v: fmt((deal.amount || 0) * (deal.probability || 0) / 100) },
                      ].map((s, j) => (
                        <span key={j} style={{ background: "#1E293B", borderRadius: 4, padding: "3px 8px", fontSize: 10, border: "1px solid #334155" }}>
                          <span style={{ color: "#64748B" }}>{s.l}: </span>
                          <span style={{ color: "#E2E8F0", fontWeight: 600 }}>{s.v}</span>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {onDealClick && <button onClick={() => onDealClick(deal)} style={actionBtnStyle("#3B82F6")}>Inspect</button>}
                      <button onClick={() => window.open(`https://skaled.lightning.force.com/lightning/r/Opportunity/${deal.id}/view`, "_blank")} style={actionBtnStyle("#00A1E0")}>Open SFDC</button>
                      {onCashFlow && <button onClick={() => onCashFlow(deal)} style={actionBtnStyle("#10B981")}>Cash Flow</button>}
                      {onWinLoss && <button onClick={() => onWinLoss()} style={actionBtnStyle("#F59E0B")}>Win/Loss</button>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
