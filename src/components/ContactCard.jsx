import { useState } from "react";

const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");

const ENGAGEMENT_COLORS = { high: "#10B981", medium: "#F59E0B", low: "#EF4444", unknown: "#64748B" };
const ROLE_COLORS = {
  "Decision Maker": "#EF4444",
  Champion: "#10B981",
  Influencer: "#3B82F6",
  "Economic Buyer": "#F59E0B",
  "Technical Buyer": "#8B5CF6",
  "End User": "#06B6D4",
  Coach: "#A855F7",
  Blocker: "#EF4444",
};

export default function ContactCard({ contact, onEmail, onCall, onLinkedIn, onAddToOpp, onChat, onTimeline, expanded: controlledExpanded, onToggle }) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const [hoveredAction, setHoveredAction] = useState(null);
  const [copied, setCopied] = useState(null);

  const expanded = controlledExpanded !== undefined ? controlledExpanded : localExpanded;
  const toggleExpand = () => {
    if (onToggle) onToggle(contact.id || contact.email);
    else setLocalExpanded(!localExpanded);
  };

  const name = contact.name || contact.Name || "—";
  const title = contact.title || contact.Title || "";
  const email = contact.email || contact.Email || "";
  const phone = contact.phone || contact.Phone || "";
  const account = contact.account || contact.Account?.Name || contact.accountName || "";
  const linkedIn = contact.linkedIn || contact.LinkedIn_URL__c || "";
  const engagement = contact.engagement || contact.engagementLevel || "unknown";
  const role = contact.role || contact.Role || "";
  const department = contact.department || contact.Department || "";
  const lastActivity = contact.lastActivity || contact.LastActivityDate || "";

  const engColor = ENGAGEMENT_COLORS[engagement] || "#64748B";
  const roleColor = ROLE_COLORS[role] || "#64748B";

  const initials = name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const actionBtn = (label, icon, onClick, color = "#334155") => (
    <button
      key={label}
      onMouseEnter={() => setHoveredAction(label)}
      onMouseLeave={() => setHoveredAction(null)}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      style={{
        padding: "5px 10px", borderRadius: 5,
        border: `1px solid ${color}40`,
        cursor: "pointer", fontSize: 11, fontWeight: 600,
        background: hoveredAction === label ? color + "35" : color + "15",
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
      onClick={toggleExpand}
      style={{
        background: "#1E293B", borderRadius: 10, padding: "12px 16px",
        marginBottom: 6, border: "1px solid #334155",
        borderLeft: engagement !== "unknown" ? `3px solid ${engColor}` : "3px solid #334155",
        cursor: "pointer", transition: "all .2s",
      }}
    >
      {/* Main Row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          {/* Avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: `linear-gradient(135deg, ${engColor}20, ${engColor}40)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, color: engColor,
            flexShrink: 0, border: `1px solid ${engColor}30`,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9" }}>{name}</span>
              {role && (
                <span style={{
                  padding: "1px 6px", borderRadius: 3, fontSize: 9, fontWeight: 600,
                  background: roleColor + "20", color: roleColor,
                }}>{role}</span>
              )}
              {engagement !== "unknown" && (
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", background: engColor,
                  display: "inline-block",
                }} title={`${engagement} engagement`} />
              )}
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {title && <span>{title}</span>}
              {title && account && <span style={{ color: "#475569" }}> at </span>}
              {account && <span style={{ fontWeight: 500 }}>{account}</span>}
            </div>
          </div>
        </div>

        {/* Quick actions on hover */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {email && (
            <div
              onClick={(e) => { e.stopPropagation(); onEmail ? onEmail(contact) : window.open(`mailto:${email}`); }}
              onMouseEnter={() => setHoveredAction("email-quick")}
              onMouseLeave={() => setHoveredAction(null)}
              style={{
                width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", fontSize: 13,
                background: hoveredAction === "email-quick" ? "#3B82F620" : "transparent",
                transition: "all .15s",
              }}
              title={`Email ${email}`}
            >✉</div>
          )}
          {phone && (
            <div
              onClick={(e) => { e.stopPropagation(); onCall ? onCall(contact) : window.open(`tel:${phone}`); }}
              onMouseEnter={() => setHoveredAction("phone-quick")}
              onMouseLeave={() => setHoveredAction(null)}
              style={{
                width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", fontSize: 13,
                background: hoveredAction === "phone-quick" ? "#10B98120" : "transparent",
                transition: "all .15s",
              }}
              title={`Call ${phone}`}
            >📞</div>
          )}
          <div style={{
            width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center",
            color: "#64748B", fontSize: 10, transition: "transform .2s",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}>▼</div>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #334155" }}>
          {/* Contact details */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6, marginBottom: 12 }}>
            {email && (
              <div
                onClick={(e) => { e.stopPropagation(); copyToClipboard(email, "email"); }}
                style={{
                  background: "#0F172A", borderRadius: 6, padding: "8px 10px",
                  border: "1px solid #1E293B", cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 9, color: "#64748B", textTransform: "uppercase", marginBottom: 2 }}>Email</div>
                <div style={{ fontSize: 12, color: "#3B82F6", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {copied === "email" ? "Copied!" : email}
                </div>
              </div>
            )}
            {phone && (
              <div
                onClick={(e) => { e.stopPropagation(); copyToClipboard(phone, "phone"); }}
                style={{
                  background: "#0F172A", borderRadius: 6, padding: "8px 10px",
                  border: "1px solid #1E293B", cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 9, color: "#64748B", textTransform: "uppercase", marginBottom: 2 }}>Phone</div>
                <div style={{ fontSize: 12, color: "#10B981", fontWeight: 500 }}>
                  {copied === "phone" ? "Copied!" : phone}
                </div>
              </div>
            )}
            {department && (
              <div style={{ background: "#0F172A", borderRadius: 6, padding: "8px 10px", border: "1px solid #1E293B" }}>
                <div style={{ fontSize: 9, color: "#64748B", textTransform: "uppercase", marginBottom: 2 }}>Department</div>
                <div style={{ fontSize: 12, color: "#E2E8F0", fontWeight: 500 }}>{department}</div>
              </div>
            )}
            {lastActivity && (
              <div style={{ background: "#0F172A", borderRadius: 6, padding: "8px 10px", border: "1px solid #1E293B" }}>
                <div style={{ fontSize: 9, color: "#64748B", textTransform: "uppercase", marginBottom: 2 }}>Last Activity</div>
                <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>
                  {typeof lastActivity === "string" && lastActivity !== "—"
                    ? new Date(lastActivity).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : "—"
                  }
                </div>
              </div>
            )}
            {engagement !== "unknown" && (
              <div style={{ background: "#0F172A", borderRadius: 6, padding: "8px 10px", border: "1px solid #1E293B" }}>
                <div style={{ fontSize: 9, color: "#64748B", textTransform: "uppercase", marginBottom: 2 }}>Engagement</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: engColor }} />
                  <span style={{ fontSize: 12, color: engColor, fontWeight: 600, textTransform: "capitalize" }}>{engagement}</span>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {email && actionBtn("Email", "✉", () => onEmail ? onEmail(contact) : window.open(`mailto:${email}`), "#3B82F6")}
            {phone && actionBtn("Call", "📞", () => onCall ? onCall(contact) : window.open(`tel:${phone}`), "#10B981")}
            {linkedIn && actionBtn("LinkedIn", "💼", () => onLinkedIn ? onLinkedIn(contact) : window.open(linkedIn, "_blank"), "#0A66C2")}
            {onAddToOpp && actionBtn("Add to Opp", "➕", () => onAddToOpp(contact), "#F59E0B")}
            {onTimeline && actionBtn("Timeline", "📅", () => onTimeline(contact), "#8B5CF6")}
            {onChat && actionBtn("Ask Claude", "🧠", () => onChat(contact), "#A855F7")}
            {contact.id && actionBtn("SFDC", "☁", () => window.open(`https://skaled.lightning.force.com/lightning/r/Contact/${contact.id}/view`, "_blank"), "#00A1E0")}
          </div>

          {/* Contact Opportunity Roles */}
          <ContactOpportunities contact={contact} />

          {/* Quick Email Composer */}
          <ContactQuickEmail contact={contact} />

          {/* Interaction History */}
          <ContactInteractions contact={contact} />
        </div>
      )}
    </div>
  );
}

// ── Contact Opportunity Roles ───────────────────────────────────
function ContactOpportunities({ contact }) {
  const [showOpps, setShowOpps] = useState(false);

  const opps = contact.opportunities || contact.OpportunityContactRoles?.records || [];
  if (opps.length === 0) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={(e) => { e.stopPropagation(); setShowOpps(!showOpps); }}
        style={{
          fontSize: 11, fontWeight: 600, color: "#F59E0B", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4, padding: "4px 0",
        }}
      >
        <span style={{ transition: "transform .2s", transform: showOpps ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▸</span>
        Opportunity Roles ({opps.length})
      </div>
      {showOpps && (
        <div style={{ marginTop: 4 }}>
          {opps.map((opp, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "6px 10px", background: "#0F172A", borderRadius: 4,
              marginBottom: 3, border: "1px solid #1E293B",
            }}>
              <div>
                <div style={{ fontSize: 11, color: "#E2E8F0", fontWeight: 500 }}>
                  {strip(opp.oppName || opp.Opportunity?.Name || "—")}
                </div>
                <div style={{ fontSize: 10, color: "#64748B" }}>
                  Role: {opp.role || opp.Role || "—"} · {opp.stage || opp.Opportunity?.StageName || "—"}
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#F1F5F9" }}>
                {fmt(opp.amount || opp.Opportunity?.Amount || 0)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quick Email Composer for Contact ────────────────────────────
function ContactQuickEmail({ contact }) {
  const [showComposer, setShowComposer] = useState(false);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copiedDraft, setCopiedDraft] = useState(false);

  const email = contact.email || contact.Email || "";
  const name = contact.name || contact.Name || "—";
  const title = contact.title || contact.Title || "";
  const account = contact.account || contact.Account?.Name || contact.accountName || "";

  if (!email) return null;

  const generateDraft = async () => {
    setLoading(true);
    try {
      const res = await fetch("/.netlify/functions/claude-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Draft a brief, professional email from Jake Dunlap (CEO, Skaled Consulting) to ${name} (${title || "Unknown role"}) at ${account || "their company"}.

Context: This is an existing contact. Draft a check-in or follow-up email that:
- Is warm and concise (3-4 sentences)
- References their role/company
- Has a clear next step

Provide subject line and body only, no commentary.`,
          history: [],
        }),
      });
      const data = await res.json();
      setDraft(strip(data.response || data.message || "Error generating draft"));
    } catch (e) {
      setDraft(`Error: ${e.message}`);
    }
    setLoading(false);
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={(e) => { e.stopPropagation(); if (!showComposer && !draft) generateDraft(); setShowComposer(!showComposer); }}
        style={{
          fontSize: 11, fontWeight: 600, color: "#3B82F6", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4, padding: "4px 0",
        }}
      >
        <span style={{ transition: "transform .2s", transform: showComposer ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▸</span>
        Quick Email Draft
      </div>
      {showComposer && (
        <div style={{ marginTop: 4, padding: "10px 12px", background: "#0F172A", borderRadius: 8, border: "1px solid #3B82F630" }}>
          {loading && <div style={{ fontSize: 11, color: "#64748B", padding: 8, textAlign: "center" }}>Drafting email to {name}...</div>}
          {draft && !loading && (
            <>
              <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4 }}>To: {email}</div>
              <div style={{ fontSize: 12, color: "#E2E8F0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{draft}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(draft); setCopiedDraft(true); setTimeout(() => setCopiedDraft(false), 1500); }}
                  style={{ padding: "4px 10px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600, background: "#33415530", color: copiedDraft ? "#10B981" : "#94A3B8" }}
                >{copiedDraft ? "Copied!" : "Copy"}</button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const lines = draft.split("\n");
                    const subj = lines.find(l => l.toLowerCase().includes("subject"))?.replace(/^subject:?\s*/i, "") || "Quick note";
                    window.open(`mailto:${email}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(draft)}`);
                  }}
                  style={{ padding: "4px 10px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600, background: "#3B82F620", color: "#3B82F6" }}
                >Send Email</button>
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

// ── Contact Interaction History ─────────────────────────────────
function ContactInteractions({ contact }) {
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const email = contact.email || contact.Email || "";
  const account = contact.account || contact.Account?.Name || contact.accountName || "";

  const loadHistory = async () => {
    if (historyData || (!email && !account)) return;
    setHistoryLoading(true);
    try {
      const res = await fetch("/.netlify/functions/unified-timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: account || undefined,
          contactEmail: email || undefined,
        }),
      });
      const data = await res.json();
      setHistoryData(data);
    } catch {}
    setHistoryLoading(false);
  };

  const timeline = historyData?.timeline || [];
  const emailCount = timeline.filter(t => t.type === "email").length;
  const callCount = timeline.filter(t => t.type === "call" || t.type === "chorus").length;
  const meetingCount = timeline.filter(t => t.type === "meeting").length;

  return (
    <div>
      <div
        onClick={(e) => { e.stopPropagation(); if (!showHistory) loadHistory(); setShowHistory(!showHistory); }}
        style={{
          fontSize: 11, fontWeight: 600, color: "#8B5CF6", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4, padding: "4px 0",
        }}
      >
        <span style={{ transition: "transform .2s", transform: showHistory ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▸</span>
        Interaction History
        {historyData && <span style={{ color: "#64748B", fontWeight: 400 }}> ({timeline.length})</span>}
      </div>

      {showHistory && (
        <div style={{ marginTop: 4, padding: "8px", background: "#0F172A", borderRadius: 6, border: "1px solid #1E293B" }}>
          {historyLoading && <div style={{ fontSize: 11, color: "#64748B", padding: 8 }}>Loading interactions...</div>}

          {historyData && timeline.length === 0 && (
            <div style={{ fontSize: 11, color: "#64748B", padding: 8 }}>No interactions found</div>
          )}

          {timeline.length > 0 && (
            <>
              {/* Summary stats */}
              <div style={{ display: "flex", gap: 10, marginBottom: 8, padding: "4px 0" }}>
                {emailCount > 0 && <span style={{ fontSize: 10, color: "#3B82F6" }}>✉ {emailCount} emails</span>}
                {callCount > 0 && <span style={{ fontSize: 10, color: "#8B5CF6" }}>📞 {callCount} calls</span>}
                {meetingCount > 0 && <span style={{ fontSize: 10, color: "#10B981" }}>📅 {meetingCount} meetings</span>}
              </div>

              {/* Recent items */}
              {timeline.slice(0, 5).map((item, i) => {
                const typeConfig = {
                  email: { icon: "✉", color: "#3B82F6" },
                  call: { icon: "📞", color: "#8B5CF6" },
                  chorus: { icon: "🎙", color: "#A855F7" },
                  meeting: { icon: "📅", color: "#10B981" },
                  task: { icon: "📋", color: "#F59E0B" },
                };
                const cfg = typeConfig[item.type] || { icon: "?", color: "#64748B" };
                const dateStr = item.date && item.date !== "—"
                  ? new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "—";

                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "4px 0",
                    borderBottom: i < Math.min(timeline.length, 5) - 1 ? "1px solid #1E293B" : "none",
                  }}>
                    <span style={{ fontSize: 11, color: cfg.color }}>{cfg.icon}</span>
                    <span style={{ fontSize: 10, color: "#64748B", width: 50, flexShrink: 0 }}>{dateStr}</span>
                    <span style={{
                      fontSize: 10, color: "#CBD5E1", flex: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{strip(item.subject || item.title || cfg.icon)}</span>
                  </div>
                );
              })}

              {timeline.length > 5 && (
                <div style={{ fontSize: 10, color: "#64748B", padding: "4px 0", textAlign: "center" }}>
                  + {timeline.length - 5} more interactions
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const fmt = (n) => "$" + (n || 0).toLocaleString();
