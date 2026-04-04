// Proactive Suggestions Engine — generates time/context/event-based action suggestions
// Inspired by JourneyAI suggestion model with recency decay scoring
import { getAccessToken } from "./google-auth.js";

// Recency decay: score = e^(-days / decay_days)
const recencyScore = (daysOld, decayDays = 14) => Math.exp(-daysOld / decayDays);

// Hybrid score combining multiple signals
const hybridScore = (urgency, value, recency, engagement) => {
  const weights = { urgency: 0.35, value: 0.25, recency: 0.25, engagement: 0.15 };
  return weights.urgency * urgency + weights.value * value + weights.recency * recency + weights.engagement * engagement;
};

export default async (req) => {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    if (!sfdcMatch) return Response.json({ error: "SFDC not connected" }, { status: 401 });

    const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const sfdcQuery = async (soql) => {
      const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!res.ok) return [];
      return (await res.json()).records || [];
    };

    const suggestions = [];

    // Pull all open opps
    const opps = await sfdcQuery(`SELECT Id, Name, Account.Name, Amount, StageName, CloseDate, LastActivityDate, CreatedDate, Group_Forecast_Category__c, NextStep, Probability FROM Opportunity WHERE IsClosed = false ORDER BY Amount DESC`);

    // ── TIME-BASED: Deals closing soon ──────────────────────
    opps.forEach(o => {
      const daysToClose = o.CloseDate ? Math.floor((new Date(o.CloseDate) - now) / 86400000) : 999;
      const amount = o.Amount || 0;
      const daysSinceActivity = o.LastActivityDate ? Math.floor((now - new Date(o.LastActivityDate)) / 86400000) : 999;

      // Closing within 7 days
      if (daysToClose >= 0 && daysToClose <= 7 && amount > 0) {
        const urgencyNorm = Math.max(0, 1 - daysToClose / 7);
        const valueNorm = Math.min(amount / 100000, 1);
        const score = hybridScore(urgencyNorm, valueNorm, recencyScore(daysSinceActivity), daysSinceActivity < 7 ? 0.8 : 0.3);
        suggestions.push({
          id: `close-soon-${o.Id}`,
          type: "time_based",
          trigger: "close_date_approaching",
          priority: daysToClose <= 2 ? "urgent" : "high",
          score: Math.round(score * 100),
          title: `${o.Name} closes in ${daysToClose === 0 ? "today" : daysToClose + "d"}`,
          description: `${o.Account?.Name || "—"} · ${o.StageName} · $${amount.toLocaleString()}`,
          action: daysToClose <= 2 ? "Confirm this will close or push the date. Contact the decision maker today." : "Review deal status. Is the close date realistic? Schedule a check-in.",
          oppId: o.Id, amount, daysToClose,
          actionType: "review_deal",
        });
      }

      // Past due
      if (daysToClose < 0 && amount > 0) {
        const daysOverdue = Math.abs(daysToClose);
        const score = hybridScore(1, Math.min(amount / 100000, 1), recencyScore(daysOverdue, 30), 0.2);
        suggestions.push({
          id: `past-due-${o.Id}`,
          type: "time_based",
          trigger: "close_date_passed",
          priority: daysOverdue > 14 ? "urgent" : "high",
          score: Math.round(score * 100),
          title: `${o.Name} is ${daysOverdue}d past due`,
          description: `${o.Account?.Name || "—"} · $${amount.toLocaleString()} · Close was ${o.CloseDate}`,
          action: daysOverdue > 30 ? "Close lost or update the date. This deal is aging your pipeline." : "Push close date or get a commitment. Don't let this drift.",
          oppId: o.Id, amount, daysOverdue,
          actionType: "update_deal",
        });
      }
    });

    // ── CONTEXT-BASED: Stalled deals ────────────────────────
    opps.forEach(o => {
      const daysSinceActivity = o.LastActivityDate ? Math.floor((now - new Date(o.LastActivityDate)) / 86400000) : 999;
      const amount = o.Amount || 0;
      const daysInPipeline = o.CreatedDate ? Math.floor((now - new Date(o.CreatedDate)) / 86400000) : 0;

      if (daysSinceActivity >= 10 && amount > 0) {
        const score = hybridScore(Math.min(daysSinceActivity / 30, 1), Math.min(amount / 100000, 1), recencyScore(daysSinceActivity, 21), 0.1);
        suggestions.push({
          id: `stalled-${o.Id}`,
          type: "context_based",
          trigger: "deal_stalled",
          priority: daysSinceActivity >= 21 ? "urgent" : daysSinceActivity >= 14 ? "high" : "medium",
          score: Math.round(score * 100),
          title: `No activity on ${o.Name} in ${daysSinceActivity}d`,
          description: `${o.Account?.Name || "—"} · ${o.StageName} · $${amount.toLocaleString()} · ${daysInPipeline}d in pipeline`,
          action: daysSinceActivity >= 21 ? "This deal is going cold. Send a breakup email or re-engage with a new angle." : "Schedule a touch — call, email, or meeting. Don't let momentum die.",
          oppId: o.Id, amount, daysSinceActivity,
          actionType: "follow_up",
        });
      }
    });

    // ── PATTERN-BASED: High-value deals without next steps ──
    opps.forEach(o => {
      const amount = o.Amount || 0;
      if (amount >= 25000 && (!o.NextStep || o.NextStep.trim() === "")) {
        const score = hybridScore(0.7, Math.min(amount / 100000, 1), 0.5, 0.3);
        suggestions.push({
          id: `no-nextstep-${o.Id}`,
          type: "pattern_based",
          trigger: "missing_next_step",
          priority: amount >= 50000 ? "high" : "medium",
          score: Math.round(score * 100),
          title: `${o.Name} has no next step defined`,
          description: `${o.Account?.Name || "—"} · $${amount.toLocaleString()} · ${o.StageName}`,
          action: "Define a concrete next step with a date. Deals without next steps stall 3x more often.",
          oppId: o.Id, amount,
          actionType: "update_deal",
        });
      }
    });

    // ── PATTERN-BASED: Single-threaded deals ────────────────
    // Check contact roles
    for (const o of opps.filter(o => (o.Amount || 0) >= 20000).slice(0, 20)) {
      try {
        const roles = await sfdcQuery(`SELECT Id FROM OpportunityContactRole WHERE OpportunityId = '${o.Id}'`);
        if (roles.length <= 1) {
          const score = hybridScore(0.6, Math.min((o.Amount || 0) / 100000, 1), 0.5, 0.2);
          suggestions.push({
            id: `single-thread-${o.Id}`,
            type: "pattern_based",
            trigger: "single_threaded",
            priority: (o.Amount || 0) >= 50000 ? "high" : "medium",
            score: Math.round(score * 100),
            title: `${o.Name} is single-threaded (${roles.length} contact${roles.length !== 1 ? "s" : ""})`,
            description: `${o.Account?.Name || "—"} · $${(o.Amount || 0).toLocaleString()} · Need multi-threading`,
            action: "Add more contacts to this opportunity. Identify the economic buyer, champion, and technical evaluator.",
            oppId: o.Id, amount: o.Amount || 0,
            actionType: "expand_contacts",
          });
        }
      } catch {}
    }

    // ── EVENT-BASED: Calendar meetings today ────────────────
    try {
      const gtoken = await getAccessToken();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const calRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(todayStart)}&timeMax=${encodeURIComponent(todayEnd)}&maxResults=20&singleEvents=true&orderBy=startTime`, { headers: { Authorization: `Bearer ${gtoken}` } });
      const calData = await calRes.json();

      (calData.items || []).forEach(event => {
        const summary = event.summary || "";
        const start = event.start?.dateTime || event.start?.date || "";
        const timeStr = event.start?.dateTime ? new Date(event.start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "";
        const attendees = (event.attendees || []).filter(a => !a.self);
        const externalCount = attendees.filter(a => !(a.email || "").includes("skaled.com")).length;

        if (externalCount > 0) {
          suggestions.push({
            id: `meeting-${event.id}`,
            type: "event_based",
            trigger: "meeting_today",
            priority: "high",
            score: 85,
            title: `Meeting: ${summary} at ${timeStr}`,
            description: `${externalCount} external attendee${externalCount > 1 ? "s" : ""}: ${attendees.slice(0, 3).map(a => a.displayName || a.email).join(", ")}`,
            action: "Prep for this meeting. Review recent context, define your ask, and set an agenda.",
            eventId: event.id,
            actionType: "prep_meeting",
          });
        }
      });
    } catch {}

    // Sort by score descending, then priority
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    suggestions.sort((a, b) => {
      const pDiff = (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
      if (pDiff !== 0) return pDiff;
      return (b.score || 0) - (a.score || 0);
    });

    return Response.json({
      suggestions: suggestions.slice(0, 25),
      counts: {
        total: suggestions.length,
        urgent: suggestions.filter(s => s.priority === "urgent").length,
        high: suggestions.filter(s => s.priority === "high").length,
        medium: suggestions.filter(s => s.priority === "medium").length,
      },
      generated: now.toISOString(),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/proactive-suggestions" };
