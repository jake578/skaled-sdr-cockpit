import { useState } from "react";

const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");

const STATUS_COLORS = {
  New: "#3B82F6",
  Working: "#F59E0B",
  "Working - Contacted": "#F59E0B",
  Nurturing: "#8B5CF6",
  Qualified: "#10B981",
  Unqualified: "#64748B",
  "Closed - Not Converted": "#EF4444",
};

const SOURCE_ICONS = {
  Web: "🌐",
  "Inbound - Website": "🌐",
  Referral: "🤝",
  LinkedIn: "💼",
  Conference: "🎪",
  Partner: "🏢",
  Outbound: "📨",
  "Content Download": "📄",
  Webinar: "🎥",
};

function formatDate(d) {
  if (!d || d === "—") return "—";
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return d; }
}

function daysSince(d) {
  if (!d || d === "—") return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

export default function LeadCard({ lead, expanded, onToggle, onResearch, onEmail, onConvert, onChat }) {
  const [hoveredAction, setHoveredAction] = useState(null);
  const [showDescription, setShowDescription] = useState(false);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchData, setResearchData] = useState(null);

  const statusColor = STATUS_COLORS[lead.status] || "#64748B";
  const sourceIcon = SOURCE_ICONS[lead.source] || "📋";
  const age = daysSince(lead.lastTouch || lead.createdDate);
  const isStale = age !== null && age > 14;
  const isNew = age !== null && age <= 3;

  const handleResearch = async () => {
    if (onResearch) {
      onResearch(lead);
      return;
    }
    setResearchLoading(true);
    try {
      const res = await fetch("/.netlify/functions/lead-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadName: lead.name, company: lead.company }),
      });
      const data = await res.json();
      setResearchData(data);
    } catch (e) {
      setResearchData({ error: e.message });
    }
    setResearchLoading(false);
  };

  const actionBtn = (label, icon, onClick, color = "#334155") => (
    <button
      key={label}
      onMouseEnter={() => setHoveredAction(label)}
      onMouseLeave={() => setHoveredAction(null)}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      style={{
        padding: "5px 12px", borderRadius: 5,
        border: `1px solid ${color}40`,
        cursor: "pointer", fontSize: 11, fontWeight: 600,
        background: hoveredAction === label ? color + "40" : color + "15",
        color: hoveredAction === label ? "#F1F5F9" : color === "#334155" ? "#94A3B8" : color,
        transition: "all .15s", display: "flex", alignItems: "center", gap: 4,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 12 }}>{icon}</span> {label}
    </button>
  );

  return (
    <div
      className="card-hover"
      onClick={() => onToggle?.(lead.name || lead.id)}
      style={{
        background: "#1E293B", borderRadius: 10, padding: "14px 18px",
        marginBottom: 8, border: "1px solid #334155",
        borderLeft: `4px solid ${statusColor}`,
        cursor: "pointer", transition: "all .2s",
        animation: "fadeIn .25s",
      }}
    >
      {/* Main Row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          {/* Avatar */}
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: statusColor + "20",
            border: `2px solid ${statusColor}40`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 700, color: statusColor,
            flexShrink: 0,
          }}>
            {(lead.name || "?")[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{lead.name || "—"}</span>
              {isNew && (
                <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: 9, fontWeight: 700, background: "#3B82F620", color: "#3B82F6" }}>NEW</span>
              )}
              {isStale && (
                <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: 9, fontWeight: 700, background: "#EF444420", color: "#EF4444" }}>STALE</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600 }}>{lead.company || "—"}</span>
              {lead.title && <><span style={{ color: "#475569" }}>|</span><span>{lead.title}</span></>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {/* Source badge */}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3, color: "#94A3B8" }}>
              <span>{sourceIcon}</span> {lead.source || "—"}
            </div>
            {lead.score > 0 && (
              <div style={{
                fontSize: 16, fontWeight: 800,
                color: lead.score >= 70 ? "#10B981" : lead.score >= 40 ? "#F59E0B" : "#64748B",
                marginTop: 2,
              }}>
                {lead.score}
              </div>
            )}
          </div>
          {/* Status badge */}
          <span style={{
            padding: "3px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600,
            background: statusColor + "20", color: statusColor,
          }}>{lead.status || "—"}</span>
          {/* Chevron */}
          <div style={{
            width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center",
            color: "#64748B", fontSize: 11, transition: "transform .2s",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}>▼</div>
        </div>
      </div>

      {/* Expanded Section */}
      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #334155" }}>
          {/* Quick stats */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { label: "Created", value: formatDate(lead.lastTouch || lead.createdDate), color: "#94A3B8" },
              { label: "Age", value: age !== null ? `${age} days` : "—", color: isStale ? "#EF4444" : age <= 7 ? "#10B981" : "#F59E0B" },
              { label: "Status", value: lead.status || "—", color: statusColor },
              { label: "Source", value: lead.source || "—", color: "#3B82F6" },
              lead.score > 0 ? { label: "Score", value: lead.score, color: lead.score >= 70 ? "#10B981" : "#F59E0B" } : null,
            ].filter(Boolean).map((s, i) => (
              <div key={i} style={{
                background: "#0F172A", borderRadius: 6, padding: "6px 10px",
                textAlign: "center", flex: "1 1 0", minWidth: 70,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 9, color: "#64748B", textTransform: "uppercase", marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {actionBtn("Research", "🔍", handleResearch, "#8B5CF6")}
            {onEmail && actionBtn("AI Email", "✉", () => onEmail(lead), "#10B981")}
            {onConvert && actionBtn("Convert in SFDC", "☁", () => onConvert(lead), "#00A1E0")}
            {onChat && actionBtn("Ask Claude", "🧠", () => onChat(lead), "#A855F7")}
            {lead.linkedIn && actionBtn("LinkedIn", "💼", () => window.open(lead.linkedIn, "_blank"), "#0A66C2")}
          </div>

          {/* Description */}
          {lead.description && (
            <div>
              <div
                onClick={(e) => { e.stopPropagation(); setShowDescription(!showDescription); }}
                style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}
              >
                <span style={{ transition: "transform .2s", transform: showDescription ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▸</span>
                Description
              </div>
              {showDescription && (
                <div style={{
                  padding: "8px 10px", background: "#0F172A", borderRadius: 6,
                  fontSize: 12, color: "#94A3B8", lineHeight: 1.5, border: "1px solid #1E293B",
                }}>
                  {strip(lead.description)}
                </div>
              )}
            </div>
          )}

          {/* Research results */}
          {researchLoading && (
            <div style={{ padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "#8B5CF6" }}>Researching {lead.company}...</div>
              <div style={{ fontSize: 10, color: "#64748B", marginTop: 4 }}>Checking Gmail, Calendar, SFDC</div>
            </div>
          )}

          {researchData && !researchData.error && (
            <div style={{ marginTop: 10, padding: "10px 12px", background: "#0F172A", borderRadius: 8, border: "1px solid #8B5CF630" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#8B5CF6", marginBottom: 6 }}>Research Results</div>

              {researchData.existingAccount && (
                <div style={{ padding: "4px 8px", background: "#F59E0B15", borderRadius: 4, fontSize: 11, color: "#F59E0B", marginBottom: 6 }}>
                  Existing SFDC account found
                </div>
              )}

              {researchData.priorEmails > 0 && (
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>
                  Prior emails found: <span style={{ color: "#3B82F6", fontWeight: 600 }}>{researchData.priorEmails}</span>
                </div>
              )}

              {researchData.priorMeetings > 0 && (
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>
                  Prior meetings: <span style={{ color: "#10B981", fontWeight: 600 }}>{researchData.priorMeetings}</span>
                </div>
              )}

              {researchData.recommendation && (
                <div style={{ fontSize: 12, color: "#E2E8F0", lineHeight: 1.5, marginTop: 6 }}>
                  {strip(researchData.recommendation)}
                </div>
              )}

              {researchData.research && (
                <div style={{ fontSize: 11, color: "#CBD5E1", lineHeight: 1.5, marginTop: 6, whiteSpace: "pre-wrap" }}>
                  {strip(researchData.research).substring(0, 500)}
                </div>
              )}
            </div>
          )}

          {researchData?.error && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: "#EF444415", borderRadius: 6, fontSize: 11, color: "#EF4444" }}>
              Research error: {researchData.error}
            </div>
          )}

          {/* Quick Outreach Composer */}
          <LeadQuickOutreach lead={lead} />

          {/* Lead Score Breakdown */}
          <LeadScoreDetail lead={lead} />
        </div>
      )}
    </div>
  );
}

// ── Quick Outreach Composer ─────────────────────────────────────
function LeadQuickOutreach({ lead }) {
  const [showComposer, setShowComposer] = useState(false);
  const [emailDraft, setEmailDraft] = useState(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateDraft = async () => {
    setDraftLoading(true);
    try {
      const res = await fetch("/.netlify/functions/claude-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Draft a short, personalized outreach email from Jake Dunlap (CEO, Skaled Consulting) to ${lead.name} (${lead.title || "Unknown title"}) at ${lead.company || "Unknown company"}.

Skaled helps B2B companies build and scale their sales organizations through consulting, training, and fractional sales leadership.

The email should be:
- 3-4 sentences max
- Reference something specific about their company or role
- Have a clear, low-commitment CTA (like a 15-min call)
- Sound human, not templated

Just provide the subject line and body, no other commentary.`,
          history: [],
        }),
      });
      const data = await res.json();
      setEmailDraft(strip(data.response || data.message || "Could not generate draft"));
    } catch (e) {
      setEmailDraft(`Error: ${e.message}`);
    }
    setDraftLoading(false);
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div
        onClick={(e) => { e.stopPropagation(); if (!showComposer) generateDraft(); setShowComposer(!showComposer); }}
        style={{
          fontSize: 11, fontWeight: 600, color: "#10B981", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4, padding: "4px 0",
        }}
      >
        <span style={{ transition: "transform .2s", transform: showComposer ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▸</span>
        Quick Outreach Draft
      </div>

      {showComposer && (
        <div style={{ marginTop: 4, padding: "10px 12px", background: "#0F172A", borderRadius: 8, border: "1px solid #10B98130" }}>
          {draftLoading && (
            <div style={{ fontSize: 11, color: "#64748B", textAlign: "center", padding: 12 }}>
              Drafting personalized email for {lead.name}...
            </div>
          )}
          {emailDraft && !draftLoading && (
            <>
              <div style={{ fontSize: 12, color: "#E2E8F0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {emailDraft}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(emailDraft);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  style={{ padding: "4px 10px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600, background: "#33415530", color: copied ? "#10B981" : "#94A3B8" }}
                >{copied ? "Copied!" : "Copy"}</button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const lines = emailDraft.split("\n");
                    const subject = lines.find(l => l.toLowerCase().includes("subject"))?.replace(/^subject:?\s*/i, "") || `Introduction from Skaled`;
                    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailDraft)}`);
                  }}
                  style={{ padding: "4px 10px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600, background: "#3B82F620", color: "#3B82F6" }}
                >Open in Email</button>
                <button
                  onClick={(e) => { e.stopPropagation(); generateDraft(); }}
                  style={{ padding: "4px 10px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600, background: "#33415530", color: "#94A3B8" }}
                >Regenerate</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Lead Score Detail ───────────────────────────────────────────
function LeadScoreDetail({ lead }) {
  const [showScore, setShowScore] = useState(false);

  if (!lead.score || lead.score <= 0) return null;

  // Compute score factors
  const factors = [
    { name: "Company Fit", score: lead.company ? 20 : 5, max: 25, detail: lead.company || "No company" },
    { name: "Title Match", score: lead.title ? (lead.title.match(/VP|Director|Head|Chief|SVP|CRO|CEO/i) ? 25 : 12) : 3, max: 25, detail: lead.title || "No title" },
    { name: "Source Quality", score: ["Referral", "Inbound - Website"].includes(lead.source) ? 20 : lead.source ? 10 : 0, max: 20, detail: lead.source || "Unknown" },
    { name: "Recency", score: (() => { const d = daysSince(lead.lastTouch || lead.createdDate); return d === null ? 5 : d <= 3 ? 15 : d <= 7 ? 12 : d <= 14 ? 8 : 3; })(), max: 15, detail: lead.lastTouch ? formatDate(lead.lastTouch) : "Unknown" },
    { name: "Status", score: lead.status === "Qualified" ? 15 : lead.status === "Working" ? 10 : lead.status === "New" ? 8 : 3, max: 15, detail: lead.status || "Unknown" },
  ];

  return (
    <div style={{ marginTop: 8 }}>
      <div
        onClick={(e) => { e.stopPropagation(); setShowScore(!showScore); }}
        style={{
          fontSize: 11, fontWeight: 600, color: "#F59E0B", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4, padding: "4px 0",
        }}
      >
        <span style={{ transition: "transform .2s", transform: showScore ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▸</span>
        Score Breakdown ({lead.score}/100)
      </div>

      {showScore && (
        <div style={{ marginTop: 4, padding: "8px 10px", background: "#0F172A", borderRadius: 6, border: "1px solid #F59E0B20" }}>
          {factors.map((f, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 10, color: "#94A3B8" }}>{f.name}: <span style={{ color: "#E2E8F0" }}>{f.detail}</span></span>
                <span style={{ fontSize: 10, color: "#64748B" }}>{f.score}/{f.max}</span>
              </div>
              <div style={{ height: 3, background: "#1E293B", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  width: `${(f.score / f.max) * 100}%`, height: "100%", borderRadius: 2,
                  background: f.score / f.max >= 0.7 ? "#10B981" : f.score / f.max >= 0.4 ? "#F59E0B" : "#EF4444",
                  transition: "width .4s",
                }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
