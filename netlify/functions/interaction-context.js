// Pulls full interaction history for a contact/account — emails, calls, meetings
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const { contactName, accountName } = await req.json();
    const searchTerms = [contactName, accountName].filter(t => t && t !== "—" && t.length > 2);
    if (searchTerms.length === 0) return Response.json({ emails: [], calls: [], meetings: [], summary: "No contact or account to search." });

    const gtoken = await getAccessToken();
    const now = new Date();

    // ── 1. Gmail threads with full bodies ─────────────────────
    const emails = [];
    try {
      const query = searchTerms.map(t => `"${t}"`).join(" OR ");
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const data = await res.json();

      if (data.messages?.length) {
        const details = await Promise.all(
          data.messages.slice(0, 8).map(async m => {
            const r = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
              { headers: { Authorization: `Bearer ${gtoken}` } }
            );
            if (!r.ok) return null;
            const msg = await r.json();
            const headers = {};
            (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });
            const body = extractBody(msg.payload);
            return {
              from: headers.from || "",
              to: headers.to || "",
              subject: headers.subject || "",
              date: headers.date || "",
              body: body.slice(0, 1500),
              snippet: msg.snippet || "",
            };
          })
        );
        details.filter(Boolean).forEach(e => emails.push(e));
      }
    } catch { /* Gmail unavailable */ }

    // ── 2. Calendar meetings ──────────────────────────────────
    const meetings = [];
    try {
      const past90 = new Date(now.getTime() - 90 * 86400000).toISOString();
      const future14 = new Date(now.getTime() + 14 * 86400000).toISOString();
      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(past90)}&timeMax=${encodeURIComponent(future14)}` +
        `&maxResults=50&singleEvents=true&orderBy=startTime`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const calData = await calRes.json();
      (calData.items || []).forEach(event => {
        const summary = (event.summary || "").toLowerCase();
        const attendees = (event.attendees || []).map(a => (a.displayName || a.email || "").toLowerCase()).join(" ");
        const match = searchTerms.some(t => summary.includes(t.toLowerCase()) || attendees.includes(t.toLowerCase()));
        if (!match) return;
        const start = event.start?.dateTime || event.start?.date || "";
        meetings.push({
          date: start.split("T")[0],
          time: event.start?.dateTime ? new Date(event.start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "",
          subject: event.summary || "",
          attendees: (event.attendees || []).filter(a => !a.self).map(a => a.displayName || a.email).join(", "),
          isPast: new Date(start) < now,
        });
      });
    } catch { /* Calendar unavailable */ }

    // ── 3. Chorus calls from SFDC Events ──────────────────────
    const calls = [];
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    if (sfdcMatch) {
      try {
        const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
        const acctSearch = accountName && accountName !== "—" ? accountName.replace(/'/g, "") : "";
        if (acctSearch) {
          const res = await fetch(
            `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(
              `SELECT Subject, StartDateTime, Who.Name, What.Name FROM Event WHERE Subject LIKE 'Chorus%' AND What.Name LIKE '%${acctSearch}%' ORDER BY StartDateTime DESC LIMIT 5`
            )}`,
            { headers: { Authorization: `Bearer ${tokens.access_token}` } }
          );
          if (res.ok) {
            const data = await res.json();
            (data.records || []).forEach(c => {
              calls.push({
                date: c.StartDateTime?.split("T")[0] || "",
                subject: (c.Subject || "").replace("Chorus - ", ""),
                contact: c.Who?.Name || "",
                account: c.What?.Name || "",
              });
            });
          }
        }
      } catch { /* SFDC unavailable */ }
    }

    // ── 4. AI Summary ─────────────────────────────────────────
    let summary = "";
    const contextParts = [];
    if (emails.length) {
      contextParts.push(`## Email History (${emails.length} emails)\n`);
      emails.forEach(e => {
        contextParts.push(`[${e.date}] From: ${e.from}\nTo: ${e.to}\nSubject: ${e.subject}\n${e.body}\n---`);
      });
    }
    if (calls.length) {
      contextParts.push(`\n## Call History (${calls.length} calls)\n`);
      calls.forEach(c => contextParts.push(`[${c.date}] ${c.subject} — ${c.contact}`));
    }
    if (meetings.length) {
      contextParts.push(`\n## Meetings (${meetings.length})\n`);
      meetings.forEach(m => contextParts.push(`[${m.date}] ${m.subject} — ${m.attendees}`));
    }

    if (contextParts.length > 0) {
      try {
        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 512,
            system: "Summarize the interaction history below in 3-5 bullet points. Focus on: what was discussed, what was promised, where things stand, and what the logical next step is. Be specific — reference actual topics, dates, and commitments. Write from Jake Dunlap's perspective.",
            messages: [{ role: "user", content: contextParts.join("\n") }],
          }),
        });
        if (claudeRes.ok) {
          const data = await claudeRes.json();
          summary = data.content?.[0]?.text || "";
        }
      } catch { /* AI unavailable */ }
    }

    return Response.json({ emails, calls, meetings, summary });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

function extractBody(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain") {
    const data = payload.body?.data || "";
    if (data) {
      try {
        const binary = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder("utf-8").decode(bytes);
      } catch { return ""; }
    }
  }
  for (const part of (payload.parts || [])) {
    if (part.mimeType === "text/plain") {
      const data = part.body?.data || "";
      if (data) {
        try {
          const binary = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return new TextDecoder("utf-8").decode(bytes);
        } catch { return ""; }
      }
    }
  }
  for (const part of (payload.parts || [])) {
    const result = extractBody(part);
    if (result) return result;
  }
  return "";
}

export const config = { path: "/.netlify/functions/interaction-context" };
