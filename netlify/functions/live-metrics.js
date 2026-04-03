// Live CEO metrics — pipeline, deals, client health, activity summary
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  try {
    const now = new Date();
    const metrics = {};

    // SFDC metrics
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);

    if (sfdcMatch) {
      const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
      const sfdcQuery = async (soql) => {
        const res = await fetch(
          `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`,
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        );
        if (!res.ok) return [];
        const data = await res.json();
        return data.records || [];
      };

      // Open pipeline
      const openOpps = await sfdcQuery(
        `SELECT Id, Amount, StageName, CloseDate, Group_Forecast_Category__c FROM Opportunity WHERE IsClosed = false`
      );
      const totalPipeline = openOpps.reduce((s, o) => s + (o.Amount || 0), 0);
      const categoryWeights = { "Closed": 1.0, "Commit": 0.9, "Best Case": 0.6, "Pipeline": 0.3, "Omitted": 0.0 };
      const weightedPipeline = openOpps.reduce((s, o) => {
        const w = categoryWeights[o.Group_Forecast_Category__c] ?? 0.3;
        return s + (o.Amount || 0) * w;
      }, 0);

      // Past due opps
      const todayStr = now.toISOString().split("T")[0];
      const pastDue = openOpps.filter(o => o.CloseDate && o.CloseDate < todayStr).length;

      // Closing this week
      const weekOut = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];
      const closingThisWeek = openOpps.filter(o => o.CloseDate && o.CloseDate >= todayStr && o.CloseDate <= weekOut).length;

      // Won this quarter
      const quarter = Math.floor(now.getMonth() / 3);
      const quarterStartMonth = quarter * 3 + 1;
      const quarterStartStr = `${now.getFullYear()}-${String(quarterStartMonth).padStart(2, "0")}-01`;
      const wonThisQ = await sfdcQuery(
        `SELECT COUNT(Id) cnt, SUM(Amount) total FROM Opportunity WHERE IsWon = true AND CloseDate >= ${quarterStartStr}`
      );
      const wonCount = wonThisQ[0]?.cnt || 0;
      const wonAmount = wonThisQ[0]?.total || 0;

      // New leads this week
      const weekAgoStr = new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0];
      const newLeads = await sfdcQuery(
        `SELECT COUNT(Id) cnt FROM Lead WHERE IsConverted = false AND CreatedDate >= ${weekAgoStr}T00:00:00Z`
      );

      metrics.totalPipeline = Math.round(totalPipeline);
      metrics.weightedPipeline = Math.round(weightedPipeline);
      metrics.openDeals = openOpps.length;
      metrics.pastDueDeals = pastDue;
      metrics.closingThisWeek = closingThisWeek;
      metrics.wonThisQuarter = wonCount;
      metrics.wonAmountThisQuarter = Math.round(wonAmount);
      metrics.newLeadsThisWeek = newLeads[0]?.cnt || 0;
      metrics.quarterLabel = `Q${quarter + 1} ${now.getFullYear()}`;
    }

    // Gmail metrics (last 7 days)
    try {
      const gtoken = await getAccessToken();
      const unreadRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q=in:inbox is:unread newer_than:7d -category:promotions -category:social -category:updates`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const unreadData = await unreadRes.json();
      metrics.unreadEmails = unreadData.resultSizeEstimate || 0;
    } catch {
      metrics.unreadEmails = 0;
    }

    // Calendar: meetings today
    try {
      const gtoken = await getAccessToken();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(todayStart)}&timeMax=${encodeURIComponent(todayEnd)}` +
        `&maxResults=50&singleEvents=true`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const calData = await calRes.json();
      metrics.meetingsToday = (calData.items || []).length;
    } catch {
      metrics.meetingsToday = 0;
    }

    return Response.json(metrics);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/live-metrics" };
