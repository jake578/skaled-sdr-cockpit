import { useState, useEffect, useCallback } from "react";
import {
  REP, DAILY_ACTIONS, SEQUENCES, TOP_TOUCHPOINTS,
  OPPORTUNITIES, RECENT_ACTIVITIES, ACCOUNTS, LEADS,
  WEEKLY_ACTIVITY, PIPELINE_WEEKLY,
} from "./mockData";
import { useSalesforce } from "./useSalesforce";
import { useActions } from "./useActions";

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
  const sfdc = useSalesforce();
  const [toast, setToast] = useState(null);
  const act = useActions(setToast);
  const [view, setView] = useState("actions"); // actions | outreach | pipeline
  const [actions, setActions] = useState(() => {
    const saved = load();
    if (saved.actions) return DAILY_ACTIONS.map(a => ({ ...a, status: saved.actions[a.id] || a.status }));
    return DAILY_ACTIONS;
  });
  const [expandedAction, setExpandedAction] = useState(null);
  const [search, setSearch] = useState("");
  const [pipelineTab, setPipelineTab] = useState("opps");
  const [copiedId, setCopiedId] = useState(null);
  const [activityFilter, setActivityFilter] = useState("all");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [actionQueue, setActionQueue] = useState("external");
  const [liveActions, setLiveActions] = useState(null);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [actionStatuses, setActionStatuses] = useState(() => load().actionStatuses || {});
  const [selectedOpps, setSelectedOpps] = useState(new Set());
  const [bulkAction, setBulkAction] = useState(null);
  const [composing, setComposing] = useState(null); // action id being composed
  const [composeData, setComposeData] = useState({ to: "", subject: "", body: "" });
  const [editingOpp, setEditingOpp] = useState(null);
  const [oppEdits, setOppEdits] = useState({});

  // ── Live Data ────────────────────────────────────────────────
  const [liveOpps, setLiveOpps] = useState(null);
  const [liveActivities, setLiveActivities] = useState(null);
  const [liveAccounts, setLiveAccounts] = useState(null);
  const [liveLeads, setLiveLeads] = useState(null);
  const [sfdcLoading, setSfdcLoading] = useState(false);
  const [gmailActivities, setGmailActivities] = useState([]);
  const [calendarActivities, setCalendarActivities] = useState([]);

  useEffect(() => {
    if (!sfdc.connected) return;
    setSfdcLoading(true);
    Promise.all([
      sfdc.query(`SELECT Id, Name, Account.Name, Amount, StageName, Probability, CloseDate, LastActivityDate, CreatedDate, LeadSource, Group_Forecast_Category__c FROM Opportunity WHERE IsClosed = false ORDER BY CreatedDate DESC LIMIT 50`),
      sfdc.query(`SELECT Id, Subject, Type, StartDateTime, CreatedDate, Who.Name, What.Name FROM Event ORDER BY StartDateTime DESC LIMIT 200`),
      sfdc.query(`SELECT Id, Name, Industry, NumberOfEmployees, Type FROM Account ORDER BY CreatedDate DESC LIMIT 50`),
      sfdc.query(`SELECT Id, Name, Company, Title, Status, LeadSource, CreatedDate FROM Lead WHERE IsConverted = false ORDER BY CreatedDate DESC LIMIT 50`),
    ]).then(([opps, events, accounts, leads]) => {
      if (opps && opps.length) setLiveOpps(opps.map(o => ({
        id: o.Id, name: o.Name, account: o.Account?.Name || "—",
        contact: "—", amount: o.Amount || 0, stage: o.StageName || "—",
        forecastCategory: o.Group_Forecast_Category__c || "—",
        probability: o.Probability || 0, closeDate: o.CloseDate || "—",
        lastActivity: o.LastActivityDate || "—", nextStep: "—",
        daysInStage: o.CreatedDate ? Math.floor((Date.now() - new Date(o.CreatedDate).getTime()) / 86400000) : 0,
        source: o.LeadSource || "—",
      })));

      // Only use Events (Chorus calls + Calendly meetings) — Task dates are unreliable (SFDC sync date, not actual activity date)
      const allActivities = [];

      if (events && events.length) events.forEach(e => {
        const subj = e.Subject || "";
        const dateStr = e.StartDateTime ? e.StartDateTime.split("T")[0] : e.CreatedDate ? e.CreatedDate.split("T")[0] : "—";
        const timeStr = e.StartDateTime ? new Date(e.StartDateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";

        let type = "meeting";
        let cleanSubject = subj;
        let source = "SFDC";

        if (subj.startsWith("Chorus - ")) {
          type = "call";
          cleanSubject = subj.replace("Chorus - ", "");
          source = "Chorus";
        } else if (subj.includes("Book a Meeting") || subj.includes("Calendly")) {
          type = "meeting";
          // Extract name from "Name: Book a Meeting..." pattern
          const namePart = subj.split(":")[0];
          cleanSubject = namePart ? `Meeting booked — ${namePart}` : subj;
          source = "Calendly";
        }

        allActivities.push({
          date: dateStr, time: timeStr, type, direction: "outbound",
          subject: cleanSubject, contact: e.Who?.Name || "—",
          company: e.What?.Name || "—", source,
          sortDate: e.StartDateTime || e.CreatedDate || "",
        });
      });

      // Filter out internal Skaled activities and records with null key data
      const internalKeywords = ["skaled", "revoptics", "l10", "1:1", "all-hands", "staffing sync", "leadership meeting", "p&l", "invoices and cash flow", "everhour", "marketing l10"];
      const cleanActivities = allActivities.filter(a => {
        if (a.company === "—" && a.contact === "—") return false;
        const text = `${a.subject} ${a.company}`.toLowerCase();
        return !internalKeywords.some(kw => text.includes(kw));
      });
      cleanActivities.sort((a, b) => (b.sortDate || "").localeCompare(a.sortDate || ""));
      if (cleanActivities.length) setLiveActivities(cleanActivities);

      if (accounts && accounts.length) setLiveAccounts(accounts.map(a => ({
        name: a.Name, industry: a.Industry || "—", employees: a.NumberOfEmployees || 0,
        status: a.Type || "—", contacts: 0,
        lastTouch: "—",
      })));
      if (leads && leads.length) setLiveLeads(leads.map(l => ({
        name: l.Name, company: l.Company || "—", title: l.Title || "—",
        status: l.Status || "—", source: l.LeadSource || "—",
        score: 0, lastTouch: l.CreatedDate ? l.CreatedDate.split("T")[0] : "—",
      })));
      setSfdcLoading(false);
    });
  }, [sfdc.connected]);

  // ── Fetch Gmail + Calendar activities (always, no SFDC dependency) ──
  useEffect(() => {
    fetch("/.netlify/functions/gmail-activities")
      .then(r => r.json())
      .then(data => { if (data.activities?.length) setGmailActivities(data.activities); })
      .catch(() => {});
    fetch("/.netlify/functions/calendar-activities")
      .then(r => r.json())
      .then(data => { if (data.activities?.length) setCalendarActivities(data.activities); })
      .catch(() => {});
  }, []);

  // ── Fetch live daily actions ──────────────────────────────────
  useEffect(() => {
    setActionsLoading(true);
    fetch("/.netlify/functions/daily-actions")
      .then(r => r.json())
      .then(data => {
        if (data.external || data.internal) setLiveActions(data);
        setActionsLoading(false);
      })
      .catch(() => setActionsLoading(false));
  }, []);

  // Persist action done/skipped statuses
  useEffect(() => {
    save({ ...load(), actionStatuses });
  }, [actionStatuses]);

  const markLiveAction = useCallback((id, status) => {
    setActionStatuses(prev => ({ ...prev, [id]: status }));
    setToast(status === "done" ? "Marked as done" : status === "skipped" ? "Skipped" : "Reopened");
  }, []);

  // Merge all activity sources: SFDC Events + Gmail + Calendar
  const mergedActivities = (() => {
    const all = [...(liveActivities || []), ...gmailActivities, ...calendarActivities];
    if (all.length === 0) return RECENT_ACTIVITIES;
    // Dedupe meetings that appear in both Calendar and Chorus (same date + similar subject)
    const seen = new Set();
    const deduped = all.filter(a => {
      const key = `${a.date}-${a.subject?.substring(0, 20)?.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    deduped.sort((a, b) => (b.sortDate || b.date || "").localeCompare(a.sortDate || a.date || ""));
    return deduped;
  })();

  // Use live data when available, otherwise mock
  const displayOpps = liveOpps || OPPORTUNITIES;
  const displayActivities = mergedActivities;
  const displayAccounts = liveAccounts || ACCOUNTS;
  const displayLeads = liveLeads || LEADS;

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
      if (e.key === "c" || e.key === "C") setChatOpen(prev => !prev);
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
  const filteredOpps = displayOpps.filter(o =>
    !q || o.name.toLowerCase().includes(q) || o.account.toLowerCase().includes(q) || o.contact.toLowerCase().includes(q)
  );
  const filteredAccounts = displayAccounts.filter(a => !q || a.name.toLowerCase().includes(q) || a.industry.toLowerCase().includes(q));
  const filteredLeads = displayLeads.filter(l => !q || l.name.toLowerCase().includes(q) || l.company.toLowerCase().includes(q));

  // Stats
  const doneCount = actions.filter(a => a.status === "done").length;
  const totalActions = actions.length;
  const pipelineTotal = displayOpps.reduce((s, o) => s + (o.amount || 0), 0);

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
            <div style={{ fontSize: 11, color: "#64748B" }}>Jake Dunlap — CEO · {REP.quarter}</div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {sfdc.connected ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />
              <span style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>SFDC{sfdc.user ? `: ${sfdc.user.name}` : ""}</span>
              {sfdcLoading && <span style={{ fontSize: 11, color: "#F59E0B" }}>Loading...</span>}
              <button style={{ ...s.btn("#334155"), fontSize: 11, padding: "4px 10px" }} onClick={sfdc.disconnect}>Disconnect</button>
            </div>
          ) : (
            <button
              style={{ ...s.btn("#00A1E0"), fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
              onClick={sfdc.connect}
            >
              <span style={{ fontSize: 14 }}>☁</span> Connect Salesforce
            </button>
          )}
          {liveOpps && <span style={{ fontSize: 10, color: "#64748B", background: "#1E293B", padding: "2px 6px", borderRadius: 3 }}>LIVE</span>}
        </div>
      </div>

      {/* ── SFDC Error Banner ─────────────────────────────────── */}
      {sfdc.error && (
        <div style={{ background: "#7F1D1D", padding: "8px 24px", fontSize: 12, color: "#FCA5A5" }}>
          Salesforce error: {sfdc.error}
        </div>
      )}

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
            {displayOpps.length} open opps
          </div>
        </div>
      </div>

      {/* ── Content Area ──────────────────────────────────────── */}
      <div style={s.content}>

        {/* ── DAILY ACTIONS VIEW ────────────────────────────── */}
        {view === "actions" && (() => {
          const currentActions = liveActions
            ? (actionQueue === "external" ? liveActions.external : liveActions.internal) || []
            : filteredActions;
          const isLive = !!liveActions;
          const externalCount = liveActions ? (liveActions.external || []).filter(a => actionStatuses[a.id] !== "done" && actionStatuses[a.id] !== "skipped").length : 0;
          const internalCount = liveActions ? (liveActions.internal || []).filter(a => actionStatuses[a.id] !== "done" && actionStatuses[a.id] !== "skipped").length : 0;

          return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={s.sectionTitle}>
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                {actionsLoading && <span style={{ fontSize: 12, color: "#F59E0B", marginLeft: 8 }}>Loading...</span>}
              </div>
              {isLive && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={s.btn("#334155")} onClick={() => setActionStatuses({})}>Reset All</button>
                </div>
              )}
            </div>

            {/* Queue toggle */}
            {isLive && (
              <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
                <button
                  style={{
                    padding: "8px 18px", borderRadius: 6, border: "1px solid #334155", cursor: "pointer",
                    fontSize: 13, fontWeight: 600,
                    background: actionQueue === "external" ? "#10B981" : "transparent",
                    color: actionQueue === "external" ? "#fff" : "#94A3B8",
                  }}
                  onClick={() => setActionQueue("external")}
                >
                  External — New Business {externalCount > 0 && <span style={{ background: "rgba(255,255,255,0.2)", padding: "1px 6px", borderRadius: 10, marginLeft: 6, fontSize: 11 }}>{externalCount}</span>}
                </button>
                <button
                  style={{
                    padding: "8px 18px", borderRadius: 6, border: "1px solid #334155", cursor: "pointer",
                    fontSize: 13, fontWeight: 600,
                    background: actionQueue === "internal" ? "#3B82F6" : "transparent",
                    color: actionQueue === "internal" ? "#fff" : "#94A3B8",
                  }}
                  onClick={() => setActionQueue("internal")}
                >
                  Internal — Clients & Team {internalCount > 0 && <span style={{ background: "rgba(255,255,255,0.2)", padding: "1px 6px", borderRadius: 10, marginLeft: 6, fontSize: 11 }}>{internalCount}</span>}
                </button>
              </div>
            )}

            {/* Priority badges */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {["critical", "high", "medium", "low"].map(p => {
                const count = currentActions.filter(a => a.priority === p && actionStatuses[a.id] !== "done" && actionStatuses[a.id] !== "skipped").length;
                if (count === 0) return null;
                return (
                  <span key={p} style={{ ...s.badge(PRIORITY_COLORS[p]), fontSize: 11 }}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}: {count}
                  </span>
                );
              })}
            </div>

            {currentActions.length === 0 && !actionsLoading && (
              <div style={{ ...s.card, cursor: "default", textAlign: "center", color: "#64748B", padding: 32 }}>
                {isLive ? "No actions in this queue" : "Loading actions..."}
              </div>
            )}

            {currentActions.map(action => {
              const expanded = expandedAction === action.id;
              const status = isLive ? (actionStatuses[action.id] || "pending") : action.status;
              const done = status === "done";
              const skipped = status === "skipped";
              return (
                <div
                  key={action.id}
                  className="card-hover"
                  style={{
                    ...s.card,
                    borderLeft: `3px solid ${PRIORITY_COLORS[action.priority] || "#64748B"}`,
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
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #334155", animation: "fadeIn .2s" }} onClick={e => e.stopPropagation()}>
                      <div style={{ background: "#0F172A", borderRadius: 6, padding: 12, fontSize: 13, color: "#CBD5E1", lineHeight: 1.5, marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Suggested Action</div>
                        {action.suggestedAction}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        {status === "pending" && (
                          <>
                            <button style={s.btn("#10B981")} onClick={() => isLive ? markLiveAction(action.id, "done") : markAction(action.id, "done")}>Mark Done</button>
                            <button style={s.btn("#64748B")} onClick={() => isLive ? markLiveAction(action.id, "skipped") : markAction(action.id, "skipped")}>Skip</button>
                          </>
                        )}
                        {(done || skipped) && (
                          <button style={s.btn("#334155")} onClick={() => isLive ? markLiveAction(action.id, "pending") : markAction(action.id, "pending")}>Reopen</button>
                        )}
                        <button style={s.btn("#3B82F6")} onClick={() => {
                          setComposing(composing === action.id ? null : action.id);
                          setComposeData({ to: action.contact || "", subject: `Re: ${action.subtitle || action.title}`, body: "" });
                        }}>
                          {composing === action.id ? "Close Email" : "Send Email"}
                        </button>
                        {action.id?.startsWith("opp-") && (
                          <button style={s.btn("#F59E0B")} onClick={() => setEditingOpp(editingOpp === action.id ? null : action.id)}>
                            {editingOpp === action.id ? "Close Edit" : "Update Opp"}
                          </button>
                        )}
                        <button style={s.btn("#1E293B")} onClick={() => copyText(action.suggestedAction, "suggested action")}>Copy</button>
                      </div>

                      {/* Inline email compose */}
                      {composing === action.id && (
                        <div style={{ background: "#0F172A", borderRadius: 8, padding: 14, marginBottom: 10, border: "1px solid #334155" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9", marginBottom: 8 }}>Compose Email</div>
                          <input
                            style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px 10px", color: "#E2E8F0", fontSize: 13, marginBottom: 6 }}
                            placeholder="To (email address)"
                            value={composeData.to}
                            onChange={e => setComposeData(d => ({ ...d, to: e.target.value }))}
                          />
                          <input
                            style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px 10px", color: "#E2E8F0", fontSize: 13, marginBottom: 6 }}
                            placeholder="Subject"
                            value={composeData.subject}
                            onChange={e => setComposeData(d => ({ ...d, subject: e.target.value }))}
                          />
                          <textarea
                            style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px 10px", color: "#E2E8F0", fontSize: 13, minHeight: 100, resize: "vertical", marginBottom: 8 }}
                            placeholder="Message body..."
                            value={composeData.body}
                            onChange={e => setComposeData(d => ({ ...d, body: e.target.value }))}
                          />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              style={{ ...s.btn("#10B981"), opacity: act.sending === "email" ? 0.6 : 1 }}
                              disabled={act.sending === "email"}
                              onClick={async () => {
                                const ok = await act.sendEmail(composeData);
                                if (ok) {
                                  setComposing(null);
                                  if (isLive) markLiveAction(action.id, "done");
                                }
                              }}
                            >
                              {act.sending === "email" ? "Sending..." : "Send"}
                            </button>
                            <button style={s.btn("#334155")} onClick={() => setComposing(null)}>Cancel</button>
                          </div>
                        </div>
                      )}

                      {/* Inline SFDC opp edit */}
                      {editingOpp === action.id && action.id?.startsWith("opp-") && (
                        <div style={{ background: "#0F172A", borderRadius: 8, padding: 14, marginBottom: 10, border: "1px solid #334155" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9", marginBottom: 8 }}>Update Opportunity</div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Stage</div>
                              <select
                                style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px 10px", color: "#E2E8F0", fontSize: 13 }}
                                value={oppEdits.StageName || ""}
                                onChange={e => setOppEdits(d => ({ ...d, StageName: e.target.value }))}
                              >
                                <option value="">No change</option>
                                <option>Prospecting</option>
                                <option>Qualification</option>
                                <option>Needs Analysis</option>
                                <option>Value Proposition</option>
                                <option>Proposal/Price Quote</option>
                                <option>Negotiation/Review</option>
                                <option>Closed Won</option>
                                <option>Closed Lost</option>
                              </select>
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Close Date</div>
                              <input
                                type="date"
                                style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px 10px", color: "#E2E8F0", fontSize: 13 }}
                                value={oppEdits.CloseDate || ""}
                                onChange={e => setOppEdits(d => ({ ...d, CloseDate: e.target.value }))}
                              />
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Amount</div>
                              <input
                                type="number"
                                style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px 10px", color: "#E2E8F0", fontSize: 13 }}
                                placeholder="Amount"
                                value={oppEdits.Amount || ""}
                                onChange={e => setOppEdits(d => ({ ...d, Amount: e.target.value ? Number(e.target.value) : "" }))}
                              />
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Next Step</div>
                              <input
                                style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px 10px", color: "#E2E8F0", fontSize: 13 }}
                                placeholder="Next step..."
                                value={oppEdits.NextStep || ""}
                                onChange={e => setOppEdits(d => ({ ...d, NextStep: e.target.value }))}
                              />
                            </div>
                            <div style={{ gridColumn: "1 / -1" }}>
                              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Group Forecast Category</div>
                              <select
                                style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px 10px", color: "#E2E8F0", fontSize: 13 }}
                                value={oppEdits.Group_Forecast_Category__c || ""}
                                onChange={e => setOppEdits(d => ({ ...d, Group_Forecast_Category__c: e.target.value }))}
                              >
                                <option value="">No change</option>
                                <option>Omitted</option>
                                <option>Pipeline</option>
                                <option>Best Case</option>
                                <option>Commit</option>
                                <option>Closed</option>
                              </select>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              style={{ ...s.btn("#F59E0B"), opacity: act.sending === "sfdc" ? 0.6 : 1 }}
                              disabled={act.sending === "sfdc"}
                              onClick={async () => {
                                const fields = {};
                                if (oppEdits.StageName) fields.StageName = oppEdits.StageName;
                                if (oppEdits.CloseDate) fields.CloseDate = oppEdits.CloseDate;
                                if (oppEdits.Amount) fields.Amount = oppEdits.Amount;
                                if (oppEdits.NextStep) fields.NextStep = oppEdits.NextStep;
                                if (oppEdits.Group_Forecast_Category__c) fields.Group_Forecast_Category__c = oppEdits.Group_Forecast_Category__c;
                                if (Object.keys(fields).length === 0) { setToast("No changes to save"); return; }
                                const sfdcId = action.id.replace("opp-", "");
                                const ok = await act.updateSFDC("Opportunity", sfdcId, fields);
                                if (ok) { setEditingOpp(null); setOppEdits({}); }
                              }}
                            >
                              {act.sending === "sfdc" ? "Saving..." : "Save to Salesforce"}
                            </button>
                            <button style={s.btn("#334155")} onClick={() => { setEditingOpp(null); setOppEdits({}); }}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          );
        })()}

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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={s.sectionTitle}>Open Opportunities — {fmt(pipelineTotal)} total pipeline</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#94A3B8", cursor: "pointer" }}>
                      <input type="checkbox" style={{ accentColor: "#10B981" }}
                        checked={selectedOpps.size === filteredOpps.length && filteredOpps.length > 0}
                        onChange={e => {
                          if (e.target.checked) setSelectedOpps(new Set(filteredOpps.map(o => o.id)));
                          else setSelectedOpps(new Set());
                        }}
                      /> Select All
                    </label>
                    {selectedOpps.size > 0 && <span style={{ fontSize: 12, color: "#F1F5F9", fontWeight: 600 }}>{selectedOpps.size} selected</span>}
                  </div>
                </div>

                {/* Bulk action bar */}
                {selectedOpps.size > 0 && (
                  <div style={{
                    background: "#1E293B", borderRadius: 8, padding: "12px 16px", marginBottom: 12,
                    border: "1px solid #334155", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                  }}>
                    <span style={{ fontSize: 13, color: "#F1F5F9", fontWeight: 600, marginRight: 8 }}>{selectedOpps.size} opp{selectedOpps.size > 1 ? "s" : ""} selected:</span>
                    <button style={s.btn("#EF4444")} onClick={() => setBulkAction(bulkAction === "closeLost" ? null : "closeLost")}>
                      Bulk Close Lost
                    </button>
                    <button style={s.btn("#F59E0B")} onClick={() => setBulkAction(bulkAction === "updateForecast" ? null : "updateForecast")}>
                      Bulk Update Forecast
                    </button>
                    <button style={s.btn("#3B82F6")} onClick={() => setBulkAction(bulkAction === "updateStage" ? null : "updateStage")}>
                      Bulk Change Stage
                    </button>
                    <button style={s.btn("#334155")} onClick={() => { setSelectedOpps(new Set()); setBulkAction(null); }}>Clear</button>
                  </div>
                )}

                {/* Bulk action panel */}
                {bulkAction && selectedOpps.size > 0 && (
                  <div style={{
                    background: "#0F172A", borderRadius: 8, padding: 16, marginBottom: 12,
                    border: bulkAction === "closeLost" ? "1px solid #EF4444" : "1px solid #334155",
                  }}>
                    {bulkAction === "closeLost" && (
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#EF4444", marginBottom: 8 }}>
                          Close {selectedOpps.size} Opportunit{selectedOpps.size > 1 ? "ies" : "y"} as Lost
                        </div>
                        <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>
                          {filteredOpps.filter(o => selectedOpps.has(o.id)).map(o => o.name).join(", ")}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            style={{ ...s.btn("#EF4444"), opacity: act.sending === "batch" ? 0.6 : 1 }}
                            disabled={act.sending === "batch"}
                            onClick={async () => {
                              const batch = [...selectedOpps].map(id => ({
                                object: "Opportunity", id,
                                fields: { StageName: "Closed Lost" },
                              }));
                              const results = await act.batchUpdate(batch);
                              if (results.length) {
                                setSelectedOpps(new Set());
                                setBulkAction(null);
                                // Refresh opps
                                window.location.reload();
                              }
                            }}
                          >
                            {act.sending === "batch" ? "Closing..." : `Confirm Close Lost (${selectedOpps.size})`}
                          </button>
                          <button style={s.btn("#334155")} onClick={() => setBulkAction(null)}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {bulkAction === "updateForecast" && (
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#F59E0B", marginBottom: 8 }}>
                          Update Forecast Category on {selectedOpps.size} Opp{selectedOpps.size > 1 ? "s" : ""}
                        </div>
                        <select
                          style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px 10px", color: "#E2E8F0", fontSize: 13, marginBottom: 10, width: 200 }}
                          value={oppEdits.bulkForecast || ""}
                          onChange={e => setOppEdits(d => ({ ...d, bulkForecast: e.target.value }))}
                        >
                          <option value="">Select category</option>
                          <option>Omitted</option><option>Pipeline</option><option>Best Case</option>
                          <option>Commit</option><option>Closed</option>
                        </select>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            style={{ ...s.btn("#F59E0B"), opacity: act.sending === "batch" || !oppEdits.bulkForecast ? 0.6 : 1 }}
                            disabled={act.sending === "batch" || !oppEdits.bulkForecast}
                            onClick={async () => {
                              const batch = [...selectedOpps].map(id => ({
                                object: "Opportunity", id,
                                fields: { Group_Forecast_Category__c: oppEdits.bulkForecast },
                              }));
                              const results = await act.batchUpdate(batch);
                              if (results.length) {
                                setSelectedOpps(new Set());
                                setBulkAction(null);
                                setOppEdits({});
                                window.location.reload();
                              }
                            }}
                          >
                            {act.sending === "batch" ? "Updating..." : `Update ${selectedOpps.size} Opps`}
                          </button>
                          <button style={s.btn("#334155")} onClick={() => setBulkAction(null)}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {bulkAction === "updateStage" && (
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#3B82F6", marginBottom: 8 }}>
                          Change Stage on {selectedOpps.size} Opp{selectedOpps.size > 1 ? "s" : ""}
                        </div>
                        <select
                          style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px 10px", color: "#E2E8F0", fontSize: 13, marginBottom: 10, width: 200 }}
                          value={oppEdits.bulkStage || ""}
                          onChange={e => setOppEdits(d => ({ ...d, bulkStage: e.target.value }))}
                        >
                          <option value="">Select stage</option>
                          <option>Prospecting</option><option>Qualification</option><option>Needs Analysis</option>
                          <option>Value Proposition</option><option>Proposal/Price Quote</option><option>Negotiation/Review</option>
                          <option>Closed Won</option><option>Closed Lost</option>
                        </select>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            style={{ ...s.btn("#3B82F6"), opacity: act.sending === "batch" || !oppEdits.bulkStage ? 0.6 : 1 }}
                            disabled={act.sending === "batch" || !oppEdits.bulkStage}
                            onClick={async () => {
                              const batch = [...selectedOpps].map(id => ({
                                object: "Opportunity", id,
                                fields: { StageName: oppEdits.bulkStage },
                              }));
                              const results = await act.batchUpdate(batch);
                              if (results.length) {
                                setSelectedOpps(new Set());
                                setBulkAction(null);
                                setOppEdits({});
                                window.location.reload();
                              }
                            }}
                          >
                            {act.sending === "batch" ? "Updating..." : `Update ${selectedOpps.size} Opps`}
                          </button>
                          <button style={s.btn("#334155")} onClick={() => setBulkAction(null)}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {filteredOpps.map(opp => (
                  <div key={opp.id} className="card-hover" style={{ ...s.card, borderLeft: selectedOpps.has(opp.id) ? "3px solid #10B981" : undefined }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <input type="checkbox" style={{ accentColor: "#10B981", marginTop: 4 }}
                          checked={selectedOpps.has(opp.id)}
                          onChange={e => {
                            const next = new Set(selectedOpps);
                            if (e.target.checked) next.add(opp.id); else next.delete(opp.id);
                            setSelectedOpps(next);
                          }}
                        />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{opp.name}</div>
                          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                            {opp.contact} · {opp.source}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#F1F5F9" }}>{fmt(opp.amount)}</div>
                        <span style={s.badge(opp.stage === "Stalled" ? "#EF4444" : opp.stage === "Proposal" ? "#10B981" : "#F59E0B")}>
                          {opp.stage}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, color: "#64748B", flexWrap: "wrap" }}>
                      <span>Close: {opp.closeDate}</span>
                      <span>Prob: {opp.probability}%</span>
                      <span>{opp.daysInStage}d in stage</span>
                      <span>Last activity: {opp.lastActivity}</span>
                      {opp.forecastCategory && opp.forecastCategory !== "—" && (
                        <span style={s.badge(
                          opp.forecastCategory === "Closed" ? "#10B981" :
                          opp.forecastCategory === "Commit" ? "#3B82F6" :
                          opp.forecastCategory === "Best Case" ? "#F59E0B" : "#64748B"
                        )}>
                          {opp.forecastCategory}
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12 }}>
                      <strong style={{ color: "#F1F5F9" }}>Next step:</strong>{" "}
                      <span style={{ color: "#CBD5E1" }}>{opp.nextStep}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <button style={s.btn("#1E293B")} onClick={() => copyText(`${opp.name}\nAmount: ${fmt(opp.amount)}\nStage: ${opp.stage}\nNext step: ${opp.nextStep}`, "opp details")}>Copy</button>
                      <button style={s.btn("#1E293B")} onClick={() => emailAction(opp.contact, `Re: ${opp.name}`, `Next step: ${opp.nextStep}`)}>Email</button>
                      {liveOpps && (
                        <button style={s.btn("#F59E0B")} onClick={() => { setEditingOpp(editingOpp === opp.id ? null : opp.id); setOppEdits({}); }}>
                          {editingOpp === opp.id ? "Close" : "Edit in SFDC"}
                        </button>
                      )}
                    </div>
                    {editingOpp === opp.id && liveOpps && (
                      <div style={{ background: "#0F172A", borderRadius: 8, padding: 14, marginTop: 10, border: "1px solid #334155" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Stage</div>
                            <select style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px", color: "#E2E8F0", fontSize: 13 }}
                              value={oppEdits.StageName || ""} onChange={e => setOppEdits(d => ({ ...d, StageName: e.target.value }))}>
                              <option value="">No change</option>
                              <option>Prospecting</option><option>Qualification</option><option>Needs Analysis</option>
                              <option>Value Proposition</option><option>Proposal/Price Quote</option><option>Negotiation/Review</option>
                              <option>Closed Won</option><option>Closed Lost</option>
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Close Date</div>
                            <input type="date" style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px", color: "#E2E8F0", fontSize: 13 }}
                              value={oppEdits.CloseDate || ""} onChange={e => setOppEdits(d => ({ ...d, CloseDate: e.target.value }))} />
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Amount</div>
                            <input type="number" style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px", color: "#E2E8F0", fontSize: 13 }}
                              placeholder="Amount" value={oppEdits.Amount || ""} onChange={e => setOppEdits(d => ({ ...d, Amount: e.target.value ? Number(e.target.value) : "" }))} />
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Next Step</div>
                            <input style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px", color: "#E2E8F0", fontSize: 13 }}
                              placeholder="Next step..." value={oppEdits.NextStep || ""} onChange={e => setOppEdits(d => ({ ...d, NextStep: e.target.value }))} />
                          </div>
                          <div style={{ gridColumn: "1 / -1" }}>
                            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 2 }}>Group Forecast Category</div>
                            <select style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, padding: "8px", color: "#E2E8F0", fontSize: 13 }}
                              value={oppEdits.Group_Forecast_Category__c || ""} onChange={e => setOppEdits(d => ({ ...d, Group_Forecast_Category__c: e.target.value }))}>
                              <option value="">No change</option>
                              <option>Omitted</option><option>Pipeline</option><option>Best Case</option>
                              <option>Commit</option><option>Closed</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button style={{ ...s.btn("#F59E0B"), opacity: act.sending === "sfdc" ? 0.6 : 1 }} disabled={act.sending === "sfdc"}
                            onClick={async () => {
                              const fields = {};
                              if (oppEdits.StageName) fields.StageName = oppEdits.StageName;
                              if (oppEdits.CloseDate) fields.CloseDate = oppEdits.CloseDate;
                              if (oppEdits.Amount) fields.Amount = oppEdits.Amount;
                              if (oppEdits.NextStep) fields.NextStep = oppEdits.NextStep;
                              if (oppEdits.Group_Forecast_Category__c) fields.Group_Forecast_Category__c = oppEdits.Group_Forecast_Category__c;
                              if (Object.keys(fields).length === 0) { setToast("No changes"); return; }
                              const ok = await act.updateSFDC("Opportunity", opp.id, fields);
                              if (ok) { setEditingOpp(null); setOppEdits({}); }
                            }}>
                            {act.sending === "sfdc" ? "Saving..." : "Save to Salesforce"}
                          </button>
                          <button style={s.btn("#334155")} onClick={() => { setEditingOpp(null); setOppEdits({}); }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Activities */}
            {pipelineTab === "activities" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={s.sectionTitle}>Activity Feed — Emails, Calls, Meetings, Forms</div>
                  {liveActivities && (
                    <div style={{ display: "flex", gap: 8, fontSize: 11 }}>
                      {["all", "email", "call", "meeting", "form"].map(f => (
                        <button key={f} style={{
                          padding: "4px 10px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer",
                          fontSize: 11, fontWeight: 600, textTransform: "capitalize",
                          background: (activityFilter || "all") === f ? "#10B981" : "transparent",
                          color: (activityFilter || "all") === f ? "#fff" : "#94A3B8",
                        }} onClick={() => setActivityFilter(f)}>{f}</button>
                      ))}
                    </div>
                  )}
                </div>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Date</th>
                      <th style={s.th}>Type</th>
                      <th style={s.th}>Subject</th>
                      <th style={s.th}>Contact</th>
                      <th style={s.th}>Company</th>
                      <th style={s.th}>Source</th>
                      <th style={s.th}>Dir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayActivities
                      .filter(act => !activityFilter || activityFilter === "all" || act.type === activityFilter)
                      .map((act, i) => {
                      const typeColors = { email: "#3B82F6", call: "#8B5CF6", meeting: "#F59E0B", form: "#10B981", task: "#64748B" };
                      return (
                        <tr key={i} className="row-hover">
                          <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                            <div>{act.date}</div>
                            {act.time && <div style={{ fontSize: 10, color: "#64748B" }}>{act.time}</div>}
                          </td>
                          <td style={s.td}>
                            <span style={s.badge(typeColors[act.type] || "#64748B")}>
                              {ACTIVITY_ICONS[act.type] || (act.type === "form" ? "📝" : "▸")} {act.type}
                            </span>
                          </td>
                          <td style={{ ...s.td, color: "#F1F5F9", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{act.subject}</td>
                          <td style={s.td}>{act.contact}</td>
                          <td style={s.td}>{act.company}</td>
                          <td style={s.td}>
                            <span style={{ fontSize: 10, color: "#64748B" }}>{act.source || "SFDC"}</span>
                          </td>
                          <td style={s.td}>
                            <span style={s.badge(act.direction === "inbound" ? "#10B981" : "#3B82F6")}>{act.direction}</span>
                          </td>
                        </tr>
                      );
                    })}
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
        <kbd style={{ background: "#1E293B", padding: "2px 6px", borderRadius: 3, fontSize: 11 }}>/</kbd> Search{" "}
        <kbd style={{ background: "#1E293B", padding: "2px 6px", borderRadius: 3, fontSize: 11 }}>C</kbd> Claude
      </div>

      {/* ── Claude Chat Sidebar ───────────────────────────────── */}
      {chatOpen && (
        <div style={{
          position: "fixed", top: 0, right: 0, width: 400, height: "100vh",
          background: "#0F172A", borderLeft: "1px solid #1E293B",
          display: "flex", flexDirection: "column", zIndex: 1000,
          boxShadow: "-4px 0 20px rgba(0,0,0,0.4)",
        }}>
          {/* Chat header */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: "linear-gradient(135deg, #8B5CF6, #6D28D9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff" }}>C</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>Claude</div>
                <div style={{ fontSize: 10, color: "#64748B" }}>Has access to SFDC, Gmail, Calendar</div>
              </div>
            </div>
            <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 18 }} onClick={() => setChatOpen(false)}>x</button>
          </div>

          {/* Quick actions */}
          <div style={{ padding: "8px 12px", borderBottom: "1px solid #1E293B", display: "flex", gap: 4, flexWrap: "wrap" }}>
            {["Summarize my pipeline", "What needs follow-up?", "Draft a check-in email", "What's on my calendar?"].map(q => (
              <button key={q} style={{
                padding: "4px 10px", borderRadius: 12, border: "1px solid #334155",
                background: "transparent", color: "#94A3B8", fontSize: 11, cursor: "pointer",
              }} onClick={() => { setChatInput(q); }}>{q}</button>
            ))}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {chatMsgs.length === 0 && (
              <div style={{ textAlign: "center", color: "#475569", fontSize: 13, marginTop: 40 }}>
                Ask me about your pipeline, emails, calendar, or anything else.
              </div>
            )}
            {chatMsgs.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                background: m.role === "user" ? "#1E40AF" : "#1E293B",
                borderRadius: 10, padding: "10px 14px", fontSize: 13,
                color: "#E2E8F0", lineHeight: 1.5, whiteSpace: "pre-wrap",
              }}>
                {m.content}
              </div>
            ))}
            {chatLoading && (
              <div style={{ alignSelf: "flex-start", background: "#1E293B", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#64748B" }}>
                Thinking...
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: 12, borderTop: "1px solid #1E293B", display: "flex", gap: 8 }}>
            <input
              style={{
                flex: 1, background: "#1E293B", border: "1px solid #334155", borderRadius: 8,
                padding: "10px 14px", color: "#E2E8F0", fontSize: 13,
              }}
              placeholder="Ask Claude..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && chatInput.trim() && !chatLoading) {
                  const msg = chatInput.trim();
                  setChatInput("");
                  const newMsgs = [...chatMsgs, { role: "user", content: msg }];
                  setChatMsgs(newMsgs);
                  setChatLoading(true);
                  fetch("/.netlify/functions/claude-chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: msg, history: chatMsgs }),
                  })
                    .then(r => r.json())
                    .then(data => {
                      setChatMsgs(prev => [...prev, { role: "assistant", content: data.reply || data.error || "Error" }]);
                      setChatLoading(false);
                    })
                    .catch(() => {
                      setChatMsgs(prev => [...prev, { role: "assistant", content: "Failed to reach Claude" }]);
                      setChatLoading(false);
                    });
                }
              }}
            />
            <button
              style={{ ...s.btn("#8B5CF6"), padding: "10px 16px", opacity: chatLoading ? 0.6 : 1 }}
              disabled={chatLoading || !chatInput.trim()}
              onClick={() => {
                if (!chatInput.trim() || chatLoading) return;
                const msg = chatInput.trim();
                setChatInput("");
                const newMsgs = [...chatMsgs, { role: "user", content: msg }];
                setChatMsgs(newMsgs);
                setChatLoading(true);
                fetch("/.netlify/functions/claude-chat", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ message: msg, history: chatMsgs }),
                })
                  .then(r => r.json())
                  .then(data => {
                    setChatMsgs(prev => [...prev, { role: "assistant", content: data.reply || data.error || "Error" }]);
                    setChatLoading(false);
                  })
                  .catch(() => {
                    setChatMsgs(prev => [...prev, { role: "assistant", content: "Failed to reach Claude" }]);
                    setChatLoading(false);
                  });
              }}
            >Send</button>
          </div>
        </div>
      )}

      {/* Chat toggle button (always visible) */}
      {!chatOpen && (
        <button
          style={{
            position: "fixed", bottom: 24, right: 24, width: 52, height: 52,
            borderRadius: 14, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
            color: "#fff", fontSize: 20, fontWeight: 700,
            boxShadow: "0 4px 20px rgba(139,92,246,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 999,
          }}
          onClick={() => setChatOpen(true)}
        >C</button>
      )}
    </div>
  );
}
