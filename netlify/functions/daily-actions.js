// Generates daily action items from Gmail, Calendar, and SFDC
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  try {
    const token = await getAccessToken();
    const actions = { external: [], internal: [] };

    // ── 1. Calendar: today + next 2 days ─────────────────────
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const threeDays = new Date(now.getTime() + 3 * 86400000).toISOString();

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(todayStart)}&timeMax=${encodeURIComponent(threeDays)}` +
      `&maxResults=50&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const calData = await calRes.json();

    (calData.items || []).forEach(event => {
      const subject = event.summary || "";
      const subjectLower = subject.toLowerCase();

      // Skip personal blocks
      if (subjectLower.includes("lunch") || subjectLower.includes("block") ||
          subjectLower.includes("focus time") || subjectLower.includes("ooo") ||
          subjectLower.includes("out of office") || subjectLower.includes("reminder")) return;

      const start = event.start?.dateTime || event.start?.date || "";
      const dateStr = start ? start.split("T")[0] : "—";
      const timeStr = event.start?.dateTime
        ? new Date(event.start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        : "All day";

      const attendees = (event.attendees || [])
        .filter(a => !a.self)
        .map(a => ({ name: a.displayName || a.email, email: a.email || "", internal: (a.email || "").includes("skaled.com") }));

      const externalAttendees = attendees.filter(a => !a.internal);
      const isToday = dateStr === now.toISOString().split("T")[0];
      const isTomorrow = dateStr === new Date(now.getTime() + 86400000).toISOString().split("T")[0];
      const dayLabel = isToday ? "Today" : isTomorrow ? "Tomorrow" : dateStr;

      // Determine if internal (all skaled attendees or internal keywords) vs external
      const isInternal = externalAttendees.length === 0 ||
        subjectLower.includes("l10") || subjectLower.includes("1:1") ||
        subjectLower.includes("all-hands") || subjectLower.includes("internal") ||
        subjectLower.includes("staffing");

      const action = {
        id: `cal-${event.id}`,
        type: "meeting",
        priority: isToday ? "critical" : isTomorrow ? "high" : "medium",
        title: `${dayLabel} ${timeStr} — ${subject}`,
        subtitle: externalAttendees.length > 0
          ? `With: ${externalAttendees.map(a => a.name).join(", ")}`
          : attendees.length > 0
            ? `With: ${attendees.map(a => a.name).join(", ")}`
            : "No attendees listed",
        channel: "calendar",
        dueTime: `${dayLabel} ${timeStr}`,
        suggestedAction: isToday
          ? `Prep for this meeting. Review recent context and talking points.`
          : `Coming up ${dayLabel.toLowerCase()}. Block prep time if needed.`,
      };

      if (isInternal) {
        actions.internal.push(action);
      } else {
        actions.external.push(action);
      }
    });

    // ── 2. Gmail: unanswered inbound (last 7 days) ───────────
    const inboxRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30&q=in:inbox is:unread newer_than:7d -from:skaled.com -category:promotions -category:social -category:updates -category:forums`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const inboxData = await inboxRes.json();

    const msgDetails = await Promise.all(
      (inboxData.messages || []).slice(0, 20).map(async m => {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return null;
        const msg = await res.json();
        const headers = {};
        (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });
        return { id: m.id, ...headers };
      })
    );

    msgDetails.filter(Boolean).forEach(msg => {
      const from = msg.from || "";
      const nameMatch = from.match(/^([^<]+)/);
      const contactName = nameMatch ? nameMatch[1].trim().replace(/"/g, "") : from;
      const emailAddr = from.toLowerCase();

      // Skip automated/noreply
      if (emailAddr.includes("noreply") || emailAddr.includes("no-reply") ||
          emailAddr.includes("notifications") || emailAddr.includes("mailer-daemon")) return;

      const dateStr = msg.date ? new Date(msg.date).toISOString().split("T")[0] : "—";
      const isToday = dateStr === now.toISOString().split("T")[0];

      const action = {
        id: `gmail-${msg.id}`,
        type: "email",
        priority: isToday ? "high" : "medium",
        title: `Reply to ${contactName}`,
        subtitle: msg.subject || "No subject",
        channel: "email",
        dueTime: isToday ? "Today" : dateStr,
        suggestedAction: `Unread email from ${contactName}: "${msg.subject}". Review and respond.`,
        contact: contactName,
      };

      // Simple heuristic: known client domains = internal, otherwise external
      // For now, treat all external emails as external actions
      actions.external.push(action);
    });

    // ── 3. SFDC: stalled opps + new leads ────────────────────
    // Parse SFDC tokens from cookie
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);

    if (sfdcMatch) {
      let tokens;
      try { tokens = JSON.parse(decodeURIComponent(sfdcMatch[1])); } catch { tokens = null; }

      if (tokens) {
        const sfdcQuery = async (soql) => {
          const res = await fetch(
            `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`,
            { headers: { Authorization: `Bearer ${tokens.access_token}` } }
          );
          if (!res.ok) return [];
          const data = await res.json();
          return data.records || [];
        };

        // Stalled/upcoming opps
        const opps = await sfdcQuery(
          `SELECT Id, Name, Account.Name, Amount, StageName, CloseDate, LastActivityDate FROM Opportunity WHERE IsClosed = false ORDER BY CloseDate ASC LIMIT 20`
        );

        opps.forEach(o => {
          const daysSinceActivity = o.LastActivityDate
            ? Math.floor((now.getTime() - new Date(o.LastActivityDate).getTime()) / 86400000)
            : 999;
          const daysToClose = o.CloseDate
            ? Math.floor((new Date(o.CloseDate).getTime() - now.getTime()) / 86400000)
            : 999;

          // Only surface opps that need attention
          if (daysSinceActivity < 7 && daysToClose > 14) return;

          let priority = "medium";
          let suggestion = "";
          if (daysToClose <= 7) {
            priority = "critical";
            suggestion = `Close date in ${daysToClose} days. Confirm status and next steps.`;
          } else if (daysSinceActivity >= 14) {
            priority = "high";
            suggestion = `No activity in ${daysSinceActivity} days. Re-engage or update pipeline.`;
          } else {
            suggestion = `Close date: ${o.CloseDate}. Review and advance.`;
          }

          actions.external.push({
            id: `opp-${o.Id}`,
            type: "follow-up",
            priority,
            title: `${o.Name}`,
            subtitle: `${o.Account?.Name || "—"} · ${o.StageName} · ${o.Amount ? "$" + o.Amount.toLocaleString() : "No amount"}`,
            channel: "salesforce",
            dueTime: daysToClose <= 7 ? `Closes in ${daysToClose}d` : `${daysSinceActivity}d since activity`,
            suggestedAction: suggestion,
          });
        });

        // New leads
        const leads = await sfdcQuery(
          `SELECT Id, Name, Company, Title, Status, CreatedDate FROM Lead WHERE IsConverted = false AND Status = 'New' ORDER BY CreatedDate DESC LIMIT 10`
        );

        leads.forEach(l => {
          const daysOld = l.CreatedDate
            ? Math.floor((now.getTime() - new Date(l.CreatedDate).getTime()) / 86400000)
            : 0;

          actions.external.push({
            id: `lead-${l.Id}`,
            type: "follow-up",
            priority: daysOld <= 1 ? "high" : "medium",
            title: `New lead: ${l.Name}`,
            subtitle: `${l.Company || "—"} · ${l.Title || "—"}`,
            channel: "salesforce",
            dueTime: daysOld <= 1 ? "New today" : `${daysOld}d old`,
            suggestedAction: `New lead from ${l.Company || "unknown"}. Research and qualify.`,
          });
        });
      }
    }

    // Sort each queue by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sortByPriority = (a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
    actions.external.sort(sortByPriority);
    actions.internal.sort(sortByPriority);

    return Response.json(actions);
  } catch (e) {
    return Response.json({ error: e.message, external: [], internal: [] }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/daily-actions" };
