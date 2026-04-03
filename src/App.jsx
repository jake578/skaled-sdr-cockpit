import { useState, useEffect, useCallback } from "react";
import {
  REP, DAILY_ACTIONS, SEQUENCES, TOP_TOUCHPOINTS,
  OPPORTUNITIES, RECENT_ACTIVITIES, ACCOUNTS, LEADS,
  WEEKLY_ACTIVITY, PIPELINE_WEEKLY,
} from "./mockData";

// ── Helpers ────────────────────────────────────────────────────
const fmt = (n) => "$" + n.toLocaleString();
const pct = (n) => n.toFixed(1) + "%";
const LS_KEY = "skaled-sdr-cockpit";
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } };
const save = (d) => localStorage.setItem(LS_KEY, JSON.stringify(d));

// ── Toast ──────────────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, background: "#10B981", color: "#fff",
      padding: "12px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999,
      boxShadow: "0 4px 20px rgba(16,185,129,0.4)", animation: "fadeIn .2s",
    }}>{msg}</div>
  );
}

// ── Mini Charts ────────────────────────────────────────────────
function MiniBar({ data, maxH = 80, barW = 28 }) {
  const max = Math.max(...data.map(d => d.emails + d.calls + d.linkedin), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: maxH }}>
      {data.map((d, i) => {
        const total = d.emails + d.calls + d.linkedin;
        const h = (total / max) * maxH;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ width: barW, height: Math.max(h, 2), borderRadius: 4, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ flex: d.emails, background: "#3B82F6" }} />
              <div style={{ flex: d.calls, background: "#8B5CF6" }} />
              <div style={{ flex: d.linkedin, background: "#06B6D4" }} />
            </div>
            <span style={{ fontSize: 10, color: "#64748B" }}>{d.day}</span>
          </div>
        );
      })}
    </div>
  );
}

function MiniLine({ data, w = 200, h = 60 }) {
  const max = Math.max(...data.map(d => d.amount), 1);
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - (d.amount / max) * h}`).join(" ");
  return (
    <svg width={w} height={h + 10} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke="#10B981" strokeWidth={2} />
      {data.map((d, i) => (
        <circle key={i} cx={(i / (data.length - 1)) * w} cy={h - (d.amount / max) * h} r={3} fill="#10B981" />
      ))}
    </svg>
  );
}

// ── Priority Colors ────────────────────────────────────────────
const PRIORITY_COLORS = { critical: "#EF4444", high: "#F59E0B", medium: "#3B82F6", low: "#64748B" };
const ACTION_TYPE_ICONS = {
  "follow-up": "↩", call: "📞", sequence: "📋", linkedin: "💬", admin: "📁",
};
const CHANNEL_COLORS = { email: "#3B82F6", phone: "#8B5CF6", outreach: "#F59E0B", linkedin: "#06B6D4", salesforce: "#00A1E0" };
const STATUS_COLORS = { "Active Opp": "#10B981", Stalled: "#EF4444", Prospecting: "#F59E0B", New: "#3B82F6", Working: "#F59E0B" };
const ACTIVITY_ICONS = { email: "✉", call: "📞", linkedin: "💬", meeting: "📅" };

// ── Main App ───────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("actions"); // actions | outreach | pipeline
  const [actions, setActions] = useState(() => {
    const saved = load();
    if (saved.actions) return DAILY_ACTIONS.map(a => ({ ...a, status: saved.actions[a.id] || a.status }));
    return DAILY_ACTIONS;
  });
  const [expandedAction, setExpandedAction] = useState(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [pipelineTab, setPipelineTab] = useState("opps"); // opps | activities | accounts | leads
  const [copiedId, setCopiedId] = useState(null);

  // Persist action statuses
  useEffect(() => {
    const statuses = {};
    actions.forEach(a => { statuses[a.id] = a.status; });
    save({ actions: statuses });
  }, [actions]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "1") setView("actions");
      if (e.key === "2") setView("outreach");
      if (e.key === "3") setView("pipeline");
      if (e.key === "/" && !e.metaKey) { e.preventDefault(); document.getElementById("search-input")?.focus(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const markAction = useCallback((id, status) => {
    setActions(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    setToast(status === "done" ? "Marked as done" : status === "skipped" ? "Skipped" : "Reopened");
  }, []);

  const copyText = useCallback((text, label) => {
    navigator.clipboard.writeText(text);
    setToast(`Copied ${label}`);
  }, []);

  const emailAction = useCallback((contact, subject, body) => {
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    setToast("Opened email client");
  }, []);

  // Filtered data based on search
  const q = search.toLowerCase();
  const filteredActions = actions.filter(a =>
    !q || a.title.toLowerCase().includes(q) || a.subtitle.toLowerCase().includes(q) ||
    (a.contact && a.contact.toLowerCase().includes(q)) || (a.company && a.company.toLowerCase().includes(q))
  );
  const filteredOpps = OPPORTUNITIES.filter(o =>
    !q || o.name.toLowerCase().includes(q) || o.account.toLowerCase().includes(q) || o.contact.toLowerCase().includes(q)
  );
  const filteredAccounts = ACCOUNTS.filter(a => !q || a.name.toLowerCase().includes(q) || a.industry.toLowerCase().includes(q));
  const filteredLeads = LEADS.filter(l => !q || l.name.toLowerCase().includes(q) || l.company.toLowerCase().includes(q));

  // Stats
  const doneCount = actions.filter(a => a.status === "done").length;
  const totalActions = actions.length;
  const pipelineTotal = OPPORTUNITIES.reduce((s, o) => s + o.amount, 0);

  // ── Styles ────────────────────────────────────────────────────
  const s = {
    shell: { minHeight: "100vh", background: "#0F1117" },
    header: {
      background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)",
      borderBottom: "1px solid #1E293B", padding: "16px 24px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    },
    logo: { display: "flex", alignItems: "center", gap: 12 },
    nav: { display: "flex", gap: 4 },
    navBtn: (active) => ({
      padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
      background: active ? "#10B981" : "transparent", color: active ? "#fff" : "#94A3B8",
      transition: "all .15s",
    }),
    searchWrap: {
      position: "relative", display: "flex", alignItems: "center",
    },
    searchInput: {
      background: "#1E293B", border: "1px solid #334155", borderRadius: 6, padding: "8px 12px 8px 32px",
      color: "#E2E8F0", fontSize: 13, width: 220,
    },
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
    content: { padding: "20px 24px", flex: 1 },
    sectionTitle: { fontSize: 16, fontWeight: 700, color: "#F1F5F9", marginBottom: 16 },
    card: {
      background: "#1E293B", borderRadius: 8, padding: "16px", marginBottom: 10,
      border: "1px solid #334155", cursor: "pointer", transition: "all .15s",
    },
    badge: (color) => ({
      display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: color + "20", color: color,
    }),
    btn: (bg) => ({
      padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
      fontSize: 12, fontWeight: 600, background: bg, color: "#fff", transition: "all .15s",
    }),
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: {
      textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #334155",
      color: "#64748B", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600,
    },
    td: { padding: "10px 12px", borderBottom: "1px solid #1E293B", color: "#CBD5E1" },
  };

  return (
    <div style={s.shell}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .card-hover:hover { border-color: #475569 !important; transform: translateY(-1px); }
        .metric-hover:hover { border-color: #10B981 !important; }
        .row-hover:hover { background: #1E293B; }
      `}</style>

      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}

      {/* ── Header ────────────────────────────────────────────── */}
      <div style={s.header}>
        <div style={s.logo}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #10B981, #059669)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#fff" }}>S</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9" }}>Skaled SDR Cockpit</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>{REP.name} — {REP.quarter} · {REP.weekLabel}</div>
          </div>
        </div>
        <div style={s.nav}>
          {[["actions", "Daily Actions"], ["outreach", "Outreach"], ["pipeline", "Pipeline"]].map(([key, label]) => (
            <button key={key} style={s.navBtn(view === key)} onClick={() => setView(key)}>{label}</button>
          ))}
        </div>
        <div style={s.searchWrap}>
          <span style={{ position: "absolute", left: 10, color: "#64748B", fontSize: 14, pointerEvents: "none" }}>⌕</span>
          <input
            id="search-input"
            style={s.searchInput}
            placeholder="Search... ( / )"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Metrics Bar ───────────────────────────────────────── */}
      <div style={s.metricsBar}>
        <div className="metric-hover" style={s.metricCard} onClick={() => setView("actions")}>
          <div style={s.metricVal}>{REP.activitiesToday}</div>
          <div style={s.metricLabel}>Activities Today</div>
          <div style={{ ...s.metricSub, color: REP.activitiesToday >= REP.activitiesGoalDaily ? "#10B981" : "#F59E0B" }}>
            Goal: {REP.activitiesGoalDaily}
          </div>
        </div>
        <div className="metric-hover" style={s.metricCard} onClick={() => setView("actions")}>
          <div style={s.metricVal}>{doneCount}/{totalActions}</div>
          <div style={s.metricLabel}>Actions Done</div>
          <div style={{ ...s.metricSub, color: doneCount === totalActions ? "#10B981" : "#F59E0B" }}>
            {totalActions - doneCount} remaining
          </div>
        </div>
        <div className="metric-hover" style={s.metricCard} onClick={() => setView("outreach")}>
          <div style={s.metricVal}>{pct(REP.emailReplyRate)}</div>
          <div style={s.metricLabel}>Reply Rate</div>
          <div style={{ ...s.metricSub, color: "#10B981" }}>
            +{(REP.emailReplyRate - REP.industryAvgReply).toFixed(1)}pp vs avg
          </div>
        </div>
        <div className="metric-hover" style={s.metricCard} onClick={() => setView("pipeline")}>
          <div style={s.metricVal}>{REP.meetingsBooked}</div>
          <div style={s.metricLabel}>Meetings Booked</div>
          <div style={{ ...s.metricSub, color: "#94A3B8" }}>
            Target: {REP.meetingsTarget}
          </div>
        </div>
        <div className="metric-hover" style={s.metricCard} onClick={() => setView("pipeline")}>
          <div style={s.metricVal}>{fmt(REP.pipelineGenerated)}</div>
          <div style={s.metricLabel}>Pipeline Created</div>
          <div style={s.metricSub}>
            <div style={{ background: "#334155", borderRadius: 4, height: 6, marginTop: 4 }}>
              <div style={{ background: "#10B981", height: 6, borderRadius: 4, width: `${Math.min((REP.pipelineGenerated / REP.quotaPipeline) * 100, 100)}%` }} />
            </div>
            <span style={{ color: "#64748B", fontSize: 10 }}>{fmt(REP.quotaPipeline)} target</span>
          </div>
        </div>
        <div className="metric-hover" style={s.metricCard} onClick={() => setView("pipeline")}>
          <div style={s.metricVal}>{fmt(pipelineTotal)}</div>
          <div style={s.metricLabel}>Active Pipeline</div>
          <div style={{ ...s.metricSub, color: "#94A3B8" }}>
            {OPPORTUNITIES.length} open opps
          </div>
        </div>
      </div>

      {/* ── Content Area ──────────────────────────────────────── */}
      <div style={s.content}>

        {/* ── DAILY ACTIONS VIEW ────────────────────────────── */}
        {view === "actions" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={s.sectionTitle}>Today's Action Plan — {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={s.btn("#334155")} onClick={() => setActions(DAILY_ACTIONS.map(a => ({ ...a, status: "pending" })))}>Reset All</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {["critical", "high", "medium", "low"].map(p => {
                const count = filteredActions.filter(a => a.priority === p && a.status === "pending").length;
                return (
                  <span key={p} style={{ ...s.badge(PRIORITY_COLORS[p]), fontSize: 11 }}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}: {count}
                  </span>
                );
              })}
            </div>

            {filteredActions.map(action => {
              const expanded = expandedAction === action.id;
              const done = action.status === "done";
              const skipped = action.status === "skipped";
              return (
                <div
                  key={action.id}
                  className="card-hover"
                  style={{
                    ...s.card,
                    borderLeft: `3px solid ${PRIORITY_COLORS[action.priority]}`,
                    opacity: done || skipped ? 0.5 : 1,
                  }}
                  onClick={() => setExpandedAction(expanded ? null : action.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 16 }}>{ACTION_TYPE_ICONS[action.type] || "▸"}</span>
                        <span style={{ fontSize: 11, color: CHANNEL_COLORS[action.channel] || "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>{action.channel}</span>
                        <span style={{ fontSize: 11, color: "#64748B" }}>{action.dueTime}</span>
                        {done && <span style={s.badge("#10B981")}>Done</span>}
                        {skipped && <span style={s.badge("#64748B")}>Skipped</span>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: done ? "#64748B" : "#F1F5F9", textDecoration: done ? "line-through" : "none" }}>
                        {action.title}
                      </div>
                      <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{action.subtitle}</div>
                    </div>
                    <span style={{ color: "#64748B", fontSize: 18, transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
                  </div>

                  {expanded && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #334155", animation: "fadeIn .2s" }}>
                      {action.contact && (
                        <div style={{ display: "flex", gap: 16, marginBottom: 10, fontSize: 12 }}>
                          <span><strong style={{ color: "#F1F5F9" }}>Contact:</strong> {action.contact}</span>
                          {action.company && <span><strong style={{ color: "#F1F5F9" }}>Company:</strong> {action.company}</span>}
                          {action.role && <span><strong style={{ color: "#F1F5F9" }}>Role:</strong> {action.role}</span>}
                        </div>
                      )}
                      <div style={{ background: "#0F172A", borderRadius: 6, padding: 12, fontSize: 13, color: "#CBD5E1", lineHeight: 1.5, marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Suggested Action</div>
                        {action.suggestedAction}
                      </div>
                      <div style={{ display: "flex", gap: 8 }} onClick={e => e.stopPropagation()}>
                        {action.status === "pending" && (
                          <>
                            <button style={s.btn("#10B981")} onClick={() => markAction(action.id, "done")}>Mark Done</button>
                            <button style={s.btn("#64748B")} onClick={() => markAction(action.id, "skipped")}>Skip</button>
                          </>
                        )}
                        {(done || skipped) && (
                          <button style={s.btn("#334155")} onClick={() => markAction(action.id, "pending")}>Reopen</button>
                        )}
                        <button style={s.btn("#1E293B")} onClick={() => copyText(action.suggestedAction, "suggested action")}>Copy Action</button>
                        {action.contact && (
                          <button style={s.btn("#1E293B")} onClick={() => emailAction(action.contact, `Re: ${action.title}`, action.suggestedAction)}>Email</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── OUTREACH VIEW ─────────────────────────────────── */}
        {view === "outreach" && (
          <div>
            {/* Activity Trend */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
              <div style={{ ...s.card, cursor: "default" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>This Week's Activity</div>
                <MiniBar data={WEEKLY_ACTIVITY} maxH={90} barW={36} />
                <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#3B82F6" }} /> Email</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#8B5CF6" }} /> Calls</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#06B6D4" }} /> LinkedIn</span>
                </div>
              </div>
              <div style={{ ...s.card, cursor: "default" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 12 }}>Pipeline Trajectory</div>
                <MiniLine data={PIPELINE_WEEKLY} w={280} h={80} />
                <div style={{ fontSize: 11, color: "#64748B", marginTop: 8 }}>
                  {PIPELINE_WEEKLY.map(p => p.week).join(" → ")}
                </div>
              </div>
            </div>

            {/* Sequences */}
            <div style={{ ...s.sectionTitle, marginBottom: 12 }}>Outreach Sequences</div>
            <div style={{ overflowX: "auto" }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Sequence</th>
                    <th style={s.th}>Status</th>
                    <th style={s.th}>Active</th>
                    <th style={s.th}>Total</th>
                    <th style={s.th}>Open Rate</th>
                    <th style={s.th}>Reply Rate</th>
                    <th style={s.th}>Meetings</th>
                    <th style={s.th}>Avg Days to Reply</th>
                  </tr>
                </thead>
                <tbody>
                  {SEQUENCES.map((seq, i) => (
                    <tr key={i} className="row-hover" style={{ cursor: "pointer" }}>
                      <td style={{ ...s.td, color: "#F1F5F9", fontWeight: 600 }}>{seq.name}</td>
                      <td style={s.td}>
                        <span style={s.badge(seq.status === "active" ? "#10B981" : "#F59E0B")}>{seq.status}</span>
                      </td>
                      <td style={s.td}>{seq.activeProspects}</td>
                      <td style={s.td}>{seq.totalEnrolled}</td>
                      <td style={s.td}>{pct(seq.openRate)}</td>
                      <td style={{ ...s.td, color: seq.replyRate >= 15 ? "#10B981" : seq.replyRate >= 10 ? "#F59E0B" : "#EF4444", fontWeight: 600 }}>
                        {pct(seq.replyRate)}
                      </td>
                      <td style={{ ...s.td, fontWeight: 600, color: "#F1F5F9" }}>{seq.meetingsBooked}</td>
                      <td style={s.td}>{seq.avgDaysToReply}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Top Touchpoints */}
            <div style={{ ...s.sectionTitle, marginTop: 24, marginBottom: 12 }}>Top Performing Touchpoints</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {TOP_TOUCHPOINTS.map((tp, i) => (
                <div key={i} className="card-hover" style={{ ...s.card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={s.badge(tp.type === "email" ? "#3B82F6" : tp.type === "call" ? "#8B5CF6" : "#06B6D4")}>{tp.type}</span>
                      <span style={{ fontSize: 11, color: "#64748B" }}>#{i + 1}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#F1F5F9" }}>{tp.name}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#10B981" }}>
                      {tp.replyRate ? pct(tp.replyRate) : pct(tp.connectRate)}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748B" }}>
                      {tp.meetings} meetings · {tp.replies || tp.conversations} {tp.replies ? "replies" : "convos"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PIPELINE VIEW ─────────────────────────────────── */}
        {view === "pipeline" && (
          <div>
            {/* Sub-tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
              {[["opps", "Opportunities"], ["activities", "Activities"], ["accounts", "Accounts"], ["leads", "Leads"]].map(([key, label]) => (
                <button
                  key={key}
                  style={{
                    padding: "6px 14px", borderRadius: 6, border: "1px solid #334155", cursor: "pointer",
                    fontSize: 12, fontWeight: 600,
                    background: pipelineTab === key ? "#10B981" : "transparent",
                    color: pipelineTab === key ? "#fff" : "#94A3B8",
                  }}
                  onClick={() => setPipelineTab(key)}
                >{label}</button>
              ))}
            </div>

            {/* Opportunities */}
            {pipelineTab === "opps" && (
              <div>
                <div style={s.sectionTitle}>Open Opportunities — {fmt(pipelineTotal)} total pipeline</div>
                {filteredOpps.map(opp => (
                  <div key={opp.id} className="card-hover" style={s.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{opp.name}</div>
                        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                          {opp.contact} · {opp.source}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#F1F5F9" }}>{fmt(opp.amount)}</div>
                        <span style={s.badge(opp.stage === "Stalled" ? "#EF4444" : opp.stage === "Proposal" ? "#10B981" : "#F59E0B")}>
                          {opp.stage}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, color: "#64748B" }}>
                      <span>Close: {opp.closeDate}</span>
                      <span>Prob: {opp.probability}%</span>
                      <span>{opp.daysInStage}d in stage</span>
                      <span>Last activity: {opp.lastActivity}</span>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12 }}>
                      <strong style={{ color: "#F1F5F9" }}>Next step:</strong>{" "}
                      <span style={{ color: "#CBD5E1" }}>{opp.nextStep}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <button style={s.btn("#1E293B")} onClick={() => copyText(`${opp.name}\nAmount: ${fmt(opp.amount)}\nStage: ${opp.stage}\nNext step: ${opp.nextStep}`, "opp details")}>Copy</button>
                      <button style={s.btn("#1E293B")} onClick={() => emailAction(opp.contact, `Re: ${opp.name}`, `Next step: ${opp.nextStep}`)}>Email</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Activities */}
            {pipelineTab === "activities" && (
              <div>
                <div style={s.sectionTitle}>Recent Salesforce Activities</div>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Date</th>
                      <th style={s.th}>Type</th>
                      <th style={s.th}>Subject</th>
                      <th style={s.th}>Contact</th>
                      <th style={s.th}>Company</th>
                      <th style={s.th}>Dir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RECENT_ACTIVITIES.map((act, i) => (
                      <tr key={i} className="row-hover">
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}>{act.date}</td>
                        <td style={s.td}>{ACTIVITY_ICONS[act.type] || "▸"} {act.type}</td>
                        <td style={{ ...s.td, color: "#F1F5F9" }}>{act.subject}</td>
                        <td style={s.td}>{act.contact}</td>
                        <td style={s.td}>{act.company}</td>
                        <td style={s.td}>
                          <span style={s.badge(act.direction === "inbound" ? "#10B981" : "#3B82F6")}>{act.direction}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Accounts */}
            {pipelineTab === "accounts" && (
              <div>
                <div style={s.sectionTitle}>Key Accounts</div>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Account</th>
                      <th style={s.th}>Industry</th>
                      <th style={s.th}>Employees</th>
                      <th style={s.th}>Status</th>
                      <th style={s.th}>Contacts</th>
                      <th style={s.th}>Last Touch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccounts.map((acc, i) => (
                      <tr key={i} className="row-hover">
                        <td style={{ ...s.td, color: "#F1F5F9", fontWeight: 600 }}>{acc.name}</td>
                        <td style={s.td}>{acc.industry}</td>
                        <td style={s.td}>{acc.employees}</td>
                        <td style={s.td}>
                          <span style={s.badge(STATUS_COLORS[acc.status] || "#64748B")}>{acc.status}</span>
                        </td>
                        <td style={s.td}>{acc.contacts}</td>
                        <td style={s.td}>{acc.lastTouch}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Leads */}
            {pipelineTab === "leads" && (
              <div>
                <div style={s.sectionTitle}>Active Leads</div>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Name</th>
                      <th style={s.th}>Company</th>
                      <th style={s.th}>Title</th>
                      <th style={s.th}>Status</th>
                      <th style={s.th}>Source</th>
                      <th style={s.th}>Score</th>
                      <th style={s.th}>Last Touch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead, i) => (
                      <tr key={i} className="row-hover">
                        <td style={{ ...s.td, color: "#F1F5F9", fontWeight: 600 }}>{lead.name}</td>
                        <td style={s.td}>{lead.company}</td>
                        <td style={s.td}>{lead.title}</td>
                        <td style={s.td}>
                          <span style={s.badge(STATUS_COLORS[lead.status] || "#64748B")}>{lead.status}</span>
                        </td>
                        <td style={s.td}>{lead.source}</td>
                        <td style={{ ...s.td, fontWeight: 600, color: lead.score >= 70 ? "#10B981" : lead.score >= 50 ? "#F59E0B" : "#64748B" }}>
                          {lead.score}
                        </td>
                        <td style={s.td}>{lead.lastTouch}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ────────────────────────────────────────────── */}
      <div style={{
        padding: "12px 24px", borderTop: "1px solid #1E293B", textAlign: "center",
        fontSize: 11, color: "#475569",
      }}>
        Keyboard: <kbd style={{ background: "#1E293B", padding: "2px 6px", borderRadius: 3, fontSize: 11 }}>1</kbd> Actions{" "}
        <kbd style={{ background: "#1E293B", padding: "2px 6px", borderRadius: 3, fontSize: 11 }}>2</kbd> Outreach{" "}
        <kbd style={{ background: "#1E293B", padding: "2px 6px", borderRadius: 3, fontSize: 11 }}>3</kbd> Pipeline{" "}
        <kbd style={{ background: "#1E293B", padding: "2px 6px", borderRadius: 3, fontSize: 11 }}>/</kbd> Search
      </div>
    </div>
  );
}
