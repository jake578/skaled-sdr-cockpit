// FAST actions — SFDC only, every item explains WHY it's important
export default async (req) => {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    if (!sfdcMatch) return Response.json({ external: [], internal: [], dealsAtRisk: [] });

    const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const sfdcQuery = async (soql) => {
      const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!res.ok) return [];
      return (await res.json()).records || [];
    };

    const actions = { external: [], internal: [], dealsAtRisk: [] };
    const fmt = (n) => "$" + (n || 0).toLocaleString();

    const [openOpps, newLeads, pastDue] = await Promise.all([
      sfdcQuery(`SELECT Id, Name, Account.Name, Amount, StageName, CloseDate, LastActivityDate, Group_Forecast_Category__c, NextStep FROM Opportunity WHERE IsClosed = false AND (NOT StageName LIKE 'Closed%') ORDER BY CloseDate ASC LIMIT 50`),
      sfdcQuery(`SELECT Id, Name, Company, Title, Status, CreatedDate, LeadSource, Industry, Description FROM Lead WHERE IsConverted = false AND Status = 'New' ORDER BY CreatedDate DESC LIMIT 10`),
      sfdcQuery(`SELECT Id, Name, Account.Name, Amount, StageName, CloseDate, Group_Forecast_Category__c FROM Opportunity WHERE IsClosed = false AND (NOT StageName LIKE 'Closed%') AND CloseDate < ${todayStr} ORDER BY CloseDate ASC LIMIT 30`),
    ]);

    // Past due deals
    pastDue.forEach(o => {
      if (!o.Amount || o.Amount === 0) return;
      if ((o.Group_Forecast_Category__c || "").toLowerCase() === "pipeline") return;
      const daysOverdue = Math.floor((now - new Date(o.CloseDate)) / 86400000);
      const amt = fmt(o.Amount);
      const acct = o.Account?.Name || "Unknown";
      const priority = daysOverdue > 60 ? "critical" : daysOverdue > 30 ? "high" : "medium";

      actions.dealsAtRisk.push({
        id: `opp-${o.Id}`, type: "follow-up", priority,
        criticalReason: priority === "critical" ? `${acct}: ${amt || "Deal"} is ${daysOverdue} days past close date — polluting your forecast` : null,
        title: o.Name,
        subtitle: `${acct} · ${o.StageName}${amt ? " · " + amt : ""}`,
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
      const daysSince = o.LastActivityDate ? Math.floor((now - new Date(o.LastActivityDate)) / 86400000) : null;
      const amt = o.Amount ? fmt(o.Amount) : null;
      const acct = o.Account?.Name || "Unknown";

      // Skip $0 deals and Pipeline forecast category
      if (!o.Amount || o.Amount === 0) return;
      if ((o.Group_Forecast_Category__c || "").toLowerCase() === "pipeline") return;

      // Closing in 3 days or less
      if (daysToClose !== null && daysToClose <= 3 && daysToClose >= 0) {
        actions.dealsAtRisk.push({
          id: `opp-${o.Id}`, type: "follow-up", priority: "critical",
          criticalReason: `${acct}: ${amt || "Deal"} closes ${daysToClose === 0 ? "TODAY" : "in " + daysToClose + " day" + (daysToClose > 1 ? "s" : "")}`,
          title: o.Name,
          subtitle: `${acct} · ${o.StageName}${amt ? " · " + amt : ""}`,
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
          subtitle: `${acct} · ${o.StageName}${amt ? " · " + amt : ""}`,
          context: `${acct} deal closes in ${daysToClose} days (${o.CloseDate}). ${o.StageName} stage${amt ? ", " + amt : ""}. ${o.NextStep ? "Next step: " + o.NextStep : "No next step defined — this deal may slip."}`,
          channel: "salesforce",
          dueTime: `${daysToClose}d left`,
          suggestedAction: `Check in with ${acct} to confirm timeline. ${o.NextStep ? "Execute: " + o.NextStep : "Define a next step immediately."}`,
        });

      // Stale — no activity in 21+ days (but NOT 999/unknown)
      } else if (daysSince !== null && daysSince >= 21) {
        actions.dealsAtRisk.push({
          id: `opp-${o.Id}`, type: "follow-up", priority: "high",
          title: o.Name,
          subtitle: `${acct} · ${o.StageName}${amt ? " · " + amt : ""}`,
          context: `No logged SFDC activity with ${acct} in ${daysSince} days. ${o.StageName} stage${amt ? " with " + amt + " at risk" : ""}. ${daysSince > 30 ? "This deal is going cold — it needs immediate attention or should be closed." : "Engagement is fading — re-engage before it goes dead."}`,
          channel: "salesforce",
          dueTime: `${daysSince}d silent`,
          suggestedAction: daysSince > 30 ? `This deal needs a pulse check. Send a direct email or call ${acct}. If no response, close it.` : `Reach out to ${acct} with a value-add — don't just "check in."`,
        });
      }
    });

    // New leads — PE leads are CRITICAL
    newLeads.forEach(l => {
      const daysOld = l.CreatedDate ? Math.floor((now - new Date(l.CreatedDate)) / 86400000) : 0;
      const company = l.Company || "Unknown";
      const title = l.Title || "";
      const industry = l.Industry || "";
      const source = l.LeadSource || "";
      const desc = (l.Description || "").toLowerCase();

      // Detect PE: company name, industry, title, description
      const peKeywords = ["private equity", "pe ", "growth equity", "venture", "capital", "portfolio", "fund", "investment", "partners", "holdings"];
      const isPE = peKeywords.some(kw => company.toLowerCase().includes(kw) || industry.toLowerCase().includes(kw) || title.toLowerCase().includes(kw) || desc.includes(kw));

      const priority = isPE ? "critical" : daysOld <= 1 ? "high" : "medium";

      actions.external.push({
        id: `lead-${l.Id}`, type: "follow-up", priority,
        criticalReason: isPE ? `PE LEAD: ${l.Name} from ${company} — private equity leads are high-value, respond immediately` : (daysOld <= 1 ? `New lead from ${company} — respond while warm` : null),
        title: `New lead: ${l.Name}`,
        subtitle: `${company} · ${title || "—"}${isPE ? " · PE" : ""}${source ? " · " + source : ""}`,
        context: isPE
          ? `${l.Name}${title ? " (" + title + ")" : ""} from ${company} — this looks like a private equity lead. ${industry ? "Industry: " + industry + ". " : ""}PE firms bring portfolio-wide opportunities. ${daysOld === 0 ? "Came in today." : "Came in " + daysOld + " days ago."} ${source ? "Source: " + source + "." : ""}`
          : `${l.Name}${title ? " (" + title + ")" : ""} from ${company} came in ${daysOld === 0 ? "today" : daysOld + " days ago"}. ${daysOld <= 1 ? "Speed to lead matters." : "This lead is " + daysOld + " days old."} ${source ? "Source: " + source + "." : ""}`,
        channel: "salesforce",
        dueTime: isPE ? "PE — Act now" : (daysOld <= 1 ? "New" : `${daysOld}d old`),
        suggestedAction: isPE
          ? `Respond immediately. Research ${company} portfolio companies. ${title ? l.Name + " is " + title + " — this is a decision maker." : ""} PE = multi-deal opportunity.`
          : `Research ${company} and reach out. ${title ? l.Name + " is " + title + "." : ""}`,
      });
    });

    const po = { critical: 0, high: 1, medium: 2, low: 3 };
    actions.external.sort((a, b) => (po[a.priority] ?? 3) - (po[b.priority] ?? 3));
    actions.dealsAtRisk.sort((a, b) => (po[a.priority] ?? 3) - (po[b.priority] ?? 3));

    return Response.json(actions);
  } catch (e) {
    return Response.json({ external: [], internal: [], dealsAtRisk: [], error: e.message });
  }
};

export const config = { path: "/.netlify/functions/actions-fast" };
