import { useState, useEffect } from "react";
const fmt = (n) => "$" + (n || 0).toLocaleString();
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");

export default function BoardReport({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedQ, setSelectedQ] = useState(null);
  const [compareQ, setCompareQ] = useState(null);
  const [quarters, setQuarters] = useState([]);
  const [tab, setTab] = useState("narrative"); // narrative | deals | comparison

  const fetchReport = (q, comp) => {
    setLoading(true); setError(null);
    const params = new URLSearchParams();
    if (q) params.set("quarter", q);
    if (comp) params.set("compare", comp);
    fetch(`/.netlify/functions/board-report?${params}`)
      .then(r => { if (!r.ok) throw new Error(`Status ${r.status}`); return r.json(); })
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setData(d);
        if (d.quarters?.length) setQuarters(d.quarters);
        if (!selectedQ && d.primary?.label) setSelectedQ(`Q${d.primary.quarter}-${d.primary.year}`);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  useEffect(() => { fetchReport(selectedQ, compareQ); }, []);

  const changeQuarter = (q) => { setSelectedQ(q); setCompareQ(null); setTab("narrative"); fetchReport(q, null); };
  const toggleCompare = (q) => { const c = compareQ === q ? null : q; setCompareQ(c); fetchReport(selectedQ, c); };

  const m = data?.primary?.metrics || {};
  const cm = data?.compare?.metrics;

  const copyReport = () => {
    if (!data) return;
    const sections = [
      `QUARTERLY BUSINESS REVIEW — SKALED CONSULTING — ${data.primary?.label}`,
      data.executiveSummary, data.revenueUpdate, data.pipelineHealth,
      data.winLossAnalysis, data.clientUpdates, data.risks, data.outlook,
      data.quarterComparison,
    ].filter(Boolean).join("\n\n");
    navigator.clipboard.writeText(strip(sections));
  };

  const MetricCard = ({ label, value, compareValue, color, prefix }) => {
    const delta = compareValue != null ? (typeof value === "number" && typeof compareValue === "number" ? value - compareValue : null) : null;
    return (
      <div style={{ background: "#1E293B", borderRadius: 8, padding: "10px 12px", textAlign: "center", border: "1px solid #334155" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: color || "#F1F5F9" }}>{prefix === "$" ? fmt(value) : `${value}${prefix || ""}`}</div>
        <div style={{ fontSize: 10, color: "#64748B", marginTop: 1, textTransform: "uppercase" }}>{label}</div>
        {delta != null && (
          <div style={{ fontSize: 10, color: delta >= 0 ? "#10B981" : "#EF4444", marginTop: 2 }}>
            {delta >= 0 ? "+" : ""}{prefix === "$" ? fmt(delta) : delta}{prefix === "%" ? "pp" : ""} vs {data.compare?.label}
          </div>
        )}
      </div>
    );
  };

  const Section = ({ title, content, color }) => content ? (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: color || "#F1F5F9", marginBottom: 6, textTransform: "uppercase", borderBottom: "1px solid #334155", paddingBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{strip(content)}</div>
    </div>
  ) : null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#0F172A", borderRadius: 12, width: 760, maxWidth: "95vw", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid #334155" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9" }}>Quarterly Business Review</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>Skaled Consulting</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {data && <button style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: "#10B981", color: "#fff" }} onClick={copyReport}>Copy</button>}
            <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20 }} onClick={onClose}>x</button>
          </div>
        </div>

        {/* Quarter selector */}
        <div style={{ padding: "10px 20px", borderBottom: "1px solid #1E293B", display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "#64748B", marginRight: 4 }}>Quarter:</span>
          {quarters.map(q => (
            <button key={q} style={{
              padding: "4px 10px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer",
              fontSize: 11, fontWeight: 600,
              background: selectedQ === q ? "#10B981" : "transparent", color: selectedQ === q ? "#fff" : "#94A3B8",
            }} onClick={() => changeQuarter(q)}>{q.replace("-", " ")}</button>
          ))}
          <span style={{ width: 1, height: 16, background: "#334155", margin: "0 4px" }} />
          <span style={{ fontSize: 11, color: "#64748B" }}>Compare:</span>
          {quarters.filter(q => q !== selectedQ).map(q => (
            <button key={q} style={{
              padding: "4px 10px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer",
              fontSize: 11, fontWeight: 600,
              background: compareQ === q ? "#8B5CF6" : "transparent", color: compareQ === q ? "#fff" : "#64748B",
            }} onClick={() => toggleCompare(q)}>{q.replace("-", " ")}</button>
          ))}
        </div>

        {/* View tabs */}
        <div style={{ padding: "8px 20px", borderBottom: "1px solid #1E293B", display: "flex", gap: 4, flexShrink: 0 }}>
          {[["narrative", "Report"], ["deals", "Deals"], ...(data?.compare ? [["comparison", "Comparison"]] : [])].map(([k, l]) => (
            <button key={k} style={{
              padding: "5px 12px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer",
              fontSize: 11, fontWeight: 600,
              background: tab === k ? "#10B981" : "transparent", color: tab === k ? "#fff" : "#94A3B8",
            }} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading && <div style={{ textAlign: "center", padding: 50, color: "#8B5CF6" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Generating QBR...</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>Analyzing {selectedQ?.replace("-", " ") || "current quarter"} data</div>
          </div>}
          {error && <div style={{ color: "#EF4444", padding: 20 }}>{strip(typeof error === "string" ? error : JSON.stringify(error))}</div>}

          {data && !loading && (
            <>
              {/* Metrics grid — always visible */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
                <MetricCard label="Revenue" value={m.wonAmount} compareValue={cm?.wonAmount} color="#10B981" prefix="$" />
                <MetricCard label="Won" value={m.wonCount} compareValue={cm?.wonCount} color="#10B981" />
                <MetricCard label="Lost" value={m.lostCount} compareValue={cm?.lostCount} color="#EF4444" />
                <MetricCard label="Win Rate" value={m.winRate} compareValue={cm?.winRate} color={m.winRate >= 40 ? "#10B981" : "#F59E0B"} prefix="%" />
                <MetricCard label="Avg Deal" value={m.avgWonDeal} compareValue={cm?.avgWonDeal} color="#3B82F6" prefix="$" />
                <MetricCard label="Pipeline" value={m.openPipeline} compareValue={cm?.openPipeline} color="#F1F5F9" prefix="$" />
                <MetricCard label="Weighted" value={m.weightedPipeline} compareValue={cm?.weightedPipeline} color="#8B5CF6" prefix="$" />
                <MetricCard label="Lost Rev" value={m.lostAmount} compareValue={cm?.lostAmount} color="#EF4444" prefix="$" />
              </div>

              {/* NARRATIVE TAB */}
              {tab === "narrative" && (
                <>
                  <Section title="Executive Summary" content={data.executiveSummary} color="#8B5CF6" />
                  <Section title="Revenue Update" content={data.revenueUpdate} color="#10B981" />
                  <Section title="Pipeline Health" content={data.pipelineHealth} color="#3B82F6" />
                  <Section title="Win/Loss Analysis" content={data.winLossAnalysis} color="#F59E0B" />
                  <Section title="Client Updates" content={data.clientUpdates} color="#06B6D4" />
                  <Section title="Risks" content={data.risks} color="#EF4444" />
                  <Section title="Outlook" content={data.outlook} color="#10B981" />
                </>
              )}

              {/* DEALS TAB */}
              {tab === "deals" && (
                <>
                  {data.primary?.wonDeals?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#10B981", marginBottom: 8, textTransform: "uppercase" }}>Won Deals ({data.primary.wonDeals.length})</div>
                      {data.primary.wonDeals.map((d, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", background: "#1E293B", borderRadius: 6, padding: "8px 12px", marginBottom: 4, border: "1px solid #334155" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{d.name}</div>
                            <div style={{ fontSize: 11, color: "#94A3B8" }}>{d.account} · {d.source} · {d.closeDate}</div>
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#10B981" }}>{fmt(d.amount)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {data.primary?.lostDeals?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#EF4444", marginBottom: 8, textTransform: "uppercase" }}>Lost Deals ({data.primary.lostDeals.length})</div>
                      {data.primary.lostDeals.map((d, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", background: "#1E293B", borderRadius: 6, padding: "8px 12px", marginBottom: 4, border: "1px solid #334155" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{d.name}</div>
                            <div style={{ fontSize: 11, color: "#94A3B8" }}>{d.account} · {d.reason}</div>
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#EF4444" }}>{fmt(d.amount)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {data.primary?.wonBySource?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#3B82F6", marginBottom: 8, textTransform: "uppercase" }}>Revenue by Source</div>
                      {data.primary.wonBySource.map((s, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                          <div style={{ width: 100, fontSize: 12, color: "#CBD5E1" }}>{s.source}</div>
                          <div style={{ flex: 1, background: "#0F172A", borderRadius: 4, height: 16, overflow: "hidden" }}>
                            <div style={{ width: `${Math.min((s.amount / (data.primary.wonBySource[0]?.amount || 1)) * 100, 100)}%`, height: "100%", background: "#3B82F6", borderRadius: 4 }} />
                          </div>
                          <div style={{ width: 80, textAlign: "right", fontSize: 12, fontWeight: 600, color: "#F1F5F9" }}>{fmt(s.amount)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {data.primary?.lossReasons?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#F59E0B", marginBottom: 8, textTransform: "uppercase" }}>Loss Reasons</div>
                      {data.primary.lossReasons.map((r, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#CBD5E1", marginBottom: 4 }}>
                          <span>{r.reason}</span><span style={{ color: "#F59E0B", fontWeight: 600 }}>{r.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* COMPARISON TAB */}
              {tab === "comparison" && data.compare && (
                <>
                  {data.quarterComparison && <Section title={`${data.primary.label} vs ${data.compare.label}`} content={data.quarterComparison} color="#8B5CF6" />}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 8, textAlign: "center" }}>{data.primary.label}</div>
                      <div style={{ background: "#1E293B", borderRadius: 8, padding: 14, textAlign: "center", border: "1px solid #334155" }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color: "#10B981" }}>{fmt(m.wonAmount)}</div>
                        <div style={{ fontSize: 11, color: "#64748B" }}>{m.wonCount} won · {m.lostCount} lost</div>
                        <div style={{ fontSize: 13, color: "#F1F5F9", marginTop: 4 }}>{m.winRate}% win rate</div>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 8, textAlign: "center" }}>{data.compare.label}</div>
                      <div style={{ background: "#1E293B", borderRadius: 8, padding: 14, textAlign: "center", border: "1px solid #334155" }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color: "#10B981" }}>{fmt(cm.wonAmount)}</div>
                        <div style={{ fontSize: 11, color: "#64748B" }}>{cm.wonCount} won · {cm.lostCount} lost</div>
                        <div style={{ fontSize: 13, color: "#F1F5F9", marginTop: 4 }}>{cm.winRate}% win rate</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
