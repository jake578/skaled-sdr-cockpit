// Cash Flow Projection — pipeline-to-cash with deal-level drill-down
export default async (req) => {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    if (!sfdcMatch) return Response.json({ error: "SFDC not connected" }, { status: 401 });

    const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
    const now = new Date();
    const sfdcQuery = async (soql) => {
      const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!res.ok) return [];
      return (await res.json()).records || [];
    };

    const quarter = Math.floor(now.getMonth() / 3);
    const qStart = `${now.getFullYear()}-${String(quarter * 3 + 1).padStart(2, "0")}-01`;
    const todayStr = now.toISOString().split("T")[0];

    const [openOpps, closedWon] = await Promise.all([
      sfdcQuery(`SELECT Id, Name, Account.Name, Amount, CloseDate, StageName, Group_Forecast_Category__c, Probability, LastActivityDate FROM Opportunity WHERE IsClosed = false AND Amount > 0 ORDER BY CloseDate ASC`),
      sfdcQuery(`SELECT Id, Name, Account.Name, Amount, CloseDate FROM Opportunity WHERE IsWon = true AND CloseDate >= ${qStart} ORDER BY CloseDate DESC`),
    ]);

    const weights = { "Commit": 0.9, "Best Case": 0.6, "Pipeline": 0.3, "Omitted": 0, "Closed": 1.0 };

    // Build next 6 months with deal-level detail
    const monthly = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly.push({ month, committed: 0, bestCase: 0, pipeline: 0, total: 0, deals: [] });
    }

    // Past due bucket
    const pastDue = { month: "Past Due", committed: 0, bestCase: 0, pipeline: 0, total: 0, deals: [] };

    openOpps.forEach(o => {
      if (!o.CloseDate) return;
      const cat = o.Group_Forecast_Category__c || "Pipeline";
      const amount = o.Amount || 0;
      const w = weights[cat] ?? 0.3;
      const weighted = Math.round(amount * w);

      const deal = {
        id: o.Id, name: o.Name, account: o.Account?.Name || "—",
        amount, weighted, stage: o.StageName || "—",
        category: cat, closeDate: o.CloseDate,
        probability: o.Probability || 0,
        lastActivity: o.LastActivityDate || "—",
        pastDue: o.CloseDate < todayStr,
      };

      if (o.CloseDate < todayStr) {
        pastDue.deals.push(deal);
        if (cat === "Commit") pastDue.committed += weighted;
        else if (cat === "Best Case") pastDue.bestCase += weighted;
        else pastDue.pipeline += weighted;
        pastDue.total += weighted;
        return;
      }

      // Revenue spread: 1-month deals stay in close month
      // Multi-month deals spread over 2.5 months from close date
      // Split: 40% month 1, 35% month 2, 25% month 3 (half)
      const oppMonth = o.CloseDate.substring(0, 7);
      const closeMonthIdx = monthly.findIndex(m => m.month === oppMonth);
      if (closeMonthIdx < 0) return;

      // Determine if this is a one-time or multi-month engagement
      // Heuristic: deals < $15K are likely one-month, larger deals spread
      const isOneMonth = amount < 15000;

      if (isOneMonth) {
        // One-month deal: all revenue in close month
        const m = monthly[closeMonthIdx];
        m.deals.push(deal);
        if (cat === "Commit") m.committed += weighted;
        else if (cat === "Best Case") m.bestCase += weighted;
        else m.pipeline += weighted;
        m.total += weighted;
      } else {
        // Multi-month: spread over 2.5 months (40/35/25 split)
        const splits = [0.4, 0.35, 0.25];
        const spreadDeal = { ...deal, spreadNote: "Spread over 2.5 months" };
        for (let s = 0; s < 3; s++) {
          const mIdx = closeMonthIdx + s;
          if (mIdx >= monthly.length) break;
          const m = monthly[mIdx];
          const portion = Math.round(weighted * splits[s]);
          const rawPortion = Math.round(amount * splits[s]);

          if (s === 0) {
            m.deals.push({ ...spreadDeal, weighted: portion, spreadAmount: rawPortion, spreadPct: "40%" });
          } else {
            m.deals.push({ ...spreadDeal, weighted: portion, spreadAmount: rawPortion, spreadPct: s === 1 ? "35%" : "25%", isSpread: true });
          }

          if (cat === "Commit") m.committed += portion;
          else if (cat === "Best Case") m.bestCase += portion;
          else m.pipeline += portion;
          m.total += portion;
        }
      }
    });

    // Unweighted totals per month
    monthly.forEach(m => {
      m.unweightedTotal = m.deals.reduce((s, d) => s + d.amount, 0);
      m.dealCount = m.deals.length;
      // Sort deals: Commit first, then by amount
      const catOrder = { "Commit": 0, "Best Case": 1, "Pipeline": 2, "Omitted": 3 };
      m.deals.sort((a, b) => (catOrder[a.category] ?? 9) - (catOrder[b.category] ?? 9) || b.amount - a.amount);
    });

    pastDue.unweightedTotal = pastDue.deals.reduce((s, d) => s + d.amount, 0);
    pastDue.dealCount = pastDue.deals.length;
    pastDue.deals.sort((a, b) => b.amount - a.amount);

    // Rolling summaries
    const d30 = new Date(now.getTime() + 30 * 86400000).toISOString().split("T")[0];
    const d60 = new Date(now.getTime() + 60 * 86400000).toISOString().split("T")[0];
    const d90 = new Date(now.getTime() + 90 * 86400000).toISOString().split("T")[0];

    const weightedSum = (maxDate) => Math.round(openOpps.filter(o => o.CloseDate && o.CloseDate >= todayStr && o.CloseDate <= maxDate).reduce((s, o) => s + (o.Amount || 0) * (weights[o.Group_Forecast_Category__c] ?? 0.3), 0));
    const unweightedSum = (maxDate) => Math.round(openOpps.filter(o => o.CloseDate && o.CloseDate >= todayStr && o.CloseDate <= maxDate).reduce((s, o) => s + (o.Amount || 0), 0));

    // Category totals
    const categoryTotals = {};
    openOpps.forEach(o => {
      const cat = o.Group_Forecast_Category__c || "Pipeline";
      if (!categoryTotals[cat]) categoryTotals[cat] = { count: 0, total: 0, weighted: 0 };
      categoryTotals[cat].count++;
      categoryTotals[cat].total += o.Amount || 0;
      categoryTotals[cat].weighted += Math.round((o.Amount || 0) * (weights[cat] ?? 0.3));
    });

    return Response.json({
      monthly: pastDue.deals.length > 0 ? [pastDue, ...monthly] : monthly,
      summary: {
        next30d: weightedSum(d30), next60d: weightedSum(d60), next90d: weightedSum(d90),
        next30dRaw: unweightedSum(d30), next60dRaw: unweightedSum(d60), next90dRaw: unweightedSum(d90),
        totalProjected: monthly.reduce((s, m) => s + m.total, 0),
        totalUnweighted: monthly.reduce((s, m) => s + m.unweightedTotal, 0),
        totalDeals: openOpps.length,
        pastDueCount: pastDue.deals.length,
        pastDueAmount: pastDue.unweightedTotal,
      },
      categoryTotals: Object.entries(categoryTotals).map(([cat, d]) => ({ category: cat, ...d, weight: weights[cat] ?? 0.3 })).sort((a, b) => b.weighted - a.weighted),
      closedThisQuarter: {
        count: closedWon.length,
        total: Math.round(closedWon.reduce((s, o) => s + (o.Amount || 0), 0)),
        deals: closedWon.slice(0, 10).map(o => ({ id: o.Id, name: o.Name, account: o.Account?.Name || "—", amount: o.Amount || 0, closeDate: o.CloseDate })),
      },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/cash-flow" };
