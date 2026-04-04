import { useState, useEffect } from "react";
const fmt = (n) => "$" + (n || 0).toLocaleString();
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");

export default function BoardReport({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/.netlify/functions/board-report")
      .then(r => { if (!r.ok) throw new Error(`Status ${r.status}`); return r.json(); })
      .then(d => { if (d.error) setError(d.error); else setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const copyReport = () => {
    if (!data) return;
    const sections = [
      `QUARTERLY BUSINESS REVIEW — SKALED CONSULTING`,
      `Generated: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" })}`,
      `\n--- EXECUTIVE SUMMARY ---\n${data.executiveSummary || ""}`,
      `\n--- REVENUE UPDATE ---\n${data.revenueUpdate || ""}`,
      `\n--- PIPELINE HEALTH ---\n${data.pipelineHealth || ""}`,
      `\n--- WIN/LOSS ANALYSIS ---\n${data.winLossAnalysis || ""}`,
      `\n--- CLIENT UPDATES ---\n${data.clientUpdates || ""}`,
      `\n--- RISKS ---\n${data.risks || ""}`,
      `\n--- OUTLOOK ---\n${data.outlook || ""}`,
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(strip(sections));
  };

  const card = { background: "#1E293B", borderRadius: 8, padding: "10px 12px", textAlign: "center", border: "1px solid #334155" };
  const section = (title, content, color) => content ? (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: color || "#F1F5F9", marginBottom: 8, textTransform: "uppercase", borderBottom: "1px solid #334155", paddingBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{strip(content)}</div>
    </div>
  ) : null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#0F172A", borderRadius: 12, width: 720, maxWidth: "95vw", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid #334155" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9" }}>Quarterly Business Review</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>Skaled Consulting — {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/Chicago" })}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {data && <button style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: "#10B981", color: "#fff" }} onClick={copyReport}>Copy Report</button>}
            <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20 }} onClick={onClose}>x</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {loading && <div style={{ textAlign: "center", padding: 60, color: "#8B5CF6" }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Generating QBR...</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>Analyzing pipeline, revenue, and client data</div>
          </div>}
          {error && <div style={{ color: "#EF4444", padding: 20 }}>{strip(typeof error === "string" ? error : JSON.stringify(error))}</div>}

          {data && (
            <>
              {/* Key Metrics */}
              {data.keyMetrics && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 24 }}>
                  <div style={card}><div style={{ fontSize: 20, fontWeight: 700, color: "#F1F5F9" }}>{fmt(data.keyMetrics.totalPipeline)}</div><div style={{ fontSize: 10, color: "#64748B" }}>PIPELINE</div></div>
                  <div style={card}><div style={{ fontSize: 20, fontWeight: 700, color: "#10B981" }}>{fmt(data.keyMetrics.weightedForecast)}</div><div style={{ fontSize: 10, color: "#64748B" }}>WEIGHTED</div></div>
                  <div style={card}><div style={{ fontSize: 20, fontWeight: 700, color: "#3B82F6" }}>{fmt(data.keyMetrics.wonThisQ)}</div><div style={{ fontSize: 10, color: "#64748B" }}>WON THIS Q</div></div>
                  <div style={card}><div style={{ fontSize: 20, fontWeight: 700, color: "#EF4444" }}>{fmt(data.keyMetrics.lostThisQ)}</div><div style={{ fontSize: 10, color: "#64748B" }}>LOST THIS Q</div></div>
                  <div style={card}><div style={{ fontSize: 20, fontWeight: 700, color: data.keyMetrics.winRate >= 40 ? "#10B981" : "#F59E0B" }}>{data.keyMetrics.winRate}%</div><div style={{ fontSize: 10, color: "#64748B" }}>WIN RATE</div></div>
                  <div style={card}><div style={{ fontSize: 20, fontWeight: 700, color: "#F1F5F9" }}>{fmt(data.keyMetrics.avgDealSize)}</div><div style={{ fontSize: 10, color: "#64748B" }}>AVG DEAL</div></div>
                </div>
              )}

              {section("Executive Summary", data.executiveSummary, "#8B5CF6")}
              {section("Revenue Update", data.revenueUpdate, "#10B981")}
              {section("Pipeline Health", data.pipelineHealth, "#3B82F6")}
              {section("Win/Loss Analysis", data.winLossAnalysis, "#F59E0B")}
              {section("Client Updates", data.clientUpdates, "#06B6D4")}
              {section("Risks", data.risks, "#EF4444")}
              {section("Outlook", data.outlook, "#10B981")}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
