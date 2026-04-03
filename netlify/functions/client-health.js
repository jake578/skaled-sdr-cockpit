// Client Health Dashboard — scores active engagements
import { getAccessToken } from "./google-auth.js";

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

    // Get active accounts with opportunities (won or open)
    const accounts = await sfdcQuery(`
      SELECT Id, Name, Industry, NumberOfEmployees, LastActivityDate,
        (SELECT Id, Name, Amount, StageName, CloseDate, IsClosed, IsWon FROM Opportunities ORDER BY CloseDate DESC LIMIT 10),
        (SELECT Id FROM Contacts)
      FROM Account
      WHERE Id IN (SELECT AccountId FROM Opportunity WHERE IsWon = true OR IsClosed = false)
      ORDER BY LastActivityDate DESC NULLS LAST
      LIMIT 30
    `);

    // Get recent activities per account
    const recentEvents = await sfdcQuery(`
      SELECT What.Name, StartDateTime, Subject FROM Event
      WHERE StartDateTime >= LAST_N_DAYS:30
      ORDER BY StartDateTime DESC LIMIT 200
    `);

    // Build event counts per account
    const eventCountByAccount = {};
    recentEvents.forEach(e => {
      const name = (e.What?.Name || "").toLowerCase();
      if (name) eventCountByAccount[name] = (eventCountByAccount[name] || 0) + 1;
    });

    // Gmail activity per account
    let emailCountByAccount = {};
    try {
      const gtoken = await getAccessToken();
      const sentRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=in:sent newer_than:30d`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const sentData = await sentRes.json();
      if (sentData.messages?.length) {
        const details = await Promise.all(
          sentData.messages.slice(0, 50).map(async m => {
            const res = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=To&metadataHeaders=Subject`,
              { headers: { Authorization: `Bearer ${gtoken}` } }
            );
            if (!res.ok) return null;
            const msg = await res.json();
            const headers = {};
            (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });
            return headers;
          })
        );
        details.filter(Boolean).forEach(e => {
          const to = ((e.to || "") + " " + (e.subject || "")).toLowerCase();
          accounts.forEach(a => {
            const name = a.Name.toLowerCase();
            if (name.length > 2 && to.includes(name)) {
              emailCountByAccount[name] = (emailCountByAccount[name] || 0) + 1;
            }
          });
        });
      }
    } catch { /* Gmail unavailable */ }

    // Score each account
    const clients = accounts.map(a => {
      const name = a.Name;
      const nameLower = name.toLowerCase();
      const opps = a.Opportunities?.records || [];
      const wonOpps = opps.filter(o => o.IsWon);
      const openOpps = opps.filter(o => !o.IsClosed);
      const totalRevenue = wonOpps.reduce((s, o) => s + (o.Amount || 0), 0);
      const openPipeline = openOpps.reduce((s, o) => s + (o.Amount || 0), 0);
      const contactCount = a.Contacts?.records?.length || 0;

      const daysSinceActivity = a.LastActivityDate
        ? Math.floor((now.getTime() - new Date(a.LastActivityDate).getTime()) / 86400000)
        : 999;

      const meetingCount = eventCountByAccount[nameLower] || 0;
      const emailCount = emailCountByAccount[nameLower] || 0;

      // Health score (1-10)
      let score = 5;
      // Activity recency
      if (daysSinceActivity <= 3) score += 2;
      else if (daysSinceActivity <= 7) score += 1;
      else if (daysSinceActivity <= 14) score += 0;
      else if (daysSinceActivity <= 30) score -= 1;
      else score -= 2;
      // Meeting engagement
      if (meetingCount >= 4) score += 1.5;
      else if (meetingCount >= 2) score += 1;
      else if (meetingCount === 0) score -= 1;
      // Email engagement
      if (emailCount >= 5) score += 1;
      else if (emailCount >= 2) score += 0.5;
      else if (emailCount === 0) score -= 0.5;
      // Multi-threading
      if (contactCount >= 3) score += 0.5;

      score = Math.max(1, Math.min(10, Math.round(score)));

      const status = score >= 8 ? "Healthy" : score >= 5 ? "Needs Attention" : "At Risk";

      return {
        id: a.Id,
        name,
        industry: a.Industry || "—",
        totalRevenue,
        openPipeline,
        contactCount,
        daysSinceActivity,
        meetingCount30d: meetingCount,
        emailCount30d: emailCount,
        healthScore: score,
        status,
        activeOpps: openOpps.length,
        wonOpps: wonOpps.length,
        lastActivity: a.LastActivityDate || "—",
      };
    });

    // Sort by health score ascending (worst first)
    clients.sort((a, b) => a.healthScore - b.healthScore);

    const summary = {
      totalClients: clients.length,
      healthy: clients.filter(c => c.status === "Healthy").length,
      needsAttention: clients.filter(c => c.status === "Needs Attention").length,
      atRisk: clients.filter(c => c.status === "At Risk").length,
      totalRevenue: clients.reduce((s, c) => s + c.totalRevenue, 0),
      totalPipeline: clients.reduce((s, c) => s + c.openPipeline, 0),
    };

    return Response.json({ clients, summary });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/client-health" };
