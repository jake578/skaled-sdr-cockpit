// Client Expansion Intelligence — signals from emails, calls, and opps
import { getAccessToken } from "./google-auth.js";

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

    // Active clients: accounts with closed won in last 90 days
    const clients = await sfdcQuery(`SELECT Id, Name FROM Account WHERE Id IN (SELECT AccountId FROM Opportunity WHERE IsWon = true AND CloseDate >= LAST_N_DAYS:90) LIMIT 15`);
    if (!clients.length) return Response.json([]);

    // For each client, gather signals
    let gtoken;
    try { gtoken = await getAccessToken(); } catch {}

    const clientContext = [];
    for (const client of clients.slice(0, 10)) {
      const safeName = client.Name.replace(/'/g, "");
      let emailSnippets = "", chorusCalls = "", openOpps = "";

      // Gmail
      if (gtoken) {
        try {
          const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=in:sent "${client.Name}" newer_than:30d`, { headers: { Authorization: `Bearer ${gtoken}` } });
          const data = await res.json();
          if (data.messages?.length) {
            const msgs = await Promise.all(data.messages.slice(0, 3).map(async m => {
              const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject`, { headers: { Authorization: `Bearer ${gtoken}` } });
              if (!r.ok) return null;
              const msg = await r.json();
              return msg.payload?.headers?.find(h => h.name === "Subject")?.value || msg.snippet?.slice(0, 100);
            }));
            emailSnippets = msgs.filter(Boolean).join(" | ");
          }
        } catch {}
      }

      // Chorus
      const calls = await sfdcQuery(`SELECT Subject FROM Event WHERE Subject LIKE 'Chorus%' AND What.Name LIKE '%${safeName}%' ORDER BY StartDateTime DESC LIMIT 3`);
      chorusCalls = calls.map(c => c.Subject?.replace("Chorus - ", "")).join(" | ");

      // Open opps
      const opps = await sfdcQuery(`SELECT Name, Amount, StageName FROM Opportunity WHERE IsClosed = false AND Account.Name LIKE '%${safeName}%' LIMIT 3`);
      openOpps = opps.map(o => `${o.Name} ($${o.Amount || 0}, ${o.StageName})`).join(" | ");

      clientContext.push(`Account: ${client.Name}\nEmails (30d): ${emailSnippets || "None"}\nCalls: ${chorusCalls || "None"}\nOpen Opps: ${openOpps || "None"}`);
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 2048,
        system: "You are analyzing active client accounts for Skaled Consulting to find expansion opportunities. Look for: scope increase discussions, new problems, budget references, new stakeholders, satisfaction signals, renewal timing. Only flag clients with real evidence. Plain text, no markdown, no asterisks.",
        messages: [{ role: "user", content: `Analyze these active clients for expansion signals. Only include clients with actual signals.\n\n${clientContext.join("\n\n---\n\n")}\n\nReturn JSON array: [{ "accountName": "", "signals": [{ "type": "", "evidence": "", "confidence": "high/medium/low" }], "estimatedExpansionValue": number, "recommendedAction": "", "urgency": "high/medium/low" }]` }],
      }),
    });

    if (!claudeRes.ok) return Response.json({ error: await claudeRes.text() }, { status: claudeRes.status });
    const raw = (await claudeRes.json()).content?.[0]?.text || "";
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) return Response.json(JSON.parse(match[0]));
    } catch {}
    return Response.json([]);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/expansion-signals" };
