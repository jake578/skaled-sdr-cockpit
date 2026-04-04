// Cash Flow — based on CLOSED WON deals trailing, with revenue spread logic
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

    // Pull all closed won deals from last 12 months
    const closedWon = await sfdcQuery(`
      SELECT Id, Name, Account.Name, AccountId, Amount, CloseDate, LeadSource
      FROM Opportunity WHERE IsWon = true AND CloseDate >= LAST_N_DAYS:365
      ORDER BY CloseDate DESC
    `);

    // Build account history for recurring detection
    const accountHistory = {};
    closedWon.forEach(o => {
      if (!o.AccountId) return;
      if (!accountHistory[o.AccountId]) accountHistory[o.AccountId] = [];
      accountHistory[o.AccountId].push({ amount: o.Amount || 0, month: (o.CloseDate || "").substring(0, 7), id: o.Id });
    });

    const isRecurring = (o) => {
      const history = accountHistory[o.AccountId] || [];
      if (history.length < 2) return false;
      const amt = o.Amount || 0;
      const similarCount = history.filter(h => h.id !== o.Id && Math.abs(h.amount - amt) / Math.max(amt, 1) < 0.2).length;
      return similarCount >= 1;
    };

    const isFirstDealForAccount = (o) => {
      const history = accountHistory[o.AccountId] || [];
      // Is this the earliest deal for this account?
      const sorted = history.sort((a, b) => a.month.localeCompare(b.month));
      return sorted.length > 0 && sorted[0].id === o.Id;
    };

    // Build last 12 months + next 3 months (for spread overflow)
    const months = [];
    for (let i = -11; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ month, recurring: 0, newClient: 0, newDeal: 0, total: 0, deals: [] });
    }

    // Place revenue into months
    closedWon.forEach(o => {
      const amount = o.Amount || 0;
      if (!amount || !o.CloseDate) return;
      const closeMonth = o.CloseDate.substring(0, 7);
      const closeIdx = months.findIndex(m => m.month === closeMonth);
      if (closeIdx < 0) return;

      const recurring = isRecurring(o);
      const firstDeal = isFirstDealForAccount(o);

      const deal = {
        id: o.Id, name: o.Name, account: o.Account?.Name || "—",
        amount, closeDate: o.CloseDate, source: o.LeadSource || "—",
      };

      if (recurring) {
        // Recurring: full amount in close month
        months[closeIdx].recurring += amount;
        months[closeIdx].total += amount;
        months[closeIdx].deals.push({ ...deal, revenueType: "recurring", revenueInMonth: amount, spreadNote: "Recurring — full amount" });
      } else {
        // New deal (first for account or new engagement): spread 40/35/25
        const splits = [0.4, 0.35, 0.25];
        const type = firstDeal ? "new_client" : "new_deal";
        const typeLabel = firstDeal ? "New client" : "New engagement";

        for (let s = 0; s < 3; s++) {
          const mIdx = closeIdx + s;
          if (mIdx >= months.length) break;
          const portion = Math.round(amount * splits[s]);
          const pctLabel = s === 0 ? "40%" : s === 1 ? "35%" : "25%";

          if (type === "new_client") months[mIdx].newClient += portion;
          else months[mIdx].newDeal += portion;
          months[mIdx].total += portion;
          months[mIdx].deals.push({
            ...deal, revenueType: type, revenueInMonth: portion,
            spreadNote: `${typeLabel} — ${pctLabel} of $${amount.toLocaleString()}`,
            spreadPct: pctLabel, isSpread: s > 0,
          });
        }
      }
    });

    // Trim to relevant months (last 6 trailing + current + 2 forward for spread)
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const relevantMonths = months.filter(m => {
      // Show last 6 months + current + 2 months forward
      return m.month >= months.find(x => x.month <= currentMonth && months.indexOf(x) >= months.length - 9)?.month;
    }).slice(-9);

    // Quarterly summaries
    const quarterSummary = {};
    months.forEach(m => {
      const [y, mo] = m.month.split("-").map(Number);
      const q = `Q${Math.floor((mo - 1) / 3) + 1} ${y}`;
      if (!quarterSummary[q]) quarterSummary[q] = { recurring: 0, newClient: 0, newDeal: 0, total: 0, dealCount: 0 };
      quarterSummary[q].recurring += m.recurring;
      quarterSummary[q].newClient += m.newClient;
      quarterSummary[q].newDeal += m.newDeal;
      quarterSummary[q].total += m.total;
      quarterSummary[q].dealCount += m.deals.filter(d => !d.isSpread).length;
    });

    // Trailing totals
    const trailing3 = relevantMonths.slice(-4, -1).reduce((s, m) => s + m.total, 0);
    const trailing6 = relevantMonths.slice(-7, -1).reduce((s, m) => s + m.total, 0);
    const currentMonthTotal = relevantMonths.find(m => m.month === currentMonth)?.total || 0;

    // Total by type
    const totalRecurring = Math.round(closedWon.filter(o => isRecurring(o)).reduce((s, o) => s + (o.Amount || 0), 0));
    const totalNew = Math.round(closedWon.filter(o => !isRecurring(o)).reduce((s, o) => s + (o.Amount || 0), 0));

    return Response.json({
      monthly: relevantMonths.map(m => ({
        ...m,
        recurring: Math.round(m.recurring),
        newClient: Math.round(m.newClient),
        newDeal: Math.round(m.newDeal),
        total: Math.round(m.total),
        dealCount: m.deals.filter(d => !d.isSpread).length,
      })),
      summary: {
        trailing3m: Math.round(trailing3),
        trailing6m: Math.round(trailing6),
        currentMonth: Math.round(currentMonthTotal),
        totalDeals: closedWon.length,
        totalRevenue: Math.round(closedWon.reduce((s, o) => s + (o.Amount || 0), 0)),
        totalRecurring,
        totalNew,
        avgDealSize: closedWon.length > 0 ? Math.round(closedWon.reduce((s, o) => s + (o.Amount || 0), 0) / closedWon.length) : 0,
      },
      quarters: Object.entries(quarterSummary).map(([label, data]) => ({ label, ...data, recurring: Math.round(data.recurring), newClient: Math.round(data.newClient), newDeal: Math.round(data.newDeal), total: Math.round(data.total) })).sort((a, b) => a.label.localeCompare(b.label)),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/cash-flow" };
