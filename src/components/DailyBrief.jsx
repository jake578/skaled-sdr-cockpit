import { useState, useEffect } from "react";

const TYPE_COLORS = {
  "follow-up": "#3B82F6",
  call: "#8B5CF6",
  email: "#3B82F6",
  meeting: "#F59E0B",
  linkedin: "#06B6D4",
  admin: "#64748B",
  deal: "#10B981",
  outreach: "#F59E0B",
};

const styles = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.6)", zIndex: 2000,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  modal: {
    background: "#0F172A", borderRadius: 12, padding: 0, width: 620, maxWidth: "92vw",
    border: "1px solid #334155", boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
    maxHeight: "90vh", overflowY: "auto",
  },
  header: {
    padding: "20px 24px 16px", borderBottom: "1px solid #1E293B",
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    position: "sticky", top: 0, background: "#0F172A", zIndex: 1,
  },
  titleWrap: {},
  title: { fontSize: 18, fontWeight: 800, color: "#F1F5F9" },
  date: { fontSize: 12, color: "#64748B", marginTop: 4 },
  closeBtn: {
    background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20,
  },
  daySummary: {
    margin: "16px 24px", padding: "14px 16px", background: "#1E293B",
    borderRadius: 8, border: "1px solid #334155",
    fontSize: 13, color: "#CBD5E1", lineHeight: 1.6,
  },
  body: { padding: "0 24px 24px" },
  sectionTitle: {
    fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 12, marginTop: 16,
  },
  card: {
    display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 8,
    background: "#1E293B", borderRadius: 8, padding: "14px 16px",
    border: "1px solid #334155", transition: "all .15s",
  },
  rankBadge: {
    width: 32, height: 32, borderRadius: 8,
    background: "linear-gradient(135deg, #10B981, #059669)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 14, fontWeight: 600, color: "#F1F5F9", marginBottom: 4 },
  cardReason: { fontSize: 12, color: "#94A3B8", lineHeight: 1.4, marginBottom: 6 },
  cardMeta: { display: "flex", gap: 10, alignItems: "center", fontSize: 11 },
  typeBadge: (color) => ({
    display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
    background: color + "20", color: color, textTransform: "uppercase",
  }),
  minutes: { color: "#64748B" },
  btn: (bg) => ({
    padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer",
    fontSize: 14, fontWeight: 700, background: bg, color: "#fff", transition: "all .15s",
    width: "100%", marginTop: 16,
  }),
  skeleton: {
    background: "#1E293B", borderRadius: 6, height: 60, marginBottom: 8,
    animation: "fadeIn 1s infinite alternate",
  },
  loadingWrap: {
    padding: "24px",
  },
};

export default function DailyBrief({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch("/.netlify/functions/ai-prioritize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError("Failed to generate briefing"); setLoading(false); });
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.titleWrap}>
            <div style={styles.title}>Daily Priority Briefing</div>
            <div style={styles.date}>{today}</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>x</button>
        </div>

        {loading && (
          <div style={styles.loadingWrap}>
            <div style={{ fontSize: 13, color: "#8B5CF6", fontWeight: 600, marginBottom: 12, textAlign: "center" }}>
              Analyzing your pipeline, calendar, and inbox...
            </div>
            {[...Array(5)].map((_, i) => (
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
          <>
            {/* Day summary */}
            {data.daySummary && (
              <div style={styles.daySummary}>{data.daySummary}</div>
            )}

            <div style={styles.body}>
              <div style={styles.sectionTitle}>Top 10 Actions for Today</div>

              {(data.actions || []).slice(0, 10).map((item, i) => (
                <div key={i} style={styles.card}>
                  <div style={{
                    ...styles.rankBadge,
                    background: i < 3
                      ? "linear-gradient(135deg, #10B981, #059669)"
                      : i < 6
                      ? "linear-gradient(135deg, #3B82F6, #1D4ED8)"
                      : "#334155",
                  }}>
                    {i + 1}
                  </div>
                  <div style={styles.cardBody}>
                    <div style={styles.cardTitle}>{item.title}</div>
                    <div style={styles.cardReason}>{item.reason}</div>
                    <div style={styles.cardMeta}>
                      <span style={styles.typeBadge(TYPE_COLORS[item.type] || "#64748B")}>{item.type}</span>
                      {item.estimatedMinutes && (
                        <span style={styles.minutes}>~{item.estimatedMinutes} min</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <button style={styles.btn("#10B981")} onClick={onClose}>
                Start My Day
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
