// Post-Meeting Auto-Execution — action items, SFDC updates, email draft
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { eventId, eventSubject, accountName } = await req.json();
    if (!accountName) return Response.json({ error: "Missing accountName" }, { status: 400 });

    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    const now = new Date();
    let sfdcContext = "";

    if (sfdcMatch) {
      const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
      const sfdcQuery = async (soql) => {
        const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        if (!res.ok) return [];
        return (await res.json()).records || [];
      };

      const safeName = accountName.replace(/'/g, "");
      const [opps, chorusCalls, contacts] = await Promise.all([
        sfdcQuery(`SELECT Name, StageName, Amount, CloseDate, NextStep, Group_Forecast_Category__c FROM Opportunity WHERE IsClosed = false AND Account.Name LIKE '%${safeName}%' ORDER BY Amount DESC LIMIT 3`),
        sfdcQuery(`SELECT Subject, StartDateTime, Who.Name FROM Event WHERE Subject LIKE 'Chorus%' AND What.Name LIKE '%${safeName}%' ORDER BY StartDateTime DESC LIMIT 3`),
        sfdcQuery(`SELECT Name, Title, Email FROM Contact WHERE Account.Name LIKE '%${safeName}%' LIMIT 10`),
      ]);

      if (opps.length) {
        sfdcContext += "\nOpen Opportunities:\n";
        opps.forEach(o => { sfdcContext += `- ${o.Name} | ${o.StageName} | $${o.Amount || 0} | Close: ${o.CloseDate || "—"} | Next: ${o.NextStep || "—"}\n`; });
      }
      if (chorusCalls.length) {
        sfdcContext += "\nRecent Chorus Calls:\n";
        chorusCalls.forEach(c => { sfdcContext += `- [${c.StartDateTime?.split("T")[0]}] ${c.Subject?.replace("Chorus - ", "")} with ${c.Who?.Name || "—"}\n`; });
      }
      if (contacts.length) {
        sfdcContext += "\nContacts:\n";
        contacts.forEach(c => { sfdcContext += `- ${c.Name} (${c.Title || "—"}) — ${c.Email || "no email"}\n`; });
      }
    }

    // Gmail context
    let emailContext = "";
    try {
      const gtoken = await getAccessToken();
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q="${accountName}" newer_than:14d`, { headers: { Authorization: `Bearer ${gtoken}` } });
      const data = await res.json();
      if (data.messages?.length) {
        const msgs = await Promise.all(data.messages.slice(0, 3).map(async m => {
          const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, { headers: { Authorization: `Bearer ${gtoken}` } });
          if (!r.ok) return null;
          const msg = await r.json();
          const h = {}; (msg.payload?.headers || []).forEach(hdr => { h[hdr.name.toLowerCase()] = hdr.value; });
          return h;
        }));
        msgs.filter(Boolean).forEach(m => { emailContext += `- [${m.date?.split(",")[0]}] ${m.subject} from ${m.from?.split("<")[0]}\n`; });
      }
    } catch {}

    const fullContext = `Meeting: ${eventSubject || "Meeting"} with ${accountName}\nDate: ${now.toISOString().split("T")[0]}\n\n${sfdcContext}\n\nRecent Emails:\n${emailContext || "None found"}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 2048,
        system: "You are Jake Dunlap's post-meeting assistant. Jake is CEO of Skaled Consulting. Extract action items, propose SFDC updates, and draft a follow-up email in Jake's voice (direct, concise, no fluff). Plain text only, no markdown, no asterisks.",
        messages: [{ role: "user", content: `Analyze this meeting and extract:\n1) Action items with owners and due dates\n2) Proposed SFDC updates (stage, next step, close date changes)\n3) Follow-up email draft from Jake\n4) Key takeaways\n\n${fullContext}\n\nReturn JSON: { "actionItems": [{ "task": "", "owner": "", "dueDate": "" }], "sfdcUpdates": { "stageName": "", "nextStep": "", "closeDate": "", "amount": null }, "emailDraft": { "to": "", "subject": "", "body": "" }, "takeaways": [""] }` }],
      }),
    });

    if (!claudeRes.ok) return Response.json({ error: await claudeRes.text() }, { status: claudeRes.status });
    const raw = (await claudeRes.json()).content?.[0]?.text || "";
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) return Response.json(JSON.parse(match[0]));
    } catch {}
    return Response.json({ actionItems: [], sfdcUpdates: {}, emailDraft: {}, takeaways: [raw.slice(0, 500)] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/post-meeting" };
