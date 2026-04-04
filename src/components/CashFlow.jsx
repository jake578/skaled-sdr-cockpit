import { useState, useEffect } from "react";
const fmt = (n) => "$" + (n || 0).toLocaleString();
const catColor = { "Commit": "#10B981", "Best Case": "#F59E0B", "Pipeline": "#8B5CF6", "Omitted": "#64748B" };

export default function CashFlow({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [showWeighted, setShowWeighted] = useState(true);

  useEffect(() => {
    fetch("/.netlify/functions/cash-flow")
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const maxTotal = data?.monthly ? Math.max(...data.monthly.map(m => showWeighted ? m.total : m.unweightedTotal || m.total), 1) : 1;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#0F172A", borderRadius: 12, width: 720, maxWidth: "95vw", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid #334155" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9" }}>Cash Flow Projection</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>Click any month to see the underlying deals</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 11, fontWeight: 600, background: showWeighted ? "#10B981" : "transparent", color: showWeighted ? "#fff" : "#94A3B8" }} onClick={() => setShowWeighted(true)}>Weighted</button>
            <button style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 11, fontWeight: 600, background: !showWeighted ? "#3B82F6" : "transparent", color: !showWeighted ? "#fff" : "#94A3B8" }} onClick={() => setShowWeighted(false)}>Unweighted</button>
            <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20 }} onClick={onClose}>x</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading && <div style={{ textAlign: "center", padding: 40, color: "#8B5CF6" }}>Building forecast...</div>}

          {data && (
            <>
              {/* Summary cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                {[
                  { label: "Next 30d", val: showWeighted ? data.summary?.next30d : data.summary?.next30dRaw, color: "#10B981" },
                  { label: "Next 60d", val: showWeighted ? data.summary?.next60d : data.summary?.next60dRaw, color: "#3B82F6" },
                  { label: "Next 90d", val: showWeighted ? data.summary?.next90d : data.summary?.next90dRaw, color: "#8B5CF6" },
                  { label: "Closed This Q", val: data.closedThisQuarter?.total, color: "#F59E0B", sub: `${data.closedThisQuarter?.count || 0} deals` },
                ].map((c, i) => (
                  <div key={i} style={{ background: "#1E293B", borderRadius: 8, padding: "10px", textAlign: "center", border: "1px solid #334155" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{fmt(c.val)}</div>
                    <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>{c.label}</div>
                    {c.sub && <div style={{ fontSize: 10, color: "#94A3B8" }}>{c.sub}</div>}
                  </div>
                ))}
              </div>

              {/* Category breakdown */}
              {data.categoryTotals?.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                  {data.categoryTotals.map((c, i) => (
                    <div key={i} style={{ background: (catColor[c.category] || "#64748B") + "15", borderRadius: 6, padding: "6px 12px", border: `1px solid ${(catColor[c.category] || "#64748B")}30` }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: catColor[c.category] || "#94A3B8" }}>{c.category}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{c.count} deals · {fmt(c.total)} → {fmt(c.weighted)} weighted</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {data.summary?.pastDueCount > 0 && (
                <div style={{ background: "#EF444415", borderRadius: 6, padding: "8px 14px", marginBottom: 16, border: "1px solid #EF444430", fontSize: 12, color: "#FCA5A5" }}>
                  {data.summary.pastDueCount} deals ({fmt(data.summary.pastDueAmount)}) are past due and need close dates updated or closed
                </div>
              )}

              {/* Legend */}
              <div style={{ display: "flex", gap: 16, marginBottom: 10, fontSize: 11 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#10B981" }} /> Commit</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#F59E0B" }} /> Best Case</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#8B5CF6" }} /> Pipeline</span>
                <span style={{ fontSize: 10, color: "#64748B", marginLeft: "auto" }}>{data.summary?.totalDeals} total deals · {fmt(showWeighted ? data.summary?.totalProjected : data.summary?.totalUnweighted)} projected</span>
              </div>

              {/* Monthly bars with drill-down */}
              {data.monthly?.map((m, i) => {
                const isExpanded = expandedMonth === m.month;
                const displayTotal = showWeighted ? m.total : (m.unweightedTotal || m.total);
                const isPastDue = m.month === "Past Due";
                const pct = (v) => Math.max((v / maxTotal) * 100, 0);

                return (
                  <div key={i} style={{ marginBottom: 6 }}>
                    {/* Bar */}
                    <div style={{ cursor: "pointer", padding: "6px 0" }} onClick={() => setExpandedMonth(isExpanded ? null : m.month)}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isPastDue ? "#EF4444" : "#F1F5F9" }}>
                          {m.month}{isPastDue ? " ⚠" : ""} <span style={{ fontSize: 11, color: "#64748B", fontWeight: 400 }}>({m.dealCount} deal{m.dealCount !== 1 ? "s" : ""})</span>
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>
                          {fmt(displayTotal)}
                          {showWeighted && m.unweightedTotal && <span style={{ fontSize: 10, color: "#64748B", marginLeft: 6 }}>({fmt(m.unweightedTotal)} raw)</span>}
                        </span>
                      </div>
                      <div style={{ display: "flex", height: 22, borderRadius: 4, overflow: "hidden", background: "#0F1117" }}>
                        {(showWeighted ? m.committed : m.deals?.filter(d => d.category === "Commit").reduce((s, d) => s + d.amount, 0) || 0) > 0 && (
                          <div style={{ width: `${pct(showWeighted ? m.committed : m.deals?.filter(d => d.category === "Commit").reduce((s, d) => s + d.amount, 0))}%`, background: "#10B981", transition: "width .3s" }} />
                        )}
                        {(showWeighted ? m.bestCase : m.deals?.filter(d => d.category === "Best Case").reduce((s, d) => s + d.amount, 0) || 0) > 0 && (
                          <div style={{ width: `${pct(showWeighted ? m.bestCase : m.deals?.filter(d => d.category === "Best Case").reduce((s, d) => s + d.amount, 0))}%`, background: "#F59E0B", transition: "width .3s" }} />
                        )}
                        {(showWeighted ? m.pipeline : m.deals?.filter(d => d.category !== "Commit" && d.category !== "Best Case").reduce((s, d) => s + d.amount, 0) || 0) > 0 && (
                          <div style={{ width: `${pct(showWeighted ? m.pipeline : m.deals?.filter(d => d.category !== "Commit" && d.category !== "Best Case").reduce((s, d) => s + d.amount, 0))}%`, background: "#8B5CF6", transition: "width .3s" }} />
                        )}
                      </div>
                    </div>

                    {/* Expanded deal list */}
                    {isExpanded && m.deals?.length > 0 && (
                      <div style={{ marginLeft: 8, marginBottom: 8 }}>
                        {m.deals.map((deal, j) => (
                          <div key={j} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            background: "#1E293B", borderRadius: 6, padding: "8px 12px", marginBottom: 3,
                            borderLeft: `3px solid ${catColor[deal.category] || "#64748B"}`,
                          }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9" }}>{deal.name}</div>
                              <div style={{ fontSize: 11, color: "#94A3B8" }}>
                                {deal.account} · {deal.stage} · Close: {deal.closeDate}
                                {deal.pastDue && <span style={{ color: "#EF4444", marginLeft: 4 }}>PAST DUE</span>}
                              </div>
                            </div>
                            <div style={{ textAlign: "right", marginLeft: 12 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{fmt(deal.amount)}</div>
                              <div style={{ fontSize: 10, color: catColor[deal.category] || "#64748B" }}>
                                {deal.category} → {fmt(deal.weighted)}
                              </div>
                            </div>
                            <a href={`https://skaled.my.salesforce.com/${deal.id}`} target="_blank" rel="noreferrer"
                              style={{ marginLeft: 8, fontSize: 10, color: "#00A1E0", textDecoration: "none", padding: "4px 8px", borderRadius: 4, border: "1px solid #334155" }}>
                              SFDC
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Closed this quarter deals */}
              {data.closedThisQuarter?.deals?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#10B981", marginBottom: 8, textTransform: "uppercase" }}>Closed Won This Quarter ({fmt(data.closedThisQuarter.total)})</div>
                  {data.closedThisQuarter.deals.map((d, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", background: "#1E293B", borderRadius: 6, padding: "6px 12px", marginBottom: 3, borderLeft: "3px solid #10B981" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9" }}>{d.name}</div>
                        <div style={{ fontSize: 10, color: "#94A3B8" }}>{d.account} · {d.closeDate}</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#10B981" }}>{fmt(d.amount)}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Total */}
              <div style={{ marginTop: 16, background: "#1E293B", borderRadius: 8, padding: 14, textAlign: "center", border: "1px solid #334155" }}>
                <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>6-Month {showWeighted ? "Weighted" : "Unweighted"} Projection</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#10B981", marginTop: 4 }}>{fmt(showWeighted ? data.summary?.totalProjected : data.summary?.totalUnweighted)}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
