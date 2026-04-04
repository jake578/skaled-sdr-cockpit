import { useState, useEffect } from "react";
const fmt = (n) => "$" + (n || 0).toLocaleString();
const CAT = { "Commit": "#10B981", "Best Case": "#F59E0B", "Pipeline": "#8B5CF6", "Omitted": "#64748B" };
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");

export default function CashFlow({ onClose, onScoreDeal, onInspectDeal }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weighted, setWeighted] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [expandedDeal, setExpandedDeal] = useState(null);
  const [catFilter, setCatFilter] = useState("all");
  const [drillView, setDrillView] = useState(null); // { type: "30d"|"60d"|"90d"|"category"|"pastdue", value }
  const [dealDetail, setDealDetail] = useState(null); // loading detail for a deal

  useEffect(() => {
    fetch("/.netlify/functions/cash-flow")
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ padding: 60, textAlign: "center", color: "#8B5CF6" }}>Building cash flow model...</div>
      </div>
    </div>
  );

  if (!data) return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ padding: 40, textAlign: "center", color: "#EF4444" }}>Failed to load</div>
      </div>
    </div>
  );

  const s = data.summary || {};
  const allDeals = (data.monthly || []).flatMap(m => m.deals || []);
  const todayStr = new Date().toISOString().split("T")[0];

  // Filter deals by category
  const filterDeals = (deals) => catFilter === "all" ? deals : deals.filter(d => d.category === catFilter);

  // Get deals for a time window
  const dealsInWindow = (days) => {
    const maxDate = new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
    return filterDeals(allDeals.filter(d => d.closeDate >= todayStr && d.closeDate <= maxDate));
  };

  // Get deals for a category
  const dealsInCategory = (cat) => allDeals.filter(d => d.category === cat);

  // Calculate filtered totals
  const filteredMonthly = (data.monthly || []).map(m => {
    const deals = filterDeals(m.deals || []);
    return {
      ...m,
      filteredDeals: deals,
      filteredTotal: deals.reduce((sum, d) => sum + (weighted ? d.weighted : d.amount), 0),
      filteredCount: deals.length,
    };
  });
  const maxBar = Math.max(...filteredMonthly.map(m => m.filteredTotal), 1);

  // Drill view deals
  const drillDeals = drillView ? (
    drillView.type === "30d" ? dealsInWindow(30) :
    drillView.type === "60d" ? dealsInWindow(60) :
    drillView.type === "90d" ? dealsInWindow(90) :
    drillView.type === "category" ? dealsInCategory(drillView.value) :
    drillView.type === "pastdue" ? filterDeals(allDeals.filter(d => d.pastDue)) :
    []
  ) : [];

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={header}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>Cash Flow</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>{s.totalDeals} deals · Click any number to drill in</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={toggleBtn(weighted)} onClick={() => setWeighted(true)}>Weighted</button>
            <button style={toggleBtn(!weighted)} onClick={() => setWeighted(false)}>Raw</button>
            <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 22 }} onClick={onClose}>x</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

          {/* ── SUMMARY CARDS (clickable) ─────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
            {[
              { label: "Next 30 Days", val: weighted ? s.next30d : s.next30dRaw, drill: "30d", color: "#10B981", count: dealsInWindow(30).length },
              { label: "Next 60 Days", val: weighted ? s.next60d : s.next60dRaw, drill: "60d", color: "#3B82F6", count: dealsInWindow(60).length },
              { label: "Next 90 Days", val: weighted ? s.next90d : s.next90dRaw, drill: "90d", color: "#8B5CF6", count: dealsInWindow(90).length },
              { label: "Closed This Q", val: data.closedThisQuarter?.total, drill: null, color: "#F59E0B", count: data.closedThisQuarter?.count },
            ].map((c, i) => (
              <div key={i} onClick={() => c.drill && setDrillView(drillView?.type === c.drill ? null : { type: c.drill })}
                style={{ background: drillView?.type === c.drill ? c.color + "20" : "#1E293B", borderRadius: 8, padding: "12px", textAlign: "center", border: `1px solid ${drillView?.type === c.drill ? c.color : "#334155"}`, cursor: c.drill ? "pointer" : "default", transition: "all .15s" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{fmt(c.val)}</div>
                <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>{c.label}</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>{c.count} deal{c.count !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>

          {/* Past due warning (clickable) */}
          {s.pastDueCount > 0 && (
            <div onClick={() => setDrillView(drillView?.type === "pastdue" ? null : { type: "pastdue" })}
              style={{ background: drillView?.type === "pastdue" ? "#EF444425" : "#EF444415", borderRadius: 6, padding: "8px 14px", marginBottom: 14, border: `1px solid ${drillView?.type === "pastdue" ? "#EF4444" : "#EF444430"}`, fontSize: 12, color: "#FCA5A5", cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
              <span>{s.pastDueCount} deals past due ({fmt(s.pastDueAmount)})</span>
              <span style={{ color: "#EF4444" }}>Click to view →</span>
            </div>
          )}

          {/* ── CATEGORY FILTER (clickable) ───────────────── */}
          <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
            <button style={catBtn("all", catFilter === "all")} onClick={() => { setCatFilter("all"); setDrillView(null); }}>All</button>
            {(data.categoryTotals || []).map(c => (
              <button key={c.category} style={catBtn(c.category, catFilter === c.category)} onClick={() => {
                const newCat = catFilter === c.category ? "all" : c.category;
                setCatFilter(newCat);
                if (newCat !== "all") setDrillView({ type: "category", value: newCat });
                else setDrillView(null);
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: CAT[c.category] || "#64748B", display: "inline-block", marginRight: 4 }} />
                {c.category} ({c.count}) · {fmt(weighted ? c.weighted : c.total)}
              </button>
            ))}
          </div>

          {/* ── DRILL VIEW (deal list for clicked summary/category) ── */}
          {drillView && drillDeals.length > 0 && (
            <div style={{ background: "#0F1117", borderRadius: 8, padding: 14, marginBottom: 16, border: "1px solid #334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9" }}>
                  {drillView.type === "30d" ? "Closing Next 30 Days" : drillView.type === "60d" ? "Closing Next 60 Days" : drillView.type === "90d" ? "Closing Next 90 Days" : drillView.type === "pastdue" ? "Past Due Deals" : drillView.value}
                  <span style={{ fontWeight: 400, color: "#64748B", marginLeft: 8 }}>
                    {drillDeals.length} deals · {fmt(drillDeals.reduce((sum, d) => sum + (weighted ? d.weighted : d.amount), 0))}
                  </span>
                </div>
                <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 14 }} onClick={() => setDrillView(null)}>x</button>
              </div>
              {drillDeals.map(deal => <DealCard key={deal.id} deal={deal} weighted={weighted} expanded={expandedDeal === deal.id} onToggle={() => setExpandedDeal(expandedDeal === deal.id ? null : deal.id)} onScore={onScoreDeal} onInspect={onInspectDeal} />)}
            </div>
          )}

          {/* ── MONTHLY BARS (clickable) ──────────────────── */}
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
            <span>Monthly Breakdown</span>
            <span>{fmt(weighted ? s.totalProjected : s.totalUnweighted)} total · {filteredMonthly.reduce((s, m) => s + m.filteredCount, 0)} deals</span>
          </div>

          {filteredMonthly.map((m, i) => {
            const isExpanded = expandedMonth === m.month;
            const isPastDue = m.month === "Past Due";
            const barPct = (v) => `${Math.max((v / maxBar) * 100, 0)}%`;

            // Segment amounts for stacked bar
            const commitAmt = m.filteredDeals.filter(d => d.category === "Commit").reduce((s, d) => s + (weighted ? d.weighted : d.amount), 0);
            const bestAmt = m.filteredDeals.filter(d => d.category === "Best Case").reduce((s, d) => s + (weighted ? d.weighted : d.amount), 0);
            const pipeAmt = m.filteredDeals.filter(d => d.category !== "Commit" && d.category !== "Best Case").reduce((s, d) => s + (weighted ? d.weighted : d.amount), 0);

            return (
              <div key={i} style={{ marginBottom: 4 }}>
                <div style={{ cursor: "pointer", padding: "6px 0" }} onClick={() => setExpandedMonth(isExpanded ? null : m.month)}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: isPastDue ? "#EF4444" : "#F1F5F9" }}>
                      {m.month}{isPastDue ? " ⚠" : ""}
                      <span style={{ fontSize: 11, color: "#64748B", fontWeight: 400, marginLeft: 6 }}>{m.filteredCount} deal{m.filteredCount !== 1 ? "s" : ""}</span>
                    </span>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{fmt(m.filteredTotal)}</span>
                      {weighted && m.unweightedTotal > 0 && <span style={{ fontSize: 10, color: "#64748B", marginLeft: 6 }}>({fmt(filterDeals(m.deals || []).reduce((s, d) => s + d.amount, 0))} raw)</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", height: 20, borderRadius: 4, overflow: "hidden", background: "#0F1117" }}>
                    {commitAmt > 0 && <div style={{ width: barPct(commitAmt), background: "#10B981", transition: "width .3s" }} />}
                    {bestAmt > 0 && <div style={{ width: barPct(bestAmt), background: "#F59E0B", transition: "width .3s" }} />}
                    {pipeAmt > 0 && <div style={{ width: barPct(pipeAmt), background: "#8B5CF6", transition: "width .3s" }} />}
                  </div>
                  {/* Mini category breakdown per month */}
                  <div style={{ display: "flex", gap: 10, marginTop: 2, fontSize: 10, color: "#64748B" }}>
                    {commitAmt > 0 && <span style={{ color: "#10B981" }}>Commit: {fmt(commitAmt)}</span>}
                    {bestAmt > 0 && <span style={{ color: "#F59E0B" }}>Best: {fmt(bestAmt)}</span>}
                    {pipeAmt > 0 && <span style={{ color: "#8B5CF6" }}>Pipe: {fmt(pipeAmt)}</span>}
                  </div>
                </div>

                {/* Expanded: deals in this month */}
                {isExpanded && m.filteredDeals.length > 0 && (
                  <div style={{ marginLeft: 8, marginTop: 4, marginBottom: 8 }}>
                    {m.filteredDeals.map(deal => <DealCard key={deal.id} deal={deal} weighted={weighted} expanded={expandedDeal === deal.id} onToggle={() => setExpandedDeal(expandedDeal === deal.id ? null : deal.id)} onScore={onScoreDeal} onInspect={onInspectDeal} />)}
                  </div>
                )}
              </div>
            );
          })}

          {/* Closed this quarter */}
          {data.closedThisQuarter?.deals?.length > 0 && (
            <div style={{ marginTop: 16, borderTop: "1px solid #334155", paddingTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#10B981", marginBottom: 8 }}>Closed Won This Quarter — {fmt(data.closedThisQuarter.total)}</div>
              {data.closedThisQuarter.deals.map((d, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", background: "#1E293B", borderRadius: 6, padding: "6px 12px", marginBottom: 3, borderLeft: "3px solid #10B981" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9" }}>{d.name}</div>
                    <div style={{ fontSize: 10, color: "#94A3B8" }}>{d.account} · {d.closeDate}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#10B981" }}>{fmt(d.amount)}</span>
                    <a href={`https://skaled.my.salesforce.com/${d.id}`} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "#00A1E0", textDecoration: "none" }}>SFDC</a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Grand total */}
          <div style={{ marginTop: 16, background: "#1E293B", borderRadius: 8, padding: 14, textAlign: "center", border: "1px solid #334155" }}>
            <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>6-Month Projection ({weighted ? "Weighted" : "Unweighted"})</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#10B981", marginTop: 4 }}>{fmt(weighted ? s.totalProjected : s.totalUnweighted)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Deal Card Component ─────────────────────────────────────────
function DealCard({ deal, weighted, expanded, onToggle, onScore, onInspect }) {
  return (
    <div style={{
      background: "#1E293B", borderRadius: 6, padding: "8px 12px", marginBottom: 3,
      borderLeft: `3px solid ${CAT[deal.category] || "#64748B"}`, cursor: "pointer",
    }} onClick={onToggle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9" }}>{deal.name}</div>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>
            {deal.account} · {deal.stage} · Close: {deal.closeDate}
            {deal.pastDue && <span style={{ color: "#EF4444", marginLeft: 4, fontWeight: 600 }}>PAST DUE</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", marginLeft: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{fmt(deal.amount)}</div>
          <div style={{ fontSize: 10, color: CAT[deal.category] || "#64748B" }}>
            {deal.category} {weighted && deal.weighted !== deal.amount ? `→ ${fmt(deal.weighted)}` : ""}
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #334155" }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8, fontSize: 11 }}>
            <div><span style={{ color: "#64748B" }}>Probability:</span> <span style={{ color: "#CBD5E1" }}>{deal.probability}%</span></div>
            <div><span style={{ color: "#64748B" }}>Weight:</span> <span style={{ color: "#CBD5E1" }}>{deal.category === "Commit" ? "90%" : deal.category === "Best Case" ? "60%" : deal.category === "Pipeline" ? "30%" : "0%"}</span></div>
            <div><span style={{ color: "#64748B" }}>Last Activity:</span> <span style={{ color: "#CBD5E1" }}>{deal.lastActivity || "—"}</span></div>
          </div>
          <div style={{ display: "flex", gap: 6, fontSize: 11 }}>
            <a href={`https://skaled.my.salesforce.com/${deal.id}`} target="_blank" rel="noreferrer" style={{ padding: "4px 10px", borderRadius: 4, background: "#00A1E0", color: "#fff", textDecoration: "none", fontWeight: 600 }}>Open in SFDC</a>
            {onScore && <button style={{ padding: "4px 10px", borderRadius: 4, border: "none", cursor: "pointer", background: "#8B5CF6", color: "#fff", fontWeight: 600 }} onClick={() => onScore({ oppId: deal.id, oppName: deal.name })}>Score Deal</button>}
            {onInspect && <button style={{ padding: "4px 10px", borderRadius: 4, border: "none", cursor: "pointer", background: "#10B981", color: "#fff", fontWeight: 600 }} onClick={() => onInspect({ oppId: deal.id, oppName: deal.name })}>Inspect</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────
const overlay = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" };
const modal = { background: "#0F172A", borderRadius: 14, width: 760, maxWidth: "95vw", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid #334155", boxShadow: "0 12px 50px rgba(0,0,0,0.6)" };
const header = { padding: "14px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 };
const toggleBtn = (active) => ({ padding: "4px 12px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 11, fontWeight: 600, background: active ? "#10B981" : "transparent", color: active ? "#fff" : "#94A3B8" });
const catBtn = (cat, active) => ({ padding: "4px 12px", borderRadius: 6, border: `1px solid ${active ? (CAT[cat] || "#10B981") : "#334155"}`, cursor: "pointer", fontSize: 11, fontWeight: 600, background: active ? (CAT[cat] || "#10B981") + "20" : "transparent", color: active ? (CAT[cat] || "#10B981") : "#94A3B8", display: "flex", alignItems: "center" });
