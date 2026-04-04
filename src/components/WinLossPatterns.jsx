import { useState, useEffect } from "react";
const fmt = (n) => "$" + (n || 0).toLocaleString();
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");

function PatternBars({ items, label }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#F1F5F9", marginBottom: 8, textTransform: "uppercase" }}>{label}</div>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 100, fontSize: 11, color: "#CBD5E1", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
          <div style={{ flex: 1, background: "#0F172A", borderRadius: 4, height: 20, overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${item.winRate || 0}%`, height: "100%", background: "#10B981", borderRadius: 4 }} />
          </div>
          <div style={{ width: 40, fontSize: 12, fontWeight: 600, color: item.winRate >= 50 ? "#10B981" : item.winRate >= 30 ? "#F59E0B" : "#EF4444", textAlign: "right" }}>{item.winRate}%</div>
          <div style={{ width: 50, fontSize: 10, color: "#64748B", textAlign: "right" }}>{item.won}W/{item.lost}L</div>
        </div>
      ))}
    </div>
  );
}

export default function WinLossPatterns({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/.netlify/functions/win-loss-patterns")
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#0F172A", borderRadius: 12, width: 720, maxWidth: "95vw", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid #334155" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>Win/Loss Patterns</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>Last 12 months analysis</div>
          </div>
          <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20 }} onClick={onClose}>x</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading && <div style={{ textAlign: "center", padding: 40, color: "#8B5CF6" }}>Analyzing deal history...</div>}

          {data && (
            <>
              {/* Totals */}
              {data.totals && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
                  <div style={{ background: "#1E293B", borderRadius: 8, padding: "10px", textAlign: "center", border: "1px solid #334155" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: data.totals.winRate >= 40 ? "#10B981" : "#F59E0B" }}>{data.totals.winRate}%</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>WIN RATE</div>
                  </div>
                  <div style={{ background: "#1E293B", borderRadius: 8, padding: "10px", textAlign: "center", border: "1px solid #334155" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#10B981" }}>{data.totals.won}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>WON</div>
                  </div>
                  <div style={{ background: "#1E293B", borderRadius: 8, padding: "10px", textAlign: "center", border: "1px solid #334155" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#EF4444" }}>{data.totals.lost}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>LOST</div>
                  </div>
                  <div style={{ background: "#1E293B", borderRadius: 8, padding: "10px", textAlign: "center", border: "1px solid #334155" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#F1F5F9" }}>{fmt(data.totals.wonAmount)}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>WON REVENUE</div>
                  </div>
                </div>
              )}

              {/* Sweet Spot */}
              {data.sweetSpot && (
                <div style={{ background: "#10B98115", borderRadius: 8, padding: 16, marginBottom: 16, border: "1px solid #10B98130" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#10B981", marginBottom: 6 }}>Sweet Spot — Where Skaled Wins</div>
                  <div style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.6 }}>{strip(data.sweetSpot.description)}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    {data.sweetSpot.dealSize && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#10B98120", color: "#10B981" }}>{data.sweetSpot.dealSize}</span>}
                    {data.sweetSpot.industry && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#10B98120", color: "#10B981" }}>{data.sweetSpot.industry}</span>}
                    {data.sweetSpot.source && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#10B98120", color: "#10B981" }}>{data.sweetSpot.source}</span>}
                  </div>
                </div>
              )}

              {/* Blind Spots */}
              {data.blindSpots?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#EF4444", marginBottom: 8, textTransform: "uppercase" }}>Blind Spots</div>
                  {data.blindSpots.map((b, i) => (
                    <div key={i} style={{ background: "#EF444410", borderRadius: 6, padding: "8px 12px", marginBottom: 4, borderLeft: "3px solid #EF4444" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#FCA5A5" }}>{strip(b.area)}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{strip(b.insight)}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Cycle Insights */}
              {data.cycleInsights && (
                <div style={{ background: "#1E293B", borderRadius: 8, padding: 14, marginBottom: 16, border: "1px solid #334155" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#F1F5F9", marginBottom: 8, textTransform: "uppercase" }}>Sales Cycle</div>
                  <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 8 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: "#10B981" }}>{data.cycleInsights.avgWonDays}d</div>
                      <div style={{ fontSize: 10, color: "#64748B" }}>Avg Won</div>
                    </div>
                    <div style={{ fontSize: 20, color: "#334155" }}>vs</div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: "#EF4444" }}>{data.cycleInsights.avgLostDays}d</div>
                      <div style={{ fontSize: 10, color: "#64748B" }}>Avg Lost</div>
                    </div>
                  </div>
                  {data.cycleInsights.insight && <div style={{ fontSize: 12, color: "#94A3B8" }}>{strip(data.cycleInsights.insight)}</div>}
                </div>
              )}

              {/* Pattern bars */}
              <PatternBars items={data.patterns?.bySize} label="Win Rate by Deal Size" />
              <PatternBars items={data.patterns?.bySource} label="Win Rate by Source" />
              <PatternBars items={data.patterns?.byIndustry} label="Win Rate by Industry" />

              {/* Recommendations */}
              {data.recommendations?.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#10B981", marginBottom: 8, textTransform: "uppercase" }}>Recommendations</div>
                  {data.recommendations.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 12, color: "#CBD5E1" }}>
                      <span style={{ color: "#10B981", fontWeight: 700 }}>{i + 1}.</span>
                      <span>{strip(r)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
