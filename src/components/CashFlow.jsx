import { useState, useEffect } from "react";
const fmt = (n) => "$" + (n || 0).toLocaleString();
const TYPE_COLORS = { recurring: "#10B981", new_client: "#3B82F6", new_deal: "#8B5CF6" };
const TYPE_LABELS = { recurring: "Recurring", new_client: "New Client", new_deal: "New Engagement" };

export default function CashFlow({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [view, setView] = useState("monthly"); // monthly | quarterly

  useEffect(() => {
    fetch("/.netlify/functions/cash-flow")
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const maxTotal = data?.monthly ? Math.max(...data.monthly.map(m => m.total), 1) : 1;
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>Cash Flow</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>Closed won revenue — trailing 12 months with spread</div>
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
              {/* Summary */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                <SumCard label="This Month" value={fmt(data.summary?.currentMonth)} color="#10B981" />
                <SumCard label="Trailing 3M" value={fmt(data.summary?.trailing3m)} color="#3B82F6" />
                <SumCard label="Trailing 6M" value={fmt(data.summary?.trailing6m)} color="#8B5CF6" />
                <SumCard label="Avg Deal" value={fmt(data.summary?.avgDealSize)} color="#F1F5F9" sub={`${data.summary?.totalDeals || 0} deals`} />
              </div>

              {/* Revenue type breakdown */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <div style={{ flex: 1, background: "#10B98115", borderRadius: 6, padding: "8px 12px", borderLeft: "3px solid #10B981" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#10B981" }}>{fmt(data.summary?.totalRecurring)}</div>
                  <div style={{ fontSize: 10, color: "#64748B" }}>RECURRING (12M)</div>
                </div>
                <div style={{ flex: 1, background: "#3B82F615", borderRadius: 6, padding: "8px 12px", borderLeft: "3px solid #3B82F6" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#3B82F6" }}>{fmt(data.summary?.totalNew)}</div>
                  <div style={{ fontSize: 10, color: "#64748B" }}>NEW REVENUE (12M)</div>
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: "flex", gap: 16, marginBottom: 10, fontSize: 11 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#10B981" }} /> Recurring</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#3B82F6" }} /> New Client</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#8B5CF6" }} /> New Engagement</span>
              </div>

              {/* MONTHLY VIEW */}
              {view === "monthly" && data.monthly?.map((m, i) => {
                const isExpanded = expandedMonth === m.month;
                const isCurrent = m.month === currentMonth;
                const pct = (v) => `${Math.max((v / maxTotal) * 100, 0)}%`;

                return (
                  <div key={i} style={{ marginBottom: 4 }}>
                    <div style={{ cursor: "pointer", padding: "6px 0" }} onClick={() => setExpandedMonth(isExpanded ? null : m.month)}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isCurrent ? "#10B981" : "#F1F5F9" }}>
                          {m.month}{isCurrent ? " (current)" : ""}
                          <span style={{ fontSize: 11, color: "#64748B", fontWeight: 400, marginLeft: 6 }}>{m.dealCount} deal{m.dealCount !== 1 ? "s" : ""}</span>
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{fmt(m.total)}</span>
                      </div>
                      <div style={{ display: "flex", height: 20, borderRadius: 4, overflow: "hidden", background: "#0F1117" }}>
                        {m.recurring > 0 && <div style={{ width: pct(m.recurring), background: "#10B981", transition: "width .3s" }} />}
                        {m.newClient > 0 && <div style={{ width: pct(m.newClient), background: "#3B82F6", transition: "width .3s" }} />}
                        {m.newDeal > 0 && <div style={{ width: pct(m.newDeal), background: "#8B5CF6", transition: "width .3s" }} />}
                      </div>
                      <div style={{ display: "flex", gap: 10, marginTop: 2, fontSize: 10, color: "#64748B" }}>
                        {m.recurring > 0 && <span style={{ color: "#10B981" }}>Recurring: {fmt(m.recurring)}</span>}
                        {m.newClient > 0 && <span style={{ color: "#3B82F6" }}>New Client: {fmt(m.newClient)}</span>}
                        {m.newDeal > 0 && <span style={{ color: "#8B5CF6" }}>New Engagement: {fmt(m.newDeal)}</span>}
                      </div>
                    </div>

                    {isExpanded && m.deals?.length > 0 && (
                      <div style={{ marginLeft: 8, marginTop: 4, marginBottom: 8 }}>
                        {m.deals.map((deal, j) => (
                          <div key={j} style={{
                            background: "#1E293B", borderRadius: 6, padding: "8px 12px", marginBottom: 3,
                            borderLeft: `3px solid ${TYPE_COLORS[deal.revenueType] || "#64748B"}`,
                          }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9" }}>{deal.name}</div>
                                <div style={{ fontSize: 11, color: "#94A3B8" }}>{deal.account} · Closed: {deal.closeDate}</div>
                                <div style={{ fontSize: 10, color: TYPE_COLORS[deal.revenueType] || "#64748B" }}>{deal.spreadNote}</div>
                              </div>
                              <div style={{ textAlign: "right", marginLeft: 10 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{fmt(deal.revenueInMonth)}</div>
                                {deal.revenueInMonth !== deal.amount && <div style={{ fontSize: 10, color: "#64748B" }}>of {fmt(deal.amount)} total</div>}
                              </div>
                            </div>
                          </div>
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
                  <div key={i} style={{ background: "#1E293B", borderRadius: 8, padding: 14, marginBottom: 8, border: "1px solid #334155" }}>
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
              <div style={{ marginTop: 16, background: "#1E293B", borderRadius: 8, padding: 14, textAlign: "center", border: "1px solid #334155" }}>
                <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>12-Month Total Revenue</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: "#10B981", marginTop: 4 }}>{fmt(data.summary?.totalRevenue)}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SumCard({ label, value, color, sub }) {
  return (
    <div style={{ background: "#1E293B", borderRadius: 8, padding: "10px", textAlign: "center", border: "1px solid #334155" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "#94A3B8" }}>{sub}</div>}
    </div>
  );
}

const overlay = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" };
const modal = { background: "#0F172A", borderRadius: 14, width: 720, maxWidth: "95vw", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid #334155" };
const header = { padding: "14px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 };
const tabBtn = (active) => ({ padding: "4px 12px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 11, fontWeight: 600, background: active ? "#10B981" : "transparent", color: active ? "#fff" : "#94A3B8" });
