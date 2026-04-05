import { useState, useMemo } from "react";

const fmt = (n) => "$" + (n || 0).toLocaleString();
const strip = (s) => (s || "").replace(/\*\*/g, "").replace(/\*/g, "");

const FORECAST_COLORS = {
  Commit: "#10B981", "Best Case": "#F59E0B", Pipeline: "#8B5CF6",
  Omitted: "#64748B", Closed: "#10B981", "Most Likely": "#3B82F6",
};
const STATUS_COLORS = { New: "#3B82F6", Working: "#F59E0B", Nurturing: "#8B5CF6", Qualified: "#10B981" };

function formatDate(d) {
  if (!d || d === "—") return "—";
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return d; }
}

function formatTime(d) {
  if (!d) return "";
  try { return new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }); } catch { return ""; }
}

function isPastDue(closeDate) {
  if (!closeDate || closeDate === "—") return false;
  return new Date(closeDate) < new Date();
}

export default function MetricDrilldown({ title, data, type, onClose, onDealClick, onMeetingPrep, onLeadResearch, onEmail }) {
  const [sortField, setSortField] = useState("amount");
  const [sortAsc, setSortAsc] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [expandedItem, setExpandedItem] = useState(null);
  const [groupBy, setGroupBy] = useState(type === "pipeline" ? "forecastCategory" : null);
  const [hoveredRow, setHoveredRow] = useState(null);

  const items = useMemo(() => {
    if (!data) return [];
    let list = Array.isArray(data) ? [...data] : [];
    if (filterText) {
      const q = filterText.toLowerCase();
      list = list.filter(item => {
        const searchable = [item.name, item.account, item.company, item.subject, item.stage, item.forecastCategory, item.title, item.source].filter(Boolean).join(" ").toLowerCase();
        return searchable.includes(q);
      });
    }
    if (type === "pipeline" || type === "won" || type === "pastdue") {
      list.sort((a, b) => {
        let aVal = a[sortField], bVal = b[sortField];
        if (typeof aVal === "string") aVal = aVal.toLowerCase();
        if (typeof bVal === "string") bVal = bVal.toLowerCase();
        if (aVal < bVal) return sortAsc ? -1 : 1;
        if (aVal > bVal) return sortAsc ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [data, filterText, sortField, sortAsc, type]);

  const grouped = useMemo(() => {
    if (!groupBy || type !== "pipeline") return null;
    const groups = {};
    items.forEach(item => {
      const key = item[groupBy] || "Other";
      if (!groups[key]) groups[key] = { items: [], total: 0 };
      groups[key].items.push(item);
      groups[key].total += item.amount || 0;
    });
    return Object.entries(groups).sort((a, b) => b[1].total - a[1].total);
  }, [items, groupBy, type]);

  const totalAmount = items.reduce((s, i) => s + (i.amount || 0), 0);

  const toggleSort = (field) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const sortIcon = (field) => sortField === field ? (sortAsc ? " ↑" : " ↓") : "";

  const renderDealRow = (deal, i) => {
    const isExpanded = expandedItem === (deal.id || i);
    const pastDue = isPastDue(deal.closeDate);
    return (
      <div key={deal.id || i}>
        <div
          onMouseEnter={() => setHoveredRow(deal.id || i)}
          onMouseLeave={() => setHoveredRow(null)}
          onClick={() => setExpandedItem(isExpanded ? null : (deal.id || i))}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
            background: hoveredRow === (deal.id || i) ? "#1E293B" : "transparent",
            borderBottom: "1px solid #1E293B", cursor: "pointer", transition: "all .1s",
            borderLeft: pastDue ? "3px solid #EF4444" : "3px solid transparent",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {strip(deal.name)}
            </div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>{deal.account || "—"}</div>
          </div>
          <div style={{ width: 100, textAlign: "center" }}>
            <span style={{
              padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600,
              background: (FORECAST_COLORS[deal.forecastCategory] || "#64748B") + "20",
              color: FORECAST_COLORS[deal.forecastCategory] || "#64748B",
            }}>{deal.forecastCategory || deal.stage || "—"}</span>
          </div>
          <div style={{ width: 80, textAlign: "center", fontSize: 11, color: pastDue ? "#EF4444" : "#94A3B8" }}>
            {formatDate(deal.closeDate)}
            {pastDue && <div style={{ fontSize: 9, color: "#EF4444", fontWeight: 600 }}>PAST DUE</div>}
          </div>
          <div style={{ width: 100, textAlign: "right" }}>
            <span
              style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", cursor: "pointer" }}
              onClick={(e) => { e.stopPropagation(); onDealClick?.(deal); }}
              title="Click for deal actions"
            >{fmt(deal.amount)}</span>
          </div>
        </div>
        {isExpanded && (
          <div style={{ padding: "10px 12px 10px 24px", background: "#0F172A", borderBottom: "1px solid #1E293B" }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              {[
                { label: "Stage", val: deal.stage },
                { label: "Probability", val: `${deal.probability || 0}%` },
                { label: "Source", val: deal.source || "—" },
                { label: "Days Open", val: deal.daysInStage || "—" },
                { label: "Last Activity", val: formatDate(deal.lastActivity) },
              ].map((s, j) => (
                <div key={j} style={{ background: "#1E293B", borderRadius: 4, padding: "4px 8px", fontSize: 10 }}>
                  <span style={{ color: "#64748B" }}>{s.label}: </span>
                  <span style={{ color: "#E2E8F0", fontWeight: 600 }}>{s.val}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={(e) => { e.stopPropagation(); onDealClick?.(deal); }} style={actionStyle("#3B82F6")}>Inspect</button>
              {onEmail && <button onClick={(e) => { e.stopPropagation(); onEmail(deal); }} style={actionStyle("#10B981")}>AI Email</button>}
              <button onClick={(e) => { e.stopPropagation(); window.open(`https://skaled.lightning.force.com/lightning/r/Opportunity/${deal.id}/view`, "_blank"); }} style={actionStyle("#00A1E0")}>Open in SFDC</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMeetingRow = (meeting, i) => {
    const isExpanded = expandedItem === `mtg-${i}`;
    return (
      <div key={`mtg-${i}`}>
        <div
          onMouseEnter={() => setHoveredRow(`mtg-${i}`)}
          onMouseLeave={() => setHoveredRow(null)}
          onClick={() => setExpandedItem(isExpanded ? null : `mtg-${i}`)}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
            background: hoveredRow === `mtg-${i}` ? "#1E293B" : "transparent",
            borderBottom: "1px solid #1E293B", cursor: "pointer", transition: "all .1s",
          }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "#3B82F620", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📅</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {strip(meeting.subject || meeting.title || "Meeting")}
            </div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>
              {formatTime(meeting.start || meeting.startTime)} · {meeting.attendees?.length || 0} attendees
            </div>
          </div>
          <div style={{ width: 80, textAlign: "right" }}>
            {meeting.account && <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>{meeting.account}</div>}
            <div style={{ fontSize: 10, color: "#64748B" }}>{formatDate(meeting.date || meeting.start)}</div>
          </div>
        </div>
        {isExpanded && (
          <div style={{ padding: "10px 12px 10px 24px", background: "#0F172A", borderBottom: "1px solid #1E293B" }}>
            {meeting.attendees && meeting.attendees.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4, textTransform: "uppercase" }}>Attendees</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {meeting.attendees.map((a, j) => (
                    <span key={j} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: "#1E293B", color: "#CBD5E1", border: "1px solid #334155" }}>
                      {typeof a === "string" ? a : a.email || a.name || "—"}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              {onMeetingPrep && <button onClick={(e) => { e.stopPropagation(); onMeetingPrep(meeting); }} style={actionStyle("#8B5CF6")}>90s Prep</button>}
              {meeting.link && <button onClick={(e) => { e.stopPropagation(); window.open(meeting.link, "_blank"); }} style={actionStyle("#3B82F6")}>Join</button>}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderLeadRow = (lead, i) => {
    const isExpanded = expandedItem === `lead-${i}`;
    const statusColor = STATUS_COLORS[lead.status] || "#64748B";
    return (
      <div key={`lead-${i}`}>
        <div
          onMouseEnter={() => setHoveredRow(`lead-${i}`)}
          onMouseLeave={() => setHoveredRow(null)}
          onClick={() => setExpandedItem(isExpanded ? null : `lead-${i}`)}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
            background: hoveredRow === `lead-${i}` ? "#1E293B" : "transparent",
            borderBottom: "1px solid #1E293B", cursor: "pointer", transition: "all .1s",
          }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 8, background: statusColor + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: statusColor }}>
            {(lead.name || "?")[0]}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{lead.name || "—"}</div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>
              {lead.company || "—"} · {lead.title || "—"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600, background: statusColor + "20", color: statusColor }}>{lead.status || "—"}</span>
            {lead.source && <span style={{ fontSize: 10, color: "#64748B" }}>{lead.source}</span>}
          </div>
        </div>
        {isExpanded && (
          <div style={{ padding: "10px 12px 10px 24px", background: "#0F172A", borderBottom: "1px solid #1E293B" }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
              {[
                { label: "Status", val: lead.status },
                { label: "Source", val: lead.source },
                { label: "Score", val: lead.score || "—" },
                { label: "Created", val: formatDate(lead.lastTouch || lead.createdDate) },
              ].map((s, j) => (
                <div key={j} style={{ background: "#1E293B", borderRadius: 4, padding: "4px 8px", fontSize: 10 }}>
                  <span style={{ color: "#64748B" }}>{s.label}: </span>
                  <span style={{ color: "#E2E8F0", fontWeight: 600 }}>{s.val}</span>
                </div>
              ))}
            </div>
            {lead.description && (
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 8, lineHeight: 1.4 }}>{strip(lead.description).substring(0, 200)}</div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              {onLeadResearch && <button onClick={(e) => { e.stopPropagation(); onLeadResearch(lead); }} style={actionStyle("#8B5CF6")}>Research</button>}
              {onEmail && <button onClick={(e) => { e.stopPropagation(); onEmail(lead); }} style={actionStyle("#10B981")}>Email</button>}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.6)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center",
      animation: "fadeIn .2s",
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0F172A", borderRadius: 14, width: "90%", maxWidth: 800,
          maxHeight: "85vh", display: "flex", flexDirection: "column",
          border: "1px solid #1E293B", boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9" }}>{title}</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
              {items.length} items
              {(type === "pipeline" || type === "won" || type === "pastdue") && ` · Total: ${fmt(totalAmount)}`}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {type === "pipeline" && (
              <select
                value={groupBy || ""}
                onChange={(e) => setGroupBy(e.target.value || null)}
                style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "4px 8px", color: "#94A3B8", fontSize: 11 }}
              >
                <option value="">No grouping</option>
                <option value="forecastCategory">By Forecast Category</option>
                <option value="stage">By Stage</option>
              </select>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 20, padding: 4 }}>x</button>
          </div>
        </div>

        {/* Search & Sort */}
        <div style={{ padding: "8px 20px", borderBottom: "1px solid #1E293B", display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <input
            placeholder="Filter..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{ flex: 1, background: "#1E293B", border: "1px solid #334155", borderRadius: 6, padding: "6px 10px", color: "#E2E8F0", fontSize: 12 }}
          />
          {(type === "pipeline" || type === "won" || type === "pastdue") && (
            <div style={{ display: "flex", gap: 4 }}>
              {[["amount", "Amount"], ["name", "Name"], ["closeDate", "Close"]].map(([field, label]) => (
                <button
                  key={field}
                  onClick={() => toggleSort(field)}
                  style={{
                    padding: "4px 8px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer",
                    fontSize: 10, fontWeight: 600, background: sortField === field ? "#334155" : "transparent", color: "#94A3B8",
                  }}
                >{label}{sortIcon(field)}</button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {items.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#64748B", fontSize: 13 }}>No items found</div>
          )}

          {/* Pipeline / Won / Past Due */}
          {(type === "pipeline" || type === "won" || type === "pastdue") && (
            <>
              {grouped ? (
                grouped.map(([group, { items: groupItems, total }]) => (
                  <div key={group}>
                    <div style={{
                      padding: "8px 20px", background: "#1E293B", display: "flex", justifyContent: "space-between",
                      borderBottom: "1px solid #334155", position: "sticky", top: 0, zIndex: 1,
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: FORECAST_COLORS[group] || "#F1F5F9" }}>{group}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#F1F5F9" }}>{fmt(total)} · {groupItems.length} deals</span>
                    </div>
                    {groupItems.map((d, i) => renderDealRow(d, i))}
                  </div>
                ))
              ) : (
                items.map((d, i) => renderDealRow(d, i))
              )}
            </>
          )}

          {/* Meetings */}
          {type === "meetings" && items.map((m, i) => renderMeetingRow(m, i))}

          {/* Leads */}
          {type === "leads" && items.map((l, i) => renderLeadRow(l, i))}
        </div>

        {/* Analytics Summary Panel */}
        {(type === "pipeline" || type === "won" || type === "pastdue") && items.length > 0 && (
          <AnalyticsSummary items={items} type={type} />
        )}

        {/* Footer Summary */}
        {(type === "pipeline" || type === "won" || type === "pastdue") && items.length > 0 && (
          <div style={{
            padding: "10px 20px", borderTop: "1px solid #1E293B", display: "flex", justifyContent: "space-between",
            flexShrink: 0, background: "#0F172A",
          }}>
            <div style={{ display: "flex", gap: 16 }}>
              {Object.entries(
                items.reduce((acc, d) => {
                  const cat = d.forecastCategory || "Other";
                  acc[cat] = (acc[cat] || 0) + (d.amount || 0);
                  return acc;
                }, {})
              ).map(([cat, total]) => (
                <span key={cat} style={{ fontSize: 11 }}>
                  <span style={{ color: FORECAST_COLORS[cat] || "#64748B", fontWeight: 600 }}>{cat}:</span>
                  <span style={{ color: "#E2E8F0", marginLeft: 4 }}>{fmt(total)}</span>
                </span>
              ))}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#F1F5F9" }}>Total: {fmt(totalAmount)}</div>
          </div>
        )}

        {/* Leads Summary */}
        {type === "leads" && items.length > 0 && (
          <div style={{
            padding: "10px 20px", borderTop: "1px solid #1E293B", flexShrink: 0, background: "#0F172A",
          }}>
            <LeadsSummary items={items} />
          </div>
        )}

        {/* Meetings Summary */}
        {type === "meetings" && items.length > 0 && (
          <div style={{
            padding: "10px 20px", borderTop: "1px solid #1E293B", flexShrink: 0, background: "#0F172A",
            display: "flex", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 11, color: "#64748B" }}>{items.length} meetings</span>
            <span style={{ fontSize: 11, color: "#3B82F6" }}>
              {items.filter(m => m.attendees?.length).reduce((s, m) => s + m.attendees.length, 0)} total attendees
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Analytics Summary for deal lists ────────────────────────────
function AnalyticsSummary({ items, type }) {
  const [showAnalytics, setShowAnalytics] = useState(false);

  const total = items.reduce((s, d) => s + (d.amount || 0), 0);
  const avg = items.length > 0 ? total / items.length : 0;
  const pastDueCount = items.filter(d => isPastDue(d.closeDate)).length;
  const avgProbability = items.length > 0 ? items.reduce((s, d) => s + (d.probability || 0), 0) / items.length : 0;
  const weighted = items.reduce((s, d) => s + (d.amount || 0) * (d.probability || 0) / 100, 0);

  // Stage distribution
  const stageDistribution = {};
  items.forEach(d => {
    const stage = d.stage || "Unknown";
    if (!stageDistribution[stage]) stageDistribution[stage] = { count: 0, amount: 0 };
    stageDistribution[stage].count++;
    stageDistribution[stage].amount += d.amount || 0;
  });

  // Source distribution
  const sourceDistribution = {};
  items.forEach(d => {
    const source = d.source || "Unknown";
    if (!sourceDistribution[source]) sourceDistribution[source] = { count: 0, amount: 0 };
    sourceDistribution[source].count++;
    sourceDistribution[source].amount += d.amount || 0;
  });

  // Close date distribution (by month)
  const monthDistribution = {};
  items.forEach(d => {
    if (!d.closeDate || d.closeDate === "—") return;
    try {
      const m = new Date(d.closeDate).toLocaleString("en-US", { month: "short", year: "2-digit" });
      if (!monthDistribution[m]) monthDistribution[m] = { count: 0, amount: 0 };
      monthDistribution[m].count++;
      monthDistribution[m].amount += d.amount || 0;
    } catch {}
  });

  return (
    <div style={{ borderTop: "1px solid #1E293B", flexShrink: 0 }}>
      <div
        onClick={() => setShowAnalytics(!showAnalytics)}
        style={{
          padding: "8px 20px", cursor: "pointer", display: "flex",
          justifyContent: "space-between", alignItems: "center",
          background: "#0F172A",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8" }}>Analytics</span>
        <span style={{ fontSize: 10, color: "#64748B", transition: "transform .2s", transform: showAnalytics ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
      </div>

      {showAnalytics && (
        <div style={{ padding: "0 20px 12px", background: "#0F172A" }}>
          {/* Key stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "Avg Deal", value: fmt(avg), color: "#F1F5F9" },
              { label: "Weighted", value: fmt(weighted), color: "#10B981" },
              { label: "Avg Prob", value: `${avgProbability.toFixed(0)}%`, color: avgProbability >= 50 ? "#10B981" : "#F59E0B" },
              { label: "Past Due", value: pastDueCount, color: pastDueCount > 0 ? "#EF4444" : "#10B981" },
              { label: "Total Deals", value: items.length, color: "#3B82F6" },
            ].map((s, i) => (
              <div key={i} style={{ background: "#1E293B", borderRadius: 4, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 8, color: "#64748B", textTransform: "uppercase", marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Stage distribution */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4, textTransform: "uppercase" }}>By Stage</div>
            {Object.entries(stageDistribution).sort((a, b) => b[1].amount - a[1].amount).slice(0, 5).map(([stage, data]) => (
              <div key={stage} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: "#CBD5E1", width: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stage}</span>
                <div style={{ flex: 1, height: 4, background: "#1E293B", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${(data.amount / total) * 100}%`, height: "100%", background: "#3B82F6", borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 10, color: "#94A3B8", width: 60, textAlign: "right" }}>{fmt(data.amount)}</span>
                <span style={{ fontSize: 9, color: "#64748B", width: 20, textAlign: "right" }}>{data.count}</span>
              </div>
            ))}
          </div>

          {/* Source distribution */}
          {Object.keys(sourceDistribution).length > 1 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4, textTransform: "uppercase" }}>By Source</div>
              {Object.entries(sourceDistribution).sort((a, b) => b[1].amount - a[1].amount).slice(0, 4).map(([source, data]) => (
                <div key={source} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: "#CBD5E1", width: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{source}</span>
                  <div style={{ flex: 1, height: 4, background: "#1E293B", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${(data.amount / total) * 100}%`, height: "100%", background: "#8B5CF6", borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 10, color: "#94A3B8", width: 60, textAlign: "right" }}>{fmt(data.amount)}</span>
                  <span style={{ fontSize: 9, color: "#64748B", width: 20, textAlign: "right" }}>{data.count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Monthly close distribution */}
          {Object.keys(monthDistribution).length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4, textTransform: "uppercase" }}>By Close Month</div>
              <div style={{ display: "flex", gap: 4 }}>
                {Object.entries(monthDistribution).slice(0, 6).map(([month, data]) => (
                  <div key={month} style={{
                    flex: "1 1 0", background: "#1E293B", borderRadius: 4, padding: "4px 6px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#F1F5F9" }}>{fmt(data.amount)}</div>
                    <div style={{ fontSize: 8, color: "#64748B", marginTop: 1 }}>{month}</div>
                    <div style={{ fontSize: 8, color: "#64748B" }}>{data.count} deals</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Leads Summary ───────────────────────────────────────────────
function LeadsSummary({ items }) {
  // Status distribution
  const statusDist = {};
  items.forEach(l => {
    const status = l.status || "Unknown";
    statusDist[status] = (statusDist[status] || 0) + 1;
  });

  // Source distribution
  const sourceDist = {};
  items.forEach(l => {
    const source = l.source || "Unknown";
    sourceDist[source] = (sourceDist[source] || 0) + 1;
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#64748B" }}>{items.length} leads</span>
        <span style={{ color: "#334155" }}>|</span>
        {Object.entries(statusDist).map(([status, count]) => (
          <span key={status} style={{ fontSize: 10 }}>
            <span style={{ color: STATUS_COLORS[status] || "#64748B", fontWeight: 600 }}>{status}:</span>
            <span style={{ color: "#E2E8F0", marginLeft: 3 }}>{count}</span>
          </span>
        ))}
        <span style={{ flex: 1 }} />
        {Object.entries(sourceDist).slice(0, 3).map(([source, count]) => (
          <span key={source} style={{ fontSize: 10, color: "#64748B" }}>
            {source}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Pipeline Velocity Analysis ──────────────────────────────────
export function PipelineVelocity({ deals }) {
  const [showVelocity, setShowVelocity] = useState(false);
  const [hoveredDeal, setHoveredDeal] = useState(null);

  if (!deals || deals.length === 0) return null;

  // Calculate velocity metrics
  const withDays = deals.filter(d => d.daysInStage > 0 || d.createdDate);
  const avgDaysInPipeline = withDays.length > 0
    ? (withDays.reduce((s, d) => s + (d.daysInStage || 0), 0) / withDays.length).toFixed(0)
    : "—";

  // Pipeline velocity = (# deals * avg deal size * win rate) / avg sales cycle
  const totalPipeline = deals.reduce((s, d) => s + (d.amount || 0), 0);
  const avgDealSize = deals.length > 0 ? totalPipeline / deals.length : 0;
  const avgProbability = deals.length > 0 ? deals.reduce((s, d) => s + (d.probability || 0), 0) / deals.length : 0;
  const avgCycle = parseInt(avgDaysInPipeline) || 30;
  const velocity = avgCycle > 0 ? (deals.length * avgDealSize * (avgProbability / 100)) / avgCycle : 0;

  // Speed categories
  const fast = deals.filter(d => (d.daysInStage || 0) <= 30).length;
  const moderate = deals.filter(d => (d.daysInStage || 0) > 30 && (d.daysInStage || 0) <= 60).length;
  const slow = deals.filter(d => (d.daysInStage || 0) > 60).length;

  // Stage progression analysis
  const stageOrder = ["Prospecting", "Qualification", "Needs Analysis", "Value Proposition", "Proposal/Price Quote", "Negotiation/Review"];
  const stageIndex = (stage) => {
    const idx = stageOrder.findIndex(s => stage?.includes(s));
    return idx >= 0 ? idx : 0;
  };

  // Deals sorted by velocity (days per stage)
  const byVelocity = [...deals].sort((a, b) => (a.daysInStage || 0) - (b.daysInStage || 0));

  return (
    <div style={{ marginTop: 12, padding: "0 20px 12px", background: "#0F172A" }}>
      <div
        onClick={() => setShowVelocity(!showVelocity)}
        style={{
          cursor: "pointer", display: "flex", justifyContent: "space-between",
          alignItems: "center", padding: "8px 0",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8" }}>Pipeline Velocity</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>{fmt(Math.round(velocity))}/day</span>
          <span style={{ fontSize: 10, color: "#64748B", transition: "transform .2s", transform: showVelocity ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
        </div>
      </div>

      {showVelocity && (
        <div>
          {/* Velocity metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "Velocity", value: `${fmt(Math.round(velocity))}/d`, color: "#10B981" },
              { label: "Avg Cycle", value: `${avgDaysInPipeline}d`, color: parseInt(avgDaysInPipeline) <= 45 ? "#10B981" : "#F59E0B" },
              { label: "Avg Deal", value: fmt(avgDealSize), color: "#3B82F6" },
              { label: "Avg Prob", value: `${avgProbability.toFixed(0)}%`, color: avgProbability >= 50 ? "#10B981" : "#F59E0B" },
            ].map((m, i) => (
              <div key={i} style={{ background: "#1E293B", borderRadius: 4, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: 8, color: "#64748B", textTransform: "uppercase" }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Speed distribution */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4, textTransform: "uppercase" }}>Deal Speed Distribution</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { label: "Fast (<30d)", count: fast, color: "#10B981" },
                { label: "Moderate (30-60d)", count: moderate, color: "#F59E0B" },
                { label: "Slow (60d+)", count: slow, color: "#EF4444" },
              ].map((s, i) => (
                <div key={i} style={{
                  flex: 1, background: s.color + "10", borderRadius: 4, padding: "6px 8px",
                  textAlign: "center", border: `1px solid ${s.color}20`,
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.count}</div>
                  <div style={{ fontSize: 9, color: "#64748B" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Fastest and slowest deals */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: "#10B981", marginBottom: 4, fontWeight: 600 }}>Fastest Moving</div>
              {byVelocity.slice(0, 3).map((d, i) => (
                <div
                  key={i}
                  onMouseEnter={() => setHoveredDeal(`fast-${i}`)}
                  onMouseLeave={() => setHoveredDeal(null)}
                  style={{
                    display: "flex", justifyContent: "space-between", padding: "3px 6px",
                    borderRadius: 3, fontSize: 10,
                    background: hoveredDeal === `fast-${i}` ? "#1E293B" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ color: "#CBD5E1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
                    {strip(d.name)}
                  </span>
                  <span style={{ color: "#10B981", fontWeight: 600 }}>{d.daysInStage || 0}d</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#EF4444", marginBottom: 4, fontWeight: 600 }}>Slowest Moving</div>
              {byVelocity.slice(-3).reverse().map((d, i) => (
                <div
                  key={i}
                  onMouseEnter={() => setHoveredDeal(`slow-${i}`)}
                  onMouseLeave={() => setHoveredDeal(null)}
                  style={{
                    display: "flex", justifyContent: "space-between", padding: "3px 6px",
                    borderRadius: 3, fontSize: 10,
                    background: hoveredDeal === `slow-${i}` ? "#1E293B" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ color: "#CBD5E1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
                    {strip(d.name)}
                  </span>
                  <span style={{ color: "#EF4444", fontWeight: 600 }}>{d.daysInStage || 0}d</span>
                </div>
              ))}
            </div>
          </div>

          {/* Velocity formula explanation */}
          <div style={{
            marginTop: 8, padding: "6px 8px", background: "#1E293B", borderRadius: 4,
            fontSize: 9, color: "#64748B", textAlign: "center",
          }}>
            Velocity = (Deals x Avg Size x Win Rate) / Avg Cycle = ({deals.length} x {fmt(avgDealSize)} x {avgProbability.toFixed(0)}%) / {avgDaysInPipeline}d
          </div>
        </div>
      )}
    </div>
  );
}

// ── Deal Amount Distribution Chart ──────────────────────────────
export function DealAmountDistribution({ deals }) {
  if (!deals || deals.length === 0) return null;

  const brackets = [
    { label: "<$10K", min: 0, max: 10000, color: "#64748B" },
    { label: "$10-25K", min: 10000, max: 25000, color: "#3B82F6" },
    { label: "$25-50K", min: 25000, max: 50000, color: "#8B5CF6" },
    { label: "$50-100K", min: 50000, max: 100000, color: "#F59E0B" },
    { label: "$100K+", min: 100000, max: Infinity, color: "#10B981" },
  ];

  const distribution = brackets.map(b => ({
    ...b,
    count: deals.filter(d => (d.amount || 0) >= b.min && (d.amount || 0) < b.max).length,
    total: deals.filter(d => (d.amount || 0) >= b.min && (d.amount || 0) < b.max).reduce((s, d) => s + (d.amount || 0), 0),
  }));

  const maxCount = Math.max(...distribution.map(d => d.count), 1);

  return (
    <div style={{ padding: "0 20px 8px", background: "#0F172A" }}>
      <div style={{ fontSize: 10, color: "#64748B", marginBottom: 6, textTransform: "uppercase" }}>Deal Size Distribution</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 50 }}>
        {distribution.map((b, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            {b.count > 0 && <span style={{ fontSize: 8, color: b.color, fontWeight: 600 }}>{b.count}</span>}
            <div style={{
              width: "100%", height: Math.max((b.count / maxCount) * 40, b.count > 0 ? 3 : 0),
              borderRadius: 2, background: b.color, transition: "height .3s",
            }} />
            <span style={{ fontSize: 8, color: "#64748B", whiteSpace: "nowrap" }}>{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const actionStyle = (color) => ({
  padding: "4px 10px", borderRadius: 4, border: "none", cursor: "pointer",
  fontSize: 11, fontWeight: 600, background: color + "20", color: color,
  transition: "all .15s",
});
