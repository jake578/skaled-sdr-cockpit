// Win/Loss Pattern Analysis — deep drill-down with deal-level + people-level detail
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

    // All closed opps with full detail + contacts
    const opps = await sfdcQuery(`SELECT Id, Name, Amount, IsWon, StageName, CloseDate, CreatedDate, LeadSource, Account.Name, Account.Industry, Account.NumberOfEmployees, Lost_Reason__c, Lost_Reason_Details__c, Owner.Name, (SELECT Contact.Name, Contact.Title, Contact.Email FROM OpportunityContactRoles) FROM Opportunity WHERE IsClosed = true AND CloseDate >= LAST_N_DAYS:365 ORDER BY CloseDate DESC`);

    if (!opps.length) return Response.json({ error: "No closed deals in last 12 months" });

    const won = opps.filter(o => o.IsWon);
    const lost = opps.filter(o => !o.IsWon);

    // Build full deal objects
    const buildDeal = (o) => {
      const cycleDays = o.CreatedDate && o.CloseDate ? Math.floor((new Date(o.CloseDate) - new Date(o.CreatedDate)) / 86400000) : 0;
      const contacts = (o.OpportunityContactRoles?.records || []).map(r => ({
        name: r.Contact?.Name || "—", title: r.Contact?.Title || "—", email: r.Contact?.Email || "—",
      }));
      return {
        id: o.Id, name: o.Name, account: o.Account?.Name || "—",
        amount: o.Amount || 0, isWon: o.IsWon, closeDate: o.CloseDate,
        createdDate: o.CreatedDate?.split("T")[0], cycleDays,
        source: o.LeadSource || "Unknown", industry: o.Account?.Industry || "Unknown",
        employees: o.Account?.NumberOfEmployees || 0, owner: o.Owner?.Name || "—",
        lossReason: o.Lost_Reason__c || "—", lossDetails: o.Lost_Reason_Details__c || "",
        contacts, contactCount: contacts.length,
      };
    };

    const allDeals = opps.map(buildDeal);
    const wonDeals = allDeals.filter(d => d.isWon);
    const lostDeals = allDeals.filter(d => !d.isWon);

    // By size brackets
    const sizeBrackets = [
      { label: "$0-25K", min: 0, max: 25000 },
      { label: "$25-50K", min: 25000, max: 50000 },
      { label: "$50-100K", min: 50000, max: 100000 },
      { label: "$100K+", min: 100000, max: Infinity },
    ];
    const bySize = sizeBrackets.map(b => {
      const w = wonDeals.filter(d => d.amount >= b.min && d.amount < b.max);
      const l = lostDeals.filter(d => d.amount >= b.min && d.amount < b.max);
      return { label: b.label, won: w.length, lost: l.length, total: w.length + l.length, winRate: w.length + l.length > 0 ? Math.round((w.length / (w.length + l.length)) * 100) : 0, wonAmount: Math.round(w.reduce((s, d) => s + d.amount, 0)), deals: [...w, ...l] };
    });

    // By source
    const sources = {};
    allDeals.forEach(d => {
      if (!sources[d.source]) sources[d.source] = { won: [], lost: [] };
      d.isWon ? sources[d.source].won.push(d) : sources[d.source].lost.push(d);
    });
    const bySource = Object.entries(sources).map(([name, d]) => ({
      label: name, won: d.won.length, lost: d.lost.length, total: d.won.length + d.lost.length,
      winRate: d.won.length + d.lost.length > 0 ? Math.round((d.won.length / (d.won.length + d.lost.length)) * 100) : 0,
      wonAmount: Math.round(d.won.reduce((s, deal) => s + deal.amount, 0)),
      deals: [...d.won, ...d.lost],
    })).sort((a, b) => b.total - a.total);

    // By industry
    const industries = {};
    allDeals.forEach(d => {
      if (!industries[d.industry]) industries[d.industry] = { won: [], lost: [] };
      d.isWon ? industries[d.industry].won.push(d) : industries[d.industry].lost.push(d);
    });
    const byIndustry = Object.entries(industries).map(([name, d]) => ({
      label: name, won: d.won.length, lost: d.lost.length, total: d.won.length + d.lost.length,
      winRate: d.won.length + d.lost.length > 0 ? Math.round((d.won.length / (d.won.length + d.lost.length)) * 100) : 0,
      wonAmount: Math.round(d.won.reduce((s, deal) => s + deal.amount, 0)),
      deals: [...d.won, ...d.lost],
    })).sort((a, b) => b.total - a.total);

    // By owner/person
    const owners = {};
    allDeals.forEach(d => {
      if (!owners[d.owner]) owners[d.owner] = { won: [], lost: [] };
      d.isWon ? owners[d.owner].won.push(d) : owners[d.owner].lost.push(d);
    });
    const byOwner = Object.entries(owners).map(([name, d]) => ({
      label: name, won: d.won.length, lost: d.lost.length, total: d.won.length + d.lost.length,
      winRate: d.won.length + d.lost.length > 0 ? Math.round((d.won.length / (d.won.length + d.lost.length)) * 100) : 0,
      wonAmount: Math.round(d.won.reduce((s, deal) => s + deal.amount, 0)),
      avgCycle: Math.round(d.won.reduce((s, deal) => s + deal.cycleDays, 0) / (d.won.length || 1)),
      deals: [...d.won, ...d.lost],
    })).sort((a, b) => b.total - a.total);

    // Cycle time
    const avgCycle = (list) => {
      const days = list.filter(d => d.cycleDays > 0).map(d => d.cycleDays);
      return days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;
    };

    // Loss reasons with deals
    const lossReasons = {};
    lostDeals.forEach(d => {
      const r = d.lossReason;
      if (!lossReasons[r]) lossReasons[r] = { count: 0, amount: 0, deals: [] };
      lossReasons[r].count++;
      lossReasons[r].amount += d.amount;
      lossReasons[r].deals.push(d);
    });
    const topLossReasons = Object.entries(lossReasons).sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(([reason, data]) => ({ reason, ...data, amount: Math.round(data.amount) }));

    // AI analysis
    let aiAnalysis = {};
    try {
      const stats = `Won: ${won.length} deals ($${Math.round(wonDeals.reduce((s, d) => s + d.amount, 0)).toLocaleString()}), Lost: ${lost.length} ($${Math.round(lostDeals.reduce((s, d) => s + d.amount, 0)).toLocaleString()}), Win Rate: ${allDeals.length > 0 ? Math.round((won.length / allDeals.length) * 100) : 0}%\nBy Size: ${bySize.map(b => `${b.label}: ${b.winRate}%`).join(", ")}\nBy Source: ${bySource.slice(0, 5).map(b => `${b.label}: ${b.winRate}%`).join(", ")}\nTop Loss: ${topLossReasons.slice(0, 3).map(r => `${r.reason} (${r.count})`).join(", ")}`;
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1024,
          system: "Analyze win/loss patterns for Skaled Consulting. Be specific and actionable. Plain text, no markdown, no asterisks.",
          messages: [{ role: "user", content: `${stats}\n\nReturn JSON: { "sweetSpot": { "description": "" }, "blindSpots": [{ "area": "", "insight": "" }], "cycleInsights": { "avgWonDays": ${avgCycle(wonDeals)}, "avgLostDays": ${avgCycle(lostDeals)}, "insight": "" }, "recommendations": [""] }` }],
        }),
      });
      if (claudeRes.ok) {
        const raw = (await claudeRes.json()).content?.[0]?.text || "";
        try { const m = raw.match(/\{[\s\S]*\}/); if (m) aiAnalysis = JSON.parse(m[0]); } catch {}
      }
    } catch {}

    return Response.json({
      ...aiAnalysis,
      patterns: { bySize, bySource: bySource.slice(0, 10), byIndustry: byIndustry.slice(0, 10), byOwner },
      topLossReasons,
      wonDeals: wonDeals.slice(0, 20),
      lostDeals: lostDeals.slice(0, 20),
      totals: {
        won: won.length, lost: lost.length, total: allDeals.length,
        winRate: allDeals.length > 0 ? Math.round((won.length / allDeals.length) * 100) : 0,
        wonAmount: Math.round(wonDeals.reduce((s, d) => s + d.amount, 0)),
        lostAmount: Math.round(lostDeals.reduce((s, d) => s + d.amount, 0)),
        avgWonCycle: avgCycle(wonDeals),
        avgLostCycle: avgCycle(lostDeals),
      },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/win-loss-patterns" };
