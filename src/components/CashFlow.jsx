import { useState, useEffect } from "react";
const fmt = (n) => "$" + (n || 0).toLocaleString();

export default function CashFlow({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/.netlify/functions/cash-flow")
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const maxTotal = data?.monthly ? Math.max(...data.monthly.map(m => m.committed + m.bestCase + m.pipeline), 1) : 1;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#0F172A", borderRadius: 12, width: 660, maxWidth: "95vw", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid #334155" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>Cash Flow Projection</div>
          <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20 }} onClick={onClose}>x</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading && <div style={{ textAlign: "center", padding: 40, color: "#8B5CF6" }}>Building forecast...</div>}

          {data && (
            <>
              {/* Summary */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
                {[
                  { label: "Next 30d", value: fmt(data.summary?.next30d), color: "#10B981" },
                  { label: "Next 60d", value: fmt(data.summary?.next60d), color: "#3B82F6" },
                  { label: "Next 90d", value: fmt(data.summary?.next90d), color: "#8B5CF6" },
                  { label: "Closed This Q", value: fmt(data.closedThisQuarter?.total), color: "#F59E0B", sub: `${data.closedThisQuarter?.count || 0} deals` },
                ].map((c, i) => (
                  <div key={i} style={{ background: "#1E293B", borderRadius: 8, padding: "12px", textAlign: "center", border: "1px solid #334155" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value}</div>
                    <div style={{ fontSize: 10, color: "#64748B", marginTop: 2, textTransform: "uppercase" }}>{c.label}</div>
                    {c.sub && <div style={{ fontSize: 10, color: "#94A3B8" }}>{c.sub}</div>}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 11 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#10B981" }} /> Commit</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#F59E0B" }} /> Best Case</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#8B5CF6" }} /> Pipeline</span>
              </div>

              {/* Monthly bars */}
              {data.monthly?.map((m, i) => {
                const total = m.committed + m.bestCase + m.pipeline;
                const pct = (v) => Math.max((v / maxTotal) * 100, 0);
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9" }}>{m.month}</span>
                      <span style={{ fontSize: 12, color: "#94A3B8" }}>{fmt(total)}</span>
                    </div>
                    <div style={{ display: "flex", height: 24, borderRadius: 4, overflow: "hidden", background: "#0F1117" }}>
                      {m.committed > 0 && <div style={{ width: `${pct(m.committed)}%`, background: "#10B981", transition: "width .3s" }} />}
                      {m.bestCase > 0 && <div style={{ width: `${pct(m.bestCase)}%`, background: "#F59E0B", transition: "width .3s" }} />}
                      {m.pipeline > 0 && <div style={{ width: `${pct(m.pipeline)}%`, background: "#8B5CF6", transition: "width .3s" }} />}
                    </div>
                    <div style={{ display: "flex", gap: 12, marginTop: 2, fontSize: 10, color: "#64748B" }}>
                      {m.committed > 0 && <span>Commit: {fmt(m.committed)}</span>}
                      {m.bestCase > 0 && <span>Best: {fmt(m.bestCase)}</span>}
                      {m.pipeline > 0 && <span>Pipe: {fmt(m.pipeline)}</span>}
                    </div>
                  </div>
                );
              })}

              <div style={{ marginTop: 16, background: "#1E293B", borderRadius: 8, padding: 14, textAlign: "center", border: "1px solid #334155" }}>
                <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase" }}>Total 6-Month Projection</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#10B981", marginTop: 4 }}>{fmt(data.summary?.totalProjected)}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
