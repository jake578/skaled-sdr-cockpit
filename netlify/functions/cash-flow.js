// Cash Flow Projection — pipeline-to-cash modeling by month
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

    const [openOpps, closedWon] = await Promise.all([
      sfdcQuery(`SELECT Amount, CloseDate, Group_Forecast_Category__c FROM Opportunity WHERE IsClosed = false AND Amount > 0`),
      sfdcQuery(`SELECT Amount, CloseDate FROM Opportunity WHERE IsWon = true AND CloseDate >= ${qStart}`),
    ]);

    const weights = { "Commit": 0.9, "Best Case": 0.6, "Pipeline": 0.3, "Omitted": 0, "Closed": 1.0 };

    // Build next 6 months
    const monthly = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly.push({ month, committed: 0, bestCase: 0, pipeline: 0, total: 0 });
    }

    openOpps.forEach(o => {
      if (!o.CloseDate) return;
      const oppMonth = o.CloseDate.substring(0, 7);
      const m = monthly.find(m => m.month === oppMonth);
      if (!m) return;
      const cat = o.Group_Forecast_Category__c || "Pipeline";
      const amount = o.Amount || 0;
      const w = weights[cat] ?? 0.3;
      if (cat === "Commit") m.committed += amount * w;
      else if (cat === "Best Case") m.bestCase += amount * w;
      else m.pipeline += amount * w;
      m.total += amount * w;
    });

    monthly.forEach(m => { m.committed = Math.round(m.committed); m.bestCase = Math.round(m.bestCase); m.pipeline = Math.round(m.pipeline); m.total = Math.round(m.total); });

    // Rolling summaries
    const today = now.toISOString().split("T")[0];
    const d30 = new Date(now.getTime() + 30 * 86400000).toISOString().split("T")[0];
    const d60 = new Date(now.getTime() + 60 * 86400000).toISOString().split("T")[0];
    const d90 = new Date(now.getTime() + 90 * 86400000).toISOString().split("T")[0];

    const weightedSum = (maxDate) => Math.round(openOpps.filter(o => o.CloseDate && o.CloseDate >= today && o.CloseDate <= maxDate).reduce((s, o) => s + (o.Amount || 0) * (weights[o.Group_Forecast_Category__c] ?? 0.3), 0));

    const closedTotal = closedWon.reduce((s, o) => s + (o.Amount || 0), 0);

    return Response.json({
      monthly,
      summary: { next30d: weightedSum(d30), next60d: weightedSum(d60), next90d: weightedSum(d90), totalProjected: monthly.reduce((s, m) => s + m.total, 0) },
      closedThisQuarter: { count: closedWon.length, total: Math.round(closedTotal) },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/cash-flow" };
