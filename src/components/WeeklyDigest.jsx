import { useState, useEffect } from "react";

const styles = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.6)", zIndex: 2000,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  modal: {
    background: "#0F172A", borderRadius: 12, padding: 0, width: 600, maxWidth: "92vw",
    border: "1px solid #334155", boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
    maxHeight: "90vh", overflowY: "auto",
  },
  header: {
    padding: "20px 24px 16px", borderBottom: "1px solid #1E293B",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    position: "sticky", top: 0, background: "#0F172A", zIndex: 1,
  },
  title: { fontSize: 18, fontWeight: 800, color: "#F1F5F9" },
  subtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  closeBtn: {
    background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20,
  },
  body: { padding: "20px 24px 24px" },
  metricsGrid: {
    display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 24,
  },
  metricCard: {
    background: "#1E293B", borderRadius: 8, padding: "14px 16px", textAlign: "center",
    border: "1px solid #334155",
  },
  metricVal: { fontSize: 24, fontWeight: 700, color: "#F1F5F9" },
  metricLabel: {
    fontSize: 10, color: "#64748B", marginTop: 4, textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  metricChange: (positive) => ({
    fontSize: 11, marginTop: 4, fontWeight: 600,
    color: positive ? "#10B981" : "#EF4444",
  }),
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 13, fontWeight: 700, color: "#94A3B8", marginBottom: 10,
    textTransform: "uppercase", letterSpacing: "0.5px",
  },
  summaryBox: {
    background: "#1E293B", borderRadius: 8, padding: 16,
    fontSize: 13, color: "#CBD5E1", lineHeight: 1.6, border: "1px solid #334155",
  },
  listItem: (color) => ({
    display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6,
    fontSize: 13, color: "#E2E8F0",
  }),
  dot: (color) => ({
    width: 6, height: 6, borderRadius: "50%", background: color,
    flexShrink: 0, marginTop: 6,
  }),
  skeleton: {
    background: "#1E293B", borderRadius: 6, height: 60, marginBottom: 8,
    animation: "fadeIn 1s infinite alternate",
  },
};

const fmt = (n) => {
  if (typeof n !== "number") return n;
  if (n >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return "$" + (n / 1000).toFixed(0) + "K";
  return n.toString();
};

export default function WeeklyDigest({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch("/.netlify/functions/weekly-digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError("Failed to load weekly digest"); setLoading(false); });
  }, []);

  const weekRange = (() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmtDate(start)} - ${fmtDate(end)}`;
  })();

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>Weekly Digest</div>
            <div style={styles.subtitle}>{weekRange}</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>x</button>
        </div>

        {loading && (
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 13, color: "#8B5CF6", fontWeight: 600, marginBottom: 12, textAlign: "center" }}>
              Compiling your weekly report...
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ ...styles.skeleton, height: 80 }} />
              ))}
            </div>
            {[...Array(3)].map((_, i) => (
              <div key={i} style={styles.skeleton} />
            ))}
          </div>
        )}

        {error && (
          <div style={{ padding: 40, textAlign: "center", color: "#EF4444", fontSize: 14 }}>
            {error}
          </div>
        )}

        {data && !loading && (
          <div style={styles.body}>
            {/* Metrics Grid */}
            <div style={styles.metricsGrid}>
              <div style={styles.metricCard}>
                <div style={styles.metricVal}>{data.emailsSent || 0}</div>
                <div style={styles.metricLabel}>Emails Sent</div>
              </div>
              <div style={styles.metricCard}>
                <div style={styles.metricVal}>{data.emailsReceived || 0}</div>
                <div style={styles.metricLabel}>Emails Received</div>
              </div>
              <div style={styles.metricCard}>
                <div style={styles.metricVal}>{data.meetings || 0}</div>
                <div style={styles.metricLabel}>Meetings</div>
              </div>
              <div style={styles.metricCard}>
                <div style={styles.metricVal}>{data.oppsUpdated || 0}</div>
                <div style={styles.metricLabel}>Opps Updated</div>
              </div>
              <div style={styles.metricCard}>
                <div style={styles.metricVal}>{fmt(data.pipelineTotal || 0)}</div>
                <div style={styles.metricLabel}>Pipeline Total</div>
              </div>
              <div style={styles.metricCard}>
                <div style={styles.metricVal}>{fmt(data.pipelineChange || 0)}</div>
                <div style={styles.metricLabel}>Pipeline Change</div>
                {data.pipelineChange != null && (
                  <div style={styles.metricChange(data.pipelineChange >= 0)}>
                    {data.pipelineChange >= 0 ? "+" : ""}{fmt(data.pipelineChange)}
                  </div>
                )}
              </div>
            </div>

            {/* AI Summary */}
            {data.summary && (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>AI Summary</div>
                <div style={styles.summaryBox}>{data.summary}</div>
              </div>
            )}

            {/* Highlights */}
            {data.highlights?.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Highlights</div>
                {data.highlights.map((h, i) => (
                  <div key={i} style={styles.listItem("#10B981")}>
                    <div style={styles.dot("#10B981")} />
                    <span>{h}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Concerns */}
            {data.concerns?.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Concerns</div>
                {data.concerns.map((c, i) => (
                  <div key={i} style={styles.listItem("#EF4444")}>
                    <div style={styles.dot("#EF4444")} />
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
