import { useState, useEffect } from "react";

const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");

const TYPE_CONFIG = {
  email: { icon: "✉", color: "#3B82F6", label: "Email" },
  call: { icon: "📞", color: "#8B5CF6", label: "Call" },
  meeting: { icon: "📅", color: "#10B981", label: "Meeting" },
  task: { icon: "📋", color: "#F59E0B", label: "Task" },
  note: { icon: "📝", color: "#94A3B8", label: "Note" },
  chorus: { icon: "🎙", color: "#A855F7", label: "Chorus" },
};

function formatDate(d) {
  if (!d || d === "—") return "—";
  try { return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }
  catch { return d; }
}

function formatTime(d) {
  if (!d) return "";
  try { return new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }); }
  catch { return ""; }
}

function daysBetween(d1, d2) {
  if (!d1 || !d2) return null;
  return Math.floor((new Date(d2) - new Date(d1)) / 86400000);
}

export default function DealTimeline({ oppId, accountName, onClose, onEmail, onDeepIntel, onPostMeeting }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedItem, setExpandedItem] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);

  useEffect(() => {
    if (!accountName && !oppId) return;
    setLoading(true);
    fetch("/.netlify/functions/unified-timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountName }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [oppId, accountName]);

  const timeline = data?.timeline || [];

  // Group by date
  const filtered = timeline.filter(item => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (searchText) {
      const q = searchText.toLowerCase();
      const text = [item.subject, item.from, item.to, item.contact, item.company, item.snippet].filter(Boolean).join(" ").toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const grouped = {};
  filtered.forEach(item => {
    const dateKey = item.date || "Unknown";
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(item);
  });
  const groupEntries = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));

  const typeCounts = {};
  timeline.forEach(item => {
    typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
  });

  const sources = data?.sources || {};
  const totalItems = timeline.length;

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, width: 520, height: "100vh",
      background: "#0F172A", borderLeft: "1px solid #1E293B", zIndex: 2000,
      display: "flex", flexDirection: "column",
      boxShadow: "-8px 0 40px rgba(0,0,0,0.5)",
      animation: "slideIn .25s ease-out",
    }}>
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>

      {/* Header */}
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #1E293B", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#F1F5F9" }}>Deal Timeline</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{accountName || "Account"}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20, padding: 4 }}>x</button>
        </div>

        {/* Stats strip */}
        {data && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {Object.entries(sources).filter(([, v]) => v > 0).map(([src, count]) => (
              <div key={src} style={{
                padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                background: "#1E293B", color: "#94A3B8", border: "1px solid #334155",
              }}>
                {src}: {count}
              </div>
            ))}
            <div style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "#10B98120", color: "#10B981" }}>
              {totalItems} total
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ padding: "8px 18px", borderBottom: "1px solid #1E293B", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setTypeFilter("all")}
            style={{
              padding: "3px 10px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer",
              fontSize: 10, fontWeight: 600,
              background: typeFilter === "all" ? "#10B981" : "transparent",
              color: typeFilter === "all" ? "#fff" : "#94A3B8",
            }}
          >All ({totalItems})</button>
          {Object.entries(typeCounts).map(([type, count]) => {
            const config = TYPE_CONFIG[type] || { icon: "?", color: "#64748B", label: type };
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(type === typeFilter ? "all" : type)}
                style={{
                  padding: "3px 10px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer",
                  fontSize: 10, fontWeight: 600,
                  background: typeFilter === type ? config.color + "30" : "transparent",
                  color: typeFilter === type ? config.color : "#94A3B8",
                }}
              >{config.icon} {config.label} ({count})</button>
            );
          })}
        </div>
        <input
          placeholder="Search timeline..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{
            width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 6,
            padding: "6px 10px", color: "#E2E8F0", fontSize: 12, boxSizing: "border-box",
          }}
        />
      </div>

      {/* Timeline Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 14, color: "#8B5CF6", fontWeight: 600, marginBottom: 8 }}>Loading timeline...</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>Pulling Gmail, Calendar, Chorus, SFDC</div>
          </div>
        )}

        {error && (
          <div style={{ padding: 20, textAlign: "center" }}>
            <div style={{ color: "#EF4444", fontSize: 12 }}>{strip(error)}</div>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#64748B", fontSize: 13 }}>
            {searchText || typeFilter !== "all" ? "No matching items" : "No timeline data found"}
          </div>
        )}

        {groupEntries.map(([date, items]) => (
          <div key={date} style={{ marginBottom: 4 }}>
            {/* Date Header */}
            <div style={{
              position: "sticky", top: 0, zIndex: 1,
              padding: "10px 0 6px", background: "#0F172A",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: "#94A3B8",
                background: "#1E293B", padding: "3px 10px", borderRadius: 4,
                border: "1px solid #334155",
              }}>
                {formatDate(date)}
              </div>
              <div style={{ flex: 1, height: 1, background: "#1E293B" }} />
              <span style={{ fontSize: 10, color: "#64748B" }}>{items.length} item{items.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Items */}
            {items.map((item, i) => {
              const config = TYPE_CONFIG[item.type] || { icon: "?", color: "#64748B", label: item.type };
              const isExpanded = expandedItem === `${date}-${i}`;
              const isHovered = hoveredItem === `${date}-${i}`;

              return (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 2 }}>
                  {/* Timeline line & dot */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24, flexShrink: 0 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: config.color, border: `2px solid ${config.color}40`,
                      flexShrink: 0, marginTop: 12,
                    }} />
                    {i < items.length - 1 && (
                      <div style={{ width: 1, flex: 1, background: "#334155", marginTop: 2 }} />
                    )}
                  </div>

                  {/* Item card */}
                  <div
                    onMouseEnter={() => setHoveredItem(`${date}-${i}`)}
                    onMouseLeave={() => setHoveredItem(null)}
                    onClick={() => setExpandedItem(isExpanded ? null : `${date}-${i}`)}
                    style={{
                      flex: 1, background: isHovered ? "#1E293B" : "#0F172A",
                      borderRadius: 8, padding: "10px 12px", marginBottom: 6,
                      border: `1px solid ${isExpanded ? "#475569" : isHovered ? "#334155" : "#1E293B"}`,
                      cursor: "pointer", transition: "all .15s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 12 }}>{config.icon}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {strip(item.subject || item.title || config.label)}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                          {item.from && <span>From: {item.from} </span>}
                          {item.contact && item.contact !== "—" && <span>{item.contact} </span>}
                          {item.company && item.company !== "—" && <span>· {item.company}</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: "#64748B", flexShrink: 0, marginLeft: 8 }}>
                        {item.time || formatTime(item.dateTime || item.date)}
                      </div>
                    </div>

                    {/* Snippet preview */}
                    {item.snippet && !isExpanded && (
                      <div style={{ fontSize: 11, color: "#64748B", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {strip(item.snippet).substring(0, 100)}
                      </div>
                    )}

                    {/* Expanded content */}
                    {isExpanded && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #334155" }}>
                        {/* Full snippet */}
                        {item.snippet && (
                          <div style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.5, marginBottom: 10, whiteSpace: "pre-wrap" }}>
                            {strip(item.snippet)}
                          </div>
                        )}

                        {/* Metadata */}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                          {item.from && (
                            <div style={{ background: "#1E293B", borderRadius: 4, padding: "3px 8px", fontSize: 10, border: "1px solid #334155" }}>
                              <span style={{ color: "#64748B" }}>From: </span>
                              <span style={{ color: "#E2E8F0" }}>{item.from}</span>
                            </div>
                          )}
                          {item.to && (
                            <div style={{ background: "#1E293B", borderRadius: 4, padding: "3px 8px", fontSize: 10, border: "1px solid #334155" }}>
                              <span style={{ color: "#64748B" }}>To: </span>
                              <span style={{ color: "#E2E8F0" }}>{item.to}</span>
                            </div>
                          )}
                          {item.duration && (
                            <div style={{ background: "#1E293B", borderRadius: 4, padding: "3px 8px", fontSize: 10, border: "1px solid #334155" }}>
                              <span style={{ color: "#64748B" }}>Duration: </span>
                              <span style={{ color: "#E2E8F0" }}>{item.duration}</span>
                            </div>
                          )}
                          {item.source && (
                            <div style={{ background: "#1E293B", borderRadius: 4, padding: "3px 8px", fontSize: 10, border: "1px solid #334155" }}>
                              <span style={{ color: "#64748B" }}>Source: </span>
                              <span style={{ color: "#E2E8F0" }}>{item.source}</span>
                            </div>
                          )}
                          {item.attendees && item.attendees.length > 0 && (
                            <div style={{ width: "100%", marginTop: 4 }}>
                              <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4 }}>Attendees:</div>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {item.attendees.map((a, j) => (
                                  <span key={j} style={{
                                    padding: "2px 6px", borderRadius: 3, fontSize: 10,
                                    background: "#1E293B", color: "#CBD5E1", border: "1px solid #334155",
                                  }}>{typeof a === "string" ? a : a.email || a.name}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: "flex", gap: 6 }}>
                          {item.type === "email" && onEmail && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onEmail({ accountName, contactEmail: item.from, subject: `Re: ${item.subject}` }); }}
                              style={actionBtnStyle("#3B82F6")}
                            >Reply</button>
                          )}
                          {(item.type === "call" || item.type === "chorus") && onDeepIntel && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onDeepIntel({ accountName }); }}
                              style={actionBtnStyle("#8B5CF6")}
                            >Analyze Call</button>
                          )}
                          {item.type === "meeting" && onPostMeeting && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onPostMeeting({ subject: item.subject, account: accountName }); }}
                              style={actionBtnStyle("#10B981")}
                            >Post-Meeting</button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(strip([item.subject, item.snippet, item.from, item.to].filter(Boolean).join("\n")));
                            }}
                            style={actionBtnStyle("#64748B")}
                          >Copy</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Engagement Analytics */}
      {data && timeline.length > 0 && (
        <TimelineAnalytics timeline={timeline} sources={sources} />
      )}

      {/* Footer summary */}
      {data && (
        <div style={{
          padding: "10px 18px", borderTop: "1px solid #1E293B", flexShrink: 0,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 11, color: "#64748B" }}>
            {filtered.length} of {totalItems} interactions
            {data.dateRange && ` · ${formatDate(data.dateRange.earliest)} — ${formatDate(data.dateRange.latest)}`}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setShowChat(!showChat)}
              style={{
                padding: "4px 10px", borderRadius: 4, border: "1px solid #334155",
                cursor: "pointer", fontSize: 10, fontWeight: 600,
                background: showChat ? "#8B5CF620" : "transparent",
                color: showChat ? "#8B5CF6" : "#94A3B8",
              }}
            >Ask Claude</button>
            {onDeepIntel && (
              <button
                onClick={() => onDeepIntel({ accountName })}
                style={{
                  padding: "4px 10px", borderRadius: 4, border: "1px solid #334155",
                  cursor: "pointer", fontSize: 10, fontWeight: 600,
                  background: "transparent", color: "#A855F7",
                }}
              >Deep Intel</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timeline Analytics Panel ────────────────────────────────────
function TimelineAnalytics({ timeline, sources }) {
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Compute engagement metrics
  const emailCount = timeline.filter(t => t.type === "email").length;
  const callCount = timeline.filter(t => t.type === "call" || t.type === "chorus").length;
  const meetingCount = timeline.filter(t => t.type === "meeting").length;
  const taskCount = timeline.filter(t => t.type === "task").length;

  // Activity by week (last 8 weeks)
  const weeklyActivity = [];
  const now = new Date();
  for (let w = 0; w < 8; w++) {
    const weekStart = new Date(now.getTime() - (w + 1) * 7 * 86400000);
    const weekEnd = new Date(now.getTime() - w * 7 * 86400000);
    const count = timeline.filter(t => {
      if (!t.date || t.date === "—") return false;
      const d = new Date(t.date);
      return d >= weekStart && d < weekEnd;
    }).length;
    weeklyActivity.unshift({ week: `W-${w}`, count });
  }
  const maxWeekly = Math.max(...weeklyActivity.map(w => w.count), 1);

  // Unique contacts
  const contacts = new Set();
  timeline.forEach(t => {
    if (t.contact && t.contact !== "—") contacts.add(t.contact);
    if (t.from) contacts.add(t.from.split("<")[0].trim());
  });

  // Response time estimate
  const dates = timeline.filter(t => t.date && t.date !== "—").map(t => new Date(t.date).getTime()).sort();
  let avgGap = 0;
  if (dates.length > 1) {
    const gaps = [];
    for (let i = 1; i < dates.length; i++) gaps.push(dates[i] - dates[i - 1]);
    avgGap = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length / 86400000);
  }

  // Trend: is engagement increasing or decreasing?
  const recentWeeks = weeklyActivity.slice(-4);
  const olderWeeks = weeklyActivity.slice(0, 4);
  const recentAvg = recentWeeks.reduce((s, w) => s + w.count, 0) / Math.max(recentWeeks.length, 1);
  const olderAvg = olderWeeks.reduce((s, w) => s + w.count, 0) / Math.max(olderWeeks.length, 1);
  const trend = recentAvg > olderAvg ? "increasing" : recentAvg < olderAvg ? "decreasing" : "stable";
  const trendColor = trend === "increasing" ? "#10B981" : trend === "decreasing" ? "#EF4444" : "#F59E0B";

  return (
    <div style={{ borderTop: "1px solid #1E293B", flexShrink: 0 }}>
      <div
        onClick={() => setShowAnalytics(!showAnalytics)}
        style={{
          padding: "8px 18px", cursor: "pointer", display: "flex",
          justifyContent: "space-between", alignItems: "center",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8" }}>Engagement Analytics</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: trendColor, fontWeight: 600 }}>
            {trend === "increasing" ? "↑ Increasing" : trend === "decreasing" ? "↓ Decreasing" : "→ Stable"}
          </span>
          <span style={{ fontSize: 10, color: "#64748B", transition: "transform .2s", transform: showAnalytics ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
        </div>
      </div>

      {showAnalytics && (
        <div style={{ padding: "0 18px 12px" }}>
          {/* Key metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "Emails", value: emailCount, color: "#3B82F6", icon: "✉" },
              { label: "Calls", value: callCount, color: "#8B5CF6", icon: "📞" },
              { label: "Meetings", value: meetingCount, color: "#10B981", icon: "📅" },
              { label: "Contacts", value: contacts.size, color: "#F59E0B", icon: "👥" },
              { label: "Avg Gap", value: `${avgGap}d`, color: avgGap <= 3 ? "#10B981" : avgGap <= 7 ? "#F59E0B" : "#EF4444", icon: "⏱" },
            ].map((m, i) => (
              <div key={i} style={{
                background: "#1E293B", borderRadius: 4, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ fontSize: 10 }}>{m.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: 8, color: "#64748B", textTransform: "uppercase" }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Weekly activity mini chart */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: "#64748B", marginBottom: 6, textTransform: "uppercase" }}>Weekly Activity (Last 8 Weeks)</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 40 }}>
              {weeklyActivity.map((w, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{
                    width: "100%", height: Math.max((w.count / maxWeekly) * 36, 2),
                    borderRadius: 2, background: i >= 4 ? "#3B82F6" : "#3B82F660",
                    transition: "height .3s",
                  }} />
                  <span style={{ fontSize: 8, color: "#64748B" }}>{w.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Engagement trend indicator */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
            background: trendColor + "10", borderRadius: 4, border: `1px solid ${trendColor}20`,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: trendColor }} />
            <span style={{ fontSize: 11, color: trendColor, fontWeight: 600 }}>
              Engagement is {trend}
            </span>
            <span style={{ fontSize: 10, color: "#64748B" }}>
              — {recentAvg.toFixed(1)} interactions/week (recent) vs {olderAvg.toFixed(1)} (prior)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Relationship Strength Indicator ─────────────────────────────
export function RelationshipStrength({ timeline }) {
  if (!timeline || timeline.length === 0) return null;

  const emailCount = timeline.filter(t => t.type === "email").length;
  const callCount = timeline.filter(t => t.type === "call" || t.type === "chorus").length;
  const meetingCount = timeline.filter(t => t.type === "meeting").length;

  // Calculate relationship strength (0-100)
  const recencyScore = (() => {
    const dates = timeline.filter(t => t.date && t.date !== "—").map(t => new Date(t.date).getTime());
    if (dates.length === 0) return 0;
    const latest = Math.max(...dates);
    const daysSince = Math.floor((Date.now() - latest) / 86400000);
    return daysSince <= 3 ? 30 : daysSince <= 7 ? 25 : daysSince <= 14 ? 15 : daysSince <= 30 ? 8 : 0;
  })();

  const frequencyScore = Math.min(timeline.length * 2, 30);
  const diversityScore = ((emailCount > 0 ? 10 : 0) + (callCount > 0 ? 15 : 0) + (meetingCount > 0 ? 15 : 0));
  const total = Math.min(recencyScore + frequencyScore + diversityScore, 100);
  const color = total >= 70 ? "#10B981" : total >= 40 ? "#F59E0B" : "#EF4444";
  const label = total >= 70 ? "Strong" : total >= 40 ? "Moderate" : "Weak";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
    }}>
      <span style={{ fontSize: 10, color: "#64748B" }}>Relationship:</span>
      <div style={{ width: 60, height: 4, background: "#1E293B", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${total}%`, height: "100%", background: color, borderRadius: 2, transition: "width .5s" }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 600, color }}>{label} ({total})</span>
    </div>
  );
}

// ── Key People Panel ────────────────────────────────────────────
export function KeyPeopleFromTimeline({ timeline }) {
  const [showPeople, setShowPeople] = useState(false);

  if (!timeline || timeline.length === 0) return null;

  // Extract unique people from timeline
  const people = {};
  timeline.forEach(item => {
    if (item.contact && item.contact !== "—") {
      if (!people[item.contact]) people[item.contact] = { name: item.contact, interactions: 0, lastSeen: null, types: new Set() };
      people[item.contact].interactions++;
      people[item.contact].types.add(item.type);
      const d = item.date && item.date !== "—" ? new Date(item.date) : null;
      if (d && (!people[item.contact].lastSeen || d > people[item.contact].lastSeen)) {
        people[item.contact].lastSeen = d;
      }
    }
    if (item.from) {
      const fromName = item.from.split("<")[0].trim().replace(/"/g, "");
      if (fromName && fromName !== "—" && !fromName.includes("jake") && !fromName.includes("Jake")) {
        if (!people[fromName]) people[fromName] = { name: fromName, interactions: 0, lastSeen: null, types: new Set() };
        people[fromName].interactions++;
        people[fromName].types.add("email");
      }
    }
  });

  const sorted = Object.values(people).sort((a, b) => b.interactions - a.interactions);

  if (sorted.length === 0) return null;

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={(e) => { e.stopPropagation(); setShowPeople(!showPeople); }}
        style={{
          fontSize: 10, fontWeight: 600, color: "#F59E0B", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4, padding: "6px 0",
        }}
      >
        <span style={{ transition: "transform .2s", transform: showPeople ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▸</span>
        Key People ({sorted.length})
      </div>

      {showPeople && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 4 }}>
          {sorted.slice(0, 8).map((person, i) => (
            <div key={i} style={{
              background: "#0F172A", borderRadius: 4, padding: "6px 8px",
              border: "1px solid #1E293B",
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#E2E8F0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {person.name}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                <span style={{ fontSize: 9, color: "#64748B" }}>{person.interactions} touches</span>
                {Array.from(person.types).map(t => {
                  const icons = { email: "✉", call: "📞", meeting: "📅", chorus: "🎙", task: "📋" };
                  return <span key={t} style={{ fontSize: 10 }}>{icons[t] || "?"}</span>;
                })}
              </div>
              {person.lastSeen && (
                <div style={{ fontSize: 9, color: "#64748B", marginTop: 1 }}>
                  Last: {formatDate(person.lastSeen.toISOString().split("T")[0])}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const actionBtnStyle = (color) => ({
  padding: "4px 10px", borderRadius: 4, border: "none", cursor: "pointer",
  fontSize: 10, fontWeight: 600, background: color + "20", color,
  transition: "all .15s",
});
