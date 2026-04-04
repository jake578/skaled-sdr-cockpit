// Relationship Intelligence — stakeholder map, engagement, gaps
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { accountId, accountName } = await req.json();
    if (!accountName) return Response.json({ error: "Missing accountName" }, { status: 400 });

    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    if (!sfdcMatch) return Response.json({ error: "SFDC not connected" }, { status: 401 });

    const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
    const sfdcQuery = async (soql) => {
      const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!res.ok) return [];
      return (await res.json()).records || [];
    };

    const safeName = accountName.replace(/'/g, "");
    const acctFilter = accountId ? `AccountId = '${accountId}'` : `Account.Name LIKE '%${safeName}%'`;

    const [contacts, chorusCalls, opps] = await Promise.all([
      sfdcQuery(`SELECT Name, Title, Email, Phone FROM Contact WHERE ${acctFilter} LIMIT 20`),
      sfdcQuery(`SELECT Subject, StartDateTime, Who.Name FROM Event WHERE Subject LIKE 'Chorus%' AND What.Name LIKE '%${safeName}%' ORDER BY StartDateTime DESC LIMIT 10`),
      sfdcQuery(`SELECT Name, StageName, Amount FROM Opportunity WHERE IsClosed = false AND Account.Name LIKE '%${safeName}%' LIMIT 5`),
    ]);

    // Gmail engagement per contact
    let contactEmails = {};
    try {
      const gtoken = await getAccessToken();
      for (const c of contacts.slice(0, 10)) {
        if (!c.Email) continue;
        try {
          const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=from:${c.Email} OR to:${c.Email}`, { headers: { Authorization: `Bearer ${gtoken}` } });
          const data = await res.json();
          contactEmails[c.Email] = data.resultSizeEstimate || data.messages?.length || 0;
        } catch {}
      }
    } catch {}

    // Calendar meetings
    let meetingCount = 0;
    try {
      const gtoken = await getAccessToken();
      const past90 = new Date(Date.now() - 90 * 86400000).toISOString();
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(past90)}&timeMax=${encodeURIComponent(new Date().toISOString())}&maxResults=50&singleEvents=true&q=${encodeURIComponent(accountName)}`, { headers: { Authorization: `Bearer ${gtoken}` } });
      const data = await res.json();
      meetingCount = (data.items || []).length;
    } catch {}

    const context = `
Account: ${accountName}
Contacts: ${contacts.map(c => `${c.Name} (${c.Title || "no title"}, ${c.Email || "no email"}, ${contactEmails[c.Email] || 0} emails)`).join("\n")}
Chorus Calls: ${chorusCalls.map(c => `[${c.StartDateTime?.split("T")[0]}] ${c.Subject?.replace("Chorus - ", "")} — ${c.Who?.Name || "?"}`).join("\n") || "None"}
Calendar Meetings (90d): ${meetingCount}
Open Opps: ${opps.map(o => `${o.Name} | ${o.StageName} | $${o.Amount || 0}`).join("\n") || "None"}
`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 1024,
        system: "Build a relationship map for this account. Assess each contact's engagement and role. Identify risks and gaps. Plain text, no markdown, no asterisks.",
        messages: [{ role: "user", content: `${context}\n\nReturn JSON: { "contacts": [{ "name": "", "title": "", "email": "", "engagementLevel": "high/medium/low/none", "dealRole": "champion/influencer/blocker/end-user/unknown", "relationshipStrength": 1-10, "lastInteraction": "", "notes": "" }], "risks": [""], "gaps": [""], "recommendations": [""] }` }],
      }),
    });

    if (!claudeRes.ok) return Response.json({ error: await claudeRes.text() }, { status: claudeRes.status });
    const raw = (await claudeRes.json()).content?.[0]?.text || "";
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) return Response.json(JSON.parse(match[0]));
    } catch {}
    return Response.json({ contacts: contacts.map(c => ({ name: c.Name, title: c.Title, email: c.Email, engagementLevel: "unknown", dealRole: "unknown", relationshipStrength: 5 })), risks: [], gaps: [], recommendations: [] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/relationship-map" };
