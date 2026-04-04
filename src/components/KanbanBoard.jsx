import { useState, useRef } from "react";

const STAGES = [
  "Prospecting",
  "Qualification",
  "Needs Analysis",
  "Value Proposition",
  "Proposal/Price Quote",
  "Negotiation/Review",
];

const STAGE_COLORS = {
  "Prospecting": "#F59E0B",
  "Qualification": "#3B82F6",
  "Needs Analysis": "#8B5CF6",
  "Value Proposition": "#06B6D4",
  "Proposal/Price Quote": "#10B981",
  "Negotiation/Review": "#EC4899",
};

const CAT_COLORS = {
  "Commit": "#3B82F6",
  "Best Case": "#F59E0B",
  "Pipeline": "#8B5CF6",
  "Omitted": "#64748B",
};

const fmt = (n) => "$" + (n || 0).toLocaleString();

export default function KanbanBoard({ opps, onUpdateStage, onScoreDeal, onDeepIntel, onEmailDeal }) {
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);
  const dragNodeRef = useRef(null);

  const oppsByStage = {};
  STAGES.forEach(stage => { oppsByStage[stage] = []; });
  (opps || []).forEach(opp => {
    const stage = STAGES.includes(opp.stage) ? opp.stage : null;
    if (stage) oppsByStage[stage].push(opp);
  });

  // Collect unmatched opps into closest stage
  const unmapped = (opps || []).filter(o => !STAGES.includes(o.stage));
  if (unmapped.length) {
    // Put unmapped opps (Discovery, Stalled, etc.) into Prospecting as fallback
    oppsByStage["Prospecting"].push(...unmapped);
  }

  const handleDragStart = (e, oppId) => {
    setDraggingId(oppId);
    dragNodeRef.current = e.target;
    e.dataTransfer.setData("text/plain", oppId);
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => {
      if (dragNodeRef.current) dragNodeRef.current.style.opacity = "0.4";
    }, 0);
  };

  const handleDragEnd = () => {
    if (dragNodeRef.current) dragNodeRef.current.style.opacity = "1";
    setDraggingId(null);
    setDropTarget(null);
    dragNodeRef.current = null;
  };

  const handleDragOver = (e, stage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== stage) setDropTarget(stage);
  };

  const handleDragLeave = (e, stage) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      if (dropTarget === stage) setDropTarget(null);
    }
  };

  const handleDrop = (e, stage) => {
    e.preventDefault();
    const oppId = e.dataTransfer.getData("text/plain");
    setDropTarget(null);
    setDraggingId(null);
    if (dragNodeRef.current) dragNodeRef.current.style.opacity = "1";
    dragNodeRef.current = null;
    if (oppId && onUpdateStage) {
      const opp = (opps || []).find(o => o.id === oppId);
      if (opp && opp.stage !== stage) {
        onUpdateStage(oppId, stage);
      }
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>Pipeline Board</div>
        <div style={{ fontSize: 12, color: "#64748B" }}>
          {(opps || []).length} deals · {fmt((opps || []).reduce((s, o) => s + (o.amount || 0), 0))} total
        </div>
      </div>
      <div style={styles.board}>
        {STAGES.map(stage => {
          const stageOpps = oppsByStage[stage];
          const total = stageOpps.reduce((s, o) => s + (o.amount || 0), 0);
          const isTarget = dropTarget === stage;
          const color = STAGE_COLORS[stage];

          return (
            <div
              key={stage}
              style={{
                ...styles.column,
                ...(isTarget ? { background: color + "15", borderColor: color + "60" } : {}),
              }}
              onDragOver={(e) => handleDragOver(e, stage)}
              onDragLeave={(e) => handleDragLeave(e, stage)}
              onDrop={(e) => handleDrop(e, stage)}
            >
              {/* Column header */}
              <div style={styles.colHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#E2E8F0", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                    {stage}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={styles.countBadge}>{stageOpps.length}</span>
                  <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>{fmt(total)}</span>
                </div>
              </div>

              {/* Cards */}
              <div style={styles.cardList}>
                {stageOpps.map(opp => (
                  <div
                    key={opp.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, opp.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => setExpandedCard(expandedCard === opp.id ? null : opp.id)}
                    style={{
                      ...styles.card,
                      ...(draggingId === opp.id ? { opacity: 0.4 } : {}),
                      borderLeft: `3px solid ${color}`,
                    }}
                  >
                    {/* Card compact view */}
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0", marginBottom: 4, lineHeight: 1.3 }}>
                      {opp.name}
                    </div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>{opp.account}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#10B981" }}>{fmt(opp.amount)}</span>
                      <span style={{ fontSize: 10, color: "#64748B" }}>{opp.closeDate}</span>
                    </div>
                    {opp.forecastCategory && opp.forecastCategory !== "—" && (
                      <div style={{ marginTop: 6 }}>
                        <span style={{
                          display: "inline-block", padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600,
                          background: (CAT_COLORS[opp.forecastCategory] || "#475569") + "20",
                          color: CAT_COLORS[opp.forecastCategory] || "#475569",
                        }}>
                          {opp.forecastCategory}
                        </span>
                      </div>
                    )}

                    {/* Expanded view */}
                    {expandedCard === opp.id && (
                      <div style={styles.expandedPanel} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {onScoreDeal && (
                            <button
                              style={styles.actionBtn("#8B5CF6")}
                              onClick={() => onScoreDeal({ oppId: opp.id, oppName: opp.name, accountName: opp.account })}
                            >
                              Score
                            </button>
                          )}
                          {onDeepIntel && (
                            <button
                              style={{ ...styles.actionBtn("#EC4899"), background: "linear-gradient(135deg, #8B5CF6, #EC4899)" }}
                              onClick={() => onDeepIntel({ oppId: opp.id, oppName: opp.name, accountName: opp.account })}
                            >
                              Deep Intel
                            </button>
                          )}
                          {onEmailDeal && (
                            <button
                              style={styles.actionBtn("#3B82F6")}
                              onClick={() => onEmailDeal({ id: opp.id, title: opp.name, subtitle: opp.account, suggestedAction: `Follow up on ${opp.name}` })}
                            >
                              AI Email
                            </button>
                          )}
                          <a
                            href={`https://skaled.lightning.force.com/lightning/r/Opportunity/${opp.id}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ ...styles.actionBtn("#334155"), textDecoration: "none", display: "inline-block" }}
                          >
                            SFDC
                          </a>
                        </div>
                        {opp.nextStep && opp.nextStep !== "—" && (
                          <div style={{ marginTop: 8, fontSize: 11, color: "#94A3B8", lineHeight: 1.4 }}>
                            <span style={{ color: "#64748B", fontWeight: 600 }}>Next: </span>{opp.nextStep}
                          </div>
                        )}
                        <div style={{ marginTop: 6, display: "flex", gap: 12, fontSize: 10, color: "#64748B" }}>
                          <span>P: {opp.probability || 0}%</span>
                          <span>{opp.daysInStage || 0}d in stage</span>
                          <span>Last: {opp.lastActivity}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {stageOpps.length === 0 && (
                  <div style={{ padding: "20px 12px", textAlign: "center", fontSize: 11, color: "#475569", fontStyle: "italic" }}>
                    No deals
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    marginBottom: 16,
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12,
  },
  board: {
    display: "grid",
    gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`,
    gap: 8,
    overflowX: "auto",
    minWidth: 0,
  },
  column: {
    background: "#0F172A",
    borderRadius: 8,
    border: "1px solid #1E293B",
    minHeight: 300,
    display: "flex",
    flexDirection: "column",
    transition: "all .2s",
  },
  colHeader: {
    padding: "10px 10px 8px",
    borderBottom: "1px solid #1E293B",
    display: "flex", flexDirection: "column", gap: 4,
  },
  countBadge: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 18, height: 18, borderRadius: "50%",
    background: "#334155", color: "#E2E8F0", fontSize: 10, fontWeight: 700,
  },
  cardList: {
    padding: 6,
    flex: 1,
    overflowY: "auto",
    maxHeight: 500,
  },
  card: {
    background: "#1E293B",
    borderRadius: 6,
    padding: "10px",
    marginBottom: 6,
    cursor: "grab",
    transition: "all .15s",
    border: "1px solid #334155",
  },
  expandedPanel: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: "1px solid #334155",
  },
  actionBtn: (bg) => ({
    padding: "4px 10px", borderRadius: 4, border: "none", cursor: "pointer",
    fontSize: 11, fontWeight: 600, background: bg, color: "#fff", transition: "all .15s",
  }),
};
