import { useState, useEffect } from "react";

const styles = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.5)", zIndex: 2000,
  },
  panel: {
    position: "fixed", top: 0, right: 0, width: 520, height: "100vh",
    background: "#0F172A", borderLeft: "1px solid #1E293B",
    display: "flex", flexDirection: "column", zIndex: 2001,
    boxShadow: "-4px 0 30px rgba(0,0,0,0.5)",
    animation: "fadeIn .2s",
    overflowY: "auto",
  },
  header: {
    padding: "16px 20px", borderBottom: "1px solid #1E293B",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    position: "sticky", top: 0, background: "#0F172A", zIndex: 1,
  },
  title: { fontSize: 16, fontWeight: 700, color: "#F1F5F9" },
  subtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  closeBtn: {
    background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20,
  },
  body: { padding: 20, flex: 1 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 13, fontWeight: 700, color: "#94A3B8", marginBottom: 8,
    textTransform: "uppercase", letterSpacing: "0.5px",
  },
  healthScore: (score) => ({
    display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
    background: "#1E293B", borderRadius: 10, padding: "16px 20px",
    border: `1px solid ${score >= 7 ? "#10B981" : score >= 4 ? "#F59E0B" : "#EF4444"}`,
  }),
  scoreNum: (score) => ({
    fontSize: 36, fontWeight: 800,
    color: score >= 7 ? "#10B981" : score >= 4 ? "#F59E0B" : "#EF4444",
  }),
  badge: (color) => ({
    display: "inline-block", padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
    background: color + "20", color: color, marginRight: 6, marginBottom: 4,
  }),
  listItem: {
    display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10,
    padding: "10px 12px", background: "#1E293B", borderRadius: 6, border: "1px solid #334155",
  },
  stepNum: {
    width: 24, height: 24, borderRadius: 6, background: "#10B981",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0,
  },
  skeleton: {
    background: "#1E293B", borderRadius: 6, height: 16, marginBottom: 8,
    animation: "fadeIn 1s infinite alternate",
  },
  warning: {
    background: "#7F1D1D20", border: "1px solid #EF4444", borderRadius: 8,
    padding: "12px 14px", marginBottom: 16,
  },
  summary: {
    background: "#1E293B", borderRadius: 8, padding: 14,
    fontSize: 13, color: "#CBD5E1", lineHeight: 1.6,
  },
  timelineItem: {
    display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8,
    paddingLeft: 12, borderLeft: "2px solid #334155",
  },
};

function LoadingSkeleton() {
  return (
    <div style={styles.body}>
      <div style={{ ...styles.skeleton, width: "60%", height: 40 }} />
      <div style={{ ...styles.skeleton, width: "100%", height: 20, marginTop: 16 }} />
      <div style={{ ...styles.skeleton, width: "80%", height: 20 }} />
      <div style={{ ...styles.skeleton, width: "90%", height: 20 }} />
      <div style={{ ...styles.skeleton, width: "100%", height: 60, marginTop: 16 }} />
      <div style={{ ...styles.skeleton, width: "100%", height: 60 }} />
      <div style={{ ...styles.skeleton, width: "100%", height: 60 }} />
      <div style={{ ...styles.skeleton, width: "70%", height: 20, marginTop: 16 }} />
      <div style={{ ...styles.skeleton, width: "100%", height: 80 }} />
    </div>
  );
}

export default function DealInspector({ oppId, oppName, onClose }) {
  const [data, setData] = useState(null);
  const [docs, setDocs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Fetch AI analysis and documents in parallel
    Promise.all([
      fetch("/.netlify/functions/ai-deal-inspect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oppId, oppName }),
      }).then(r => r.json()),
      fetch("/.netlify/functions/deal-documents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: oppName?.split("—")[0]?.trim() || oppName, oppName }),
      }).then(r => r.json()).catch(() => null),
    ]).then(([analysis, documents]) => {
      setData(analysis);
      if (documents && !documents.error) setDocs(documents);
      setLoading(false);
    }).catch(() => { setError("Failed to analyze deal"); setLoading(false); });
  }, [oppId, oppName]);

  return (
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div style={styles.panel}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>Deal Inspector</div>
            <div style={styles.subtitle}>{oppName}</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>x</button>
        </div>

        {loading && <LoadingSkeleton />}

        {error && (
          <div style={{ ...styles.body, textAlign: "center", color: "#EF4444" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>!</div>
            <div style={{ fontSize: 14 }}>{error}</div>
          </div>
        )}

        {data && !loading && (
          <div style={styles.body}>
            {/* Health Score */}
            <div style={styles.healthScore(data.healthScore || 5)}>
              <div style={styles.scoreNum(data.healthScore || 5)}>{data.healthScore || "?"}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>Health Score</div>
                <div style={{ fontSize: 12, color: "#94A3B8" }}>
                  {(data.healthScore || 5) >= 7 ? "Deal is on track" : (data.healthScore || 5) >= 4 ? "Needs attention" : "At risk"}
                </div>
              </div>
            </div>

            {/* Risk Factors */}
            {data.riskFactors?.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Risk Factors</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {data.riskFactors.map((r, i) => (
                    <span key={i} style={styles.badge("#EF4444")}>{r}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Strengths */}
            {data.strengths?.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Strengths</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {data.strengths.map((s, i) => (
                    <span key={i} style={styles.badge("#10B981")}>{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Stakeholder Gaps */}
            {data.stakeholderGaps?.length > 0 && (
              <div style={styles.warning}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#EF4444", marginBottom: 6 }}>Stakeholder Gaps</div>
                {data.stakeholderGaps.map((g, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#FCA5A5", marginBottom: 2 }}>- {g}</div>
                ))}
              </div>
            )}

            {/* Next Steps */}
            {data.nextSteps?.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Next Steps</div>
                {data.nextSteps.map((step, i) => (
                  <div key={i} style={styles.listItem}>
                    <div style={styles.stepNum}>{i + 1}</div>
                    <div style={{ fontSize: 13, color: "#E2E8F0", lineHeight: 1.4 }}>{step}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Activity Timeline */}
            {data.activityTimeline?.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Activity Timeline</div>
                {data.activityTimeline.map((item, i) => (
                  <div key={i} style={styles.timelineItem}>
                    <div>
                      <div style={{ fontSize: 11, color: "#64748B" }}>{item.date}</div>
                      <div style={{ fontSize: 13, color: "#E2E8F0" }}>{item.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Summary */}
            {data.summary && (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Summary</div>
                <div style={styles.summary}>{data.summary}</div>
              </div>
            )}

            {/* Documents */}
            {docs && (docs.docs?.length > 0 || docs.decks?.length > 0) && (
              <div style={styles.section}>
                <div style={{ ...styles.sectionTitle, color: "#8B5CF6" }}>Deal Documents</div>
                {docs.documentSummary && (
                  <div style={{ background: "#1E293B", borderRadius: 6, padding: 10, marginBottom: 8, fontSize: 12, color: "#CBD5E1", lineHeight: 1.5 }}>
                    {(docs.documentSummary || "").replace(/\*\*/g, "").replace(/\*/g, "")}
                  </div>
                )}
                {docs.decks?.map((d, i) => (
                  <a key={i} href={d.link} target="_blank" rel="noreferrer" style={{ display: "block", background: "#1E293B", borderRadius: 6, padding: "8px 12px", marginBottom: 4, textDecoration: "none", border: "1px solid #334155" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#F59E0B" }}>{d.name}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>{d.type === "gamma" ? "Gamma Deck" : "Presentation"} · {d.modified}</div>
                  </a>
                ))}
                {docs.docs?.map((d, i) => (
                  <a key={i} href={d.link} target="_blank" rel="noreferrer" style={{ display: "block", background: "#1E293B", borderRadius: 6, padding: "8px 12px", marginBottom: 4, textDecoration: "none", border: "1px solid #334155" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#3B82F6" }}>{d.name}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>Document · {d.modified}</div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
