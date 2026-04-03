// Claude chat with access to SFDC, Gmail, and Calendar data
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { message, history } = await req.json();
  if (!message) return Response.json({ error: "No message" }, { status: 400 });

  // Gather live context from all sources
  let context = "";

  // SFDC context
  const cookieHeader = req.headers.get("cookie") || "";
  const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
  if (sfdcMatch) {
    try {
      const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
      const sfdcQuery = async (soql) => {
        const res = await fetch(
          `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`,
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        );
        if (!res.ok) return [];
        const data = await res.json();
        return data.records || [];
      };

      const [opps, leads, recentTasks] = await Promise.all([
        sfdcQuery("SELECT Name, Account.Name, Amount, StageName, CloseDate, LastActivityDate FROM Opportunity WHERE IsClosed = false ORDER BY Amount DESC LIMIT 20"),
        sfdcQuery("SELECT Name, Company, Title, Status, LeadSource FROM Lead WHERE IsConverted = false ORDER BY CreatedDate DESC LIMIT 15"),
        sfdcQuery("SELECT Subject, Who.Name, CreatedDate FROM Task ORDER BY CreatedDate DESC LIMIT 15"),
      ]);

      context += "\n## Salesforce Data\n";
      context += "### Open Opportunities\n";
      opps.forEach(o => {
        context += `- ${o.Name} | ${o.Account?.Name || "—"} | ${o.StageName} | $${o.Amount || 0} | Close: ${o.CloseDate || "—"} | Last activity: ${o.LastActivityDate || "—"}\n`;
      });
      context += "\n### Recent Leads\n";
      leads.forEach(l => {
        context += `- ${l.Name} | ${l.Company || "—"} | ${l.Title || "—"} | Status: ${l.Status} | Source: ${l.LeadSource || "—"}\n`;
      });
      context += "\n### Recent Activities\n";
      recentTasks.forEach(t => {
        context += `- ${t.Subject} | ${t.Who?.Name || "—"} | ${t.CreatedDate?.split("T")[0] || "—"}\n`;
      });
    } catch (e) {
      context += "\n[SFDC data unavailable: " + e.message + "]\n";
    }
  }

  // Gmail context
  try {
    const gtoken = await getAccessToken();
    const inboxRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=in:inbox is:unread newer_than:7d -category:promotions -category:social`,
      { headers: { Authorization: `Bearer ${gtoken}` } }
    );
    const inboxData = await inboxRes.json();

    if (inboxData.messages?.length) {
      const msgs = await Promise.all(
        inboxData.messages.slice(0, 8).map(async m => {
          const res = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${gtoken}` } }
          );
          if (!res.ok) return null;
          const msg = await res.json();
          const headers = {};
          (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });
          return headers;
        })
      );

      context += "\n## Unread Emails (last 7 days)\n";
      msgs.filter(Boolean).forEach(m => {
        context += `- From: ${m.from || "—"} | Subject: ${m.subject || "—"} | Date: ${m.date || "—"}\n`;
      });
    }
  } catch (e) {
    context += "\n[Gmail data unavailable]\n";
  }

  // Calendar context
  try {
    const gtoken = await getAccessToken();
    const now = new Date();
    const weekOut = new Date(now.getTime() + 7 * 86400000).toISOString();
    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(now.toISOString())}&timeMax=${encodeURIComponent(weekOut)}` +
      `&maxResults=20&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${gtoken}` } }
    );
    const calData = await calRes.json();

    if (calData.items?.length) {
      context += "\n## Upcoming Calendar (next 7 days)\n";
      calData.items.forEach(e => {
        const start = e.start?.dateTime || e.start?.date || "";
        const attendees = (e.attendees || []).filter(a => !a.self).map(a => a.displayName || a.email).join(", ");
        context += `- ${start} | ${e.summary || "—"} | With: ${attendees || "no attendees"}\n`;
      });
    }
  } catch {
    context += "\n[Calendar data unavailable]\n";
  }

  // Build messages for Claude
  const systemPrompt = `You are Jake Dunlap's AI assistant inside his Skaled Consulting cockpit. You have access to his live Salesforce, Gmail, and Calendar data below. Be concise and actionable. When he asks about data, reference specific records. When he asks you to draft something, make it ready to send. Today is ${new Date().toISOString().split("T")[0]}.

${context}`;

  const messages = [
    ...(history || []).map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    const reply = data.content?.[0]?.text || "No response";
    return Response.json({ reply });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/claude-chat" };
