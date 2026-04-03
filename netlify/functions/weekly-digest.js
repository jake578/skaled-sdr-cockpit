// Weekly Digest — executive summary of the past 7 days across Gmail, Calendar, and SFDC
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString();
    const todayStr = now.toISOString().split("T")[0];

    let metrics = {
      emailsSent: 0,
      emailsReceived: 0,
      meetingsHeld: 0,
      oppsUpdated: 0,
      pipelineTotal: 0,
      pipelineChange: 0,
    };

    // ── 1. Gmail metrics: sent and received counts ──────────────
    let emailContext = "";
    try {
      const gtoken = await getAccessToken();

      // Count sent emails
      const sentRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=in:sent newer_than:7d -to:skaled.com`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const sentData = await sentRes.json();
      metrics.emailsSent = sentData.messages?.length || 0;

      // Count received emails
      const recvRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=in:inbox newer_than:7d -from:skaled.com -category:promotions -category:social -category:updates -category:forums`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const recvData = await recvRes.json();
      metrics.emailsReceived = recvData.messages?.length || 0;

      // Get notable email threads for context
      const notableRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=in:sent newer_than:7d -to:skaled.com`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const notableData = await notableRes.json();

      if (notableData.messages?.length) {
        const msgs = await Promise.all(
          notableData.messages.slice(0, 10).map(async m => {
            const res = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=To&metadataHeaders=Date`,
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
        if (validMsgs.length > 0) {
          emailContext += `## Emails Sent This Week (${metrics.emailsSent} total, ${metrics.emailsReceived} received)\n`;
          validMsgs.forEach(m => {
            emailContext += `- To: ${m.to || "—"} | Subject: ${m.subject || "—"} | ${m.date || "—"}\n`;
          });
        }
      }
    } catch (e) {
      emailContext += `[Gmail unavailable: ${e.message}]\n`;
    }

    // ── 2. Calendar: meetings held ──────────────────────────────
    let calendarContext = "";
    try {
      const gtoken = await getAccessToken();
      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(sevenDaysAgoStr)}&timeMax=${encodeURIComponent(now.toISOString())}` +
        `&maxResults=100&singleEvents=true&orderBy=startTime`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const calData = await calRes.json();

      const events = (calData.items || []).filter(e => {
        const summary = (e.summary || "").toLowerCase();
        // Skip personal blocks
        return !summary.includes("lunch") && !summary.includes("block") &&
               !summary.includes("focus time") && !summary.includes("ooo");
      });

      metrics.meetingsHeld = events.length;

      const externalMeetings = events.filter(e =>
        (e.attendees || []).some(a => !a.self && !(a.email || "").includes("skaled.com"))
      );

      calendarContext += `\n## Meetings This Week (${events.length} total, ${externalMeetings.length} external)\n`;
      externalMeetings.slice(0, 15).forEach(e => {
        const start = e.start?.dateTime || e.start?.date || "";
        const attendees = (e.attendees || []).filter(a => !a.self && !(a.email || "").includes("skaled.com")).map(a => a.displayName || a.email).join(", ");
        calendarContext += `- ${start.split("T")[0]} — ${e.summary || "—"} | With: ${attendees}\n`;
      });
    } catch (e) {
      calendarContext += `\n[Calendar unavailable: ${e.message}]\n`;
    }

    // ── 3. SFDC: pipeline snapshot and changes ──────────────────
    let sfdcContext = "";
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);

    if (sfdcMatch) {
      let tokens;
      try { tokens = JSON.parse(decodeURIComponent(sfdcMatch[1])); } catch { tokens = null; }

      if (tokens) {
        const sfdcQuery = async (soql) => {
          const res = await fetch(
            `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`,
            { headers: { Authorization: `Bearer ${tokens.access_token}` } }
          );
          if (!res.ok) return [];
          const data = await res.json();
          return data.records || [];
        };

        const [openOpps, recentlyUpdated, closedWon, closedLost, stageChanges] = await Promise.all([
          sfdcQuery(`SELECT Id, Name, Amount, StageName, CloseDate FROM Opportunity WHERE IsClosed = false`),
          sfdcQuery(`SELECT Id, Name, Account.Name, Amount, StageName, CloseDate, LastModifiedDate FROM Opportunity WHERE LastModifiedDate >= ${sevenDaysAgoStr} ORDER BY LastModifiedDate DESC LIMIT 30`),
          sfdcQuery(`SELECT Id, Name, Account.Name, Amount FROM Opportunity WHERE IsWon = true AND CloseDate >= ${sevenDaysAgo.toISOString().split("T")[0]} LIMIT 10`),
          sfdcQuery(`SELECT Id, Name, Account.Name, Amount FROM Opportunity WHERE IsClosed = true AND IsWon = false AND CloseDate >= ${sevenDaysAgo.toISOString().split("T")[0]} LIMIT 10`),
          sfdcQuery(`SELECT OpportunityId, Opportunity.Name, Field, OldValue, NewValue, CreatedDate FROM OpportunityFieldHistory WHERE CreatedDate >= ${sevenDaysAgoStr} AND Field IN ('StageName', 'Amount', 'CloseDate') ORDER BY CreatedDate DESC LIMIT 50`),
        ]);

        metrics.oppsUpdated = recentlyUpdated.length;
        metrics.pipelineTotal = openOpps.reduce((sum, o) => sum + (o.Amount || 0), 0);

        // Estimate pipeline change from closed won/lost this week
        const wonTotal = closedWon.reduce((sum, o) => sum + (o.Amount || 0), 0);
        const lostTotal = closedLost.reduce((sum, o) => sum + (o.Amount || 0), 0);
        metrics.pipelineChange = -(wonTotal + lostTotal); // removed from pipeline

        sfdcContext += `\n## Pipeline Snapshot\n`;
        sfdcContext += `- Total open pipeline: $${metrics.pipelineTotal.toLocaleString()}\n`;
        sfdcContext += `- Open opps: ${openOpps.length}\n`;
        sfdcContext += `- Opps updated this week: ${metrics.oppsUpdated}\n`;

        if (closedWon.length > 0) {
          sfdcContext += `\n### Closed Won This Week ($${wonTotal.toLocaleString()})\n`;
          closedWon.forEach(o => {
            sfdcContext += `- ${o.Name} | ${o.Account?.Name || "—"} | $${(o.Amount || 0).toLocaleString()}\n`;
          });
        }

        if (closedLost.length > 0) {
          sfdcContext += `\n### Closed Lost This Week ($${lostTotal.toLocaleString()})\n`;
          closedLost.forEach(o => {
            sfdcContext += `- ${o.Name} | ${o.Account?.Name || "—"} | $${(o.Amount || 0).toLocaleString()}\n`;
          });
        }

        if (stageChanges.length > 0) {
          sfdcContext += `\n### Stage/Amount/Date Changes This Week\n`;
          stageChanges.forEach(h => {
            sfdcContext += `- [${h.CreatedDate?.split("T")[0] || "—"}] ${h.Opportunity?.Name || "—"}: ${h.Field} ${h.OldValue || "—"} → ${h.NewValue || "—"}\n`;
          });
        }

        // Top deals by amount
        const topDeals = [...openOpps].sort((a, b) => (b.Amount || 0) - (a.Amount || 0)).slice(0, 10);
        sfdcContext += `\n### Top 10 Open Deals\n`;
        topDeals.forEach(o => {
          sfdcContext += `- ${o.Name} | ${o.StageName} | $${(o.Amount || 0).toLocaleString()} | Close: ${o.CloseDate || "—"}\n`;
        });
      }
    } else {
      sfdcContext += `\n[Salesforce not connected]\n`;
    }

    // ── 4. Send to Claude for executive summary ─────────────────
    const fullContext = [emailContext, calendarContext, sfdcContext].filter(Boolean).join("\n");

    const systemPrompt = `You are Jake Dunlap's AI chief of staff producing his weekly executive digest. Jake is CEO of Skaled Consulting, a sales consulting firm. Be concise, data-driven, and actionable. Today is ${todayStr}. This covers the past 7 days.

${fullContext}`;

    const userPrompt = `Create a weekly executive digest. Analyze the email activity, meetings, and pipeline changes from the past 7 days.

Return JSON with exactly this structure:
{
  "summary": "<3-5 sentence executive summary of the week — wins, concerns, and trajectory>",
  "highlights": ["<notable positive events/wins from the week>"],
  "concerns": ["<things that need attention or are trending wrong>"]
}

Be specific. Reference actual deal names, people, and numbers. Highlights should include wins, new meetings booked, deals advanced. Concerns should include stalled deals, missed follow-ups, pipeline risks.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
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
          summary: result.summary || "",
          metrics,
          highlights: result.highlights || [],
          concerns: result.concerns || [],
        });
      }
    } catch { /* fall through */ }

    return Response.json({
      summary: rawText.slice(0, 500),
      metrics,
      highlights: [],
      concerns: [],
      error: "Failed to parse structured response",
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/weekly-digest" };
