// FAST metrics — SFDC only, no Gmail/Calendar. Sub-1-second response.
export default async (req) => {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    if (!sfdcMatch) return Response.json({});

    const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const quarter = Math.floor(now.getMonth() / 3);
    const qStart = `${now.getFullYear()}-${String(quarter * 3 + 1).padStart(2, "0")}-01`;

    const sfdcQuery = async (soql) => {
      const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!res.ok) return [];
      return (await res.json()).records || [];
    };

    // 3 parallel queries
    const [oppAgg, wonAgg, leads] = await Promise.all([
      sfdcQuery(`SELECT COUNT(Id) cnt, SUM(Amount) total FROM Opportunity WHERE IsClosed = false`),
      sfdcQuery(`SELECT COUNT(Id) cnt, SUM(Amount) total FROM Opportunity WHERE IsWon = true AND CloseDate >= ${qStart}`),
      sfdcQuery(`SELECT COUNT(Id) cnt FROM Lead WHERE IsConverted = false AND CreatedDate >= LAST_N_DAYS:7`),
    ]);

    const categoryWeights = { "Commit": 0.9, "Best Case": 0.6, "Pipeline": 0.3, "Omitted": 0 };
    const totalPipeline = Math.round(oppAgg[0]?.total || 0);
    const openDeals = oppAgg[0]?.cnt || 0;

    // Quick weighted calc
    let weightedPipeline = Math.round(totalPipeline * 0.4); // Rough estimate, fast
    try {
      const cats = await sfdcQuery(`SELECT Group_Forecast_Category__c cat, SUM(Amount) total FROM Opportunity WHERE IsClosed = false GROUP BY Group_Forecast_Category__c`);
      weightedPipeline = Math.round(cats.reduce((s, c) => s + (c.total || 0) * (categoryWeights[c.cat] ?? 0.3), 0));
    } catch {}

    // Past due count
    let pastDueDeals = 0;
    try {
      const pd = await sfdcQuery(`SELECT COUNT(Id) cnt FROM Opportunity WHERE IsClosed = false AND Amount > 0 AND (NOT StageName LIKE 'Closed%') AND Group_Forecast_Category__c != 'Pipeline' AND CloseDate < ${todayStr}`);
      pastDueDeals = pd[0]?.cnt || 0;
    } catch {}

    return Response.json({
      totalPipeline, weightedPipeline, openDeals, pastDueDeals,
      wonThisQuarter: wonAgg[0]?.cnt || 0,
      wonAmountThisQuarter: Math.round(wonAgg[0]?.total || 0),
      newLeadsThisWeek: leads[0]?.cnt || 0,
      quarterLabel: `Q${quarter + 1} ${now.getFullYear()}`,
      meetingsToday: 0, // Filled by background enrichment
      unreadEmails: 0,
    });
  } catch (e) {
    return Response.json({ error: e.message });
  }
};

export const config = { path: "/.netlify/functions/metrics-fast" };
