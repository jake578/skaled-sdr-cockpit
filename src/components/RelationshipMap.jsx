import { useState, useEffect } from "react";
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");
const engColor = { high: "#10B981", medium: "#F59E0B", low: "#EF4444", none: "#64748B" };
const roleColor = { champion: "#10B981", influencer: "#3B82F6", blocker: "#EF4444", "end-user": "#94A3B8", unknown: "#64748B" };

export default function RelationshipMap({ accountId, accountName, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/.netlify/functions/relationship-map", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, accountName }),
    }).then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ position: "fixed", top: 0, right: 0, width: 520, height: "100vh", background: "#0F172A", borderLeft: "1px solid #1E293B", zIndex: 2000, display: "flex", flexDirection: "column", boxShadow: "-4px 0 30px rgba(0,0,0,0.5)" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>Relationship Map</div>
          <div style={{ fontSize: 12, color: "#64748B" }}>{accountName}</div>
        </div>
        <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20 }} onClick={onClose}>x</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {loading && <div style={{ textAlign: "center", padding: 40, color: "#8B5CF6" }}>Mapping relationships...</div>}

        {data && (
          <>
            {/* Contacts grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {(data.contacts || []).map((c, i) => (
                <div key={i} style={{ background: "#1E293B", borderRadius: 8, padding: 12, border: "1px solid #334155" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{c.title || "—"}</div>
                    </div>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: engColor[c.engagementLevel] || "#64748B", flexShrink: 0, marginTop: 4 }} />
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: (roleColor[c.dealRole] || "#64748B") + "20", color: roleColor[c.dealRole] || "#64748B" }}>{c.dealRole || "unknown"}</span>
                    <span style={{ fontSize: 10, color: "#64748B" }}>{c.engagementLevel}</span>
                  </div>
                  {/* Strength bar */}
                  <div style={{ background: "#0F172A", borderRadius: 3, height: 4, marginBottom: 4 }}>
                    <div style={{ width: `${((c.relationshipStrength || 0) / 10) * 100}%`, height: 4, borderRadius: 3, background: engColor[c.engagementLevel] || "#64748B" }} />
                  </div>
                  {c.lastInteraction && <div style={{ fontSize: 10, color: "#64748B" }}>Last: {c.lastInteraction}</div>}
                  {c.notes && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{strip(c.notes)}</div>}
                </div>
              ))}
            </div>

            {/* Risks */}
            {data.risks?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#EF4444", marginBottom: 6, textTransform: "uppercase" }}>Risks</div>
                {data.risks.map((r, i) => (
                  <div key={i} style={{ background: "#EF444410", borderRadius: 6, padding: "8px 12px", marginBottom: 4, fontSize: 12, color: "#FCA5A5", borderLeft: "3px solid #EF4444" }}>{strip(r)}</div>
                ))}
              </div>
            )}

            {/* Gaps */}
            {data.gaps?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#F59E0B", marginBottom: 6, textTransform: "uppercase" }}>Missing Personas</div>
                {data.gaps.map((g, i) => (
                  <div key={i} style={{ background: "#F59E0B10", borderRadius: 6, padding: "8px 12px", marginBottom: 4, fontSize: 12, color: "#FCD34D", borderLeft: "3px solid #F59E0B" }}>{strip(g)}</div>
                ))}
              </div>
            )}

            {/* Recommendations */}
            {data.recommendations?.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#10B981", marginBottom: 6, textTransform: "uppercase" }}>Recommendations</div>
                {data.recommendations.map((r, i) => (
                  <div key={i} style={{ background: "#10B98110", borderRadius: 6, padding: "8px 12px", marginBottom: 4, fontSize: 12, color: "#6EE7B7", borderLeft: "3px solid #10B981" }}>{strip(r)}</div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
