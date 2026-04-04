import { useState, useEffect } from "react";
const fmt = (n) => "$" + (n || 0).toLocaleString();
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");
const urgencyColor = { high: "#EF4444", medium: "#F59E0B", low: "#3B82F6" };
const confColor = { high: "#10B981", medium: "#F59E0B", low: "#64748B" };

export default function ExpansionSignals({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/.netlify/functions/expansion-signals")
      .then(r => r.json()).then(d => { setData(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const sorted = (data || []).sort((a, b) => {
    const o = { high: 0, medium: 1, low: 2 };
    return (o[a.urgency] ?? 2) - (o[b.urgency] ?? 2);
  });

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#0F172A", borderRadius: 12, width: 660, maxWidth: "95vw", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid #334155" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>Expansion Opportunities</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>AI-detected signals from active clients</div>
          </div>
          <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20 }} onClick={onClose}>x</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading && <div style={{ textAlign: "center", padding: 40, color: "#8B5CF6" }}>Scanning client interactions...</div>}
          {!loading && sorted.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#64748B" }}>No expansion signals detected</div>}

          {sorted.map((client, i) => (
            <div key={i} style={{ background: "#1E293B", borderRadius: 8, padding: 16, marginBottom: 10, border: "1px solid #334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9" }}>{client.accountName}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {client.estimatedExpansionValue > 0 && <span style={{ fontSize: 16, fontWeight: 700, color: "#10B981" }}>{fmt(client.estimatedExpansionValue)}</span>}
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: (urgencyColor[client.urgency] || "#64748B") + "20", color: urgencyColor[client.urgency] || "#64748B" }}>{client.urgency}</span>
                </div>
              </div>

              {/* Signals */}
              {client.signals?.map((sig, j) => (
                <div key={j} style={{ background: "#0F172A", borderRadius: 6, padding: "8px 12px", marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "#334155", color: "#94A3B8", marginRight: 6 }}>{sig.type}</span>
                    <span style={{ fontSize: 12, color: "#CBD5E1" }}>{strip(sig.evidence)}</span>
                  </div>
                  <span style={{ fontSize: 10, color: confColor[sig.confidence] || "#64748B", fontWeight: 600, marginLeft: 8 }}>{sig.confidence}</span>
                </div>
              ))}

              {/* Recommended action */}
              {client.recommendedAction && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#10B981", fontStyle: "italic" }}>
                  → {strip(client.recommendedAction)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
