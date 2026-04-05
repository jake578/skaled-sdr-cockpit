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
      sfdcQuery(`SELECT Id, Name, Company, Title, Status, CreatedDate FROM Lead WHERE IsConverted = false AND Status = 'New' ORDER BY CreatedDate DESC LIMIT 10`),
      sfdcQuery(`SELECT Id, Name, Account.Name, Amount, StageName, CloseDate, Group_Forecast_Category__c FROM Opportunity WHERE IsClosed = false AND (NOT StageName LIKE 'Closed%') AND CloseDate < ${todayStr} ORDER BY CloseDate ASC LIMIT 30`),
    ]);

    // Past due deals
    pastDue.forEach(o => {
      const daysOverdue = Math.floor((now - new Date(o.CloseDate)) / 86400000);
      const amt = o.Amount ? fmt(o.Amount) : null;
      const acct = o.Account?.Name || "Unknown";
      const priority = daysOverdue > 30 ? "critical" : daysOverdue > 14 ? "high" : "medium";

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

      // Stale — no activity in 14+ days (but NOT 999/unknown)
      } else if (daysSince !== null && daysSince >= 14) {
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

    // New leads
    newLeads.forEach(l => {
      const daysOld = l.CreatedDate ? Math.floor((now - new Date(l.CreatedDate)) / 86400000) : 0;
      actions.external.push({
        id: `lead-${l.Id}`, type: "follow-up",
        priority: daysOld <= 1 ? "high" : "medium",
        criticalReason: daysOld <= 1 ? `New lead from ${l.Company || "unknown"} — respond quickly while they're warm` : null,
        title: `New lead: ${l.Name}`,
        subtitle: `${l.Company || "—"} · ${l.Title || "—"}`,
        context: `${l.Name}${l.Title ? " (" + l.Title + ")" : ""} from ${l.Company || "unknown"} came in ${daysOld === 0 ? "today" : daysOld + " days ago"}. ${daysOld <= 1 ? "Speed to lead matters — the faster you respond, the higher the conversion rate." : "This lead is " + daysOld + " days old and hasn't been worked yet."}`,
        channel: "salesforce",
        dueTime: daysOld <= 1 ? "New" : `${daysOld}d old`,
        suggestedAction: `Research ${l.Company || "the company"} and reach out. ${l.Title ? l.Name + " is " + l.Title + " — tailor your approach to their level." : ""}`,
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
