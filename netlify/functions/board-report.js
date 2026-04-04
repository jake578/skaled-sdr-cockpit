// Board-Ready QBR Generator — multi-quarter with comparison
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  try {
    const url = new URL(req.url);
    const requestedQ = url.searchParams.get("quarter"); // e.g., "Q1-2026" or null for current
    const compareQ = url.searchParams.get("compare"); // e.g., "Q4-2025" for comparison

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

    // Parse quarter string to date range
    const parseQuarter = (qStr) => {
      if (!qStr) {
        const q = Math.floor(now.getMonth() / 3);
        return { label: `Q${q + 1} ${now.getFullYear()}`, q: q + 1, year: now.getFullYear(), start: `${now.getFullYear()}-${String(q * 3 + 1).padStart(2, "0")}-01`, end: `${now.getFullYear()}-${String((q + 1) * 3).padStart(2, "0")}-${(q + 1) * 3 === 12 ? 31 : new Date(now.getFullYear(), (q + 1) * 3, 0).getDate()}` };
      }
      const [qNum, year] = qStr.replace("Q", "").split("-");
      const q = parseInt(qNum) - 1;
      const y = parseInt(year);
      const endMonth = (q + 1) * 3;
      const lastDay = new Date(y, endMonth, 0).getDate();
      return { label: `Q${q + 1} ${y}`, q: q + 1, year: y, start: `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`, end: `${y}-${String(endMonth).padStart(2, "0")}-${lastDay}` };
    };

    const buildQuarterData = async (qInfo) => {
      const [wonOpps, lostOpps, openOpps] = await Promise.all([
        sfdcQuery(`SELECT Name, Account.Name, Amount, CloseDate, LeadSource FROM Opportunity WHERE IsWon = true AND CloseDate >= ${qInfo.start} AND CloseDate <= ${qInfo.end} ORDER BY Amount DESC`),
        sfdcQuery(`SELECT Name, Account.Name, Amount, CloseDate, Lost_Reason__c, LeadSource FROM Opportunity WHERE IsClosed = true AND IsWon = false AND CloseDate >= ${qInfo.start} AND CloseDate <= ${qInfo.end} ORDER BY Amount DESC`),
        sfdcQuery(`SELECT Name, Account.Name, Amount, StageName, CloseDate, Group_Forecast_Category__c FROM Opportunity WHERE IsClosed = false AND CloseDate >= ${qInfo.start} AND CloseDate <= ${qInfo.end}`),
      ]);

      const categoryWeights = { "Commit": 0.9, "Best Case": 0.6, "Pipeline": 0.3, "Omitted": 0 };
      const wonAmount = Math.round(wonOpps.reduce((s, o) => s + (o.Amount || 0), 0));
      const lostAmount = Math.round(lostOpps.reduce((s, o) => s + (o.Amount || 0), 0));
      const openAmount = Math.round(openOpps.reduce((s, o) => s + (o.Amount || 0), 0));
      const weightedOpen = Math.round(openOpps.reduce((s, o) => s + (o.Amount || 0) * (categoryWeights[o.Group_Forecast_Category__c] ?? 0.3), 0));
      const totalClosed = wonOpps.length + lostOpps.length;
      const winRate = totalClosed > 0 ? Math.round((wonOpps.length / totalClosed) * 100) : 0;
      const avgWonDeal = wonOpps.length > 0 ? Math.round(wonAmount / wonOpps.length) : 0;

      // Loss reasons
      const lossReasons = {};
      lostOpps.forEach(o => { const r = o.Lost_Reason__c || "Not specified"; lossReasons[r] = (lossReasons[r] || 0) + 1; });

      // Won by source
      const wonBySource = {};
      wonOpps.forEach(o => { const s = o.LeadSource || "Unknown"; wonBySource[s] = (wonBySource[s] || 0) + (o.Amount || 0); });

      // Pipeline by category
      const pipelineByCategory = {};
      openOpps.forEach(o => { const c = o.Group_Forecast_Category__c || "No Category"; pipelineByCategory[c] = (pipelineByCategory[c] || 0) + (o.Amount || 0); });

      return {
        label: qInfo.label,
        quarter: qInfo.q,
        year: qInfo.year,
        metrics: {
          wonAmount, lostAmount, openPipeline: openAmount, weightedPipeline: weightedOpen,
          wonCount: wonOpps.length, lostCount: lostOpps.length, openCount: openOpps.length,
          winRate, avgWonDeal, totalRevenue: wonAmount,
        },
        wonDeals: wonOpps.slice(0, 10).map(o => ({ name: o.Name, account: o.Account?.Name || "—", amount: o.Amount || 0, closeDate: o.CloseDate, source: o.LeadSource || "—" })),
        lostDeals: lostOpps.slice(0, 10).map(o => ({ name: o.Name, account: o.Account?.Name || "—", amount: o.Amount || 0, reason: o.Lost_Reason__c || "—" })),
        lossReasons: Object.entries(lossReasons).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => ({ reason, count })),
        wonBySource: Object.entries(wonBySource).sort((a, b) => b[1] - a[1]).map(([source, amount]) => ({ source, amount: Math.round(amount) })),
        pipelineByCategory: Object.entries(pipelineByCategory).map(([cat, amount]) => ({ category: cat, amount: Math.round(amount) })),
      };
    };

    // Build primary quarter
    const primaryQ = parseQuarter(requestedQ);
    const primaryData = await buildQuarterData(primaryQ);

    // Build comparison quarter if requested
    let compareData = null;
    if (compareQ) {
      const compQ = parseQuarter(compareQ);
      compareData = await buildQuarterData(compQ);
    }

    // AI narrative
    let narrative = {};
    try {
      const compContext = compareData ? `\nComparison Quarter (${compareData.label}): Won $${compareData.metrics.wonAmount.toLocaleString()} (${compareData.metrics.wonCount} deals), Lost $${compareData.metrics.lostAmount.toLocaleString()} (${compareData.metrics.lostCount}), Win Rate ${compareData.metrics.winRate}%, Avg Deal $${compareData.metrics.avgWonDeal.toLocaleString()}` : "";

      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 4096,
          system: "Generate a CEO quarterly business review for Skaled Consulting. Be specific with numbers. If comparing quarters, highlight trends and changes. Plain text only, no markdown, no asterisks. Use line breaks between paragraphs.",
          messages: [{ role: "user", content: `${primaryData.label} Business Review:
Won: $${primaryData.metrics.wonAmount.toLocaleString()} (${primaryData.metrics.wonCount} deals)
Lost: $${primaryData.metrics.lostAmount.toLocaleString()} (${primaryData.metrics.lostCount} deals)
Win Rate: ${primaryData.metrics.winRate}%
Avg Won Deal: $${primaryData.metrics.avgWonDeal.toLocaleString()}
Open Pipeline: $${primaryData.metrics.openPipeline.toLocaleString()} (${primaryData.metrics.openCount} deals)
Weighted: $${primaryData.metrics.weightedPipeline.toLocaleString()}

Won Deals: ${primaryData.wonDeals.map(d => `${d.name} ($${d.amount.toLocaleString()}) — ${d.account}`).join("; ") || "None"}
Lost Deals: ${primaryData.lostDeals.map(d => `${d.name} ($${d.amount.toLocaleString()}) — ${d.reason}`).join("; ") || "None"}
Top Loss Reasons: ${primaryData.lossReasons.map(r => `${r.reason} (${r.count})`).join(", ") || "None"}
Revenue by Source: ${primaryData.wonBySource.map(s => `${s.source}: $${s.amount.toLocaleString()}`).join(", ") || "None"}
${compContext}

Return JSON: { "executiveSummary": "", "revenueUpdate": "", "pipelineHealth": "", "winLossAnalysis": "", "clientUpdates": "", "risks": "", "outlook": ""${compareData ? ', "quarterComparison": ""' : ""} }` }],
        }),
      });

      if (claudeRes.ok) {
        const raw = (await claudeRes.json()).content?.[0]?.text || "";
        try { const m = raw.match(/\{[\s\S]*\}/); if (m) narrative = JSON.parse(m[0]); } catch {}
      }
    } catch {}

    // Available quarters (last 4 + current)
    const quarters = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
      const q = Math.floor(d.getMonth() / 3) + 1;
      const label = `Q${q}-${d.getFullYear()}`;
      if (!quarters.includes(label)) quarters.push(label);
    }

    return Response.json({
      ...narrative,
      primary: primaryData,
      compare: compareData,
      quarters,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/board-report" };
