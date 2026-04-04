// Win/Loss Pattern Analysis — sweet spots, blind spots, cycle insights
export default async (req) => {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    if (!sfdcMatch) return Response.json({ error: "SFDC not connected" }, { status: 401 });

    const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
    const sfdcQuery = async (soql) => {
      const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!res.ok) return [];
      return (await res.json()).records || [];
    };

    const opps = await sfdcQuery(`SELECT Name, Amount, IsWon, StageName, CloseDate, CreatedDate, LeadSource, Account.Industry, Account.NumberOfEmployees, Lost_Reason__c FROM Opportunity WHERE IsClosed = true AND CloseDate >= LAST_N_DAYS:365 ORDER BY CloseDate DESC`);

    if (!opps.length) return Response.json({ error: "No closed deals in last 12 months" });

    const won = opps.filter(o => o.IsWon);
    const lost = opps.filter(o => !o.IsWon);

    // By size
    const sizeBrackets = [
      { label: "$0-25K", min: 0, max: 25000 },
      { label: "$25-50K", min: 25000, max: 50000 },
      { label: "$50-100K", min: 50000, max: 100000 },
      { label: "$100K+", min: 100000, max: Infinity },
    ];
    const bySize = sizeBrackets.map(b => {
      const w = won.filter(o => (o.Amount || 0) >= b.min && (o.Amount || 0) < b.max).length;
      const l = lost.filter(o => (o.Amount || 0) >= b.min && (o.Amount || 0) < b.max).length;
      return { label: b.label, won: w, lost: l, total: w + l, winRate: w + l > 0 ? Math.round((w / (w + l)) * 100) : 0 };
    });

    // By source
    const sources = {};
    opps.forEach(o => {
      const src = o.LeadSource || "Unknown";
      if (!sources[src]) sources[src] = { won: 0, lost: 0 };
      o.IsWon ? sources[src].won++ : sources[src].lost++;
    });
    const bySource = Object.entries(sources).map(([name, d]) => ({ label: name, won: d.won, lost: d.lost, total: d.won + d.lost, winRate: d.won + d.lost > 0 ? Math.round((d.won / (d.won + d.lost)) * 100) : 0 })).sort((a, b) => b.total - a.total);

    // By industry
    const industries = {};
    opps.forEach(o => {
      const ind = o.Account?.Industry || "Unknown";
      if (!industries[ind]) industries[ind] = { won: 0, lost: 0 };
      o.IsWon ? industries[ind].won++ : industries[ind].lost++;
    });
    const byIndustry = Object.entries(industries).map(([name, d]) => ({ label: name, won: d.won, lost: d.lost, total: d.won + d.lost, winRate: d.won + d.lost > 0 ? Math.round((d.won / (d.won + d.lost)) * 100) : 0 })).sort((a, b) => b.total - a.total);

    // Cycle time
    const cycleDays = (list) => {
      const days = list.filter(o => o.CreatedDate && o.CloseDate).map(o => Math.floor((new Date(o.CloseDate) - new Date(o.CreatedDate)) / 86400000));
      return days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;
    };

    // Loss reasons
    const lossReasons = {};
    lost.forEach(o => { const r = o.Lost_Reason__c || "Not specified"; lossReasons[r] = (lossReasons[r] || 0) + 1; });
    const topLossReasons = Object.entries(lossReasons).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => ({ reason, count }));

    const stats = `
Total Closed (12mo): ${opps.length} (${won.length} won, ${lost.length} lost)
Overall Win Rate: ${Math.round((won.length / opps.length) * 100)}%
Won Amount: $${won.reduce((s, o) => s + (o.Amount || 0), 0).toLocaleString()}
Lost Amount: $${lost.reduce((s, o) => s + (o.Amount || 0), 0).toLocaleString()}
Avg Won Cycle: ${cycleDays(won)} days
Avg Lost Cycle: ${cycleDays(lost)} days

By Size: ${bySize.map(b => `${b.label}: ${b.winRate}% (${b.won}W/${b.lost}L)`).join(", ")}
By Source: ${bySource.slice(0, 5).map(b => `${b.label}: ${b.winRate}% (${b.total})`).join(", ")}
By Industry: ${byIndustry.slice(0, 5).map(b => `${b.label}: ${b.winRate}% (${b.total})`).join(", ")}
Top Loss Reasons: ${topLossReasons.map(r => `${r.reason} (${r.count})`).join(", ")}
`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 1024,
        system: "Analyze win/loss patterns for Skaled Consulting (sales consulting firm). Be specific and actionable. Plain text, no markdown, no asterisks.",
        messages: [{ role: "user", content: `${stats}\n\nReturn JSON: { "sweetSpot": { "dealSize": "", "industry": "", "source": "", "description": "" }, "blindSpots": [{ "area": "", "insight": "" }], "cycleInsights": { "avgWonDays": ${cycleDays(won)}, "avgLostDays": ${cycleDays(lost)}, "insight": "" }, "recommendations": [""] }` }],
      }),
    });

    if (!claudeRes.ok) return Response.json({ error: await claudeRes.text() }, { status: claudeRes.status });
    const raw = (await claudeRes.json()).content?.[0]?.text || "";
    let aiAnalysis = {};
    try { const match = raw.match(/\{[\s\S]*\}/); if (match) aiAnalysis = JSON.parse(match[0]); } catch {}

    return Response.json({
      ...aiAnalysis,
      patterns: { bySize, bySource: bySource.slice(0, 8), byIndustry: byIndustry.slice(0, 8) },
      topLossReasons,
      totals: { won: won.length, lost: lost.length, total: opps.length, winRate: Math.round((won.length / opps.length) * 100), wonAmount: Math.round(won.reduce((s, o) => s + (o.Amount || 0), 0)), lostAmount: Math.round(lost.reduce((s, o) => s + (o.Amount || 0), 0)) },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/win-loss-patterns" };
