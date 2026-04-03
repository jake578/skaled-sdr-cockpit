// Generates daily action items from Gmail, Calendar, and SFDC
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  try {
    const token = await getAccessToken();
    const actions = { external: [], internal: [], sfdcCleanup: [], dealsAtRisk: [] };

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
        ? new Date(event.start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
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

        // ── 4. SFDC Cleanup: past due close dates + closing next week ──
        const todayStr = now.toISOString().split("T")[0];
        const nextWeekStr = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];

        const pastDueOpps = await sfdcQuery(
          `SELECT Id, Name, Account.Name, Amount, StageName, CloseDate, Group_Forecast_Category__c FROM Opportunity WHERE IsClosed = false AND (NOT StageName LIKE 'Closed%') AND CloseDate < ${todayStr} ORDER BY CloseDate ASC LIMIT 50`
        );

        pastDueOpps.forEach(o => {
          const daysOverdue = Math.floor((now.getTime() - new Date(o.CloseDate).getTime()) / 86400000);
          actions.sfdcCleanup.push({
            id: `opp-${o.Id}`,
            type: "follow-up",
            priority: daysOverdue > 30 ? "critical" : daysOverdue > 14 ? "high" : "medium",
            title: `${o.Name}`,
            subtitle: `${o.Account?.Name || "—"} · ${o.StageName} · ${o.Amount ? "$" + o.Amount.toLocaleString() : "No amount"} · ${o.Group_Forecast_Category__c || "—"}`,
            channel: "salesforce",
            dueTime: `${daysOverdue}d overdue`,
            closeDate: o.CloseDate,
            daysOverdue,
            suggestedAction: `Close date was ${o.CloseDate} (${daysOverdue} days ago). Update close date, close lost, or advance the deal.`,
            tag: "past-due",
          });
        });

        const closingNextWeek = await sfdcQuery(
          `SELECT Id, Name, Account.Name, Amount, StageName, CloseDate, Group_Forecast_Category__c FROM Opportunity WHERE IsClosed = false AND (NOT StageName LIKE 'Closed%') AND CloseDate >= ${todayStr} AND CloseDate <= ${nextWeekStr} ORDER BY CloseDate ASC LIMIT 20`
        );

        closingNextWeek.forEach(o => {
          const daysToClose = Math.floor((new Date(o.CloseDate).getTime() - now.getTime()) / 86400000);
          actions.sfdcCleanup.push({
            id: `opp-${o.Id}`,
            type: "follow-up",
            priority: daysToClose <= 2 ? "critical" : "high",
            title: `${o.Name}`,
            subtitle: `${o.Account?.Name || "—"} · ${o.StageName} · ${o.Amount ? "$" + o.Amount.toLocaleString() : "No amount"} · ${o.Group_Forecast_Category__c || "—"}`,
            channel: "salesforce",
            dueTime: daysToClose === 0 ? "Closes today" : `Closes in ${daysToClose}d`,
            closeDate: o.CloseDate,
            daysOverdue: -daysToClose,
            suggestedAction: `Closing ${daysToClose === 0 ? "today" : `in ${daysToClose} days`}. Confirm this will close or push the date.`,
            tag: "closing-soon",
          });
        });

        // Sort cleanup: past due first (most overdue at top), then closing soon
        actions.sfdcCleanup.sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0));

        // ── 5. Deals at Risk: close date moved 2+ times or no activity in 10+ days ──
        // Cross-reference Gmail, Calendar, Chorus for real last activity per account

        const allOpenOpps = await sfdcQuery(
          `SELECT Id, Name, Account.Name, Amount, StageName, CloseDate, LastActivityDate, Group_Forecast_Category__c FROM Opportunity WHERE IsClosed = false ORDER BY CloseDate ASC LIMIT 100`
        );

        // Build account name → last real activity date map from Gmail + Calendar + Chorus
        const accountLastTouch = {}; // accountName (lowercase) → date string

        // Gmail: search sent emails mentioning account/company names (last 30 days)
        try {
          const gtoken = await getAccessToken();
          const sentRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=in:sent newer_than:30d`,
            { headers: { Authorization: `Bearer ${gtoken}` } }
          );
          const sentData = await sentRes.json();
          if (sentData.messages?.length) {
            const emailDetails = await Promise.all(
              sentData.messages.slice(0, 60).map(async m => {
                const res = await fetch(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=To&metadataHeaders=Date&metadataHeaders=Subject`,
                  { headers: { Authorization: `Bearer ${gtoken}` } }
                );
                if (!res.ok) return null;
                const msg = await res.json();
                const headers = {};
                (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });
                return headers;
              })
            );
            emailDetails.filter(Boolean).forEach(e => {
              const dateStr = e.date ? new Date(e.date).toISOString().split("T")[0] : null;
              if (!dateStr) return;
              const to = (e.to || "").toLowerCase();
              const subject = (e.subject || "").toLowerCase();
              // Match against account names
              allOpenOpps.forEach(o => {
                const acctName = (o.Account?.Name || "").toLowerCase();
                if (acctName && acctName.length > 2 && (to.includes(acctName) || subject.includes(acctName))) {
                  if (!accountLastTouch[acctName] || dateStr > accountLastTouch[acctName]) {
                    accountLastTouch[acctName] = dateStr;
                  }
                }
              });
            });
          }
        } catch { /* Gmail unavailable */ }

        // Calendar: check meetings with account names (last 30 days)
        try {
          const gtoken = await getAccessToken();
          const past30 = new Date(now.getTime() - 30 * 86400000).toISOString();
          const calRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
            `timeMin=${encodeURIComponent(past30)}&timeMax=${encodeURIComponent(now.toISOString())}` +
            `&maxResults=100&singleEvents=true&orderBy=startTime`,
            { headers: { Authorization: `Bearer ${gtoken}` } }
          );
          const calData = await calRes.json();
          (calData.items || []).forEach(event => {
            const summary = (event.summary || "").toLowerCase();
            const dateStr = (event.start?.dateTime || event.start?.date || "").split("T")[0];
            if (!dateStr) return;
            allOpenOpps.forEach(o => {
              const acctName = (o.Account?.Name || "").toLowerCase();
              if (acctName && acctName.length > 2 && summary.includes(acctName)) {
                if (!accountLastTouch[acctName] || dateStr > accountLastTouch[acctName]) {
                  accountLastTouch[acctName] = dateStr;
                }
              }
            });
            // Also check attendee emails/names
            (event.attendees || []).forEach(a => {
              const attendee = ((a.displayName || "") + " " + (a.email || "")).toLowerCase();
              allOpenOpps.forEach(o => {
                const acctName = (o.Account?.Name || "").toLowerCase();
                if (acctName && acctName.length > 2 && attendee.includes(acctName)) {
                  if (!accountLastTouch[acctName] || dateStr > accountLastTouch[acctName]) {
                    accountLastTouch[acctName] = dateStr;
                  }
                }
              });
            });
          });
        } catch { /* Calendar unavailable */ }

        // Chorus calls (from SFDC Events)
        try {
          const chorusEvents = await sfdcQuery(
            `SELECT Subject, What.Name, StartDateTime FROM Event WHERE Subject LIKE 'Chorus%' AND StartDateTime >= LAST_N_DAYS:30 ORDER BY StartDateTime DESC LIMIT 100`
          );
          chorusEvents.forEach(e => {
            const dateStr = (e.StartDateTime || "").split("T")[0];
            const whatName = (e.What?.Name || "").toLowerCase();
            if (!dateStr) return;
            allOpenOpps.forEach(o => {
              const acctName = (o.Account?.Name || "").toLowerCase();
              if (acctName && acctName.length > 2 && whatName.includes(acctName)) {
                if (!accountLastTouch[acctName] || dateStr > accountLastTouch[acctName]) {
                  accountLastTouch[acctName] = dateStr;
                }
              }
            });
          });
        } catch { /* Chorus unavailable */ }

        // Check close date change history
        let closeDateChanges = {};
        try {
          const historyRecords = await sfdcQuery(
            `SELECT OpportunityId, OldValue, NewValue FROM OpportunityFieldHistory WHERE Field = 'CloseDate' AND CreatedDate >= LAST_N_DAYS:180`
          );
          historyRecords.forEach(h => {
            closeDateChanges[h.OpportunityId] = (closeDateChanges[h.OpportunityId] || 0) + 1;
          });
        } catch { /* Field history tracking might not be enabled */ }

        allOpenOpps.forEach(o => {
          const acctName = (o.Account?.Name || "").toLowerCase();

          // Real last activity: best of SFDC LastActivityDate vs Gmail/Calendar/Chorus
          const sfdcDate = o.LastActivityDate || null;
          const realDate = accountLastTouch[acctName] || null;
          const bestDate = [sfdcDate, realDate].filter(Boolean).sort().pop(); // latest of the two

          const daysSinceActivity = bestDate
            ? Math.floor((now.getTime() - new Date(bestDate).getTime()) / 86400000)
            : 999;
          const closeDateMoves = closeDateChanges[o.Id] || 0;
          const noRecentActivity = daysSinceActivity >= 11; // 1.5 weeks
          const closeDateSlipped = closeDateMoves >= 2;

          if (!noRecentActivity && !closeDateSlipped) return;

          const reasons = [];
          if (closeDateSlipped) reasons.push(`Close date moved ${closeDateMoves}x`);
          if (noRecentActivity) reasons.push(`No activity in ${daysSinceActivity}d`);

          // Show activity source breakdown
          const activityNote = bestDate
            ? (realDate && realDate > (sfdcDate || "")) ? `Last touch: ${bestDate} (Gmail/Cal/Chorus)` : `Last touch: ${bestDate} (SFDC)`
            : "No activity found";

          actions.dealsAtRisk.push({
            id: `opp-${o.Id}`,
            type: "follow-up",
            priority: (closeDateSlipped && noRecentActivity) ? "critical" : closeDateSlipped ? "high" : "high",
            title: `${o.Name}`,
            subtitle: `${o.Account?.Name || "—"} · ${o.StageName} · ${o.Amount ? "$" + o.Amount.toLocaleString() : "No amount"} · ${o.Group_Forecast_Category__c || "—"}`,
            channel: "salesforce",
            dueTime: reasons.join(" · "),
            closeDate: o.CloseDate,
            closeDateMoves,
            daysSinceActivity,
            suggestedAction: `${activityNote}. Risk: ${reasons.join(", ")}. Re-engage, validate timeline, or close lost.`,
            riskReasons: reasons,
          });
        });

        actions.dealsAtRisk.sort((a, b) => {
          const aScore = (a.closeDateMoves >= 2 ? 2 : 0) + (a.daysSinceActivity >= 11 ? 1 : 0);
          const bScore = (b.closeDateMoves >= 2 ? 2 : 0) + (b.daysSinceActivity >= 11 ? 1 : 0);
          if (bScore !== aScore) return bScore - aScore;
          return (b.daysSinceActivity || 0) - (a.daysSinceActivity || 0);
        });
      }
    }

    // Sort each queue by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sortByPriority = (a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
    actions.external.sort(sortByPriority);
    actions.internal.sort(sortByPriority);

    // ── AI Enrichment: generate specific suggested actions ────
    try {
      const allActions = [
        ...actions.external.slice(0, 8).map(a => ({ queue: "external", ...a })),
        ...actions.internal.slice(0, 5).map(a => ({ queue: "internal", ...a })),
        ...actions.sfdcCleanup.slice(0, 5).map(a => ({ queue: "sfdcCleanup", ...a })),
        ...actions.dealsAtRisk.slice(0, 5).map(a => ({ queue: "dealsAtRisk", ...a })),
      ];

      if (allActions.length > 0) {
        const actionSummary = allActions.map((a, i) =>
          `${i}. [${a.priority}] ${a.title} | ${a.subtitle || ""} | Current suggestion: ${a.suggestedAction || "none"}`
        ).join("\n");

        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            system: `You are Jake Dunlap's action assistant. Jake is CEO of Skaled Consulting. For each action below, write a specific 1-2 sentence suggested action that tells Jake exactly what to do. Be concrete — name the person, reference the deal context, suggest the specific email/call/update to make. No generic advice like "review and follow up." Instead say things like "Send Amy the revised SOW with the Q3 timeline she asked about" or "Push this to Closed Lost — no response in 45 days and they went with a competitor." Plain text only, no markdown, no asterisks.`,
            messages: [{
              role: "user",
              content: `Today is ${now.toISOString().split("T")[0]}. Here are Jake's actions. Return a JSON array of objects with "index" (number) and "suggestion" (string) for each:\n\n${actionSummary}`,
            }],
          }),
        });

        if (claudeRes.ok) {
          const data = await claudeRes.json();
          const text = data.content?.[0]?.text || "";
          try {
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const suggestions = JSON.parse(jsonMatch[0]);
              suggestions.forEach(s => {
                const action = allActions[s.index];
                if (action && s.suggestion) {
                  // Find and update in the original queue
                  const queue = actions[action.queue];
                  const match = queue?.find(a => a.id === action.id);
                  if (match) match.suggestedAction = s.suggestion;
                }
              });
            }
          } catch { /* Parse failed — keep original suggestions */ }
        }
      }
    } catch { /* AI enrichment failed — keep original suggestions */ }

    return Response.json(actions);
  } catch (e) {
    return Response.json({ error: e.message, external: [], internal: [], sfdcCleanup: [], dealsAtRisk: [] }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/daily-actions" };
