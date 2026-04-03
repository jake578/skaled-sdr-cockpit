// Full pipeline detail — every angle of the pipeline for interactive drill-down
export default async (req) => {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    if (!sfdcMatch) return Response.json({ error: "SFDC not connected" }, { status: 401 });

    const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const sfdcQuery = async (soql) => {
      const res = await fetch(
        `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.records || [];
    };

    // All open opps with full details
    const opps = await sfdcQuery(`
      SELECT Id, Name, Account.Name, Amount, StageName, Probability, CloseDate,
        LastActivityDate, CreatedDate, LeadSource, Group_Forecast_Category__c, NextStep, Owner.Name
      FROM Opportunity WHERE IsClosed = false ORDER BY Amount DESC NULLS LAST
    `);

    // Recently closed (last 90 days)
    const closedRecent = await sfdcQuery(`
      SELECT Id, Name, Account.Name, Amount, StageName, IsWon, CloseDate, Group_Forecast_Category__c
      FROM Opportunity WHERE IsClosed = true AND CloseDate >= LAST_N_DAYS:90 ORDER BY CloseDate DESC
    `);

    const categoryWeights = { "Closed": 1.0, "Commit": 0.9, "Best Case": 0.6, "Pipeline": 0.3, "Omitted": 0.0 };
    const categoryOrder = ["Commit", "Best Case", "Pipeline", "Omitted"];

    // Build category breakdown
    const byCategory = {};
    opps.forEach(o => {
      const cat = o.Group_Forecast_Category__c || "No Category";
      if (!byCategory[cat]) byCategory[cat] = { deals: [], total: 0, weighted: 0, count: 0 };
      const amount = o.Amount || 0;
      const weight = categoryWeights[cat] ?? 0.3;
      byCategory[cat].deals.push({
        id: o.Id, name: o.Name, account: o.Account?.Name || "—",
        amount, stage: o.StageName || "—", closeDate: o.CloseDate || "—",
        probability: o.Probability || 0, source: o.LeadSource || "—",
        forecastCategory: cat, nextStep: o.NextStep || "—",
        lastActivity: o.LastActivityDate || "—", owner: o.Owner?.Name || "—",
        daysInPipeline: o.CreatedDate ? Math.floor((now.getTime() - new Date(o.CreatedDate).getTime()) / 86400000) : 0,
        pastDue: o.CloseDate && o.CloseDate < todayStr,
      });
      byCategory[cat].total += amount;
      byCategory[cat].weighted += amount * weight;
      byCategory[cat].count++;
    });

    // Build stage breakdown
    const byStage = {};
    opps.forEach(o => {
      const stage = o.StageName || "Unknown";
      if (!byStage[stage]) byStage[stage] = { total: 0, weighted: 0, count: 0 };
      const weight = categoryWeights[o.Group_Forecast_Category__c] ?? 0.3;
      byStage[stage].total += o.Amount || 0;
      byStage[stage].weighted += (o.Amount || 0) * weight;
      byStage[stage].count++;
    });

    // Monthly close date distribution
    const byMonth = {};
    opps.forEach(o => {
      const month = o.CloseDate ? o.CloseDate.substring(0, 7) : "No Date";
      if (!byMonth[month]) byMonth[month] = { total: 0, weighted: 0, count: 0, pastDue: false };
      const weight = categoryWeights[o.Group_Forecast_Category__c] ?? 0.3;
      byMonth[month].total += o.Amount || 0;
      byMonth[month].weighted += (o.Amount || 0) * weight;
      byMonth[month].count++;
      if (o.CloseDate && o.CloseDate < todayStr) byMonth[month].pastDue = true;
    });

    // Pipeline health metrics
    const totalPipeline = opps.reduce((s, o) => s + (o.Amount || 0), 0);
    const totalWeighted = opps.reduce((s, o) => s + (o.Amount || 0) * (categoryWeights[o.Group_Forecast_Category__c] ?? 0.3), 0);
    const pastDueCount = opps.filter(o => o.CloseDate && o.CloseDate < todayStr).length;
    const noAmount = opps.filter(o => !o.Amount).length;
    const noCategory = opps.filter(o => !o.Group_Forecast_Category__c).length;
    const avgDealSize = opps.filter(o => o.Amount).length > 0
      ? totalPipeline / opps.filter(o => o.Amount).length : 0;
    const avgAge = opps.length > 0
      ? Math.round(opps.reduce((s, o) => s + (o.CreatedDate ? (now.getTime() - new Date(o.CreatedDate).getTime()) / 86400000 : 0), 0) / opps.length)
      : 0;

    // Win rate (last 90 days)
    const wonRecent = closedRecent.filter(o => o.IsWon);
    const lostRecent = closedRecent.filter(o => !o.IsWon);
    const winRate = closedRecent.length > 0 ? Math.round((wonRecent.length / closedRecent.length) * 100) : 0;
    const wonAmount = wonRecent.reduce((s, o) => s + (o.Amount || 0), 0);
    const lostAmount = lostRecent.reduce((s, o) => s + (o.Amount || 0), 0);

    // Quarter info
    const quarter = Math.floor(now.getMonth() / 3);
    const quarterLabel = `Q${quarter + 1} ${now.getFullYear()}`;

    // Sorted categories
    const categories = categoryOrder
      .filter(c => byCategory[c])
      .map(c => ({ name: c, ...byCategory[c], weight: categoryWeights[c], deals: byCategory[c].deals.sort((a, b) => b.amount - a.amount) }));
    if (byCategory["No Category"]) {
      categories.push({ name: "No Category", ...byCategory["No Category"], weight: 0, deals: byCategory["No Category"].deals.sort((a, b) => b.amount - a.amount) });
    }

    // Sorted stages
    const stages = Object.entries(byStage)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);

    // Sorted months
    const months = Object.entries(byMonth)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return Response.json({
      summary: {
        totalPipeline: Math.round(totalPipeline),
        totalWeighted: Math.round(totalWeighted),
        totalDeals: opps.length,
        pastDueCount,
        noAmount,
        noCategory,
        avgDealSize: Math.round(avgDealSize),
        avgAge,
        winRate,
        wonAmount: Math.round(wonAmount),
        lostAmount: Math.round(lostAmount),
        wonCount: wonRecent.length,
        lostCount: lostRecent.length,
        quarterLabel,
      },
      categories,
      stages,
      months,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/pipeline-detail" };
