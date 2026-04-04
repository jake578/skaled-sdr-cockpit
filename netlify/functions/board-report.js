// Board-Ready QBR Generator — pulls SFDC + Gmail + Calendar + Drive for comprehensive report
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    if (!sfdcMatch) return Response.json({ error: "SFDC not connected" }, { status: 401 });

    const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3);
    const qStart = `${now.getFullYear()}-${String(quarter * 3 + 1).padStart(2, "0")}-01`;
    const quarterLabel = `Q${quarter + 1} ${now.getFullYear()}`;

    const sfdcQuery = async (soql) => {
      const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!res.ok) return [];
      return (await res.json()).records || [];
    };

    // Pull all data in parallel
    const [openOpps, wonOpps, lostOpps, allAccounts] = await Promise.all([
      sfdcQuery(`SELECT Name, Account.Name, Amount, StageName, CloseDate, Group_Forecast_Category__c FROM Opportunity WHERE IsClosed = false`),
      sfdcQuery(`SELECT Name, Account.Name, Amount, CloseDate FROM Opportunity WHERE IsWon = true AND CloseDate >= ${qStart}`),
      sfdcQuery(`SELECT Name, Account.Name, Amount, CloseDate, Lost_Reason__c FROM Opportunity WHERE IsClosed = true AND IsWon = false AND CloseDate >= ${qStart}`),
      sfdcQuery(`SELECT Name FROM Account WHERE Id IN (SELECT AccountId FROM Opportunity WHERE IsWon = true AND CloseDate >= LAST_N_DAYS:90) LIMIT 20`),
    ]);

    const categoryWeights = { "Commit": 0.9, "Best Case": 0.6, "Pipeline": 0.3, "Omitted": 0 };
    const totalPipeline = Math.round(openOpps.reduce((s, o) => s + (o.Amount || 0), 0));
    const weightedForecast = Math.round(openOpps.reduce((s, o) => s + (o.Amount || 0) * (categoryWeights[o.Group_Forecast_Category__c] ?? 0.3), 0));
    const wonThisQ = Math.round(wonOpps.reduce((s, o) => s + (o.Amount || 0), 0));
    const lostThisQ = Math.round(lostOpps.reduce((s, o) => s + (o.Amount || 0), 0));
    const totalClosed = wonOpps.length + lostOpps.length;
    const winRate = totalClosed > 0 ? Math.round((wonOpps.length / totalClosed) * 100) : 0;
    const avgDealSize = openOpps.filter(o => o.Amount).length > 0 ? Math.round(totalPipeline / openOpps.filter(o => o.Amount).length) : 0;

    // Gmail + Calendar activity counts
    let emailsSent = -1, meetingsHeld = -1;
    try {
      const gtoken = await getAccessToken();
      const emailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q=in:sent newer_than:30d`, { headers: { Authorization: `Bearer ${gtoken}` } });
      const emailData = await emailRes.json();
      emailsSent = emailData.resultSizeEstimate || 0;

      const past30 = new Date(now.getTime() - 30 * 86400000).toISOString();
      const calRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(past30)}&timeMax=${encodeURIComponent(now.toISOString())}&maxResults=200&singleEvents=true`, { headers: { Authorization: `Bearer ${gtoken}` } });
      const calData = await calRes.json();
      meetingsHeld = (calData.items || []).length;
    } catch {}

    // Build context for Claude
    const context = `
${quarterLabel} Business Review Data for Skaled Consulting:

Pipeline: $${totalPipeline.toLocaleString()} (${openOpps.length} deals)
Weighted Forecast: $${weightedForecast.toLocaleString()}
Won This Quarter: $${wonThisQ.toLocaleString()} (${wonOpps.length} deals)
Lost This Quarter: $${lostThisQ.toLocaleString()} (${lostOpps.length} deals)
Win Rate: ${winRate}%
Avg Deal Size: $${avgDealSize.toLocaleString()}
Emails Sent (30d): ${emailsSent}
Meetings (30d): ${meetingsHeld}

Active Clients: ${allAccounts.map(a => a.Name).join(", ")}

Won Deals: ${wonOpps.map(o => `${o.Name} ($${(o.Amount || 0).toLocaleString()}) — ${o.Account?.Name}`).join("; ") || "None"}
Lost Deals: ${lostOpps.map(o => `${o.Name} ($${(o.Amount || 0).toLocaleString()}) — ${o.Lost_Reason__c || "No reason"}`).join("; ") || "None"}

Pipeline by Category:
${Object.entries(openOpps.reduce((acc, o) => { const c = o.Group_Forecast_Category__c || "No Category"; acc[c] = (acc[c] || 0) + (o.Amount || 0); return acc; }, {})).map(([k, v]) => `- ${k}: $${v.toLocaleString()}`).join("\n")}
`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 4096,
        system: "Generate a CEO quarterly business review for Skaled Consulting. Write like a sharp, data-driven CFO presenting to the board. Be specific — reference actual numbers, clients, and deals. Plain text only, no markdown, no asterisks, no bullet point symbols. Use line breaks between paragraphs.",
        messages: [{ role: "user", content: `${context}\n\nReturn JSON: { "executiveSummary": "", "revenueUpdate": "", "pipelineHealth": "", "winLossAnalysis": "", "clientUpdates": "", "risks": "", "outlook": "", "keyMetrics": { "totalPipeline": ${totalPipeline}, "weightedForecast": ${weightedForecast}, "wonThisQ": ${wonThisQ}, "lostThisQ": ${lostThisQ}, "winRate": ${winRate}, "avgDealSize": ${avgDealSize} } }` }],
      }),
    });

    if (!claudeRes.ok) return Response.json({ error: await claudeRes.text() }, { status: claudeRes.status });
    const raw = (await claudeRes.json()).content?.[0]?.text || "";

    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const result = JSON.parse(match[0]);
        // Override metrics with our calculated numbers
        result.keyMetrics = { totalPipeline, weightedForecast, wonThisQ, lostThisQ, winRate, avgDealSize };
        return Response.json(result);
      }
    } catch {}
    return Response.json({ executiveSummary: raw.slice(0, 1000), keyMetrics: { totalPipeline, weightedForecast, wonThisQ, lostThisQ, winRate, avgDealSize } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/board-report" };
