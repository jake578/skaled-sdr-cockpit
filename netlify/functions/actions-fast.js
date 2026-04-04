// FAST actions — SFDC only, no Gmail/Calendar/Claude. Sub-2-second response.
export default async (req) => {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    if (!sfdcMatch) return Response.json({ external: [], internal: [], dealsAtRisk: [] });

    const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const weekStr = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];

    const sfdcQuery = async (soql) => {
      const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!res.ok) return [];
      return (await res.json()).records || [];
    };

    const actions = { external: [], internal: [], dealsAtRisk: [] };

    // 3 parallel SFDC queries — fast
    const [openOpps, newLeads, pastDue] = await Promise.all([
      sfdcQuery(`SELECT Id, Name, Account.Name, Amount, StageName, CloseDate, LastActivityDate, Group_Forecast_Category__c FROM Opportunity WHERE IsClosed = false AND (NOT StageName LIKE 'Closed%') ORDER BY CloseDate ASC LIMIT 50`),
      sfdcQuery(`SELECT Id, Name, Company, Title, Status, CreatedDate FROM Lead WHERE IsConverted = false AND Status = 'New' ORDER BY CreatedDate DESC LIMIT 10`),
      sfdcQuery(`SELECT Id, Name, Account.Name, Amount, StageName, CloseDate, Group_Forecast_Category__c FROM Opportunity WHERE IsClosed = false AND (NOT StageName LIKE 'Closed%') AND CloseDate < ${todayStr} ORDER BY CloseDate ASC LIMIT 30`),
    ]);

    // Deals at risk: past due + closing soon + stale
    pastDue.forEach(o => {
      const daysOverdue = Math.floor((now - new Date(o.CloseDate)) / 86400000);
      const priority = daysOverdue > 30 ? "critical" : daysOverdue > 14 ? "high" : "medium";
      actions.dealsAtRisk.push({
        id: `opp-${o.Id}`, type: "follow-up", priority,
        criticalReason: priority === "critical" ? `${daysOverdue} days past close — ${o.Amount ? "$" + o.Amount.toLocaleString() + " aging pipeline" : "needs attention"}` : null,
        title: o.Name,
        subtitle: `${o.Account?.Name || "—"} · ${o.StageName} · ${o.Amount ? "$" + o.Amount.toLocaleString() : "—"} · ${o.Group_Forecast_Category__c || "—"}`,
        channel: "salesforce", dueTime: `${daysOverdue}d overdue`,
        suggestedAction: `Close date was ${o.CloseDate}. Update, close lost, or advance.`,
      });
    });

    openOpps.forEach(o => {
      if (pastDue.some(p => p.Id === o.Id)) return; // Already in past due
      const daysToClose = o.CloseDate ? Math.floor((new Date(o.CloseDate) - now) / 86400000) : 999;
      const daysSince = o.LastActivityDate ? Math.floor((now - new Date(o.LastActivityDate)) / 86400000) : 999;

      if (daysToClose <= 7 && daysToClose >= 0) {
        const priority = daysToClose <= 3 ? "critical" : "high";
        actions.dealsAtRisk.push({
          id: `opp-${o.Id}`, type: "follow-up", priority,
          criticalReason: priority === "critical" ? `Closes in ${daysToClose}d — ${o.Amount ? "$" + o.Amount.toLocaleString() + " at stake" : "confirm status"}` : null,
          title: o.Name,
          subtitle: `${o.Account?.Name || "—"} · ${o.StageName} · ${o.Amount ? "$" + o.Amount.toLocaleString() : "—"}`,
          channel: "salesforce", dueTime: `Closes in ${daysToClose}d`,
          suggestedAction: `Close date in ${daysToClose} days. Confirm or push.`,
        });
      } else if (daysSince >= 14) {
        actions.dealsAtRisk.push({
          id: `opp-${o.Id}`, type: "follow-up", priority: "high",
          title: o.Name,
          subtitle: `${o.Account?.Name || "—"} · ${o.StageName} · ${o.Amount ? "$" + o.Amount.toLocaleString() : "—"}`,
          channel: "salesforce", dueTime: `${daysSince}d since activity`,
          suggestedAction: `No SFDC activity in ${daysSince} days. Checking Gmail/Calendar for real activity...`,
        });
      }
    });

    // New leads → external
    newLeads.forEach(l => {
      const daysOld = l.CreatedDate ? Math.floor((now - new Date(l.CreatedDate)) / 86400000) : 0;
      actions.external.push({
        id: `lead-${l.Id}`, type: "follow-up", priority: daysOld <= 1 ? "high" : "medium",
        title: `New lead: ${l.Name}`, subtitle: `${l.Company || "—"} · ${l.Title || "—"}`,
        channel: "salesforce", dueTime: daysOld <= 1 ? "New today" : `${daysOld}d old`,
        suggestedAction: `New lead from ${l.Company || "unknown"}. Research and qualify.`,
      });
    });

    // Sort
    const po = { critical: 0, high: 1, medium: 2, low: 3 };
    actions.external.sort((a, b) => (po[a.priority] ?? 3) - (po[b.priority] ?? 3));
    actions.dealsAtRisk.sort((a, b) => (po[a.priority] ?? 3) - (po[b.priority] ?? 3));

    return Response.json(actions);
  } catch (e) {
    return Response.json({ external: [], internal: [], dealsAtRisk: [], error: e.message });
  }
};

export const config = { path: "/.netlify/functions/actions-fast" };
