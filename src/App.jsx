import { useState, useEffect, useCallback } from "react";
// Mock data removed — all data is live
import { useSalesforce } from "./useSalesforce";
import { useActions } from "./useActions";
import { useAuth } from "./useAuth";
import { useStore } from "./useStore";
import EmailComposer from "./components/EmailComposer";
import DealInspector from "./components/DealInspector";
import DailyBrief from "./components/DailyBrief";
import EADelegate from "./components/EADelegate";
import WeeklyDigest from "./components/WeeklyDigest";
import ClientHealth from "./components/ClientHealth";
import RevenueForecast from "./components/RevenueForecast";
import PipelineDetail from "./components/PipelineDetail";
import DealScore from "./components/DealScore";
import Account360 from "./components/Account360";
import KanbanBoard from "./components/KanbanBoard";
import GlobalSearch from "./components/GlobalSearch";
import KeyboardShortcuts from "./components/KeyboardShortcuts";
import EnhancedChat from "./components/EnhancedChat";
import PostMeeting from "./components/PostMeeting";
import CashFlow from "./components/CashFlow";
import ExpansionSignals from "./components/ExpansionSignals";
import RelationshipMap from "./components/RelationshipMap";
import WinLossPatterns from "./components/WinLossPatterns";
import BoardReport from "./components/BoardReport";
import SuggestionCards from "./components/SuggestionCards";
import DeepDealIntel from "./components/DeepDealIntel";
import MissingContacts from "./components/MissingContacts";

// ── Helpers ────────────────────────────────────────────────────
const fmt = (n) => "$" + (n || 0).toLocaleString();
const pct = (n) => (n || 0).toFixed(1) + "%";
const LS_KEY = "ceo-cockpit-v2";
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } };
const save = (d) => localStorage.setItem(LS_KEY, JSON.stringify(d));

// Clear ALL old data on version change
const APP_VERSION = "v2.1";
try {
  if (localStorage.getItem("cockpit_version") !== APP_VERSION) {
    localStorage.removeItem("skaled-sdr-cockpit");
    localStorage.removeItem("cockpit_actions_cache");
    localStorage.removeItem("cockpit_metrics_cache");
    localStorage.removeItem("ceo-cockpit-v2");
    localStorage.setItem("cockpit_version", APP_VERSION);
  }
} catch {}

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

// ── Login Screen ──────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  return (
    <div style={{ minHeight: "100vh", background: "#0F1117", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#0F172A", borderRadius: 16, padding: 40, width: 380, border: "1px solid #1E293B", textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(135deg, #10B981, #059669)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 20, color: "#fff", margin: "0 auto 16px" }}>S</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#F1F5F9", marginBottom: 4 }}>CEO Cockpit</div>
        <div style={{ fontSize: 13, color: "#64748B", marginBottom: 24 }}>Skaled Consulting</div>
        <input
          style={{ width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 8, padding: "12px 14px", color: "#E2E8F0", fontSize: 14, marginBottom: 12, boxSizing: "border-box", textAlign: "center" }}
          type="password" placeholder="Password" value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && pw) { setLoading(true); setError(null); onLogin(pw).then(r => { if (!r.success) { setError(r.error); setLoading(false); } }); } }}
          autoFocus
        />
        {error && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 10 }}>{error}</div>}
        <button
          style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, background: "#10B981", color: "#fff", opacity: loading || !pw ? 0.6 : 1 }}
          disabled={loading || !pw}
          onClick={() => { setLoading(true); setError(null); onLogin(pw).then(r => { if (!r.success) { setError(r.error); setLoading(false); } }); }}
        >{loading ? "Logging in..." : "Log In"}</button>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────
export default function App() {
  const auth = useAuth();
  const store = useStore();
  const sfdc = useSalesforce();
  const [toast, setToast] = useState(null);
  const act = useActions(setToast);
  const [view, setView] = useState("actions");
  const [actions, setActions] = useState([]);
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
  const [liveActions, setLiveActions] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem("cockpit_actions_cache")); if (c?.data && (Date.now() - c.timestamp) < 60 * 1000) return c.data; } catch {} return null;
  });
  const [actionsLoading, setActionsLoading] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem("cockpit_actions_cache")); return !(c?.data && (Date.now() - c.timestamp) < 60 * 1000); } catch { return true; }
  });
  const [actionStatuses, setActionStatuses] = useState(() => load().actionStatuses || {});
  const [storeLoaded, setStoreLoaded] = useState(false);
  const [selectedOpps, setSelectedOpps] = useState(new Set());
  const [oppSortAsc, setOppSortAsc] = useState(true);
  const [bulkAction, setBulkAction] = useState(null);
  const [composing, setComposing] = useState(null); // action id being composed
  const [composeData, setComposeData] = useState({ to: "", subject: "", body: "" });
  const [editingOpp, setEditingOpp] = useState(null);
  const [oppEdits, setOppEdits] = useState({ priorityFilter: "critical" });
  // Live metrics
  const [liveMetrics, setLiveMetrics] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem("cockpit_metrics_cache")); if (c?.data && (Date.now() - c.timestamp) < 60 * 1000) return c.data; } catch {} return null;
  });
  // New feature panels
  const [showEmailComposer, setShowEmailComposer] = useState(null); // { action, mode: "ai"|"manual" }
  const [showDealInspector, setShowDealInspector] = useState(null); // { oppId, oppName }
  const [showDailyBrief, setShowDailyBrief] = useState(false);
  const [showEADelegate, setShowEADelegate] = useState(null); // action object
  const [showWeeklyDigest, setShowWeeklyDigest] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showPipelineDetail, setShowPipelineDetail] = useState(false);
  const [showDeepIntel, setShowDeepIntel] = useState(null);
  const [showMissingContacts, setShowMissingContacts] = useState(null);
  const [showAccount360, setShowAccount360] = useState(null); // { accountId, accountName }
  const [showKanban, setShowKanban] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false); // { oppId, accountId, accountName } // { oppId, oppName, accountName }
  const [showDealScore, setShowDealScore] = useState(null); // { oppId, oppName }
  const [showPostMeeting, setShowPostMeeting] = useState(null); // { id, subject, account }
  const [showCashFlow, setShowCashFlow] = useState(false);
  const [showExpansion, setShowExpansion] = useState(false);
  const [showRelMap, setShowRelMap] = useState(null); // { accountId, accountName }
  const [showWinLoss, setShowWinLoss] = useState(false);
  const [showBoardReport, setShowBoardReport] = useState(false);
  const [customActions, setCustomActions] = useState(() => load().customActions || []);
  const [closedWonOpps, setClosedWonOpps] = useState(null);

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
      sfdc.query(`SELECT Id, Name, Account.Name, Amount, StageName, CloseDate, LeadSource, Group_Forecast_Category__c FROM Opportunity WHERE IsWon = true AND CloseDate >= THIS_QUARTER ORDER BY CloseDate DESC LIMIT 50`),
    ]).then(([opps, events, accounts, leads, wonOpps]) => {
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
        const timeStr = e.StartDateTime ? new Date(e.StartDateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "";

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
      if (wonOpps && wonOpps.length) setClosedWonOpps(wonOpps.map(o => ({
        id: o.Id, name: o.Name, account: o.Account?.Name || "—",
        amount: o.Amount || 0, closeDate: o.CloseDate || "—",
        source: o.LeadSource || "—", forecastCategory: o.Group_Forecast_Category__c || "—",
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

  // ── PHASE 1: Fast load (SFDC only, <2s) ─────────────────────
  useEffect(() => {
    const hasCached = liveActions !== null;
    if (!hasCached) setActionsLoading(true);

    // Fast endpoints — SFDC only, parallel
    Promise.all([
      fetch("/.netlify/functions/metrics-fast").then(r => r.json()).catch(() => null),
      fetch("/.netlify/functions/actions-fast").then(r => r.json()).catch(() => null),
    ]).then(([metrics, actions]) => {
      if (metrics && !metrics.error) setLiveMetrics(metrics);
      if (actions && (actions.external || actions.dealsAtRisk)) {
        setLiveActions(prev => {
          // Merge fast results, keep any existing enriched data
          if (!prev) return actions;
          return { ...actions, external: [...(actions.external || []), ...(prev.external || []).filter(a => a.channel !== "salesforce")], internal: prev.internal || [] };
        });
        setActionsLoading(false);
      } else {
        setActionsLoading(false);
      }
    });

    // ── PHASE 2: Full enrichment (Gmail + Calendar + Claude, background) ──
    fetch("/.netlify/functions/daily-actions")
      .then(r => r.json())
      .then(data => {
        if (data.external || data.internal) {
          setLiveActions(data);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })); } catch {}
        }
        setActionsLoading(false);
      })
      .catch(() => setActionsLoading(false));

    // Auto-refresh every 5 minutes in background
    const refreshInterval = setInterval(() => {
      fetch("/.netlify/functions/daily-actions")
        .then(r => r.json())
        .then(data => {
          if (data.external || data.internal) {
            setLiveActions(data);
            try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() })); } catch {}
          }
        }).catch(() => {});
      fetch("/.netlify/functions/live-metrics")
        .then(r => r.json())
        .then(data => { if (!data.error) setLiveMetrics(data); })
        .catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Lazy AI enrichment — runs after actions load, doesn't block
  useEffect(() => {
    if (!liveActions) return;
    const allActions = [...(liveActions.external || []), ...(liveActions.internal || []), ...(liveActions.dealsAtRisk || [])].slice(0, 12);
    if (allActions.length === 0) return;

    fetch("/.netlify/functions/enrich-actions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actions: allActions }),
    }).then(r => r.json()).then(data => {
      if (data.enriched?.length) {
        setLiveActions(prev => {
          const updated = { ...prev };
          data.enriched.forEach(e => {
            const action = allActions[e.index];
            if (!action) return;
            for (const qKey of ["external", "internal", "dealsAtRisk"]) {
              const match = (updated[qKey] || []).find(a => a.id === action.id);
              if (match) {
                if (e.context) match.context = e.context;
                if (e.action) match.suggestedAction = e.action;
                break;
              }
            }
          });
          return { ...updated };
        });
      }
    }).catch(() => {});
  }, [liveActions ? "loaded" : "waiting"]);

  // Load from blob store on mount
  useEffect(() => {
    (async () => {
      const [savedStatuses, savedCustom] = await Promise.all([
        store.get("actionStatuses"),
        store.get("customActions"),
      ]);
      if (savedStatuses && Object.keys(savedStatuses).length) setActionStatuses(savedStatuses);
      if (savedCustom && savedCustom.length) setCustomActions(savedCustom);
      setStoreLoaded(true);
    })();
  }, []);

  // Persist to both localStorage (instant) and blob store (debounced)
  useEffect(() => {
    save({ ...load(), actionStatuses });
    if (storeLoaded) store.set("actionStatuses", actionStatuses);
  }, [actionStatuses]);
  useEffect(() => {
    save({ ...load(), customActions });
    if (storeLoaded) store.set("customActions", customActions);
  }, [customActions]);

  const markLiveAction = useCallback((id, status) => {
    setActionStatuses(prev => ({
      ...prev,
      [id]: { status, timestamp: Date.now() },
    }));
    setToast(status === "done" ? "Marked as done — returns in 3 days if unresolved" : status === "skipped" ? "Skipped — returns in 3 days" : "Reopened");
  }, []);

  // 3-day cooldown check: returns true if item should be hidden
  const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
  const isInCooldown = (id) => {
    const entry = actionStatuses[id];
    if (!entry) return false;
    // Support old format (string) and new format ({ status, timestamp })
    if (typeof entry === "string") return entry === "done" || entry === "skipped";
    if (entry.status === "pending") return false;
    if (!entry.timestamp) return entry.status === "done" || entry.status === "skipped";
    return (Date.now() - entry.timestamp) < COOLDOWN_MS;
  };

  // Merge all activity sources: SFDC Events + Gmail + Calendar
  const mergedActivities = (() => {
    const all = [...(liveActivities || []), ...gmailActivities, ...calendarActivities];
    if (all.length === 0) return [];
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
  const displayOpps = liveOpps || [];
  const displayActivities = mergedActivities;
  const displayAccounts = liveAccounts || [];
  const displayLeads = liveLeads || [];

  // Persist mock action statuses (merged, not overwriting)
  useEffect(() => {
    const statuses = {};
    actions.forEach(a => { statuses[a.id] = a.status; });
    save({ ...load(), actions: statuses });
  }, [actions]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "1") setView("actions");
      if (e.key === "2") setView("dashboard");
      if (e.key === "3") setView("pipeline");
      if (e.key === "/" && !e.metaKey) { e.preventDefault(); setShowGlobalSearch(true); }
      if (e.key === "c" || e.key === "C") setChatOpen(prev => !prev);
      if (e.key === "b") setShowDailyBrief(true);
      if (e.key === "w") setShowWeeklyDigest(true);
      if (e.key === "f") setShowCashFlow(true);
      if (e.key === "p") setShowPipelineDetail(true);
      if (e.key === "n") setShowNewTask(true);
      if (e.key === "k") setShowKanban(prev => !prev);
      if (e.key === "?") setShowShortcuts(prev => !prev);
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

  // ── Auth gate (after all hooks) ──────────────────────────────
  if (auth.loading) return (
    <div style={{ minHeight: "100vh", background: "#0F1117", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#64748B", fontSize: 14 }}>Loading...</div>
    </div>
  );
  if (!auth.authenticated) return <LoginScreen onLogin={auth.login} />;

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
            <div style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9" }}>CEO Cockpit</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>Jake Dunlap — Skaled Consulting</div>
          </div>
        </div>
        <div style={s.nav}>
          {[["actions", "Actions"], ["dashboard", "Dashboard"], ["pipeline", "Pipeline"]].map(([key, label]) => {
            // Badge counts
            let badge = 0;
            if (key === "actions" && liveActions) {
              badge = [...(liveActions.external || []), ...(liveActions.internal || []), ...(liveActions.dealsAtRisk || [])].filter(a => !isInCooldown(a.id) && (typeof (actionStatuses[a.id]) === "object" ? actionStatuses[a.id]?.status : actionStatuses[a.id]) !== "done").filter(a => a.priority === "critical").length;
            }
            if (key === "pipeline" && liveMetrics?.pastDueDeals) badge = liveMetrics.pastDueDeals;
            return (
              <button key={key} style={{ ...s.navBtn(view === key), position: "relative" }} onClick={() => setView(key)}>
                {label}
                {badge > 0 && <span style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "#EF4444", color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{badge}</span>}
              </button>
            );
          })}
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
          <button style={{ ...s.btn("#8B5CF6"), fontSize: 11, padding: "4px 10px" }} onClick={() => setShowDailyBrief(true)}>AI Brief</button>
          <button style={{ ...s.btn("#334155"), fontSize: 11, padding: "4px 10px" }} onClick={() => setShowWeeklyDigest(true)}>Weekly</button>
          <button style={{ ...s.btn("#334155"), fontSize: 11, padding: "4px 10px" }} onClick={() => setShowCashFlow(true)}>Cash Flow</button>
          <button style={{ ...s.btn("#334155"), fontSize: 11, padding: "4px 10px" }} onClick={() => setShowExpansion(true)}>Expansion</button>
          <button style={{ ...s.btn("#334155"), fontSize: 11, padding: "4px 10px" }} onClick={() => setShowWinLoss(true)}>Win/Loss</button>
          <button style={{ ...s.btn("#334155"), fontSize: 11, padding: "4px 10px" }} onClick={() => setShowBoardReport(true)}>QBR</button>
          <button style={{ ...s.btn("#1E293B"), fontSize: 11, padding: "4px 10px", color: "#64748B" }} onClick={auth.logout}>Logout</button>
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
        <div className="metric-hover" style={s.metricCard} onClick={() => setShowCashFlow(true)}>
          <div style={s.metricVal}>{liveMetrics ? fmt(liveMetrics.weightedPipeline) : "..."}</div>
          <div style={s.metricLabel}>Weighted Forecast</div>
          <div style={{ ...s.metricSub, color: "#94A3B8" }}>
            {liveMetrics ? `${liveMetrics.openDeals} deals` : "Loading"}
          </div>
        </div>
        <div className="metric-hover" style={s.metricCard} onClick={() => setShowPipelineDetail(true)}>
          <div style={s.metricVal}>{liveMetrics ? fmt(liveMetrics.totalPipeline) : fmt(pipelineTotal)}</div>
          <div style={s.metricLabel}>Total Pipeline</div>
          <div style={{ ...s.metricSub, color: "#94A3B8" }}>
            {liveMetrics ? `${liveMetrics.openDeals} open` : `${displayOpps.length} open`}
          </div>
        </div>
        <div className="metric-hover" style={s.metricCard} onClick={() => { setView("pipeline"); setPipelineTab("closedWon"); }}>
          <div style={s.metricVal}>{liveMetrics ? fmt(liveMetrics.wonAmountThisQuarter) : "..."}</div>
          <div style={s.metricLabel}>{liveMetrics?.quarterLabel || "Quarter"} Won</div>
          <div style={{ ...s.metricSub, color: "#10B981" }}>
            {liveMetrics ? `${liveMetrics.wonThisQuarter} deals closed` : ""}
          </div>
        </div>
        <div className="metric-hover" style={s.metricCard} onClick={() => { setView("actions"); setActionQueue("dealsAtRisk"); setOppEdits(d => ({ ...d, priorityFilter: null })); }}>
          <div style={{ ...s.metricVal, color: liveMetrics?.pastDueDeals > 0 ? "#EF4444" : "#10B981" }}>
            {liveMetrics?.pastDueDeals ?? "..."}
          </div>
          <div style={s.metricLabel}>Past Due Deals</div>
          <div style={{ ...s.metricSub, color: "#F59E0B" }}>
            {liveMetrics ? `${liveMetrics.closingThisWeek} closing this week` : ""}
          </div>
        </div>
        <div className="metric-hover" style={s.metricCard} onClick={() => { setView("actions"); setActionQueue("internal"); setOppEdits(d => ({ ...d, priorityFilter: null })); }}>
          <div style={s.metricVal}>{liveMetrics?.meetingsToday ?? "..."}</div>
          <div style={s.metricLabel}>Meetings Today</div>
          <div style={{ ...s.metricSub, color: "#94A3B8" }}>
            {liveMetrics ? `${liveMetrics.unreadEmails} unread emails` : ""}
          </div>
        </div>
        <div className="metric-hover" style={s.metricCard} onClick={() => { setView("pipeline"); setPipelineTab("leads"); }}>
          <div style={s.metricVal}>{liveMetrics?.newLeadsThisWeek ?? "..."}</div>
          <div style={s.metricLabel}>New Leads (7d)</div>
          <div style={{ ...s.metricSub, color: "#94A3B8" }}>
            This week
          </div>
        </div>
      </div>

      {/* ── Content Area ──────────────────────────────────────── */}
      <div style={s.content}>

        {/* ── DAILY ACTIONS VIEW ────────────────────────────── */}
        {view === "actions" && (() => {
          const queueMap = {
            external: [...(liveActions?.external || []), ...customActions.filter(a => a.queue === "external")],
            internal: [...(liveActions?.internal || []), ...customActions.filter(a => a.queue === "internal")],
            dealsAtRisk: liveActions?.dealsAtRisk || [],
          };
          let currentActions = liveActions ? [...(queueMap[actionQueue] || [])] : [];
          // Remove done/skipped items
          currentActions = currentActions.filter(a => !isInCooldown(a.id));
          if (false && oppEdits.cleanupSort === "asc") { // sfdcCleanup removed
            currentActions.sort((a, b) => (a.daysOverdue || 0) - (b.daysOverdue || 0));
          }
          if (oppEdits.priorityFilter) {
            currentActions = currentActions.filter(a => a.priority === oppEdits.priorityFilter);
          }
          const isLive = !!liveActions;
          const countFor = (key) => (queueMap[key] || []).filter(a => !isInCooldown(a.id)).length;

          const queues = [
            { key: "external", label: "External", color: "#10B981" },
            { key: "internal", label: "Internal", color: "#3B82F6" },
            { key: "dealsAtRisk", label: "Deals at Risk", color: "#EF4444" },
            { key: "suggestions", label: "AI Suggestions", color: "#8B5CF6" },
          ];

          return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={s.sectionTitle}>
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" })}
                {actionsLoading && <span style={{ fontSize: 12, color: "#F59E0B", marginLeft: 8 }}>Loading...</span>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={s.btn("#3B82F6")} onClick={() => setShowNewTask(true)}>+ New Task</button>
                {isLive && <button style={s.btn("#334155")} onClick={() => setActionStatuses({})}>Reset All</button>}
              </div>
            </div>

            {/* Queue toggle */}
            {isLive && (
              <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
                {queues.map(q => {
                  const cnt = countFor(q.key);
                  return (
                    <button key={q.key}
                      style={{
                        padding: "8px 16px", borderRadius: 6, border: "1px solid #334155", cursor: "pointer",
                        fontSize: 12, fontWeight: 600,
                        background: actionQueue === q.key ? q.color : "transparent",
                        color: actionQueue === q.key ? "#fff" : "#94A3B8",
                      }}
                      onClick={() => { setActionQueue(q.key); setOppEdits(d => ({ ...d, priorityFilter: null })); setSelectedOpps(new Set()); }}
                    >
                      {q.label} {cnt > 0 && <span style={{ background: "rgba(255,255,255,0.2)", padding: "1px 6px", borderRadius: 10, marginLeft: 4, fontSize: 11 }}>{cnt}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Sort controls + bulk actions for SFDC Cleanup / Deals at Risk */}
            {isLive && currentActions.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {false && (
                    <>
                      <span style={{ fontSize: 12, color: "#64748B" }}>Sort:</span>
                      <button style={s.btn(oppEdits.cleanupSort === "asc" ? "#F59E0B" : "#334155")} onClick={() => setOppEdits(d => ({ ...d, cleanupSort: "asc" }))}>Oldest first</button>
                      <button style={s.btn(oppEdits.cleanupSort !== "asc" ? "#F59E0B" : "#334155")} onClick={() => setOppEdits(d => ({ ...d, cleanupSort: "desc" }))}>Newest first</button>
                      <span style={{ fontSize: 12, color: "#64748B", marginLeft: 4 }}>
                        {currentActions.filter(a => a.tag === "past-due").length} past due · {currentActions.filter(a => a.tag === "closing-soon").length} closing this week
                      </span>
                    </>
                  )}
                  <span style={{ flex: 1 }} />
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#94A3B8", cursor: "pointer" }}>
                    <input type="checkbox" style={{ accentColor: "#10B981" }}
                      checked={selectedOpps.size === currentActions.length && currentActions.length > 0}
                      onChange={e => {
                        if (e.target.checked) setSelectedOpps(new Set(currentActions.map(a => a.id)));
                        else setSelectedOpps(new Set());
                      }}
                    /> Select All
                  </label>
                  {selectedOpps.size > 0 && <span style={{ fontSize: 12, color: "#F1F5F9", fontWeight: 600 }}>{selectedOpps.size} selected</span>}
                </div>
                {selectedOpps.size > 0 && (
                  <div style={{
                    background: "#1E293B", borderRadius: 8, padding: "10px 14px", marginTop: 8,
                    border: "1px solid #334155", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                  }}>
                    {/* Mark all selected as done */}
                    <button style={s.btn("#10B981")} onClick={() => {
                      selectedOpps.forEach(id => markLiveAction(id, "done"));
                      setSelectedOpps(new Set());
                    }}>
                      Mark Done ({selectedOpps.size})
                    </button>
                    <button style={s.btn("#64748B")} onClick={() => {
                      selectedOpps.forEach(id => markLiveAction(id, "skipped"));
                      setSelectedOpps(new Set());
                    }}>
                      Skip ({selectedOpps.size})
                    </button>
                    {/* SFDC bulk ops — only show when opp actions are selected */}
                    {currentActions.some(a => a.id?.startsWith("opp-")) && (
                      <>
                        <span style={{ width: 1, height: 20, background: "#334155" }} />
                        <button style={s.btn("#EF4444")} disabled={act.sending === "batch"} onClick={async () => {
                          const oppActionIds = [...selectedOpps].filter(id => id.startsWith("opp-"));
                          if (oppActionIds.length === 0) return;
                          const batch = oppActionIds.map(id => ({
                            object: "Opportunity", id: id.replace("opp-", ""),
                            fields: { StageName: "Closed Lost", Lost_Reason__c: "Other", Lost_Reason_Details__c: "Old" },
                          }));
                          const results = await act.batchUpdate(batch);
                          if (results.length) {
                            oppActionIds.forEach(id => markLiveAction(id, "done"));
                            setSelectedOpps(new Set());
                          }
                        }}>
                          {act.sending === "batch" ? "Closing..." : `Close Lost`}
                        </button>
                        <button style={s.btn("#8B5CF6")} disabled={act.sending === "batch"} onClick={async () => {
                          const oppActionIds = [...selectedOpps].filter(id => id.startsWith("opp-"));
                          if (oppActionIds.length === 0) return;
                          const batch = oppActionIds.map(id => {
                            const action = currentActions.find(a => a.id === id);
                            const current = action?.closeDate ? new Date(action.closeDate) : new Date();
                            const pushed = new Date(current.getTime() + 14 * 86400000);
                            return { object: "Opportunity", id: id.replace("opp-", ""), fields: { CloseDate: pushed.toISOString().split("T")[0] } };
                          });
                          const results = await act.batchUpdate(batch);
                          if (results.length) {
                            oppActionIds.forEach(id => markLiveAction(id, "done"));
                            setSelectedOpps(new Set());
                          }
                        }}>
                      Push +2 Weeks
                    </button>
                      </>
                    )}
                    <button style={s.btn("#334155")} onClick={() => setSelectedOpps(new Set())}>Clear</button>
                  </div>
                )}
              </div>
            )}

            {/* Priority filter — all tabs */}
            {isLive && (
              <div style={{ display: "flex", gap: 4, marginBottom: 16, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#64748B", marginRight: 4 }}>Priority:</span>
                <button style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 11, fontWeight: 600, background: !oppEdits.priorityFilter ? "#10B981" : "transparent", color: !oppEdits.priorityFilter ? "#fff" : "#94A3B8" }}
                  onClick={() => setOppEdits(d => ({ ...d, priorityFilter: null }))}>
                  All ({(liveActions ? (queueMap[actionQueue] || []).filter(a => !isInCooldown(a.id)) : []).length})
                </button>
                {["critical", "high", "medium", "low"].map(p => {
                  const activeQueue = liveActions ? (queueMap[actionQueue] || []).filter(a => !isInCooldown(a.id)) : [];
                  const count = activeQueue.filter(a => a.priority === p).length;
                  if (count === 0) return null;
                  return (
                    <button key={p} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #334155", cursor: "pointer", fontSize: 11, fontWeight: 600, background: oppEdits.priorityFilter === p ? PRIORITY_COLORS[p] : "transparent", color: oppEdits.priorityFilter === p ? "#fff" : "#94A3B8" }}
                      onClick={() => setOppEdits(d => ({ ...d, priorityFilter: d.priorityFilter === p ? null : p }))}>
                      {p.charAt(0).toUpperCase() + p.slice(1)} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* AI Suggestions tab */}
            {actionQueue === "suggestions" && (
              <SuggestionCards
                onAction={(s) => setToast("Action taken")}
                onDismiss={(id) => {}}
                onScoreDeal={(d) => setShowDealScore(d)}
                onEmailDeal={(action) => setShowEmailComposer({ action, mode: "ai" })}
                onDelegateDeal={(action) => setShowEADelegate(action)}
              />
            )}

            {actionQueue !== "suggestions" && actionsLoading && (
              <div style={{ padding: 20 }}>
                {[...Array(4)].map((_, i) => (
                  <div key={i} style={{ background: "#1E293B", borderRadius: 8, height: 60, marginBottom: 6, opacity: 0.5 + (i * 0.1) }} />
                ))}
                <div style={{ textAlign: "center", color: "#8B5CF6", fontSize: 12, marginTop: 8 }}>Loading actions from SFDC, Gmail, Calendar...</div>
              </div>
            )}

            {actionQueue !== "suggestions" && currentActions.length === 0 && !actionsLoading && isLive && (
              <div style={{ ...s.card, cursor: "default", textAlign: "center", color: "#64748B", padding: 32 }}>
                No actions in this queue
              </div>
            )}

            {currentActions.map(action => {
              const expanded = expandedAction === action.id;
              const rawSt = actionStatuses[action.id];
              const status = isLive ? (typeof rawSt === "string" ? rawSt : rawSt?.status || "pending") : action.status;
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
                    {isLive && (
                      <input type="checkbox" style={{ accentColor: "#10B981", marginTop: 4, marginRight: 8 }}
                        checked={selectedOpps.has(action.id)}
                        onClick={e => e.stopPropagation()}
                        onChange={e => {
                          const next = new Set(selectedOpps);
                          if (e.target.checked) next.add(action.id); else next.delete(action.id);
                          setSelectedOpps(next);
                        }}
                      />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 16 }}>{ACTION_TYPE_ICONS[action.type] || "▸"}</span>
                        <span style={{ fontSize: 11, color: CHANNEL_COLORS[action.channel] || "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>{action.channel}</span>
                        <span style={{ fontSize: 11, color: "#64748B" }}>{action.dueTime}</span>
                        {done && <span style={s.badge("#10B981")}>Done</span>}
                        {skipped && <span style={s.badge("#64748B")}>Skipped</span>}
                      </div>
                      {/* Critical reason — WHY this is critical */}
                      {action.criticalReason && action.priority === "critical" && !done && (
                        <div style={{ fontSize: 11, color: "#EF4444", fontWeight: 600, marginBottom: 4, background: "#EF444410", padding: "4px 8px", borderRadius: 4 }}>
                          ⚠ {action.criticalReason}
                        </div>
                      )}
                      <div style={{ fontSize: 14, fontWeight: 600, color: done ? "#64748B" : "#F1F5F9", textDecoration: done ? "line-through" : "none" }}>
                        {action.title}
                      </div>
                      <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{action.subtitle}</div>
                      {/* Context: what's happening */}
                      {action.context && !done && (
                        <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 6, lineHeight: 1.5, background: "#1E293B", padding: "6px 10px", borderRadius: 4 }}>
                          {action.context}
                        </div>
                      )}
                      {/* Action: what to do */}
                      {action.suggestedAction && !done && (
                        <div style={{ fontSize: 12, color: "#10B981", marginTop: 4, lineHeight: 1.5, background: "#10B98108", padding: "6px 10px", borderRadius: 4, borderLeft: "2px solid #10B98140" }}>
                          → {action.suggestedAction}
                        </div>
                      )}
                      {/* Show amount prominently if present */}
                      {action.amount > 0 && (
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#F1F5F9", marginTop: 4 }}>{fmt(action.amount)}</div>
                      )}
                    </div>
                    <span style={{ color: "#64748B", fontSize: 18, transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
                  </div>

                  {expanded && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #334155", animation: "fadeIn .2s" }} onClick={e => e.stopPropagation()}>

                      {/* Critical: prompt to auto-draft */}
                      {action.priority === "critical" && status === "pending" && (action.type === "email" || action.type === "follow-up") && (
                        <div style={{
                          background: "#8B5CF620", border: "1px solid #8B5CF640", borderRadius: 8, padding: "10px 14px",
                          marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}>
                          <span style={{ fontSize: 12, color: "#C4B5FD" }}>Critical priority — AI draft ready</span>
                          <button style={{ ...s.btn("#8B5CF6"), padding: "6px 14px" }} onClick={() => setShowEmailComposer({ action, mode: "ai" })}>
                            Draft & Review
                          </button>
                        </div>
                      )}

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
                          setShowEmailComposer({ action, mode: "manual" });
                        }}>Email</button>
                        <button style={s.btn("#8B5CF6")} onClick={() => {
                          setShowEmailComposer({ action, mode: "ai" });
                        }}>AI Email</button>
                        <button style={s.btn("#06B6D4")} onClick={() => setShowEADelegate(action)}>Delegate</button>
                        {action.id?.startsWith("opp-") && (
                          <>
                            <button style={s.btn("#F59E0B")} onClick={() => {
                              if (editingOpp === action.id) { setEditingOpp(null); } else {
                                const opp = displayOpps.find(o => o.id === action.id.replace("opp-", ""));
                                setOppEdits(opp ? { StageName: opp.stage || "", CloseDate: opp.closeDate || "", Amount: opp.amount || "", Group_Forecast_Category__c: opp.forecastCategory || "" } : {});
                                setEditingOpp(action.id);
                              }
                            }}>
                              {editingOpp === action.id ? "Close Edit" : "Update Opp"}
                            </button>
                            <button style={s.btn("#10B981")} onClick={() => setShowDealInspector({ oppId: action.id.replace("opp-", ""), oppName: action.title })}>
                              Inspect
                            </button>
                            <button style={s.btn("#8B5CF6")} onClick={() => setShowDealScore({ oppId: action.id.replace("opp-", ""), oppName: action.title })}>
                              Score
                            </button>
                          </>
                        )}
                        {action.type === "meeting" && (
                          <button style={s.btn("#06B6D4")} onClick={() => setShowPostMeeting({ id: action.id, subject: action.title, account: action.subtitle?.split("With:")[1]?.split(",")[0]?.trim() || action.subtitle })}>
                            Post-Meeting
                          </button>
                        )}
                        <button style={s.btn("#1E293B")} onClick={() => copyText(action.suggestedAction, "suggested action")}>Copy</button>
                      </div>

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
                                if (ok) { setEditingOpp(null); setOppEdits({}); markLiveAction(action.id, "done"); }
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

        {/* ── DASHBOARD VIEW ─────────────────────────────────── */}
        {view === "dashboard" && (
          <div>
            <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
              {[["forecast", "Revenue Forecast"], ["clients", "Client Health"]].map(([key, label]) => (
                <button key={key} style={{
                  padding: "6px 14px", borderRadius: 6, border: "1px solid #334155", cursor: "pointer",
                  fontSize: 12, fontWeight: 600,
                  background: (pipelineTab === key || (!["forecast", "clients"].includes(pipelineTab) && key === "forecast")) ? "#10B981" : "transparent",
                  color: (pipelineTab === key || (!["forecast", "clients"].includes(pipelineTab) && key === "forecast")) ? "#fff" : "#94A3B8",
                }} onClick={() => setPipelineTab(key)}>{label}</button>
              ))}
            </div>
            {(pipelineTab === "forecast" || !["forecast", "clients"].includes(pipelineTab)) && <RevenueForecast />}
            {pipelineTab === "clients" && <ClientHealth />}
          </div>
        )}

        {/* ── PIPELINE VIEW ─────────────────────────────────── */}
        {view === "pipeline" && (
          <div>
            {/* Sub-tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
              {[["opps", "Opportunities"], ["closedWon", "Closed Won"], ["activities", "Activities"], ["accounts", "Accounts"], ["leads", "Leads"]].map(([key, label]) => (
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={s.sectionTitle}>Open Opportunities — {fmt(pipelineTotal)} total pipeline</div>
                  <button style={s.btn("#334155")} onClick={() => setOppSortAsc(p => !p)}>
                    {oppSortAsc ? "Closest first ↑" : "Furthest first ↓"}
                  </button>
                </div>
                {/* Forecast category filter */}
                <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
                  {[
                    { key: "all", label: "All", color: "#10B981" },
                    { key: "Commit", label: "Commit", color: "#3B82F6" },
                    { key: "Best Case", label: "Best Case", color: "#F59E0B" },
                    { key: "Pipeline", label: "Pipeline", color: "#8B5CF6" },
                    { key: "Omitted", label: "Omitted", color: "#64748B" },
                    { key: "none", label: "No Category", color: "#64748B" },
                  ].map(f => {
                    const count = filteredOpps.filter(o =>
                      f.key === "all" ? true :
                      f.key === "none" ? (!o.forecastCategory || o.forecastCategory === "—") :
                      o.forecastCategory === f.key
                    ).length;
                    if (count === 0 && f.key !== "all") return null;
                    return (
                      <button key={f.key} style={{
                        padding: "5px 12px", borderRadius: 6, border: "1px solid #334155", cursor: "pointer",
                        fontSize: 11, fontWeight: 600,
                        background: (oppEdits.forecastFilter || "all") === f.key ? f.color : "transparent",
                        color: (oppEdits.forecastFilter || "all") === f.key ? "#fff" : "#94A3B8",
                      }} onClick={() => setOppEdits(d => ({ ...d, forecastFilter: f.key }))}>
                        {f.label} ({count})
                      </button>
                    );
                  })}
                  <span style={{ flex: 1 }} />
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
                    <button style={s.btn("#8B5CF6")} onClick={async () => {
                      const batch = [...selectedOpps].map(id => {
                        const opp = filteredOpps.find(o => o.id === id);
                        const current = opp?.closeDate && opp.closeDate !== "—" ? new Date(opp.closeDate) : new Date();
                        const pushed = new Date(current.getTime() + 14 * 86400000);
                        return { object: "Opportunity", id, fields: { CloseDate: pushed.toISOString().split("T")[0] } };
                      });
                      const results = await act.batchUpdate(batch);
                      if (results.length) { setSelectedOpps(new Set()); setBulkAction(null); window.location.reload(); }
                    }}>
                      Push Close +2 Weeks
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
                                fields: { StageName: "Closed Lost", Lost_Reason__c: "Other", Lost_Reason_Details__c: "Old" },
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

                {[...filteredOpps]
                  .filter(o => {
                    const f = oppEdits.forecastFilter || "all";
                    if (f === "all") return true;
                    if (f === "none") return !o.forecastCategory || o.forecastCategory === "—";
                    return o.forecastCategory === f;
                  })
                  .sort((a, b) => {
                    // Primary: forecast category (Commit > Best Case > Pipeline > Omitted > none)
                    const catOrder = { "Commit": 0, "Best Case": 1, "Closed": 2, "Pipeline": 3, "Omitted": 4 };
                    const ca = catOrder[a.forecastCategory] ?? 5;
                    const cb = catOrder[b.forecastCategory] ?? 5;
                    if (ca !== cb) return ca - cb;
                    // Secondary: close date
                    const da = a.closeDate && a.closeDate !== "—" ? new Date(a.closeDate) : new Date("2099-01-01");
                    const db = b.closeDate && b.closeDate !== "—" ? new Date(b.closeDate) : new Date("2099-01-01");
                    return oppSortAsc ? da - db : db - da;
                  }).map(opp => (
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
                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                      <button style={s.btn("#1E293B")} onClick={() => copyText(`${opp.name}\nAmount: ${fmt(opp.amount)}\nStage: ${opp.stage}\nNext step: ${opp.nextStep}`, "opp details")}>Copy</button>
                      <button style={s.btn("#3B82F6")} onClick={() => setShowEmailComposer({ action: { id: `opp-${opp.id}`, title: opp.name, subtitle: `${opp.account} · ${opp.stage}`, contact: opp.contact, suggestedAction: `Follow up on ${opp.name}` }, mode: "ai" })}>AI Email</button>
                      <button style={s.btn("#10B981")} onClick={() => setShowDealInspector({ oppId: opp.id, oppName: opp.name })}>Inspect</button>
                      <button style={s.btn("#8B5CF6")} onClick={() => setShowDealScore({ oppId: opp.id, oppName: opp.name })}>Score</button>
                      <button style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: "linear-gradient(135deg, #8B5CF6, #EC4899)", color: "#fff" }} onClick={() => setShowDeepIntel({ oppId: opp.id, oppName: opp.name, accountName: opp.account })}>Deep Intel</button>
                      <button style={s.btn("#F59E0B")} onClick={() => setShowRelMap({ accountId: null, accountName: opp.account })}>Relationships</button>
                      <button style={s.btn("#06B6D4")} onClick={() => setShowMissingContacts({ oppId: opp.id, accountName: opp.account })}>+ Contacts</button>
                      <button style={s.btn("#334155")} onClick={() => setShowAccount360({ accountName: opp.account })}>Account</button>
                      <button style={s.btn("#06B6D4")} onClick={() => setShowEADelegate({ id: `opp-${opp.id}`, title: opp.name, subtitle: `${opp.account} · ${opp.stage} · ${fmt(opp.amount)}`, suggestedAction: `Follow up on ${opp.name}. Next step: ${opp.nextStep}` })}>Delegate</button>
                      {liveOpps && (
                        <button style={s.btn("#F59E0B")} onClick={() => {
                          if (editingOpp === opp.id) { setEditingOpp(null); } else {
                            setOppEdits({ StageName: opp.stage || "", CloseDate: opp.closeDate || "", Amount: opp.amount || "", NextStep: opp.nextStep || "", Group_Forecast_Category__c: opp.forecastCategory || "" });
                            setEditingOpp(opp.id);
                          }
                        }}>
                          {editingOpp === opp.id ? "Close" : "Edit"}
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
            {/* Closed Won */}
            {pipelineTab === "closedWon" && (
              <div>
                <div style={s.sectionTitle}>
                  Closed Won This Quarter — {closedWonOpps ? fmt(closedWonOpps.reduce((sum, o) => sum + (o.amount || 0), 0)) : "..."} ({closedWonOpps?.length || 0} deals)
                </div>
                {!closedWonOpps && <div style={{ color: "#64748B", textAlign: "center", padding: 40 }}>Connect Salesforce to view closed won deals</div>}
                {closedWonOpps?.map(opp => (
                  <div key={opp.id} className="card-hover" style={{ ...s.card, borderLeft: "3px solid #10B981" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9" }}>{opp.name}</div>
                        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{opp.account} · {opp.source}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#10B981" }}>{fmt(opp.amount)}</div>
                        <div style={{ fontSize: 11, color: "#64748B" }}>Closed {opp.closeDate}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
        <kbd style={{ background: "#1E293B", padding: "2px 6px", borderRadius: 3, fontSize: 11 }}>1</kbd> Actions{" "}
        <kbd style={{ background: "#1E293B", padding: "2px 6px", borderRadius: 3, fontSize: 11 }}>2</kbd> Dashboard{" "}
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

      {/* ── Feature Modals/Panels ─────────────────────────────── */}
      {showEmailComposer && (
        <EmailComposer
          action={showEmailComposer.action}
          mode={showEmailComposer.mode}
          sendEmail={async (data) => {
            const ok = await act.sendEmail(data);
            if (ok) {
              setShowEmailComposer(null);
              const actionId = showEmailComposer.action?.id;
              if (actionId) markLiveAction(actionId, "done");
            }
            return ok;
          }}
          onSend={() => setShowEmailComposer(null)}
          onClose={() => setShowEmailComposer(null)}
          setToast={setToast}
        />
      )}

      {showDealInspector && (
        <DealInspector
          oppId={showDealInspector.oppId}
          oppName={showDealInspector.oppName}
          onClose={() => setShowDealInspector(null)}
        />
      )}

      {showDailyBrief && (
        <DailyBrief
          onClose={() => setShowDailyBrief(false)}
          onStart={() => { setShowDailyBrief(false); setView("actions"); setActionQueue("external"); setOppEdits(d => ({ ...d, priorityFilter: "critical" })); }}
          onScoreDeal={(d) => { setShowDailyBrief(false); setShowDealScore(d); }}
          onEmailDeal={(action) => { setShowDailyBrief(false); setShowEmailComposer({ action, mode: "ai" }); }}
          onDelegateDeal={(action) => { setShowDailyBrief(false); setShowEADelegate(action); }}
          onInspectDeal={(d) => { setShowDailyBrief(false); setShowDealInspector(d); }}
        />
      )}

      {showEADelegate && (
        <EADelegate
          action={showEADelegate}
          onClose={() => setShowEADelegate(null)}
          onDelegated={(action) => markLiveAction(action?.id || action, "done")}
          setToast={setToast}
        />
      )}

      {showWeeklyDigest && (
        <WeeklyDigest onClose={() => setShowWeeklyDigest(false)} />
      )}

      {showPipelineDetail && (
        <PipelineDetail
          onClose={() => setShowPipelineDetail(false)}
          onEditOpp={(id) => { setShowPipelineDetail(false); setView("pipeline"); setPipelineTab("opps"); setTimeout(() => { setEditingOpp(id); const opp = displayOpps.find(o => o.id === id); if (opp) setOppEdits({ StageName: opp.stage || "", CloseDate: opp.closeDate || "", Amount: opp.amount || "", Group_Forecast_Category__c: opp.forecastCategory || "" }); }, 100); }}
          onInspectOpp={(data) => { setShowPipelineDetail(false); setShowDealInspector(data); }}
        />
      )}

      {showAccount360 && (
        <Account360 accountId={showAccount360.accountId} accountName={showAccount360.accountName} onClose={() => setShowAccount360(null)}
          onScoreDeal={(d) => { setShowAccount360(null); setShowDealScore(d); }}
          onEmailDeal={(a) => { setShowAccount360(null); setShowEmailComposer({ action: a, mode: "ai" }); }}
          onDeepIntel={(d) => { setShowAccount360(null); setShowDeepIntel(d); }}
        />
      )}

      {showGlobalSearch && (
        <GlobalSearch onClose={() => setShowGlobalSearch(false)} onNavigate={(item) => {
          setShowGlobalSearch(false);
          if (item.type === "opportunity") { setView("pipeline"); setPipelineTab("opps"); }
          else if (item.type === "contact" || item.type === "lead") { setView("pipeline"); setPipelineTab("leads"); }
          else if (item.type === "account") { setShowAccount360({ accountName: item.name }); }
        }} />
      )}

      {showShortcuts && <KeyboardShortcuts onClose={() => setShowShortcuts(false)} />}

      {showMissingContacts && (
        <MissingContacts oppId={showMissingContacts.oppId} accountId={showMissingContacts.accountId} accountName={showMissingContacts.accountName} onClose={() => setShowMissingContacts(null)} />
      )}

      {showDeepIntel && (
        <DeepDealIntel oppId={showDeepIntel.oppId} oppName={showDeepIntel.oppName} accountName={showDeepIntel.accountName} onClose={() => setShowDeepIntel(null)} />
      )}

      {showDealScore && (
        <DealScore oppId={showDealScore.oppId} oppName={showDealScore.oppName} onClose={() => setShowDealScore(null)} />
      )}

      {showPostMeeting && (
        <PostMeeting event={showPostMeeting} onClose={() => setShowPostMeeting(null)}
          onSendEmail={async (data) => { const ok = await act.sendEmail(data); if (ok) setShowPostMeeting(null); }}
          onUpdateSFDC={async (fields) => {
            const oppId = showPostMeeting.oppId;
            if (oppId) { await act.updateSFDC("Opportunity", oppId, fields); setShowPostMeeting(null); }
          }}
        />
      )}

      {showCashFlow && <CashFlow onClose={() => setShowCashFlow(false)} onScoreDeal={(d) => { setShowCashFlow(false); setShowDealScore(d); }} onInspectDeal={(d) => { setShowCashFlow(false); setShowDealInspector(d); }} onDeepIntel={(d) => { setShowCashFlow(false); setShowDeepIntel(d); }} />}
      {showExpansion && <ExpansionSignals onClose={() => setShowExpansion(false)} />}
      {showRelMap && <RelationshipMap accountId={showRelMap.accountId} accountName={showRelMap.accountName} onClose={() => setShowRelMap(null)} />}
      {showWinLoss && <WinLossPatterns onClose={() => setShowWinLoss(false)} />}
      {showBoardReport && <BoardReport onClose={() => setShowBoardReport(false)} />}

      {/* New Task Modal */}
      {showNewTask && (
        <NewTaskModal
          onClose={() => setShowNewTask(false)}
          onCreate={(task) => {
            setCustomActions(prev => [...prev, task]);
            setShowNewTask(false);
            setToast("Task added");
          }}
        />
      )}
    </div>
  );
}

function NewTaskModal({ onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [contact, setContact] = useState("");
  const [company, setCompany] = useState("");
  const [details, setDetails] = useState("");
  const [priority, setPriority] = useState("high");
  const [queue, setQueue] = useState("external");
  const [type, setType] = useState("follow-up");

  const handleCreate = () => {
    if (!title.trim()) return;
    onCreate({
      id: `custom-${Date.now()}`,
      type,
      priority,
      queue,
      title: title.trim(),
      subtitle: [contact, company].filter(Boolean).join(" · ") || "—",
      contact: contact || "—",
      company: company || "—",
      channel: type === "follow-up" ? "email" : type === "call" ? "phone" : type,
      dueTime: "Today",
      suggestedAction: details || title,
    });
  };

  const btn = (bg) => ({
    padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer",
    fontSize: 13, fontWeight: 600, background: bg, color: "#fff",
  });
  const input = {
    width: "100%", background: "#1E293B", border: "1px solid #334155", borderRadius: 6,
    padding: "10px 12px", color: "#E2E8F0", fontSize: 13, marginBottom: 8, boxSizing: "border-box",
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000,
    }} onClick={onClose}>
      <div style={{
        background: "#0F172A", borderRadius: 12, padding: 24, width: 500, maxWidth: "90vw",
        border: "1px solid #334155", boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>New Task</div>
          <button style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 18 }} onClick={onClose}>x</button>
        </div>

        <input style={input} placeholder="Task title *" value={title} onChange={e => setTitle(e.target.value)} autoFocus />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input style={{ ...input, marginBottom: 0 }} placeholder="Contact name" value={contact} onChange={e => setContact(e.target.value)} />
          <input style={{ ...input, marginBottom: 0 }} placeholder="Company" value={company} onChange={e => setCompany(e.target.value)} />
        </div>

        <textarea style={{ ...input, minHeight: 80, resize: "vertical" }} placeholder="Details / context..." value={details} onChange={e => setDetails(e.target.value)} />

        {/* Queue */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>Queue</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[["external", "External", "#10B981"], ["internal", "Internal", "#3B82F6"]].map(([k, l, c]) => (
              <button key={k} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #334155", cursor: "pointer", fontSize: 12, fontWeight: 600, background: queue === k ? c : "transparent", color: queue === k ? "#fff" : "#94A3B8" }}
                onClick={() => setQueue(k)}>{l}</button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>Priority</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[["critical", "#EF4444"], ["high", "#F59E0B"], ["medium", "#3B82F6"], ["low", "#64748B"]].map(([k, c]) => (
              <button key={k} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #334155", cursor: "pointer", fontSize: 12, fontWeight: 600, textTransform: "capitalize", background: priority === k ? c : "transparent", color: priority === k ? "#fff" : "#94A3B8" }}
                onClick={() => setPriority(k)}>{k}</button>
            ))}
          </div>
        </div>

        {/* Type */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600 }}>Type</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[["follow-up", "Follow-up"], ["email", "Email"], ["call", "Call"], ["meeting", "Meeting"], ["admin", "Admin"]].map(([k, l]) => (
              <button key={k} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #334155", cursor: "pointer", fontSize: 12, fontWeight: 600, background: type === k ? "#334155" : "transparent", color: type === k ? "#F1F5F9" : "#94A3B8" }}
                onClick={() => setType(k)}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...btn("#10B981"), opacity: !title.trim() ? 0.5 : 1 }} disabled={!title.trim()} onClick={handleCreate}>Create Task</button>
          <button style={btn("#334155")} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
