import { useState } from "react";

const fmt = (n) => "$" + (n || 0).toLocaleString();
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");

const FORECAST_COLORS = {
  Commit: "#10B981",
  "Best Case": "#F59E0B",
  Pipeline: "#8B5CF6",
  Omitted: "#64748B",
  Closed: "#10B981",
  "Most Likely": "#3B82F6",
};

const STAGE_COLORS = {
  Prospecting: "#3B82F6",
  Qualification: "#06B6D4",
  "Needs Analysis": "#8B5CF6",
  "Value Proposition": "#A855F7",
  "Id. Decision Makers": "#EC4899",
  "Perception Analysis": "#F59E0B",
  "Proposal/Price Quote": "#F97316",
  "Negotiation/Review": "#EF4444",
  "Closed Won": "#10B981",
  "Closed Lost": "#64748B",
};

function isPastDue(closeDate) {
  if (!closeDate || closeDate === "—") return false;
  return new Date(closeDate) < new Date();
}

function daysUntilClose(closeDate) {
  if (!closeDate || closeDate === "—") return null;
  const diff = Math.floor((new Date(closeDate) - new Date()) / 86400000);
  return diff;
}

function formatDate(d) {
  if (!d || d === "—") return "—";
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return d; }
}

export default function DealCard({
  deal,
  expanded,
  onToggle,
  onScore,
  onInspect,
  onDeepIntel,
  onEmail,
  onDelegate,
  onRelationships,
  onAccount360,
  onAddContacts,
  onTimeline,
  onCashFlow,
  compact = false,
}) {
  const [hoveredAction, setHoveredAction] = useState(null);
  const [showContacts, setShowContacts] = useState(false);
  const [statsHover, setStatsHover] = useState(null);

  const fcColor = FORECAST_COLORS[deal.forecastCategory] || "#64748B";
  const stageColor = STAGE_COLORS[deal.stage] || "#64748B";
  const pastDue = isPastDue(deal.closeDate);
  const daysLeft = daysUntilClose(deal.closeDate);
  const daysInPipeline = deal.daysInStage || (deal.createdDate ? Math.floor((Date.now() - new Date(deal.createdDate).getTime()) / 86400000) : 0);

  const borderColor = pastDue ? "#EF4444" : fcColor;

  const actionBtn = (label, icon, onClick, color = "#334155", hoverColor = "#475569") => (
    <button
      key={label}
      onMouseEnter={() => setHoveredAction(label)}
      onMouseLeave={() => setHoveredAction(null)}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      style={{
        padding: "5px 10px",
        borderRadius: 5,
        border: "1px solid #334155",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 600,
        background: hoveredAction === label ? hoverColor : color,
        color: hoveredAction === label ? "#F1F5F9" : "#94A3B8",
        transition: "all .15s",
        display: "flex",
        alignItems: "center",
        gap: 4,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 12 }}>{icon}</span> {label}
    </button>
  );

  const statBox = (label, value, color = "#F1F5F9", clickable = false, onClick = null) => (
    <div
      onMouseEnter={() => setStatsHover(label)}
      onMouseLeave={() => setStatsHover(null)}
      onClick={(e) => { if (clickable && onClick) { e.stopPropagation(); onClick(); } }}
      style={{
        background: statsHover === label ? "#1E293B" : "#0F172A",
        borderRadius: 6,
        padding: "8px 10px",
        textAlign: "center",
        cursor: clickable ? "pointer" : "default",
        border: statsHover === label && clickable ? "1px solid #475569" : "1px solid transparent",
        transition: "all .15s",
        flex: "1 1 0",
        minWidth: 80,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 9, color: "#64748B", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.3px" }}>{label}</div>
    </div>
  );

  return (
    <div
      className="card-hover"
      onClick={() => onToggle?.(deal.id)}
      style={{
        background: "#1E293B",
        borderRadius: 10,
        padding: compact ? "10px 14px" : "14px 18px",
        marginBottom: 8,
        border: "1px solid #334155",
        borderLeft: `4px solid ${borderColor}`,
        cursor: "pointer",
        transition: "all .2s",
        animation: "fadeIn .25s",
      }}
    >
      {/* ── Main Row ──────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: compact ? 13 : 14, fontWeight: 700, color: "#F1F5F9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>
              {strip(deal.name)}
            </span>
            {pastDue && (
              <span style={{
                padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700,
                background: "#EF444420", color: "#EF4444",
                animation: "fadeIn .3s",
              }}>PAST DUE</span>
            )}
            {daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && !pastDue && (
              <span style={{
                padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700,
                background: "#F59E0B20", color: "#F59E0B",
              }}>CLOSING SOON</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>{deal.account || "—"}</span>
            <span style={{ color: "#475569" }}>|</span>
            <span style={{ color: stageColor, fontWeight: 500 }}>{deal.stage}</span>
            <span style={{ color: "#475569" }}>|</span>
            <span>Close: {formatDate(deal.closeDate)}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div
              style={{ fontSize: compact ? 16 : 20, fontWeight: 800, color: "#F1F5F9", cursor: "pointer" }}
              onClick={(e) => { e.stopPropagation(); onInspect?.(deal); }}
              title="Click to inspect deal"
            >
              {fmt(deal.amount)}
            </div>
            <div style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              background: fcColor + "20",
              color: fcColor,
              marginTop: 2,
            }}>
              {deal.forecastCategory || "—"}
            </div>
          </div>
          <div style={{
            width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
            color: "#64748B", fontSize: 12, transition: "transform .2s",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}>▼</div>
        </div>
      </div>

      {/* ── Expanded Section ─────────────────────────── */}
      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #334155" }}>
          {/* Quick Stats Row */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {statBox("Days in Pipeline", daysInPipeline, daysInPipeline > 90 ? "#EF4444" : daysInPipeline > 45 ? "#F59E0B" : "#10B981")}
            {statBox("Probability", `${deal.probability || 0}%`, deal.probability >= 70 ? "#10B981" : deal.probability >= 40 ? "#F59E0B" : "#EF4444")}
            {statBox("Last Activity", deal.lastActivity && deal.lastActivity !== "—" ? formatDate(deal.lastActivity) : "None", deal.lastActivity === "—" ? "#EF4444" : "#94A3B8")}
            {statBox("Source", deal.source || "—", "#3B82F6")}
            {statBox("Close Date", daysLeft !== null ? (daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`) : "—",
              daysLeft !== null ? (daysLeft < 0 ? "#EF4444" : daysLeft <= 7 ? "#F59E0B" : "#10B981") : "#64748B"
            )}
            {deal.nextStep && deal.nextStep !== "—" && statBox("Next Step", strip(deal.nextStep).substring(0, 20), "#8B5CF6")}
          </div>

          {/* Actions Row */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {actionBtn("SFDC", "☁", () => {
              if (deal.id) window.open(`https://skaled.lightning.force.com/lightning/r/Opportunity/${deal.id}/view`, "_blank");
            }, "#00A1E020", "#00A1E040")}
            {onScore && actionBtn("Score", "📊", () => onScore(deal), "#3B82F620", "#3B82F640")}
            {onInspect && actionBtn("Inspect", "🔍", () => onInspect(deal), "#8B5CF620", "#8B5CF640")}
            {onDeepIntel && actionBtn("Deep Intel", "🧠", () => onDeepIntel(deal), "#A855F720", "#A855F740")}
            {onEmail && actionBtn("AI Email", "✉", () => onEmail(deal), "#10B98120", "#10B98140")}
            {onDelegate && actionBtn("Delegate", "👤", () => onDelegate(deal), "#F59E0B20", "#F59E0B40")}
            {onRelationships && actionBtn("Relationships", "🕸", () => onRelationships(deal), "#06B6D420", "#06B6D440")}
            {onAccount360 && actionBtn("Account 360", "🌐", () => onAccount360(deal), "#EC489920", "#EC489940")}
            {onAddContacts && actionBtn("+ Contacts", "👥", () => onAddContacts(deal), "#F9731620", "#F9731640")}
            {onTimeline && actionBtn("Timeline", "📅", () => onTimeline(deal), "#64748B20", "#64748B40")}
            {onCashFlow && actionBtn("Cash Flow", "💰", () => onCashFlow(deal))}
          </div>

          {/* Contacts Section */}
          {deal.contacts && deal.contacts.length > 0 && (
            <div>
              <div
                style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", marginBottom: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                onClick={(e) => { e.stopPropagation(); setShowContacts(!showContacts); }}
              >
                <span style={{ transition: "transform .2s", transform: showContacts ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▸</span>
                Contacts ({deal.contacts.length})
              </div>
              {showContacts && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
                  {deal.contacts.map((c, i) => (
                    <div key={i} style={{
                      background: "#0F172A",
                      borderRadius: 6,
                      padding: "8px 10px",
                      border: "1px solid #334155",
                      fontSize: 11,
                    }}>
                      <div style={{ fontWeight: 600, color: "#E2E8F0" }}>{c.name || c.Name || "—"}</div>
                      <div style={{ color: "#64748B", marginTop: 2 }}>{c.title || c.Title || ""}</div>
                      {(c.email || c.Email) && (
                        <div
                          style={{ color: "#3B82F6", marginTop: 2, cursor: "pointer" }}
                          onClick={(e) => { e.stopPropagation(); onEmail?.({ ...deal, contactEmail: c.email || c.Email, contactName: c.name || c.Name }); }}
                        >
                          {c.email || c.Email}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Deal Health Indicator */}
          <DealHealthBar deal={deal} />

          {/* Deal Description / Next Step if available */}
          {deal.description && (
            <div style={{ marginTop: 10, padding: "8px 10px", background: "#0F172A", borderRadius: 6, fontSize: 12, color: "#94A3B8", lineHeight: 1.5, border: "1px solid #1E293B" }}>
              {strip(deal.description).substring(0, 300)}
            </div>
          )}

          {/* Mini Activity Snapshot */}
          <DealActivitySnapshot deal={deal} />
        </div>
      )}
    </div>
  );
}

// ── Deal Health Bar ─────────────────────────────────────────────
function DealHealthBar({ deal }) {
  const [showDetail, setShowDetail] = useState(false);

  // Calculate health factors
  const factors = [];

  // Days in pipeline
  const days = deal.daysInStage || 0;
  const daysScore = days <= 30 ? 100 : days <= 60 ? 70 : days <= 90 ? 40 : 15;
  factors.push({ name: "Velocity", score: daysScore, detail: `${days}d in pipeline`, color: daysScore >= 70 ? "#10B981" : daysScore >= 40 ? "#F59E0B" : "#EF4444" });

  // Probability
  const prob = deal.probability || 0;
  factors.push({ name: "Probability", score: prob, detail: `${prob}%`, color: prob >= 70 ? "#10B981" : prob >= 40 ? "#F59E0B" : "#EF4444" });

  // Close date health
  const daysLeft = daysUntilClose(deal.closeDate);
  const closeScore = daysLeft === null ? 50 : daysLeft < 0 ? 10 : daysLeft <= 7 ? 40 : daysLeft <= 30 ? 70 : 90;
  factors.push({ name: "Timeline", score: closeScore, detail: daysLeft !== null ? (daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`) : "No date", color: closeScore >= 70 ? "#10B981" : closeScore >= 40 ? "#F59E0B" : "#EF4444" });

  // Activity recency
  const lastAct = deal.lastActivity;
  let actScore = 30;
  if (lastAct && lastAct !== "—") {
    const daysSinceAct = Math.floor((Date.now() - new Date(lastAct).getTime()) / 86400000);
    actScore = daysSinceAct <= 7 ? 100 : daysSinceAct <= 14 ? 70 : daysSinceAct <= 30 ? 40 : 15;
  }
  factors.push({ name: "Engagement", score: actScore, detail: lastAct && lastAct !== "—" ? formatDate(lastAct) : "No activity", color: actScore >= 70 ? "#10B981" : actScore >= 40 ? "#F59E0B" : "#EF4444" });

  const overallScore = Math.round(factors.reduce((s, f) => s + f.score, 0) / factors.length);
  const overallColor = overallScore >= 70 ? "#10B981" : overallScore >= 40 ? "#F59E0B" : "#EF4444";

  return (
    <div style={{ marginTop: 10 }}>
      {/* Overall health bar */}
      <div
        onClick={(e) => { e.stopPropagation(); setShowDetail(!showDetail); }}
        style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
      >
        <span style={{ fontSize: 10, color: "#64748B", width: 60 }}>Deal Health</span>
        <div style={{ flex: 1, height: 6, background: "#0F172A", borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            width: `${overallScore}%`, height: "100%", borderRadius: 3,
            background: `linear-gradient(90deg, ${overallColor}CC, ${overallColor})`,
            transition: "width .5s ease",
          }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: overallColor, width: 30, textAlign: "right" }}>{overallScore}</span>
        <span style={{ fontSize: 10, color: "#64748B", transition: "transform .2s", transform: showDetail ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
      </div>

      {showDetail && (
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {factors.map((f, i) => (
            <div key={i} style={{
              background: "#0F172A", borderRadius: 6, padding: "6px 8px",
              textAlign: "center", border: `1px solid ${f.color}20`,
            }}>
              <div style={{ fontSize: 9, color: "#64748B", textTransform: "uppercase", marginBottom: 2 }}>{f.name}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: f.color }}>{f.score}</div>
              <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 1 }}>{f.detail}</div>
              {/* Mini bar */}
              <div style={{ height: 3, background: "#1E293B", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                <div style={{ width: `${f.score}%`, height: "100%", borderRadius: 2, background: f.color, transition: "width .4s" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Deal Activity Snapshot ──────────────────────────────────────
function DealActivitySnapshot({ deal }) {
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [snapshotData, setSnapshotData] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const loadSnapshot = async () => {
    if (snapshotData || !deal.account || deal.account === "—") return;
    setSnapshotLoading(true);
    try {
      const res = await fetch("/.netlify/functions/unified-timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: deal.account }),
      });
      const data = await res.json();
      setSnapshotData(data);
    } catch {}
    setSnapshotLoading(false);
  };

  const handleToggle = (e) => {
    e.stopPropagation();
    if (!showSnapshot) loadSnapshot();
    setShowSnapshot(!showSnapshot);
  };

  const timeline = snapshotData?.timeline || [];
  const recentEmails = timeline.filter(t => t.type === "email").slice(0, 3);
  const recentCalls = timeline.filter(t => t.type === "call" || t.type === "chorus").slice(0, 2);
  const recentMeetings = timeline.filter(t => t.type === "meeting").slice(0, 2);

  return (
    <div style={{ marginTop: 8 }}>
      <div
        onClick={handleToggle}
        style={{
          fontSize: 11, fontWeight: 600, color: "#94A3B8", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4, padding: "4px 0",
        }}
      >
        <span style={{ transition: "transform .2s", transform: showSnapshot ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▸</span>
        Recent Activity Snapshot
        {snapshotData && <span style={{ color: "#64748B", fontWeight: 400 }}> ({timeline.length} interactions)</span>}
      </div>

      {showSnapshot && (
        <div style={{ marginTop: 4, padding: "8px", background: "#0F172A", borderRadius: 6, border: "1px solid #1E293B" }}>
          {snapshotLoading && <div style={{ fontSize: 11, color: "#64748B", padding: 8 }}>Loading activity...</div>}

          {snapshotData && timeline.length === 0 && (
            <div style={{ fontSize: 11, color: "#64748B", padding: 8 }}>No recent activity found</div>
          )}

          {recentEmails.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: "#3B82F6", textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>Emails</div>
              {recentEmails.map((e, i) => (
                <div key={i} style={{ fontSize: 10, color: "#94A3B8", padding: "2px 0", display: "flex", gap: 6 }}>
                  <span style={{ color: "#64748B", flexShrink: 0 }}>{formatDate(e.date)}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{strip(e.subject || "No subject")}</span>
                </div>
              ))}
            </div>
          )}

          {recentCalls.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: "#8B5CF6", textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>Calls</div>
              {recentCalls.map((c, i) => (
                <div key={i} style={{ fontSize: 10, color: "#94A3B8", padding: "2px 0", display: "flex", gap: 6 }}>
                  <span style={{ color: "#64748B", flexShrink: 0 }}>{formatDate(c.date)}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{strip(c.subject || "Call")}</span>
                  {c.duration && <span style={{ color: "#64748B", flexShrink: 0 }}>{c.duration}</span>}
                </div>
              ))}
            </div>
          )}

          {recentMeetings.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: "#10B981", textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>Meetings</div>
              {recentMeetings.map((m, i) => (
                <div key={i} style={{ fontSize: 10, color: "#94A3B8", padding: "2px 0", display: "flex", gap: 6 }}>
                  <span style={{ color: "#64748B", flexShrink: 0 }}>{formatDate(m.date)}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{strip(m.subject || "Meeting")}</span>
                </div>
              ))}
            </div>
          )}

          {/* Summary bar */}
          {timeline.length > 0 && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #1E293B", display: "flex", gap: 8 }}>
              {[
                { type: "email", icon: "✉", color: "#3B82F6", count: timeline.filter(t => t.type === "email").length },
                { type: "call", icon: "📞", color: "#8B5CF6", count: timeline.filter(t => t.type === "call" || t.type === "chorus").length },
                { type: "meeting", icon: "📅", color: "#10B981", count: timeline.filter(t => t.type === "meeting").length },
              ].filter(t => t.count > 0).map((t, i) => (
                <span key={i} style={{ fontSize: 10, color: t.color, display: "flex", alignItems: "center", gap: 2 }}>
                  {t.icon} {t.count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
