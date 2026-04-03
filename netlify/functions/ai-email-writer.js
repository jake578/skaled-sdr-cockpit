// AI Email Writer — drafts follow-up emails using SFDC + Gmail + Calendar context
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const { oppId, oppName, accountName, contactName, contactEmail, context: userContext, tone } = await req.json();

    if (!oppId || !contactName || !contactEmail) {
      return Response.json({ error: "Missing required fields: oppId, contactName, contactEmail" }, { status: 400 });
    }

    const validTones = ["professional", "casual", "urgent", "breakup"];
    const selectedTone = validTones.includes(tone) ? tone : "professional";

    // ── 1. Gather SFDC context ──────────────────────────────────
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

        const [oppDetails, activities, contacts] = await Promise.all([
          sfdcQuery(`SELECT Id, Name, Account.Name, Amount, StageName, CloseDate, Description, NextStep, LastActivityDate, Group_Forecast_Category__c FROM Opportunity WHERE Id = '${oppId}' LIMIT 1`),
          sfdcQuery(`SELECT Subject, Description, Status, CreatedDate, Who.Name FROM Task WHERE WhatId = '${oppId}' ORDER BY CreatedDate DESC LIMIT 10`),
          sfdcQuery(`SELECT Id, Name, Title, Email FROM Contact WHERE AccountId IN (SELECT AccountId FROM Opportunity WHERE Id = '${oppId}') LIMIT 20`),
        ]);

        if (oppDetails.length > 0) {
          const o = oppDetails[0];
          sfdcContext += `\n## Opportunity Details\n`;
          sfdcContext += `- Name: ${o.Name}\n- Account: ${o.Account?.Name || "—"}\n- Stage: ${o.StageName}\n- Amount: $${o.Amount || 0}\n- Close Date: ${o.CloseDate || "—"}\n- Next Step: ${o.NextStep || "—"}\n- Description: ${o.Description || "—"}\n- Last Activity: ${o.LastActivityDate || "—"}\n`;
        }

        if (activities.length > 0) {
          sfdcContext += `\n## Recent Activities on this Deal\n`;
          activities.forEach(a => {
            sfdcContext += `- [${a.CreatedDate?.split("T")[0] || "—"}] ${a.Subject} (${a.Status}) — ${a.Who?.Name || "—"}: ${(a.Description || "").slice(0, 200)}\n`;
          });
        }

        if (contacts.length > 0) {
          sfdcContext += `\n## Contacts on Account\n`;
          contacts.forEach(c => {
            sfdcContext += `- ${c.Name} — ${c.Title || "—"} (${c.Email || "—"})\n`;
          });
        }
      }
    }

    // ── 2. Gather Gmail thread context ──────────────────────────
    let emailContext = "";
    try {
      const gtoken = await getAccessToken();
      const searchQuery = `from:${contactEmail} OR to:${contactEmail}`;
      const gmailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(searchQuery)}`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const gmailData = await gmailRes.json();

      if (gmailData.messages?.length) {
        const msgs = await Promise.all(
          gmailData.messages.slice(0, 5).map(async m => {
            const res = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
              { headers: { Authorization: `Bearer ${gtoken}` } }
            );
            if (!res.ok) return null;
            const msg = await res.json();
            const headers = {};
            (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });
            const snippet = msg.snippet || "";
            return { from: headers.from, to: headers.to, subject: headers.subject, date: headers.date, snippet };
          })
        );

        const validMsgs = msgs.filter(Boolean);
        if (validMsgs.length > 0) {
          emailContext += `\n## Recent Email Threads with ${contactName}\n`;
          validMsgs.forEach(m => {
            emailContext += `- [${m.date || "—"}] From: ${m.from || "—"} | Subject: ${m.subject || "—"}\n  Preview: ${m.snippet?.slice(0, 300)}\n`;
          });
        }
      }
    } catch (e) {
      emailContext += `\n[Gmail data unavailable: ${e.message}]\n`;
    }

    // ── 3. Gather Calendar context ──────────────────────────────
    let calendarContext = "";
    try {
      const gtoken = await getAccessToken();
      const now = new Date();
      const past30 = new Date(now.getTime() - 30 * 86400000).toISOString();
      const future14 = new Date(now.getTime() + 14 * 86400000).toISOString();

      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(past30)}&timeMax=${encodeURIComponent(future14)}` +
        `&maxResults=50&singleEvents=true&orderBy=startTime` +
        `&q=${encodeURIComponent(accountName || "")}`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const calData = await calRes.json();

      const relevantEvents = (calData.items || []).filter(e => {
        const summary = (e.summary || "").toLowerCase();
        const acct = (accountName || "").toLowerCase();
        const contact = (contactName || "").toLowerCase();
        return (acct && summary.includes(acct)) ||
               (contact && summary.includes(contact)) ||
               (e.attendees || []).some(a =>
                 (a.email || "").toLowerCase() === (contactEmail || "").toLowerCase()
               );
      });

      if (relevantEvents.length > 0) {
        calendarContext += `\n## Meetings with ${accountName || contactName}\n`;
        relevantEvents.forEach(e => {
          const start = e.start?.dateTime || e.start?.date || "—";
          const isPast = new Date(start) < now;
          calendarContext += `- [${isPast ? "Past" : "Upcoming"}] ${start.split("T")[0]} — ${e.summary}\n`;
        });
      }
    } catch (e) {
      calendarContext += `\n[Calendar data unavailable: ${e.message}]\n`;
    }

    // ── 4. Build prompt and call Claude ─────────────────────────
    const toneInstructions = {
      professional: "Write in a professional, warm but business-focused tone. Be direct and value-driven.",
      casual: "Write in a casual, friendly tone. Keep it light but still purposeful. Use contractions.",
      urgent: "Write with urgency. Convey time sensitivity clearly but without being aggressive. Reference deadlines or closing timelines.",
      breakup: "This is a breakup email. The prospect has gone silent. Be respectful but clearly signal this is the final outreach unless they respond. Keep it very short (3-4 sentences max).",
    };

    const fullContext = [sfdcContext, emailContext, calendarContext].filter(Boolean).join("\n");

    const systemPrompt = `You are Jake Dunlap's AI email assistant. Jake is CEO of Skaled Consulting, a sales consulting firm. Write emails in his voice — direct, concise, value-driven. No fluff.

Today's date: ${new Date().toISOString().split("T")[0]}

${fullContext}

${userContext ? `\nAdditional context from Jake: ${userContext}` : ""}`;

    const userPrompt = `Draft a follow-up email to ${contactName} (${contactEmail}) regarding the ${oppName || "deal"} opportunity with ${accountName || "their company"}.

Tone: ${selectedTone} — ${toneInstructions[selectedTone]}

Requirements:
- Write a clear, compelling subject line
- Reference specific prior interactions if available from the email/meeting/activity history above
- Keep it concise (under 200 words for the body)
- End with a clear call to action
- Do NOT include a signature (Jake's sig is added automatically)
- Return your response as JSON with exactly these fields: { "subject": "...", "body": "..." }
- The body should be plain text with line breaks (\\n), not HTML`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
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

    // Parse the JSON from Claude's response
    let subject = "";
    let body = "";
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        subject = parsed.subject || "";
        body = parsed.body || "";
      } else {
        body = rawText;
        subject = `Following up — ${oppName || accountName || "our conversation"}`;
      }
    } catch {
      body = rawText;
      subject = `Following up — ${oppName || accountName || "our conversation"}`;
    }

    const contextSources = [];
    if (sfdcContext) contextSources.push("salesforce");
    if (emailContext) contextSources.push("gmail");
    if (calendarContext) contextSources.push("calendar");

    return Response.json({ subject, body, context_used: contextSources });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/ai-email-writer" };
