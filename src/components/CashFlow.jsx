import { useState, useEffect } from "react";
const fmt = (n) => "$" + (n || 0).toLocaleString();
const TYPE_COLORS = { recurring: "#10B981", new_client: "#3B82F6", new_deal: "#8B5CF6" };

export default function CashFlow({ onClose, onScoreDeal, onInspectDeal, onDeepIntel }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [expandedDeal, setExpandedDeal] = useState(null);
  const [view, setView] = useState("monthly");
  const [typeFilter, setTypeFilter] = useState("all");
  const [drillDeals, setDrillDeals] = useState(null); // { label, deals }

  useEffect(() => {
    fetch("/.netlify/functions/cash-flow")
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  // Filter deals by type
  const filterDeals = (deals) => typeFilter === "all" ? deals : deals.filter(d => d.revenueType === typeFilter);

  // Get all deals across all months for drill-down
  const allDeals = data?.monthly?.flatMap(m => (m.deals || []).filter(d => !d.isSpread)) || [];

  // Clickable summary values
  const drillByType = (type) => {
    const deals = type === "all" ? allDeals : allDeals.filter(d => d.revenueType === type);
    setDrillDeals({ label: type === "all" ? "All Deals (12M)" : type === "recurring" ? "Recurring Revenue" : type === "new_client" ? "New Client Revenue" : "New Engagement Revenue", deals });
  };

  const filteredMonthly = (data?.monthly || []).map(m => {
    const deals = filterDeals(m.deals || []);
    return { ...m, filteredDeals: deals, filteredTotal: deals.reduce((s, d) => s + (d.revenueInMonth || 0), 0) };
  });
  const maxTotal = Math.max(...filteredMonthly.map(m => m.filteredTotal), 1);

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={hdr}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>Cash Flow</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>Closed won trailing — click anything to drill in</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={tabBtn(view === "monthly")} onClick={() => setView("monthly")}>Monthly</button>
            <button style={tabBtn(view === "quarterly")} onClick={() => setView("quarterly")}>Quarterly</button>
            <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 22 }} onClick={onClose}>x</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading && <div style={{ textAlign: "center", padding: 40, color: "#8B5CF6" }}>Loading revenue data...</div>}

          {data && (
            <>
              {/* Clickable summary cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
                {[
                  { label: "This Month", value: data.summary?.currentMonth, color: "#10B981", click: () => setExpandedMonth(currentMonth) },
                  { label: "Trailing 3M", value: data.summary?.trailing3m, color: "#3B82F6", click: () => drillByType("all") },
                  { label: "Trailing 6M", value: data.summary?.trailing6m, color: "#8B5CF6", click: () => drillByType("all") },
                  { label: "Avg Deal", value: data.summary?.avgDealSize, color: "#F1F5F9", sub: `${data.summary?.totalDeals || 0} deals`, click: () => drillByType("all") },
                ].map((c, i) => (
                  <div key={i} onClick={c.click} style={{ background: "#1E293B", borderRadius: 8, padding: "10px", textAlign: "center", border: "1px solid #334155", cursor: "pointer", transition: "all .15s" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{fmt(c.value)}</div>
                    <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>{c.label}</div>
                    {c.sub && <div style={{ fontSize: 10, color: "#94A3B8" }}>{c.sub}</div>}
                  </div>
                ))}
              </div>

              {/* Clickable revenue type cards */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {[
                  { key: "recurring", label: "Recurring", value: data.summary?.totalRecurring, color: "#10B981" },
                  { key: "new_client", label: "New Client", value: data.summary?.totalNew, color: "#3B82F6" },
                ].map(t => (
                  <div key={t.key} onClick={() => { setTypeFilter(typeFilter === t.key ? "all" : t.key); drillByType(t.key); }}
                    style={{ flex: 1, background: typeFilter === t.key ? t.color + "25" : t.color + "10", borderRadius: 6, padding: "8px 12px", borderLeft: `3px solid ${t.color}`, cursor: "pointer", border: typeFilter === t.key ? `1px solid ${t.color}` : `1px solid ${t.color}30` }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: t.color }}>{fmt(t.value)}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>{t.label.toUpperCase()} (12M)</div>
                  </div>
                ))}
                {typeFilter !== "all" && (
                  <button style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 11, background: "transparent", color: "#94A3B8" }} onClick={() => { setTypeFilter("all"); setDrillDeals(null); }}>Clear Filter</button>
                )}
              </div>

              {/* Drill-down deal list */}
              {drillDeals && (
                <div style={{ background: "#0F1117", borderRadius: 8, padding: 14, marginBottom: 14, border: "1px solid #334155" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9" }}>{drillDeals.label} <span style={{ fontWeight: 400, color: "#64748B" }}>({drillDeals.deals.length} deals · {fmt(drillDeals.deals.reduce((s, d) => s + (d.amount || 0), 0))})</span></div>
                    <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer" }} onClick={() => setDrillDeals(null)}>x</button>
                  </div>
                  {drillDeals.deals.sort((a, b) => (b.amount || 0) - (a.amount || 0)).map((deal, j) => (
                    <DealRow key={j} deal={deal} expanded={expandedDeal === `drill-${j}`} onToggle={() => setExpandedDeal(expandedDeal === `drill-${j}` ? null : `drill-${j}`)} onScore={onScoreDeal} onInspect={onInspectDeal} onDeepIntel={onDeepIntel} />
                  ))}
                </div>
              )}

              {/* Legend */}
              <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 11 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#10B981" }} /> Recurring</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#3B82F6" }} /> New Client</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#8B5CF6" }} /> New Engagement</span>
              </div>

              {/* MONTHLY VIEW */}
              {view === "monthly" && filteredMonthly.map((m, i) => {
                const isExpanded = expandedMonth === m.month;
                const isCurrent = m.month === currentMonth;
                const pct = (v) => `${Math.max((v / maxTotal) * 100, 0)}%`;
                const recAmt = filterDeals(m.deals || []).filter(d => d.revenueType === "recurring").reduce((s, d) => s + (d.revenueInMonth || 0), 0);
                const newCAmt = filterDeals(m.deals || []).filter(d => d.revenueType === "new_client").reduce((s, d) => s + (d.revenueInMonth || 0), 0);
                const newDAmt = filterDeals(m.deals || []).filter(d => d.revenueType === "new_deal").reduce((s, d) => s + (d.revenueInMonth || 0), 0);

                return (
                  <div key={i} style={{ marginBottom: 4 }}>
                    <div style={{ cursor: "pointer", padding: "6px 0" }} onClick={() => setExpandedMonth(isExpanded ? null : m.month)}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isCurrent ? "#10B981" : "#F1F5F9" }}>
                          {m.month}{isCurrent ? " ●" : ""}
                          <span style={{ fontSize: 11, color: "#64748B", fontWeight: 400, marginLeft: 6 }}>{m.filteredDeals.filter(d => !d.isSpread).length} deals</span>
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{fmt(m.filteredTotal)}</span>
                      </div>
                      <div style={{ display: "flex", height: 20, borderRadius: 4, overflow: "hidden", background: "#0F1117" }}>
                        {recAmt > 0 && <div style={{ width: pct(recAmt), background: "#10B981", transition: "width .3s" }} />}
                        {newCAmt > 0 && <div style={{ width: pct(newCAmt), background: "#3B82F6", transition: "width .3s" }} />}
                        {newDAmt > 0 && <div style={{ width: pct(newDAmt), background: "#8B5CF6", transition: "width .3s" }} />}
                      </div>
                      <div style={{ display: "flex", gap: 10, marginTop: 2, fontSize: 10, color: "#64748B" }}>
                        {recAmt > 0 && <span style={{ color: "#10B981" }}>Rec: {fmt(recAmt)}</span>}
                        {newCAmt > 0 && <span style={{ color: "#3B82F6" }}>New: {fmt(newCAmt)}</span>}
                        {newDAmt > 0 && <span style={{ color: "#8B5CF6" }}>Exp: {fmt(newDAmt)}</span>}
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ marginLeft: 8, marginTop: 4, marginBottom: 8 }}>
                        {m.filteredDeals.map((deal, j) => (
                          <DealRow key={j} deal={deal} expanded={expandedDeal === `${m.month}-${j}`} onToggle={() => setExpandedDeal(expandedDeal === `${m.month}-${j}` ? null : `${m.month}-${j}`)} onScore={onScoreDeal} onInspect={onInspectDeal} onDeepIntel={onDeepIntel} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* QUARTERLY VIEW */}
              {view === "quarterly" && data.quarters?.map((q, i) => {
                const qMax = Math.max(...(data.quarters || []).map(x => x.total), 1);
                return (
                  <div key={i} style={{ background: "#1E293B", borderRadius: 8, padding: 14, marginBottom: 8, border: "1px solid #334155", cursor: "pointer" }}
                    onClick={() => { const qDeals = allDeals.filter(d => { const [y, mo] = (d.closeDate || "").split("-"); const qLabel = `Q${Math.floor((parseInt(mo) - 1) / 3) + 1} ${y}`; return qLabel === q.label; }); setDrillDeals({ label: q.label, deals: qDeals }); }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9" }}>{q.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#10B981" }}>{fmt(q.total)}</div>
                    </div>
                    <div style={{ display: "flex", height: 12, borderRadius: 4, overflow: "hidden", background: "#0F1117", marginBottom: 6 }}>
                      {q.recurring > 0 && <div style={{ width: `${(q.recurring / qMax) * 100}%`, background: "#10B981" }} />}
                      {q.newClient > 0 && <div style={{ width: `${(q.newClient / qMax) * 100}%`, background: "#3B82F6" }} />}
                      {q.newDeal > 0 && <div style={{ width: `${(q.newDeal / qMax) * 100}%`, background: "#8B5CF6" }} />}
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#94A3B8" }}>
                      <span>{fmt(q.recurring)} recurring</span>
                      <span>{fmt(q.newClient + q.newDeal)} new</span>
                      <span>{q.dealCount} deals</span>
                    </div>
                  </div>
                );
              })}

              {/* Total */}
              <div style={{ marginTop: 16, background: "#1E293B", borderRadius: 8, padding: 14, textAlign: "center", border: "1px solid #334155", cursor: "pointer" }} onClick={() => drillByType("all")}>
                <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>12-Month Revenue (click for all deals)</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: "#10B981", marginTop: 4 }}>{fmt(data.summary?.totalRevenue)}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DealRow({ deal, expanded, onToggle, onScore, onInspect, onDeepIntel }) {
  return (
    <div style={{
      background: "#1E293B", borderRadius: 6, padding: "8px 12px", marginBottom: 3,
      borderLeft: `3px solid ${TYPE_COLORS[deal.revenueType] || "#64748B"}`, cursor: "pointer",
    }} onClick={onToggle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9" }}>{deal.name}</div>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>{deal.account} · {deal.closeDate}</div>
          <div style={{ fontSize: 10, color: TYPE_COLORS[deal.revenueType] || "#64748B" }}>{deal.spreadNote}</div>
        </div>
        <div style={{ textAlign: "right", marginLeft: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{fmt(deal.revenueInMonth)}</div>
          {deal.revenueInMonth !== deal.amount && <div style={{ fontSize: 10, color: "#64748B" }}>of {fmt(deal.amount)}</div>}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #334155", display: "flex", gap: 6, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
          <a href={`https://skaled.my.salesforce.com/${deal.id}`} target="_blank" rel="noreferrer" style={{ ...btn("#00A1E0"), textDecoration: "none" }}>SFDC</a>
          {onScore && <button style={btn("#8B5CF6")} onClick={() => onScore({ oppId: deal.id, oppName: deal.name })}>Score</button>}
          {onInspect && <button style={btn("#10B981")} onClick={() => onInspect({ oppId: deal.id, oppName: deal.name })}>Inspect</button>}
          {onDeepIntel && <button style={{ ...btn("#EC4899"), background: "linear-gradient(135deg, #8B5CF6, #EC4899)" }} onClick={() => onDeepIntel({ oppId: deal.id, oppName: deal.name, accountName: deal.account })}>Deep Intel</button>}
          {deal.source && <span style={{ fontSize: 10, color: "#64748B", padding: "4px 8px" }}>Source: {deal.source}</span>}
        </div>
      )}
    </div>
  );
}

const btn = (bg) => ({ padding: "4px 10px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: bg, color: "#fff" });
const overlay = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" };
const modal = { background: "#0F172A", borderRadius: 14, width: 720, maxWidth: "95vw", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid #334155" };
const hdr = { padding: "14px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 };
const tabBtn = (active) => ({ padding: "4px 12px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 11, fontWeight: 600, background: active ? "#10B981" : "transparent", color: active ? "#fff" : "#94A3B8" });
