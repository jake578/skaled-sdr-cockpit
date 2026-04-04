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

      // Jenni Weber: skip calendar invites, only show urgent or OOO
      const organizer = (event.organizer?.email || "").toLowerCase();
      const isJenniWeber = organizer.includes("jenni") || (event.attendees || []).some(a => (a.email || "").toLowerCase().includes("jenni") && (a.organizer || false));
      if (isJenniWeber) {
        const isUrgent = subjectLower.includes("urgent") || subjectLower.includes("asap") || subjectLower.includes("critical");
        const isOOO = subjectLower.includes("out of") || subjectLower.includes("ooo") || subjectLower.includes("vacation") || subjectLower.includes("travel") || subjectLower.includes("out of town");
        if (!isUrgent && !isOOO) return; // Skip non-urgent Jenni calendar invites
      }

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

        // ── Build cross-source last touch map (contact emails + account names) ──
        const allOpenOpps = await sfdcQuery(
          `SELECT Id, Name, Account.Name, AccountId, Amount, StageName, CloseDate, LastActivityDate, Group_Forecast_Category__c FROM Opportunity WHERE IsClosed = false ORDER BY CloseDate ASC LIMIT 100`
        );

        // Pull contact emails per account for precise matching
        const accountContacts = {};
        const uniqueAccountIds = [...new Set(allOpenOpps.map(o => o.AccountId).filter(Boolean))];
        if (uniqueAccountIds.length > 0) {
          // Batch query contacts — up to 20 accounts at a time
          for (let i = 0; i < uniqueAccountIds.length; i += 20) {
            const batch = uniqueAccountIds.slice(i, i + 20);
            const idList = batch.map(id => `'${id}'`).join(",");
            const contacts = await sfdcQuery(`SELECT AccountId, Email, Name FROM Contact WHERE AccountId IN (${idList}) AND Email != null LIMIT 200`);
            contacts.forEach(c => {
              if (!accountContacts[c.AccountId]) accountContacts[c.AccountId] = [];
              accountContacts[c.AccountId].push({ email: c.Email.toLowerCase(), name: c.Name });
            });
          }
        }

        const accountLastTouch = {}; // accountName (lowercase) → date string
        const gtoken = await getAccessToken().catch(() => null);

        // Gmail: search by CONTACT EMAILS (exact match, not fuzzy name)
        if (gtoken) {
          // Build a map of email domain → account name for domain matching
          const domainToAccount = {};
          allOpenOpps.forEach(o => {
            const acctName = (o.Account?.Name || "").toLowerCase();
            const contacts = accountContacts[o.AccountId] || [];
            contacts.forEach(c => {
              const domain = c.email.split("@")[1];
              if (domain && !domain.includes("gmail") && !domain.includes("yahoo") && !domain.includes("hotmail") && !domain.includes("outlook")) {
                domainToAccount[domain] = acctName;
              }
            });
          });

          // Search Gmail for emails with contact addresses (batched by account)
          for (const opp of allOpenOpps.slice(0, 30)) {
            const acctName = (opp.Account?.Name || "").toLowerCase();
            const contacts = accountContacts[opp.AccountId] || [];
            if (contacts.length === 0) continue;

            // Search by top 3 contact emails
            const emailQueries = contacts.slice(0, 3).map(c => `from:${c.email} OR to:${c.email}`);
            const query = emailQueries.join(" OR ") + " newer_than:30d";

            try {
              const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${gtoken}` } });
              const data = await res.json();
              if (data.messages?.length) {
                // Get the date of the most recent email
                const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${data.messages[0].id}?format=metadata&metadataHeaders=Date`, { headers: { Authorization: `Bearer ${gtoken}` } });
                if (msgRes.ok) {
                  const msg = await msgRes.json();
                  const dateH = msg.payload?.headers?.find(h => h.name.toLowerCase() === "date");
                  if (dateH) {
                    const dateStr = new Date(dateH.value).toISOString().split("T")[0];
                    if (!accountLastTouch[acctName] || dateStr > accountLastTouch[acctName]) accountLastTouch[acctName] = dateStr;
                  }
                }
              }
            } catch {}
          }

          // Also search by account name as fallback for accounts with no contacts
          try {
            const noContactAccounts = allOpenOpps.filter(o => !(accountContacts[o.AccountId]?.length > 0));
            for (const opp of noContactAccounts.slice(0, 10)) {
              const acctName = (opp.Account?.Name || "").toLowerCase();
              if (acctName.length < 3) continue;
              try {
                const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q="${opp.Account?.Name}" newer_than:30d`, { headers: { Authorization: `Bearer ${gtoken}` } });
                const data = await res.json();
                if (data.messages?.length) {
                  const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${data.messages[0].id}?format=metadata&metadataHeaders=Date`, { headers: { Authorization: `Bearer ${gtoken}` } });
                  if (msgRes.ok) {
                    const msg = await msgRes.json();
                    const dateH = msg.payload?.headers?.find(h => h.name.toLowerCase() === "date");
                    if (dateH) {
                      const dateStr = new Date(dateH.value).toISOString().split("T")[0];
                      if (!accountLastTouch[acctName] || dateStr > accountLastTouch[acctName]) accountLastTouch[acctName] = dateStr;
                    }
                  }
                }
              } catch {}
            }
          } catch {}

          // Calendar: search by attendee emails
          try {
            const past30 = new Date(now.getTime() - 30 * 86400000).toISOString();
            const calRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(past30)}&timeMax=${encodeURIComponent(now.toISOString())}&maxResults=200&singleEvents=true`, { headers: { Authorization: `Bearer ${gtoken}` } });
            const calData = await calRes.json();
            (calData.items || []).forEach(event => {
              const dateStr = (event.start?.dateTime || event.start?.date || "").split("T")[0];
              if (!dateStr) return;
              const attendeeEmails = (event.attendees || []).map(a => (a.email || "").toLowerCase());
              // Match attendee emails to account contacts
              for (const opp of allOpenOpps) {
                const acctName = (opp.Account?.Name || "").toLowerCase();
                const contacts = accountContacts[opp.AccountId] || [];
                const hasMatch = contacts.some(c => attendeeEmails.includes(c.email)) ||
                  (acctName.length > 2 && (event.summary || "").toLowerCase().includes(acctName));
                if (hasMatch) {
                  if (!accountLastTouch[acctName] || dateStr > accountLastTouch[acctName]) accountLastTouch[acctName] = dateStr;
                }
              }
            });
          } catch {}
        }

        // Chorus calls from SFDC Events
        try {
          const chorusEvents = await sfdcQuery(
            `SELECT Subject, What.Name, StartDateTime FROM Event WHERE Subject LIKE 'Chorus%' AND StartDateTime >= LAST_N_DAYS:60 ORDER BY StartDateTime DESC LIMIT 100`
          );
          chorusEvents.forEach(e => {
            const dateStr = (e.StartDateTime || "").split("T")[0];
            const whatName = (e.What?.Name || "").toLowerCase();
            if (!dateStr) return;
            allOpenOpps.forEach(o => {
              const acctName = (o.Account?.Name || "").toLowerCase();
              if (acctName && acctName.length > 2 && whatName.includes(acctName)) {
                if (!accountLastTouch[acctName] || dateStr > accountLastTouch[acctName]) accountLastTouch[acctName] = dateStr;
              }
            });
          });
        } catch {}

        // Helper: get real days since activity for any opp
        const getRealDaysSince = (o) => {
          const acctName = (o.Account?.Name || "").toLowerCase();
          const sfdcDate = o.LastActivityDate || null;
          const realDate = accountLastTouch[acctName] || null;
          const bestDate = [sfdcDate, realDate].filter(Boolean).sort().pop();
          return bestDate ? Math.floor((now.getTime() - new Date(bestDate).getTime()) / 86400000) : 999;
        };

        // Stalled/upcoming opps (using REAL activity dates)
        allOpenOpps.forEach(o => {
          const daysSinceActivity = getRealDaysSince(o);
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
            suggestion = `No activity in ${daysSinceActivity} days (across Gmail, Calendar, Chorus). Re-engage or update pipeline.`;
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
        // (reuses allOpenOpps, accountLastTouch, getRealDaysSince from above)

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
          const daysSinceActivity = getRealDaysSince(o);
          const closeDateMoves = closeDateChanges[o.Id] || 0;
          const noRecentActivity = daysSinceActivity >= 11;
          const closeDateSlipped = closeDateMoves >= 2;

          if (!noRecentActivity && !closeDateSlipped) return;

          const reasons = [];
          if (closeDateSlipped) reasons.push(`Close date moved ${closeDateMoves}x`);
          if (noRecentActivity) reasons.push(`No activity in ${daysSinceActivity}d`);

          const acctName = (o.Account?.Name || "").toLowerCase();
          const realDate = accountLastTouch[acctName] || null;
          const sfdcDate = o.LastActivityDate || null;
          const bestDate = [sfdcDate, realDate].filter(Boolean).sort().pop();
          const activityNote = bestDate
            ? (realDate && realDate > (sfdcDate || "")) ? `Last touch: ${bestDate} (Gmail/Cal/Chorus)` : `Last touch: ${bestDate} (SFDC)`
            : "No activity found across Gmail, Calendar, Chorus, or SFDC";

          actions.dealsAtRisk.push({
            id: `opp-${o.Id}`,
            type: "follow-up",
            priority: (closeDateSlipped && noRecentActivity) ? "critical" : "high",
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
