// AI Prioritizer — ranks Jake's top 10 actions for today using Calendar + Gmail + SFDC
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });

  try {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // ── 1. Pull today's calendar events ─────────────────────────
    let calendarContext = "";
    try {
      const gtoken = await getAccessToken();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(todayStart)}&timeMax=${encodeURIComponent(todayEnd)}` +
        `&maxResults=30&singleEvents=true&orderBy=startTime`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const calData = await calRes.json();

      if (calData.items?.length) {
        calendarContext += `## Today's Calendar (${calData.items.length} events)\n`;
        calData.items.forEach(e => {
          const start = e.start?.dateTime || e.start?.date || "";
          const end = e.end?.dateTime || e.end?.date || "";
          const timeStr = e.start?.dateTime
            ? new Date(e.start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
            : "All day";
          const endTimeStr = e.end?.dateTime
            ? new Date(e.end.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
            : "";
          const attendees = (e.attendees || []).filter(a => !a.self).map(a => `${a.displayName || a.email}${(a.email || "").includes("skaled.com") ? " (internal)" : ""}`).join(", ");
          calendarContext += `- ${timeStr}${endTimeStr ? ` - ${endTimeStr}` : ""}: ${e.summary || "—"} | With: ${attendees || "no attendees"}\n`;
        });
      } else {
        calendarContext += `## Today's Calendar\nNo events scheduled.\n`;
      }
    } catch (e) {
      calendarContext += `[Calendar unavailable: ${e.message}]\n`;
    }

    // ── 2. Pull unread Gmail ────────────────────────────────────
    let emailContext = "";
    try {
      const gtoken = await getAccessToken();
      const inboxRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=in:inbox is:unread newer_than:7d -category:promotions -category:social -category:updates -category:forums`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const inboxData = await inboxRes.json();

      if (inboxData.messages?.length) {
        const msgs = await Promise.all(
          inboxData.messages.slice(0, 15).map(async m => {
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

        const validMsgs = msgs.filter(Boolean);
        emailContext += `\n## Unread Emails (${inboxData.messages.length} total, showing ${validMsgs.length})\n`;
        validMsgs.forEach(m => {
          const from = m.from || "—";
          const isInternal = from.toLowerCase().includes("skaled.com");
          emailContext += `- From: ${from}${isInternal ? " (internal)" : ""} | Subject: ${m.subject || "—"} | ${m.date || "—"}\n`;
        });
      } else {
        emailContext += `\n## Unread Emails\nInbox zero!\n`;
      }
    } catch (e) {
      emailContext += `\n[Gmail unavailable: ${e.message}]\n`;
    }

    // ── 3. Pull open opps with close dates and last activity ────
    let sfdcContext = "";
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);

    if (sfdcMatch) {
      let sfdcTokens;
      try { sfdcTokens = JSON.parse(decodeURIComponent(sfdcMatch[1])); } catch { sfdcTokens = null; }

      if (sfdcTokens) {
        const sfdcQuery = async (soql) => {
          const res = await fetch(
            `${sfdcTokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`,
            { headers: { Authorization: `Bearer ${sfdcTokens.access_token}` } }
          );
          if (!res.ok) return [];
          const data = await res.json();
          return data.records || [];
        };

        const nextWeekStr = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];

        const [opps, pastDue, recentTasks] = await Promise.all([
          sfdcQuery(`SELECT Id, Name, Account.Name, Amount, StageName, CloseDate, LastActivityDate, Group_Forecast_Category__c FROM Opportunity WHERE IsClosed = false ORDER BY CloseDate ASC LIMIT 30`),
          sfdcQuery(`SELECT Id, Name, Account.Name, Amount, StageName, CloseDate FROM Opportunity WHERE IsClosed = false AND CloseDate < ${todayStr} LIMIT 20`),
          sfdcQuery(`SELECT Subject, Who.Name, CreatedDate, Status FROM Task WHERE CreatedDate >= TODAY ORDER BY CreatedDate DESC LIMIT 10`),
        ]);

        sfdcContext += `\n## Open Pipeline (${opps.length} opps)\n`;
        opps.forEach(o => {
          const daysToClose = o.CloseDate ? Math.floor((new Date(o.CloseDate).getTime() - now.getTime()) / 86400000) : 999;
          const daysSinceActivity = o.LastActivityDate ? Math.floor((now.getTime() - new Date(o.LastActivityDate).getTime()) / 86400000) : 999;
          const flag = daysToClose < 0 ? " [PAST DUE]" : daysToClose <= 7 ? " [CLOSING SOON]" : daysSinceActivity > 14 ? " [STALLED]" : "";
          sfdcContext += `- ${o.Name} | ${o.Account?.Name || "—"} | ${o.StageName} | $${o.Amount || 0} | Close: ${o.CloseDate || "—"} (${daysToClose}d) | Last activity: ${daysSinceActivity}d ago${flag}\n`;
        });

        if (pastDue.length > 0) {
          sfdcContext += `\n## Past Due Close Dates (${pastDue.length})\n`;
          pastDue.forEach(o => {
            sfdcContext += `- ${o.Name} | ${o.Account?.Name || "—"} | Close: ${o.CloseDate} | $${o.Amount || 0}\n`;
          });
        }

        if (recentTasks.length > 0) {
          sfdcContext += `\n## Today's SFDC Tasks\n`;
          recentTasks.forEach(t => {
            sfdcContext += `- ${t.Subject} — ${t.Who?.Name || "—"} (${t.Status})\n`;
          });
        }
      }
    } else {
      sfdcContext += `\n[Salesforce not connected]\n`;
    }

    // ── 4. Send to Claude for prioritization ────────────────────
    const fullContext = [calendarContext, emailContext, sfdcContext].filter(Boolean).join("\n");

    const systemPrompt = `You are Jake Dunlap's AI chief of staff. Jake is CEO of Skaled Consulting, a sales consulting firm. You deeply understand sales leadership priorities: revenue-generating activities come first, then relationship maintenance, then admin. Today is ${todayStr}.

${fullContext}`;

    const userPrompt = `Given Jake's calendar, emails, and pipeline, rank his top 10 actions for today. Consider: deal value, urgency, close date proximity, relationship warmth, and time available between meetings.

Return JSON with exactly this structure:
{
  "topActions": [
    { "rank": 1, "title": "<action>", "reason": "<why this is priority>", "estimatedMinutes": <number>, "type": "<email|call|meeting-prep|sfdc-update|follow-up|review>" }
  ],
  "daySummary": "<1-2 sentence overview of how Jake should approach today>"
}

Be specific. Reference actual names, deals, and amounts. Don't be generic.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
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
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return Response.json({ error: `Claude API error: ${err}` }, { status: claudeRes.status });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || "";

    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return Response.json({
          topActions: result.topActions || [],
          daySummary: result.daySummary || "",
        });
      }
    } catch { /* fall through */ }

    return Response.json({
      topActions: [],
      daySummary: rawText.slice(0, 500),
      error: "Failed to parse structured response",
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/ai-prioritize" };
