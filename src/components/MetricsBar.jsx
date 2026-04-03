import { REP } from "../mockData";

const fmt = (n) => "$" + n.toLocaleString();
const pct = (n) => n.toFixed(1) + "%";

const styles = {
  metricsBar: {
    display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, padding: "16px 24px",
    borderBottom: "1px solid #1E293B",
  },
  metricCard: {
    background: "#1E293B", borderRadius: 8, padding: "14px 16px", textAlign: "center",
    cursor: "pointer", transition: "all .15s", border: "1px solid #334155",
  },
  metricVal: { fontSize: 22, fontWeight: 700, color: "#F1F5F9" },
  metricLabel: { fontSize: 11, color: "#64748B", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.5px" },
  metricSub: { fontSize: 11, marginTop: 4 },
};

export default function MetricsBar({ rep, doneCount, totalActions, pipelineTotal, displayOpps, setView }) {
  return (
    <div style={styles.metricsBar}>
      <div className="metric-hover" style={styles.metricCard} onClick={() => setView("actions")}>
        <div style={styles.metricVal}>{REP.activitiesToday}</div>
        <div style={styles.metricLabel}>Activities Today</div>
        <div style={{ ...styles.metricSub, color: REP.activitiesToday >= REP.activitiesGoalDaily ? "#10B981" : "#F59E0B" }}>
          Goal: {REP.activitiesGoalDaily}
        </div>
      </div>
      <div className="metric-hover" style={styles.metricCard} onClick={() => setView("actions")}>
        <div style={styles.metricVal}>{doneCount}/{totalActions}</div>
        <div style={styles.metricLabel}>Actions Done</div>
        <div style={{ ...styles.metricSub, color: doneCount === totalActions ? "#10B981" : "#F59E0B" }}>
          {totalActions - doneCount} remaining
        </div>
      </div>
      <div className="metric-hover" style={styles.metricCard} onClick={() => setView("outreach")}>
        <div style={styles.metricVal}>{pct(REP.emailReplyRate)}</div>
        <div style={styles.metricLabel}>Reply Rate</div>
        <div style={{ ...styles.metricSub, color: "#10B981" }}>
          +{(REP.emailReplyRate - REP.industryAvgReply).toFixed(1)}pp vs avg
        </div>
      </div>
      <div className="metric-hover" style={styles.metricCard} onClick={() => setView("pipeline")}>
        <div style={styles.metricVal}>{REP.meetingsBooked}</div>
        <div style={styles.metricLabel}>Meetings Booked</div>
        <div style={{ ...styles.metricSub, color: "#94A3B8" }}>
          Target: {REP.meetingsTarget}
        </div>
      </div>
      <div className="metric-hover" style={styles.metricCard} onClick={() => setView("pipeline")}>
        <div style={styles.metricVal}>{fmt(REP.pipelineGenerated)}</div>
        <div style={styles.metricLabel}>Pipeline Created</div>
        <div style={styles.metricSub}>
          <div style={{ background: "#334155", borderRadius: 4, height: 6, marginTop: 4 }}>
            <div style={{ background: "#10B981", height: 6, borderRadius: 4, width: `${Math.min((REP.pipelineGenerated / REP.quotaPipeline) * 100, 100)}%` }} />
          </div>
          <span style={{ color: "#64748B", fontSize: 10 }}>{fmt(REP.quotaPipeline)} target</span>
        </div>
      </div>
      <div className="metric-hover" style={styles.metricCard} onClick={() => setView("pipeline")}>
        <div style={styles.metricVal}>{fmt(pipelineTotal)}</div>
        <div style={styles.metricLabel}>Active Pipeline</div>
        <div style={{ ...styles.metricSub, color: "#94A3B8" }}>
          {displayOpps.length} open opps
        </div>
      </div>
    </div>
  );
}
