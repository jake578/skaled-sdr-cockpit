import { useState, useEffect } from "react";

const fmt = (n) => "$" + (n || 0).toLocaleString();
const categoryColors = { "Closed": "#10B981", "Commit": "#3B82F6", "Best Case": "#F59E0B", "Pipeline": "#8B5CF6", "Omitted": "#64748B" };

function BarChart({ data, labelKey, valueKey, maxH = 120, color = "#3B82F6" }) {
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: maxH }}>
      {data.map((d, i) => {
        const h = ((d[valueKey] || 0) / max) * maxH;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
            <div style={{ fontSize: 10, color: "#94A3B8", whiteSpace: "nowrap" }}>{fmt(d[valueKey])}</div>
            <div style={{ width: "100%", height: Math.max(h, 2), borderRadius: 4, background: color, minWidth: 20 }} />
            <div style={{ fontSize: 10, color: "#64748B", whiteSpace: "nowrap" }}>{d[labelKey]}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function RevenueForecast() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("overview"); // overview | monthly | deals

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

  return (
    <div>
      {/* View tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {[["overview", "Overview"], ["monthly", "Monthly"], ["deals", "Top Deals"]].map(([key, label]) => (
          <button key={key} style={{
            padding: "6px 14px", borderRadius: 6, border: "1px solid #334155", cursor: "pointer",
            fontSize: 12, fontWeight: 600,
            background: view === key ? "#10B981" : "transparent", color: view === key ? "#fff" : "#94A3B8",
          }} onClick={() => setView(key)}>{label}</button>
        ))}
      </div>

      {view === "overview" && (
        <div>
          {/* Key metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#F1F5F9" }}>{fmt(data.totalPipeline)}</div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>TOTAL PIPELINE</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{data.totalOpps} deals</div>
            </div>
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#10B981" }}>{fmt(data.totalWeighted)}</div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>WEIGHTED FORECAST</div>
            </div>
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#3B82F6" }}>{fmt(data.quarter.closed)}</div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{data.quarter.label} CLOSED</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>of {fmt(data.quarter.weighted)} weighted</div>
            </div>
            <div style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: data.winLoss.winRate >= 40 ? "#10B981" : "#F59E0B" }}>{data.winLoss.winRate}%</div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>WIN RATE (90D)</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{data.winLoss.won}W / {data.winLoss.lost}L</div>
            </div>
          </div>

          {/* Forecast categories */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>Pipeline by Forecast Category</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {data.categories.map(cat => (
                <div key={cat.name} style={{
                  flex: "1 1 150px", background: "#0F172A", borderRadius: 8, padding: "12px 14px",
                  borderLeft: `3px solid ${categoryColors[cat.name] || "#64748B"}`,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: categoryColors[cat.name] || "#94A3B8" }}>{cat.name}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#F1F5F9", marginTop: 4 }}>{fmt(cat.total)}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: "#64748B" }}>{cat.count} deals</span>
                    <span style={{ fontSize: 11, color: "#10B981" }}>Weighted: {fmt(cat.weighted)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stage breakdown */}
          <div style={{ ...cardStyle }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>Pipeline by Stage</div>
            {data.stages.map((stage, i) => {
              const pct = data.totalPipeline > 0 ? (stage.total / data.totalPipeline) * 100 : 0;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <div style={{ width: 140, fontSize: 12, color: "#CBD5E1", fontWeight: 500 }}>{stage.name}</div>
                  <div style={{ flex: 1, background: "#0F172A", borderRadius: 4, height: 20, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "#3B82F6", borderRadius: 4, minWidth: pct > 0 ? 2 : 0 }} />
                  </div>
                  <div style={{ width: 100, textAlign: "right", fontSize: 12, color: "#F1F5F9", fontWeight: 600 }}>{fmt(stage.total)}</div>
                  <div style={{ width: 50, textAlign: "right", fontSize: 11, color: "#64748B" }}>{stage.count}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "monthly" && (
        <div>
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 16 }}>Monthly Pipeline</div>
            {data.monthlyData.length > 0 ? (
              <BarChart data={data.monthlyData} labelKey="month" valueKey="pipeline" color="#3B82F6" />
            ) : (
              <div style={{ color: "#64748B", textAlign: "center", padding: 20 }}>No monthly data</div>
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
        </div>
      )}

      {view === "deals" && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>Top 10 Deals by Amount</div>
          {data.topDeals.map((deal, i) => (
            <div key={deal.id} style={{
              ...cardStyle, marginBottom: 8, display: "flex", alignItems: "center", gap: 14,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", background: i < 3 ? "#F59E0B20" : "#1E293B",
                border: `1px solid ${i < 3 ? "#F59E0B" : "#334155"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700, color: i < 3 ? "#F59E0B" : "#64748B",
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{deal.name}</div>
                <div style={{ fontSize: 11, color: "#94A3B8" }}>{deal.account} · {deal.stage} · Close: {deal.closeDate}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>{fmt(deal.amount)}</div>
                <div style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
                  background: (categoryColors[deal.forecastCategory] || "#64748B") + "20",
                  color: categoryColors[deal.forecastCategory] || "#64748B",
                  display: "inline-block",
                }}>{deal.forecastCategory}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
