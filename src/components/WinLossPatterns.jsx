import { useState, useEffect } from "react";
const fmt = (n) => "$" + (n || 0).toLocaleString();
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");

export default function WinLossPatterns({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview"); // overview | deals | people | reasons
  const [drillDeals, setDrillDeals] = useState(null); // { label, deals }
  const [expandedDeal, setExpandedDeal] = useState(null);
  const [dealFilter, setDealFilter] = useState("all"); // all | won | lost

  useEffect(() => {
    fetch("/.netlify/functions/win-loss-patterns")
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const drill = (label, deals) => setDrillDeals(drillDeals?.label === label ? null : { label, deals });

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={header}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>Win/Loss Analysis</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>Last 12 months · Click any bar to see deals</div>
          </div>
          <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 22 }} onClick={onClose}>x</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: "8px 20px", borderBottom: "1px solid #1E293B", flexShrink: 0 }}>
          {[["overview", "Patterns"], ["deals", "All Deals"], ["people", "By Person"], ["reasons", "Loss Reasons"]].map(([k, l]) => (
            <button key={k} style={{ padding: "5px 14px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 11, fontWeight: 600, background: tab === k ? "#10B981" : "transparent", color: tab === k ? "#fff" : "#94A3B8" }} onClick={() => { setTab(k); setDrillDeals(null); }}>{l}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading && <div style={{ textAlign: "center", padding: 40, color: "#8B5CF6" }}>Analyzing deal history...</div>}

          {data && (
            <>
              {/* Totals — always visible */}
              {data.totals && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                  <div style={card}><div style={{ fontSize: 22, fontWeight: 700, color: data.totals.winRate >= 40 ? "#10B981" : "#F59E0B" }}>{data.totals.winRate}%</div><div style={cardLabel}>WIN RATE</div></div>
                  <div style={card}><div style={{ fontSize: 22, fontWeight: 700, color: "#10B981" }}>{fmt(data.totals.wonAmount)}</div><div style={cardLabel}>{data.totals.won} WON</div></div>
                  <div style={card}><div style={{ fontSize: 22, fontWeight: 700, color: "#EF4444" }}>{fmt(data.totals.lostAmount)}</div><div style={cardLabel}>{data.totals.lost} LOST</div></div>
                  <div style={card}><div style={{ fontSize: 22, fontWeight: 700, color: "#3B82F6" }}>{data.totals.avgWonCycle}d</div><div style={cardLabel}>AVG WON CYCLE</div></div>
                </div>
              )}

              {/* OVERVIEW TAB */}
              {tab === "overview" && (
                <>
                  {data.sweetSpot && (
                    <div style={{ background: "#10B98115", borderRadius: 8, padding: 16, marginBottom: 16, border: "1px solid #10B98130" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#10B981", marginBottom: 4 }}>Sweet Spot</div>
                      <div style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.5 }}>{strip(data.sweetSpot.description)}</div>
                    </div>
                  )}
                  {data.blindSpots?.length > 0 && data.blindSpots.map((b, i) => (
                    <div key={i} style={{ background: "#EF444410", borderRadius: 6, padding: "8px 12px", marginBottom: 4, borderLeft: "3px solid #EF4444" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#FCA5A5" }}>{strip(b.area)}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{strip(b.insight)}</div>
                    </div>
                  ))}
                  <div style={{ height: 12 }} />
                  <PatternBars label="By Deal Size" items={data.patterns?.bySize} onDrill={drill} />
                  <PatternBars label="By Source" items={data.patterns?.bySource} onDrill={drill} />
                  <PatternBars label="By Industry" items={data.patterns?.byIndustry} onDrill={drill} />
                  {data.recommendations?.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#10B981", marginBottom: 6, textTransform: "uppercase" }}>Recommendations</div>
                      {data.recommendations.map((r, i) => <div key={i} style={{ fontSize: 12, color: "#CBD5E1", marginBottom: 4 }}>{i + 1}. {strip(r)}</div>)}
                    </div>
                  )}
                </>
              )}

              {/* DEALS TAB */}
              {tab === "deals" && (
                <>
                  <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                    {[["all", "All"], ["won", "Won"], ["lost", "Lost"]].map(([k, l]) => (
                      <button key={k} style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 11, fontWeight: 600, background: dealFilter === k ? (k === "won" ? "#10B981" : k === "lost" ? "#EF4444" : "#334155") : "transparent", color: dealFilter === k ? "#fff" : "#94A3B8" }} onClick={() => setDealFilter(k)}>{l}</button>
                    ))}
                  </div>
                  {(dealFilter === "all" ? [...(data.wonDeals || []), ...(data.lostDeals || [])] : dealFilter === "won" ? data.wonDeals || [] : data.lostDeals || [])
                    .sort((a, b) => b.amount - a.amount)
                    .map(d => <DealRow key={d.id} deal={d} expanded={expandedDeal === d.id} onToggle={() => setExpandedDeal(expandedDeal === d.id ? null : d.id)} />)}
                </>
              )}

              {/* PEOPLE TAB */}
              {tab === "people" && data.patterns?.byOwner?.map((owner, i) => (
                <div key={i} style={{ background: "#1E293B", borderRadius: 8, padding: 14, marginBottom: 8, border: "1px solid #334155", cursor: "pointer" }} onClick={() => drill(owner.label, owner.deals)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{owner.label}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{owner.total} deals · Avg cycle: {owner.avgCycle}d</div>
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: owner.winRate >= 40 ? "#10B981" : "#F59E0B" }}>{owner.winRate}%</div>
                        <div style={{ fontSize: 9, color: "#64748B" }}>WIN RATE</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#10B981" }}>{owner.won}</div>
                        <div style={{ fontSize: 9, color: "#64748B" }}>WON</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#EF4444" }}>{owner.lost}</div>
                        <div style={{ fontSize: 9, color: "#64748B" }}>LOST</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{fmt(owner.wonAmount)}</div>
                    </div>
                  </div>
                  {/* Win rate bar */}
                  <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "#EF4444", marginTop: 8 }}>
                    <div style={{ width: `${owner.winRate}%`, background: "#10B981", borderRadius: 3 }} />
                  </div>
                </div>
              ))}

              {/* REASONS TAB */}
              {tab === "reasons" && data.topLossReasons?.map((r, i) => (
                <div key={i} style={{ background: "#1E293B", borderRadius: 8, padding: 14, marginBottom: 8, border: "1px solid #334155", cursor: "pointer", borderLeft: "3px solid #EF4444" }} onClick={() => drill(r.reason, r.deals)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#F1F5F9" }}>{r.reason}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{r.count} deal{r.count !== 1 ? "s" : ""} · {fmt(r.amount)} lost</div>
                    </div>
                    <span style={{ color: "#64748B" }}>→</span>
                  </div>
                </div>
              ))}

              {/* DRILL VIEW — deals behind any clicked bar */}
              {drillDeals && (
                <div style={{ background: "#0F1117", borderRadius: 8, padding: 14, marginTop: 12, border: "1px solid #334155" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9" }}>
                      {drillDeals.label} <span style={{ fontWeight: 400, color: "#64748B" }}>({drillDeals.deals?.length} deals)</span>
                    </div>
                    <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer" }} onClick={() => setDrillDeals(null)}>x</button>
                  </div>
                  {(drillDeals.deals || []).sort((a, b) => b.amount - a.amount).map(d => (
                    <DealRow key={d.id} deal={d} expanded={expandedDeal === d.id} onToggle={() => setExpandedDeal(expandedDeal === d.id ? null : d.id)} />
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

// ── Pattern Bars (clickable) ────────────────────────────────────
function PatternBars({ label, items, onDrill }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#F1F5F9", marginBottom: 8, textTransform: "uppercase" }}>{label}</div>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }} onClick={() => onDrill(item.label, item.deals)}>
          <div style={{ width: 90, fontSize: 11, color: "#CBD5E1", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
          <div style={{ flex: 1, background: "#0F172A", borderRadius: 4, height: 20, overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${item.winRate || 0}%`, height: "100%", background: "#10B981", borderRadius: "4px 0 0 4px" }} />
            <div style={{ width: `${100 - (item.winRate || 0)}%`, height: "100%", background: "#EF444460" }} />
          </div>
          <div style={{ width: 36, fontSize: 12, fontWeight: 600, color: item.winRate >= 50 ? "#10B981" : item.winRate >= 30 ? "#F59E0B" : "#EF4444", textAlign: "right" }}>{item.winRate}%</div>
          <div style={{ width: 55, fontSize: 10, color: "#64748B", textAlign: "right" }}>{item.won}W/{item.lost}L</div>
        </div>
      ))}
    </div>
  );
}

// ── Deal Row (expandable with contacts) ─────────────────────────
function DealRow({ deal, expanded, onToggle }) {
  return (
    <div style={{ background: "#1E293B", borderRadius: 6, padding: "8px 12px", marginBottom: 3, borderLeft: `3px solid ${deal.isWon ? "#10B981" : "#EF4444"}`, cursor: "pointer" }} onClick={onToggle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9" }}>{deal.name}</div>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>{deal.account} · {deal.source} · {deal.closeDate}</div>
        </div>
        <div style={{ textAlign: "right", marginLeft: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: deal.isWon ? "#10B981" : "#EF4444" }}>{fmt(deal.amount)}</div>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: deal.isWon ? "#10B98120" : "#EF444420", color: deal.isWon ? "#10B981" : "#EF4444" }}>{deal.isWon ? "WON" : "LOST"}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #334155" }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8, fontSize: 11 }}>
            <div><span style={{ color: "#64748B" }}>Cycle:</span> <span style={{ color: "#CBD5E1" }}>{deal.cycleDays}d</span></div>
            <div><span style={{ color: "#64748B" }}>Industry:</span> <span style={{ color: "#CBD5E1" }}>{deal.industry}</span></div>
            <div><span style={{ color: "#64748B" }}>Owner:</span> <span style={{ color: "#CBD5E1" }}>{deal.owner}</span></div>
            {!deal.isWon && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "#EF4444" }}>Loss Reason:</span> <span style={{ color: "#FCA5A5" }}>{deal.lossReason}{deal.lossDetails ? ` — ${deal.lossDetails}` : ""}</span></div>}
          </div>

          {/* Contacts on the deal */}
          {deal.contacts?.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#64748B", marginBottom: 4, textTransform: "uppercase" }}>People on this deal ({deal.contactCount})</div>
              {deal.contacts.map((c, j) => (
                <div key={j} style={{ display: "flex", justifyContent: "space-between", background: "#0F172A", borderRadius: 4, padding: "4px 10px", marginBottom: 2, fontSize: 11 }}>
                  <div>
                    <span style={{ color: "#F1F5F9", fontWeight: 600 }}>{c.name}</span>
                    <span style={{ color: "#64748B", marginLeft: 6 }}>{c.title}</span>
                  </div>
                  {c.email && c.email !== "—" && <span style={{ color: "#3B82F6" }}>{c.email}</span>}
                </div>
              ))}
            </div>
          )}

          <a href={`https://skaled.my.salesforce.com/${deal.id}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6, padding: "4px 10px", borderRadius: 4, background: "#00A1E0", color: "#fff", textDecoration: "none", fontSize: 11, fontWeight: 600 }}>Open in SFDC</a>
        </div>
      )}
    </div>
  );
}

const overlay = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" };
const modal = { background: "#0F172A", borderRadius: 14, width: 760, maxWidth: "95vw", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid #334155" };
const header = { padding: "14px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 };
const card = { background: "#1E293B", borderRadius: 8, padding: "10px", textAlign: "center", border: "1px solid #334155" };
const cardLabel = { fontSize: 10, color: "#64748B", textTransform: "uppercase", marginTop: 1 };
