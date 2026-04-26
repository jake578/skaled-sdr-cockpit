// Generates daily action items from Gmail, Calendar, and SFDC
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  try {
    const token = await getAccessToken();
    const actions = { external: [], internal: [], dealsAtRisk: [], leads: [] };

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

      // Skip personal/non-business events
      if (subjectLower.includes("lunch") || subjectLower.includes("block") ||
          subjectLower.includes("focus time") || subjectLower.includes("ooo") ||
          subjectLower.includes("out of office") || subjectLower.includes("reminder") ||
          subjectLower.includes("birthday") || subjectLower.includes("anniversary") ||
          subjectLower.includes("doctor") || subjectLower.includes("dentist") ||
          subjectLower.includes("pickup") || subjectLower.includes("drop off") ||
          subjectLower.includes("gym") || subjectLower.includes("workout") ||
          subjectLower.includes("dinner") || subjectLower.includes("brunch") ||
          subjectLower.includes("haircut") || subjectLower.includes("personal") ||
          subjectLower.includes("flight") || subjectLower.includes("hotel")) return;

      // Skip personal contacts — Jenni Dunlap/Weber and family
      const organizer = (event.organizer?.email || "").toLowerCase();
      const allEmails = (event.attendees || []).map(a => (a.email || "").toLowerCase()).join(" ") + " " + organizer;
      const allNames = (event.attendees || []).map(a => (a.displayName || "").toLowerCase()).join(" ");
      if (allEmails.includes("jenni") || allNames.includes("jenni")) return;

      // Skip events with only you (no other attendees = personal reminder)
      const otherAttendees = (event.attendees || []).filter(a => !a.self);
      if (otherAttendees.length === 0) return;

      // Skip 1:1s with Wendy — only show if other people are on the invite
      const nonSkaledAttendees = otherAttendees.filter(a => !(a.email || "").includes("skaled.com"));
      const hasWendy = allEmails.includes("wendy") || allNames.includes("wendy");
      if (hasWendy && otherAttendees.length === 1) return; // Just you + Wendy, skip
      if (hasWendy && nonSkaledAttendees.length === 0) return; // Wendy + only Skaled people, skip

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

      const calPriority = isToday ? "critical" : isTomorrow ? "high" : "medium";
      const action = {
        id: `cal-${event.id}`,
        type: "meeting",
        priority: calPriority,
        criticalReason: calPriority === "critical" ? `Meeting with ${externalAttendees.length > 0 ? externalAttendees[0].name : "attendees"} is TODAY at ${timeStr}` : null,
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
    // ── 2. Gmail: AI-classified unread emails ──────────────────
    const inboxRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=in:inbox is:unread newer_than:7d -from:skaled.com -category:promotions -category:social -category:updates -category:forums`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const inboxData = await inboxRes.json();

    // Pull FULL email bodies for classification
    const rawEmails = [];
    for (const m of (inboxData.messages || []).slice(0, 10)) {
      try {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) continue;
        const msg = await res.json();
        const headers = {};
        (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });

        const from = headers.from || "";
        const emailAddr = from.toLowerCase();
        if (emailAddr.includes("noreply") || emailAddr.includes("no-reply") || emailAddr.includes("notifications") || emailAddr.includes("mailer-daemon") || emailAddr.includes("calendar-notification")) continue;

        // Extract body
        let body = msg.snippet || "";
        const extractBody = (payload) => {
          if (!payload) return "";
          if (payload.mimeType === "text/plain" && payload.body?.data) {
            try { return atob(payload.body.data.replace(/-/g, "+").replace(/_/g, "/")); } catch { return ""; }
          }
          for (const part of (payload.parts || [])) { const r = extractBody(part); if (r) return r; }
          return "";
        };
        const fullBody = extractBody(msg.payload) || body;

        rawEmails.push({
          id: m.id,
          from,
          subject: headers.subject || "",
          date: headers.date || "",
          body: fullBody.slice(0, 500), // Cap for token management
          snippet: msg.snippet || "",
        });
      } catch {}
    }

    // AI classify all emails in one batch call
    if (rawEmails.length > 0) {
      try {
        const emailSummary = rawEmails.map((e, i) =>
          `${i}. From: ${e.from}\nSubject: ${e.subject}\nBody: ${e.body.slice(0, 300)}`
        ).join("\n---\n");

        const classifyRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1024,
            system: `You triage emails for Jake Dunlap, CEO of Skaled Consulting. For each email:

1. Classify: NEEDS_ACTION / FYI_ONLY / CAN_WAIT
2. Explain WHY Jake needs to act (not just "needs response" — say what the person is asking/wanting)
3. Tell Jake exactly what to do

NEEDS_ACTION: Direct question to Jake, decision needed, prospect/client asking something specific, money on the line, senior person reaching out, time-sensitive request
FYI_ONLY: Newsletters, automated updates, CC threads, status updates, confirmations, receipts, marketing emails, internal FYIs
CAN_WAIT: Non-urgent asks, team updates, informational

Be VERY strict. 70%+ of emails should be FYI_ONLY. Only NEEDS_ACTION if Jake ignoring it would cost money or damage a relationship.`,
            messages: [{ role: "user", content: `Classify each email. Return JSON array: [{ "index": 0, "classification": "NEEDS_ACTION/FYI_ONLY/CAN_WAIT", "why": "what the person wants from Jake specifically", "action": "exactly what Jake should do" }]\n\n${emailSummary}` }],
          }),
        });

        if (classifyRes.ok) {
          const data = await classifyRes.json();
          const raw = data.content?.[0]?.text || "";
          let classifications = [];
          try { const match = raw.match(/\[[\s\S]*\]/); if (match) classifications = JSON.parse(match[0]); } catch {}

          rawEmails.forEach((msg, i) => {
            const cls = classifications.find(c => c.index === i);
            const classification = cls?.classification || "CAN_WAIT";
            if (classification === "FYI_ONLY") return; // Skip entirely

            const nameMatch = msg.from.match(/^([^<]+)/);
            const contactName = nameMatch ? nameMatch[1].trim().replace(/"/g, "") : msg.from;
            const dateStr = msg.date ? new Date(msg.date).toISOString().split("T")[0] : "—";
            const isToday = dateStr === now.toISOString().split("T")[0];

            actions.external.push({
              id: `gmail-${msg.id}`,
              type: "email",
              priority: classification === "NEEDS_ACTION" ? (isToday ? "critical" : "high") : "medium",
              criticalReason: classification === "NEEDS_ACTION" ? `${cls?.why || contactName + " needs your response"}` : null,
              title: `${contactName} — ${msg.subject || "No subject"}`,
              subtitle: cls?.why || `Unread email`,
              context: cls?.why || null,
              channel: "email",
              dueTime: isToday ? "Today" : dateStr,
              suggestedAction: cls?.action || `Review and respond to "${msg.subject}"`,
              contact: contactName,
            });
          });
        } else {
          // Fallback: add all without classification
          rawEmails.forEach(msg => {
            const nameMatch = msg.from.match(/^([^<]+)/);
            const contactName = nameMatch ? nameMatch[1].trim().replace(/"/g, "") : msg.from;
            actions.external.push({
              id: `gmail-${msg.id}`, type: "email", priority: "medium",
              title: `Reply to ${contactName}`, subtitle: msg.subject || "",
              channel: "email", dueTime: "—", suggestedAction: `Unread: "${msg.subject}"`, contact: contactName,
            });
          });
        }
      } catch {
        // If AI fails, add all as medium
        rawEmails.forEach(msg => {
          const nameMatch = msg.from.match(/^([^<]+)/);
          const contactName = nameMatch ? nameMatch[1].trim().replace(/"/g, "") : msg.from;
          actions.external.push({
            id: `gmail-${msg.id}`, type: "email", priority: "medium",
            title: `Reply to ${contactName}`, subtitle: msg.subject || "",
            channel: "email", dueTime: "—", suggestedAction: `Unread: "${msg.subject}"`, contact: contactName,
          });
        });
      }
    }

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

          // Search Gmail in PARALLEL batches — only for opps with stale SFDC activity
          const oppsNeedingGmailCheck = allOpenOpps.filter(o => {
            const sfdcDays = o.LastActivityDate ? Math.floor((now - new Date(o.LastActivityDate)) / 86400000) : 999;
            return sfdcDays >= 7; // Only check Gmail if SFDC says 7+ days stale
          }).slice(0, 15); // Cap at 15 to stay fast

          const gmailCheck = async (opp) => {
            const acctName = (opp.Account?.Name || "").toLowerCase();
            const contacts = accountContacts[opp.AccountId] || [];

            // Try contact emails first, then account name
            let query;
            if (contacts.length > 0) {
              query = contacts.slice(0, 2).map(c => `from:${c.email} OR to:${c.email}`).join(" OR ") + " newer_than:30d";
            } else if (acctName.length > 2) {
              query = `"${opp.Account?.Name}" newer_than:30d`;
            } else return;

            try {
              const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${gtoken}` } });
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
          };

          // Run in parallel batches of 5
          for (let i = 0; i < oppsNeedingGmailCheck.length; i += 5) {
            await Promise.all(oppsNeedingGmailCheck.slice(i, i + 5).map(gmailCheck));
          }


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

        // Stalled/upcoming opps — only show deals with clear reasons WHY they need attention
        allOpenOpps.forEach(o => {
          // Skip $0 and Pipeline forecast category
          if (!o.Amount || o.Amount === 0) return;
          if ((o.Group_Forecast_Category__c || "").toLowerCase() === "pipeline") return;

          const daysSinceActivity = getRealDaysSince(o);
          const daysToClose = o.CloseDate ? Math.floor((new Date(o.CloseDate).getTime() - now.getTime()) / 86400000) : null;
          const acctName = (o.Account?.Name || "").toLowerCase();
          const hasRealTouch = !!accountLastTouch[acctName];
          const amt = "$" + o.Amount.toLocaleString();
          const acct = o.Account?.Name || "Unknown";

          // Skip deals with no clear reason to surface
          if (daysSinceActivity < 7 && (daysToClose === null || daysToClose > 14)) return;
          // Skip if activity data is unknown (999) and close date isn't soon
          if (daysSinceActivity >= 999 && (daysToClose === null || daysToClose > 7)) return;

          let priority = "medium";
          let criticalReason = null;
          let context = null;
          let suggestion = "";
          let dueTime = "";

          if (daysToClose !== null && daysToClose <= 3 && daysToClose >= 0) {
            priority = "critical";
            criticalReason = amt ? `${amt} closes in ${daysToClose} day${daysToClose !== 1 ? "s" : ""}` : `Deal closes in ${daysToClose} day${daysToClose !== 1 ? "s" : ""}`;
            context = `${acct} deal is ${daysToClose === 0 ? "due TODAY" : "due in " + daysToClose + " days"}. ${hasRealTouch ? "You've been in touch recently." : "No recent emails or meetings found."} ${o.StageName} stage${amt ? ", " + amt + " on the line" : ""}.`;
            suggestion = daysToClose === 0 ? "Get verbal confirmation today or push the close date." : "Confirm commitment or push the date before it goes past due.";
            dueTime = daysToClose === 0 ? "Closes today" : `Closes in ${daysToClose}d`;

          } else if (daysToClose !== null && daysToClose <= 7 && !hasRealTouch) {
            priority = "critical";
            criticalReason = `${amt || "Deal"} closes in ${daysToClose}d with no recent engagement`;
            context = `${acct} deal closes in ${daysToClose} days but there's been no email, call, or meeting activity detected. This deal may be at risk of slipping.`;
            suggestion = "Reach out today — call or email the primary contact to confirm timeline.";
            dueTime = `Closes in ${daysToClose}d`;

          } else if (daysToClose !== null && daysToClose <= 7) {
            priority = "high";
            context = `${acct} deal closing in ${daysToClose} days. Recent activity detected. ${o.StageName} stage${amt ? ", " + amt : ""}.`;
            suggestion = "Review deal status and confirm close is on track.";
            dueTime = `Closes in ${daysToClose}d`;

          } else if (daysSinceActivity >= 14 && daysSinceActivity < 999 && !hasRealTouch) {
            priority = "high";
            context = `No emails, calls, or meetings with ${acct} in ${daysSinceActivity} days. ${o.StageName} stage${amt ? " with " + amt + " at stake" : ""}. This deal is going cold.`;
            suggestion = "Send a value-add email or schedule a call. If the deal is dead, close it out.";
            dueTime = `${daysSinceActivity}d silent`;

          } else if (daysSinceActivity >= 14 && daysSinceActivity < 999 && hasRealTouch) {
            priority = "medium";
            context = `SFDC shows no logged activity for ${acct} in ${daysSinceActivity} days, but Gmail/Calendar has recent touches. CRM data may be stale.`;
            suggestion = "Log recent activity in SFDC to keep pipeline data accurate.";
            dueTime = "SFDC stale";

          } else if (daysToClose !== null && daysToClose < 0) {
            // Past due handled separately below
            return;
          } else {
            return; // No clear reason to surface
          }

          actions.dealsAtRisk.push({
            id: `opp-${o.Id}`, type: "follow-up", priority, criticalReason, context,
            title: o.Name,
            subtitle: `${acct} · ${o.StageName}${amt ? " · " + amt : ""}`,
            channel: "salesforce", dueTime, suggestedAction: suggestion,
          });
        });

        // New leads
        const leads = await sfdcQuery(
          `SELECT Id, Name, Company, Title, Status, CreatedDate, LeadSource, Description FROM Lead WHERE IsConverted = false AND Status = 'New' ORDER BY CreatedDate DESC LIMIT 10`
        );

        const inboundKeywords = ["web", "inbound", "form", "demo", "contact us", "download", "webinar", "newsletter", "landing", "chat", "referral"];

        leads.forEach(l => {
          const daysOld = l.CreatedDate
            ? Math.floor((now.getTime() - new Date(l.CreatedDate).getTime()) / 86400000)
            : 0;
          const source = l.LeadSource || "";
          const sourceLower = source.toLowerCase();
          const desc = (l.Description || "").toLowerCase();
          const descInbound = ["filled out", "requested", "downloaded", "submitted", "signed up"].some(k => desc.includes(k));
          const isInbound = !!source && (inboundKeywords.some(k => sourceLower.includes(k)) || descInbound);

          actions.leads.push({
            id: `lead-${l.Id}`,
            type: "follow-up",
            priority: isInbound ? (daysOld <= 1 ? "critical" : "high") : (daysOld <= 1 ? "high" : "medium"),
            title: `New lead: ${l.Name}`,
            subtitle: `${l.Company || "—"} · ${l.Title || "—"}${source ? " · " + source : ""}`,
            channel: "salesforce",
            dueTime: daysOld <= 1 ? "New today" : `${daysOld}d old`,
            suggestedAction: `New lead from ${l.Company || "unknown"}. Research and qualify.`,
            isInbound,
            leadSource: source || null,
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
          const pdPriority = daysOverdue > 30 ? "critical" : daysOverdue > 14 ? "high" : "medium";
          actions.dealsAtRisk.push({
            id: `opp-${o.Id}`,
            type: "follow-up",
            priority: pdPriority,
            criticalReason: pdPriority === "critical" ? `${daysOverdue} days past close date — ${o.Amount ? "$" + o.Amount.toLocaleString() + " aging your pipeline" : "polluting pipeline accuracy"}` : null,
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
          actions.dealsAtRisk.push({
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
        actions.dealsAtRisk.sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0));

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
    actions.leads.sort(sortByPriority);

    // AI Enrichment moved to on-demand (AI Suggestions tab) for faster initial load

    return Response.json(actions);
  } catch (e) {
    return Response.json({ error: e.message, external: [], internal: [], dealsAtRisk: [], leads: [] }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/daily-actions" };
