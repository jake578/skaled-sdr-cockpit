// Revenue Forecasting — weighted pipeline by forecast category, monthly rollup
export default async (req) => {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    if (!sfdcMatch) return Response.json({ error: "SFDC not connected" }, { status: 401 });

    const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
    const now = new Date();

    const sfdcQuery = async (soql) => {
      const res = await fetch(
        `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.records || [];
    };

    // All open opps
    const openOpps = await sfdcQuery(`
      SELECT Id, Name, Account.Name, Amount, StageName, Probability, CloseDate,
        Group_Forecast_Category__c, CreatedDate, LastActivityDate
      FROM Opportunity WHERE IsClosed = false ORDER BY CloseDate ASC
    `);

    // Recently closed (won + lost, last 90 days)
    const closedOpps = await sfdcQuery(`
      SELECT Id, Name, Amount, StageName, IsWon, CloseDate, Group_Forecast_Category__c
      FROM Opportunity WHERE IsClosed = true AND CloseDate >= LAST_N_DAYS:90 ORDER BY CloseDate DESC
    `);

    // Forecast category weights
    const categoryWeights = {
      "Closed": 1.0,
      "Commit": 0.9,
      "Best Case": 0.6,
      "Pipeline": 0.3,
      "Omitted": 0.0,
    };

    // Monthly rollup for open pipeline
    const monthlyPipeline = {};
    const monthlyWeighted = {};
    const categoryBreakdown = {};

    openOpps.forEach(o => {
      const amount = o.Amount || 0;
      const category = o.Group_Forecast_Category__c || "Pipeline";
      const weight = categoryWeights[category] ?? 0.3;
      const closeMonth = o.CloseDate ? o.CloseDate.substring(0, 7) : "Unknown";

      // Monthly totals
      if (!monthlyPipeline[closeMonth]) monthlyPipeline[closeMonth] = 0;
      if (!monthlyWeighted[closeMonth]) monthlyWeighted[closeMonth] = 0;
      monthlyPipeline[closeMonth] += amount;
      monthlyWeighted[closeMonth] += amount * weight;

      // Category breakdown
      if (!categoryBreakdown[category]) categoryBreakdown[category] = { count: 0, total: 0, weighted: 0 };
      categoryBreakdown[category].count++;
      categoryBreakdown[category].total += amount;
      categoryBreakdown[category].weighted += amount * weight;
    });

    // Build monthly array sorted by month
    const months = [...new Set([...Object.keys(monthlyPipeline)])].sort();
    const monthlyData = months.map(m => ({
      month: m,
      pipeline: Math.round(monthlyPipeline[m] || 0),
      weighted: Math.round(monthlyWeighted[m] || 0),
    }));

    // Category summary
    const categories = Object.entries(categoryBreakdown)
      .map(([name, data]) => ({
        name,
        count: data.count,
        total: Math.round(data.total),
        weighted: Math.round(data.weighted),
        weight: categoryWeights[name] ?? 0.3,
      }))
      .sort((a, b) => b.weighted - a.weighted);

    // Win/loss stats (last 90 days)
    const wonOpps = closedOpps.filter(o => o.IsWon);
    const lostOpps = closedOpps.filter(o => !o.IsWon);
    const wonAmount = wonOpps.reduce((s, o) => s + (o.Amount || 0), 0);
    const lostAmount = lostOpps.reduce((s, o) => s + (o.Amount || 0), 0);
    const winRate = closedOpps.length > 0 ? Math.round((wonOpps.length / closedOpps.length) * 100) : 0;

    // Current quarter calculation
    const quarter = Math.floor(now.getMonth() / 3);
    const quarterStart = new Date(now.getFullYear(), quarter * 3, 1).toISOString().split("T")[0].substring(0, 7);
    const quarterEnd = new Date(now.getFullYear(), (quarter + 1) * 3, 0).toISOString().split("T")[0].substring(0, 7);
    const quarterMonths = months.filter(m => m >= quarterStart && m <= quarterEnd);
    const quarterPipeline = quarterMonths.reduce((s, m) => s + (monthlyPipeline[m] || 0), 0);
    const quarterWeighted = quarterMonths.reduce((s, m) => s + (monthlyWeighted[m] || 0), 0);
    const quarterWon = wonOpps
      .filter(o => o.CloseDate && o.CloseDate.substring(0, 7) >= quarterStart && o.CloseDate.substring(0, 7) <= quarterEnd)
      .reduce((s, o) => s + (o.Amount || 0), 0);

    // Pipeline by stage
    const stageBreakdown = {};
    openOpps.forEach(o => {
      const stage = o.StageName || "Unknown";
      if (!stageBreakdown[stage]) stageBreakdown[stage] = { count: 0, total: 0 };
      stageBreakdown[stage].count++;
      stageBreakdown[stage].total += o.Amount || 0;
    });
    const stages = Object.entries(stageBreakdown)
      .map(([name, data]) => ({ name, count: data.count, total: Math.round(data.total) }))
      .sort((a, b) => b.total - a.total);

    // Top deals
    const topDeals = openOpps
      .filter(o => o.Amount)
      .sort((a, b) => (b.Amount || 0) - (a.Amount || 0))
      .slice(0, 10)
      .map(o => ({
        id: o.Id,
        name: o.Name,
        account: o.Account?.Name || "—",
        amount: o.Amount,
        stage: o.StageName,
        closeDate: o.CloseDate,
        forecastCategory: o.Group_Forecast_Category__c || "—",
      }));

    const totalPipeline = openOpps.reduce((s, o) => s + (o.Amount || 0), 0);
    const totalWeighted = Math.round(openOpps.reduce((s, o) => {
      const w = categoryWeights[o.Group_Forecast_Category__c] ?? 0.3;
      return s + (o.Amount || 0) * w;
    }, 0));

    return Response.json({
      totalPipeline: Math.round(totalPipeline),
      totalWeighted,
      totalOpps: openOpps.length,
      monthlyData,
      categories,
      stages,
      topDeals,
      winLoss: {
        won: wonOpps.length,
        lost: lostOpps.length,
        wonAmount: Math.round(wonAmount),
        lostAmount: Math.round(lostAmount),
        winRate,
        period: "Last 90 days",
      },
      quarter: {
        label: `Q${quarter + 1} ${now.getFullYear()}`,
        pipeline: Math.round(quarterPipeline),
        weighted: Math.round(quarterWeighted),
        closed: Math.round(quarterWon),
      },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/revenue-forecast" };
