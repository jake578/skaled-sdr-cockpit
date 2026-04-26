// FAST actions — SFDC + quick Calendar check for upcoming meetings
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    if (!sfdcMatch) return Response.json({ external: [], internal: [], dealsAtRisk: [], leads: [], inboundLeads: [] });

    const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Quick calendar pull — single API call, covers all accounts
    const accountsWithMeetings = new Set();
    const blueMeetings = [];
    try {
      const gtoken = await getAccessToken();
      const past7 = new Date(now.getTime() - 7 * 86400000).toISOString();
      const future14 = new Date(now.getTime() + 14 * 86400000).toISOString();
      const calRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(past7)}&timeMax=${encodeURIComponent(future14)}&maxResults=100&singleEvents=true&orderBy=startTime`, { headers: { Authorization: `Bearer ${gtoken}` } });
      if (calRes.ok) {
        const calData = await calRes.json();
        (calData.items || []).forEach(event => {
          const title = (event.summary || "").toLowerCase();
          accountsWithMeetings.add(title);
          // Only forward-looking "Blueberry" (colorId "9") events go to external queue
          if (event.colorId === "9" && event.start?.dateTime) {
            const startMs = new Date(event.start.dateTime).getTime();
            if (startMs >= now.getTime()) blueMeetings.push(event);
          }
        });
      }
    } catch {}

    const sfdcQuery = async (soql) => {
      const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!res.ok) return [];
      return (await res.json()).records || [];
    };

    const actions = { external: [], internal: [], dealsAtRisk: [], leads: [], inboundLeads: [] };
    const fmt = (n) => "$" + (n || 0).toLocaleString();

    const [openOpps, newLeads, pastDue] = await Promise.all([
      sfdcQuery(`SELECT Id, Name, Account.Name, Amount, StageName, CloseDate, LastActivityDate, LastModifiedDate, Group_Forecast_Category__c, NextStep, Owner.Name FROM Opportunity WHERE IsClosed = false AND (NOT StageName LIKE 'Closed%') ORDER BY CloseDate ASC LIMIT 50`),
      sfdcQuery(`SELECT Id, Name, Company, Title, Status, CreatedDate, LeadSource, Industry, Description, Website, NumberOfEmployees, AnnualRevenue FROM Lead WHERE IsConverted = false AND Status = 'New' ORDER BY CreatedDate DESC LIMIT 10`),
      sfdcQuery(`SELECT Id, Name, Account.Name, Amount, StageName, CloseDate, Group_Forecast_Category__c, Owner.Name FROM Opportunity WHERE IsClosed = false AND (NOT StageName LIKE 'Closed%') AND CloseDate < ${todayStr} ORDER BY CloseDate ASC LIMIT 30`),
    ]);

    // Past due deals
    pastDue.forEach(o => {
      if (!o.Amount || o.Amount === 0) return;
      if ((o.Group_Forecast_Category__c || "").toLowerCase() === "pipeline") return;
      // If there's a meeting on the books, it's not dead — just needs date update
      const acctLower = (o.Account?.Name || "").toLowerCase();
      const hasMeeting = acctLower.length > 2 && [...accountsWithMeetings].some(t => t.includes(acctLower));
      const daysOverdue = Math.floor((now - new Date(o.CloseDate)) / 86400000);
      const amt = fmt(o.Amount);
      const acct = o.Account?.Name || "Unknown";
      const priority = hasMeeting ? "medium" : (daysOverdue > 60 ? "critical" : daysOverdue > 30 ? "high" : "medium");

      actions.dealsAtRisk.push({
        id: `opp-${o.Id}`, type: "follow-up", priority,
        criticalReason: priority === "critical" ? `${acct}: ${amt || "Deal"} is ${daysOverdue} days past close date — polluting your forecast` : null,
        title: o.Name,
        subtitle: `${acct} · ${o.Owner?.Name || "—"} · ${o.StageName}${amt ? " · " + amt : ""}`,
        context: `The ${acct} deal was supposed to close on ${o.CloseDate} (${daysOverdue} days ago). It's still sitting in ${o.StageName} stage${amt ? " with " + amt + " showing in pipeline" : ""}. ${daysOverdue > 30 ? "This is over a month past due and is making your pipeline inaccurate." : "This needs a new close date or should be closed lost."}`,
        channel: "salesforce",
        dueTime: `${daysOverdue}d overdue`,
        suggestedAction: daysOverdue > 30 ? `Close this lost or set a realistic new date. ${amt ? amt + " has been inflating your pipeline for " + daysOverdue + " days." : ""}` : `Update the close date or get a commitment. Don't let this drift.`,
      });
    });

    // Closing soon + stale deals
    openOpps.forEach(o => {
      if (pastDue.some(p => p.Id === o.Id)) return;
      const daysToClose = o.CloseDate ? Math.floor((new Date(o.CloseDate) - now) / 86400000) : null;
      // Use most recent of LastActivityDate and LastModifiedDate
      const lastTouch = [o.LastActivityDate, o.LastModifiedDate].filter(Boolean).sort().pop();
      const daysSince = lastTouch ? Math.floor((now - new Date(lastTouch)) / 86400000) : null;
      const amt = o.Amount ? fmt(o.Amount) : null;
      const acct = o.Account?.Name || "Unknown";

      // Skip $0 deals and Pipeline forecast category
      if (!o.Amount || o.Amount === 0) return;
      if ((o.Group_Forecast_Category__c || "").toLowerCase() === "pipeline") return;

      // Skip if there's a meeting on the calendar mentioning this account
      const acctLower = (o.Account?.Name || "").toLowerCase();
      const hasMeeting = acctLower.length > 2 && [...accountsWithMeetings].some(t => t.includes(acctLower));

      // Closing in 3 days or less
      if (daysToClose !== null && daysToClose <= 3 && daysToClose >= 0) {
        actions.dealsAtRisk.push({
          id: `opp-${o.Id}`, type: "follow-up", priority: "critical",
          criticalReason: `${acct}: ${amt || "Deal"} closes ${daysToClose === 0 ? "TODAY" : "in " + daysToClose + " day" + (daysToClose > 1 ? "s" : "")}`,
          title: o.Name,
          subtitle: `${acct} · ${o.Owner?.Name || "—"} · ${o.StageName}${amt ? " · " + amt : ""}`,
          context: `${acct} deal is ${daysToClose === 0 ? "due to close TODAY" : "closing in " + daysToClose + " days"}. Currently in ${o.StageName} stage${amt ? " at " + amt : ""}. ${o.Group_Forecast_Category__c === "Commit" ? "This is in Commit — it should close." : o.Group_Forecast_Category__c === "Best Case" ? "This is Best Case — there's risk it slips." : "Forecast category: " + (o.Group_Forecast_Category__c || "not set") + "."}${o.NextStep ? " Next step: " + o.NextStep : ""}`,
          channel: "salesforce",
          dueTime: daysToClose === 0 ? "TODAY" : `${daysToClose}d left`,
          suggestedAction: daysToClose === 0 ? "Get verbal confirmation today or push the date. Don't let it go past due." : `Confirm with ${acct} that this is still on track to close by ${o.CloseDate}.`,
        });

      // Closing in 4-7 days
      } else if (daysToClose !== null && daysToClose <= 7) {
        actions.dealsAtRisk.push({
          id: `opp-${o.Id}`, type: "follow-up", priority: "high",
          title: o.Name,
          subtitle: `${acct} · ${o.Owner?.Name || "—"} · ${o.StageName}${amt ? " · " + amt : ""}`,
          context: `${acct} deal closes in ${daysToClose} days (${o.CloseDate}). ${o.StageName} stage${amt ? ", " + amt : ""}. ${o.NextStep ? "Next step: " + o.NextStep : "No next step defined — this deal may slip."}`,
          channel: "salesforce",
          dueTime: `${daysToClose}d left`,
          suggestedAction: `Check in with ${acct} to confirm timeline. ${o.NextStep ? "Execute: " + o.NextStep : "Define a next step immediately."}`,
        });

      // Stale — no activity in 30+ days, no upcoming meeting, not unknown
      } else if (daysSince !== null && daysSince >= 30 && !hasMeeting) {
        actions.dealsAtRisk.push({
          id: `opp-${o.Id}`, type: "follow-up", priority: "high",
          title: o.Name,
          subtitle: `${acct} · ${o.Owner?.Name || "—"} · ${o.StageName}${amt ? " · " + amt : ""}`,
          context: `No logged SFDC activity with ${acct} in ${daysSince} days. ${o.StageName} stage${amt ? " with " + amt + " at risk" : ""}. ${daysSince > 30 ? "This deal is going cold — it needs immediate attention or should be closed." : "Engagement is fading — re-engage before it goes dead."}`,
          channel: "salesforce",
          dueTime: `${daysSince}d silent`,
          suggestedAction: daysSince > 30 ? `This deal needs a pulse check. Send a direct email or call ${acct}. If no response, close it.` : `Reach out to ${acct} with a value-add — don't just "check in."`,
        });
      }
    });

    // New leads — PE leads are CRITICAL
    const inboundKeywords = ["web", "inbound", "form", "demo", "contact us", "download", "webinar", "newsletter", "landing", "chat", "referral"];
    const seniorKeywords = ["ceo", "cfo", "cro", "coo", "cto", "cmo", "cpo", "cio", "chief", "president", "founder", "owner", "partner", "principal", "managing director", "head of", "vp ", "vice president", "svp", "evp", "director"];

    // Bulk-fetch matching SFDC Accounts by company name
    const inboundLeadsRaw = newLeads.filter(l => {
      const sourceLower = (l.LeadSource || "").toLowerCase();
      const desc = (l.Description || "").toLowerCase();
      const descInbound = ["filled out", "requested", "downloaded", "submitted", "signed up"].some(k => desc.includes(k));
      return !!l.LeadSource && (inboundKeywords.some(k => sourceLower.includes(k)) || descInbound);
    });

    let accountMap = {};
    if (inboundLeadsRaw.length > 0) {
      const companyNames = [...new Set(inboundLeadsRaw.map(l => l.Company).filter(Boolean))];
      if (companyNames.length > 0) {
        const escaped = companyNames.map(n => `'${n.replace(/'/g, "\\'")}'`).join(",");
        const accounts = await sfdcQuery(`SELECT Id, Name, NumberOfEmployees, Industry, Website, Description, AnnualRevenue FROM Account WHERE Name IN (${escaped})`);
        accounts.forEach(a => { accountMap[a.Name.toLowerCase()] = a; });
      }
    }

    // Claude enrichment: one-line "what they do" for inbound leads missing a useful description
    // Batch all needed calls with Promise.all; cache by company name within this invocation
    const claudeCache = {};
    const needsClaude = inboundLeadsRaw.filter(l => {
      const acct = accountMap[(l.Company || "").toLowerCase()];
      const desc = (acct?.Description || l.Description || "").trim();
      return !desc || desc.length < 30;
    });

    if (needsClaude.length > 0 && process.env.ANTHROPIC_API_KEY) {
      const uniqueCompanies = [...new Map(needsClaude.map(l => [l.Company, l])).values()];
      await Promise.all(uniqueCompanies.map(async (l) => {
        const company = l.Company || "";
        if (!company || claudeCache[company] !== undefined) return;
        try {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              max_tokens: 60,
              messages: [{ role: "user", content: `In one sentence (max 15 words), what does ${company} do? Industry hint: ${l.Industry || "unknown"}. Website: ${l.Website || "unknown"}. Reply with just the sentence, no punctuation at end.` }],
            }),
          });
          if (res.ok) {
            const data = await res.json();
            claudeCache[company] = (data.content?.[0]?.text || "").trim();
          } else {
            claudeCache[company] = "";
          }
        } catch {
          claudeCache[company] = "";
        }
      }));
    }

    newLeads.forEach(l => {
      const daysOld = l.CreatedDate ? Math.floor((now - new Date(l.CreatedDate)) / 86400000) : 0;
      const company = l.Company || "Unknown";
      const title = l.Title || "";
      const industry = l.Industry || "";
      const source = l.LeadSource || "";
      const desc = (l.Description || "").toLowerCase();

      const peKeywords = ["private equity", "pe ", "growth equity", "venture", "capital", "portfolio", "fund", "investment", "partners", "holdings"];
      const isPE = peKeywords.some(kw => company.toLowerCase().includes(kw) || industry.toLowerCase().includes(kw) || title.toLowerCase().includes(kw) || desc.includes(kw));

      const priority = isPE ? "critical" : daysOld <= 1 ? "high" : "medium";

      const sourceLower = (source || "").toLowerCase();
      const descInbound = ["filled out", "requested", "downloaded", "submitted", "signed up"].some(k => desc.includes(k));
      const isInbound = !!source && (inboundKeywords.some(k => sourceLower.includes(k)) || descInbound);

      const titleLower = (title || "").toLowerCase();
      const isSenior = seniorKeywords.some(k => titleLower.includes(k));

      // Enrich with Account data if matched
      const acct = accountMap[(l.Company || "").toLowerCase()] || null;
      const companySize = acct?.NumberOfEmployees ?? l.NumberOfEmployees ?? null;
      const resolvedIndustry = acct?.Industry || l.Industry || null;
      const resolvedWebsite = acct?.Website || l.Website || null;
      const rawDesc = (acct?.Description || l.Description || "").trim();
      const whatTheyDo = rawDesc.length >= 30 ? rawDesc.substring(0, 120) : (claudeCache[l.Company] ?? rawDesc);

      const leadEntry = {
        id: `lead-${l.Id}`, type: "follow-up", priority, isInbound, isSenior, leadSource: source || null,
        role: title || null,
        companySize: companySize || null,
        industry: resolvedIndustry,
        website: resolvedWebsite,
        whatTheyDo: whatTheyDo || "",
        matchedAccountId: acct?.Id || null,
        criticalReason: isPE ? `PE LEAD: ${l.Name} from ${company} — private equity leads are high-value, respond immediately` : (daysOld <= 1 ? `New lead from ${company} — respond while warm` : null),
        title: `New lead: ${l.Name}`,
        subtitle: `${company} · ${title || "—"}${isPE ? " · PE" : ""}${source ? " · " + source : ""}`,
        context: isPE
          ? `${l.Name}${title ? " (" + title + ")" : ""} from ${company} — this looks like a private equity lead. ${resolvedIndustry ? "Industry: " + resolvedIndustry + ". " : ""}PE firms bring portfolio-wide opportunities. ${daysOld === 0 ? "Came in today." : "Came in " + daysOld + " days ago."} ${source ? "Source: " + source + "." : ""}`
          : `${l.Name}${title ? " (" + title + ")" : ""} from ${company} came in ${daysOld === 0 ? "today" : daysOld + " days ago"}. ${daysOld <= 1 ? "Speed to lead matters." : "This lead is " + daysOld + " days old."} ${source ? "Source: " + source + "." : ""}`,
        channel: "salesforce",
        dueTime: isPE ? "PE — Act now" : (daysOld <= 1 ? "New" : `${daysOld}d old`),
        suggestedAction: isPE
          ? `Respond immediately. Research ${company} portfolio companies. ${title ? l.Name + " is " + title + " — this is a decision maker." : ""} PE = multi-deal opportunity.`
          : `Research ${company} and reach out. ${title ? l.Name + " is " + title + "." : ""}`,
      };

      (isInbound ? actions.inboundLeads : actions.leads).push(leadEntry);
    });

    // Blue calendar meetings → external queue with meeting-brief support
    blueMeetings.forEach(event => {
      const start = new Date(event.start.dateTime);
      const dateStr = start.toISOString().split("T")[0];
      const isToday = dateStr === todayStr;
      const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().split("T")[0];
      const isTomorrow = dateStr === tomorrowStr;
      const dayLabel = isToday ? "Today" : isTomorrow ? "Tomorrow" : start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const timeStr = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
      const subject = event.summary || "(no title)";
      const attendees = (event.attendees || []).filter(a => !a.self).map(a => ({ name: a.displayName || a.email, email: a.email || "" }));
      const externalAttendees = attendees.filter(a => !a.email.includes("skaled.com"));
      const displayAttendees = externalAttendees.length ? externalAttendees : attendees;
      const priority = isToday ? "critical" : isTomorrow ? "high" : "medium";

      actions.external.push({
        id: `cal-${event.id}`,
        type: "meeting",
        priority,
        criticalReason: priority === "critical" ? `Meeting with ${displayAttendees[0]?.name || "attendees"} is TODAY at ${timeStr}` : null,
        title: `${dayLabel} ${timeStr} — ${subject}`,
        subtitle: displayAttendees.length
          ? `With: ${displayAttendees.map(a => a.name).join(", ")}`
          : "No attendees listed",
        channel: "calendar",
        dueTime: `${dayLabel} ${timeStr}`,
        suggestedAction: isToday
          ? `Prep for this meeting. Pull up recent context and talking points.`
          : `Coming up ${dayLabel.toLowerCase()}. Block prep time if needed.`,
        eventSubject: subject,
        attendees: displayAttendees.map(a => a.email).filter(Boolean),
        accountName: displayAttendees[0]?.name || null,
      });
    });

    const po = { critical: 0, high: 1, medium: 2, low: 3 };
    actions.external.sort((a, b) => (po[a.priority] ?? 3) - (po[b.priority] ?? 3));
    actions.dealsAtRisk.sort((a, b) => (po[a.priority] ?? 3) - (po[b.priority] ?? 3));
    actions.leads.sort((a, b) => (po[a.priority] ?? 3) - (po[b.priority] ?? 3));
    actions.inboundLeads.sort((a, b) => (po[a.priority] ?? 3) - (po[b.priority] ?? 3));

    return Response.json(actions);
  } catch (e) {
    return Response.json({ external: [], internal: [], dealsAtRisk: [], leads: [], inboundLeads: [], error: e.message });
  }
};

export const config = { path: "/.netlify/functions/actions-fast" };
