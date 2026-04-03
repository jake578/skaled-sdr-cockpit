// AI Deal Inspector — deep analysis of a single opportunity using SFDC + Gmail + Calendar
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const { oppId } = await req.json();
    if (!oppId) {
      return Response.json({ error: "Missing required field: oppId" }, { status: 400 });
    }

    // ── 1. Gather SFDC data ─────────────────────────────────────
    let sfdcContext = "";
    let accountName = "";
    let contactEmails = [];

    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);

    if (!sfdcMatch) {
      return Response.json({ error: "not_authenticated", message: "Please connect Salesforce first" }, { status: 401 });
    }

    let tokens;
    try { tokens = JSON.parse(decodeURIComponent(sfdcMatch[1])); } catch {
      return Response.json({ error: "invalid_token", message: "Invalid token cookie" }, { status: 401 });
    }

    const sfdcQuery = async (soql) => {
      const res = await fetch(
        `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.records || [];
    };

    // Run all SFDC queries in parallel
    const [oppDetails, activities, contacts, fieldHistory, events] = await Promise.all([
      sfdcQuery(`SELECT Id, Name, Account.Name, Account.Id, Amount, StageName, CloseDate, Description, NextStep, LastActivityDate, CreatedDate, Probability, ForecastCategory, Group_Forecast_Category__c, OwnerId, Owner.Name FROM Opportunity WHERE Id = '${oppId}' LIMIT 1`),
      sfdcQuery(`SELECT Subject, Description, Status, Priority, CreatedDate, Who.Name, Who.Title, ActivityDate, Type FROM Task WHERE WhatId = '${oppId}' ORDER BY CreatedDate DESC LIMIT 30`),
      sfdcQuery(`SELECT Id, Name, Title, Email, Phone, Department FROM Contact WHERE AccountId IN (SELECT AccountId FROM Opportunity WHERE Id = '${oppId}') ORDER BY CreatedDate ASC LIMIT 30`),
      sfdcQuery(`SELECT Field, OldValue, NewValue, CreatedDate FROM OpportunityFieldHistory WHERE OpportunityId = '${oppId}' ORDER BY CreatedDate DESC LIMIT 50`),
      sfdcQuery(`SELECT Subject, StartDateTime, EndDateTime, Who.Name, Description FROM Event WHERE WhatId = '${oppId}' ORDER BY StartDateTime DESC LIMIT 20`),
    ]);

    if (oppDetails.length === 0) {
      return Response.json({ error: "Opportunity not found" }, { status: 404 });
    }

    const opp = oppDetails[0];
    accountName = opp.Account?.Name || "";

    sfdcContext += `## Opportunity Details\n`;
    sfdcContext += `- Name: ${opp.Name}\n- Account: ${accountName}\n- Stage: ${opp.StageName}\n- Amount: $${opp.Amount || 0}\n- Close Date: ${opp.CloseDate || "—"}\n- Created: ${opp.CreatedDate?.split("T")[0] || "—"}\n- Probability: ${opp.Probability || 0}%\n- Forecast: ${opp.ForecastCategory || "—"} / ${opp.Group_Forecast_Category__c || "—"}\n- Next Step: ${opp.NextStep || "—"}\n- Description: ${opp.Description || "—"}\n- Owner: ${opp.Owner?.Name || "—"}\n- Last Activity: ${opp.LastActivityDate || "—"}\n`;

    if (contacts.length > 0) {
      sfdcContext += `\n## Contacts on Account (${contacts.length})\n`;
      contacts.forEach(c => {
        sfdcContext += `- ${c.Name} — ${c.Title || "No title"} | ${c.Department || "—"} | ${c.Email || "—"}\n`;
        if (c.Email) contactEmails.push(c.Email);
      });
    }

    if (activities.length > 0) {
      sfdcContext += `\n## Activities/Tasks (${activities.length})\n`;
      activities.forEach(a => {
        sfdcContext += `- [${a.CreatedDate?.split("T")[0] || "—"}] ${a.Type || "Task"}: ${a.Subject} (${a.Status}) — ${a.Who?.Name || "—"} ${a.Who?.Title ? `(${a.Who.Title})` : ""}\n`;
        if (a.Description) sfdcContext += `  Notes: ${a.Description.slice(0, 300)}\n`;
      });
    }

    if (events.length > 0) {
      sfdcContext += `\n## Meetings/Events (${events.length})\n`;
      events.forEach(e => {
        sfdcContext += `- [${e.StartDateTime?.split("T")[0] || "—"}] ${e.Subject} — with ${e.Who?.Name || "—"}\n`;
        if (e.Description) sfdcContext += `  Notes: ${e.Description.slice(0, 300)}\n`;
      });
    }

    if (fieldHistory.length > 0) {
      sfdcContext += `\n## Field Change History (${fieldHistory.length})\n`;
      fieldHistory.forEach(h => {
        sfdcContext += `- [${h.CreatedDate?.split("T")[0] || "—"}] ${h.Field}: ${h.OldValue || "—"} → ${h.NewValue || "—"}\n`;
      });
    }

    // ── 2. Gather Gmail context ─────────────────────────────────
    let emailContext = "";
    try {
      const gtoken = await getAccessToken();

      // Search for emails with account name and contact emails
      const queries = [];
      if (accountName) queries.push(accountName);
      contactEmails.slice(0, 5).forEach(e => queries.push(e));

      const searchQuery = queries.map(q => `(${q})`).join(" OR ");
      if (searchQuery) {
        const gmailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=${encodeURIComponent(searchQuery + " newer_than:90d")}`,
          { headers: { Authorization: `Bearer ${gtoken}` } }
        );
        const gmailData = await gmailRes.json();

        if (gmailData.messages?.length) {
          const msgs = await Promise.all(
            gmailData.messages.slice(0, 10).map(async m => {
              const res = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
                { headers: { Authorization: `Bearer ${gtoken}` } }
              );
              if (!res.ok) return null;
              const msg = await res.json();
              const headers = {};
              (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });
              return { ...headers, snippet: msg.snippet || "" };
            })
          );

          const validMsgs = msgs.filter(Boolean);
          if (validMsgs.length > 0) {
            emailContext += `\n## Gmail Threads with ${accountName} (${validMsgs.length} emails)\n`;
            validMsgs.forEach(m => {
              emailContext += `- [${m.date || "—"}] From: ${m.from || "—"} → To: ${m.to || "—"}\n  Subject: ${m.subject || "—"}\n  Preview: ${(m.snippet || "").slice(0, 200)}\n`;
            });
          }
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
      const past90 = new Date(now.getTime() - 90 * 86400000).toISOString();
      const future30 = new Date(now.getTime() + 30 * 86400000).toISOString();

      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(past90)}&timeMax=${encodeURIComponent(future30)}` +
        `&maxResults=50&singleEvents=true&orderBy=startTime` +
        `&q=${encodeURIComponent(accountName || "")}`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const calData = await calRes.json();

      const relevantEvents = (calData.items || []).filter(e => {
        const summary = (e.summary || "").toLowerCase();
        const acct = accountName.toLowerCase();
        return (acct && summary.includes(acct)) ||
               (e.attendees || []).some(a => contactEmails.some(ce => (a.email || "").toLowerCase() === ce.toLowerCase()));
      });

      if (relevantEvents.length > 0) {
        calendarContext += `\n## Calendar Meetings with ${accountName} (${relevantEvents.length})\n`;
        const now = new Date();
        relevantEvents.forEach(e => {
          const start = e.start?.dateTime || e.start?.date || "—";
          const isPast = new Date(start) < now;
          const attendees = (e.attendees || []).filter(a => !a.self).map(a => a.displayName || a.email).join(", ");
          calendarContext += `- [${isPast ? "Past" : "Upcoming"}] ${start.split("T")[0]} — ${e.summary} | With: ${attendees || "—"}\n`;
        });
      }
    } catch (e) {
      calendarContext += `\n[Calendar data unavailable: ${e.message}]\n`;
    }

    // ── 4. Send to Claude for analysis ──────────────────────────
    const fullContext = [sfdcContext, emailContext, calendarContext].filter(Boolean).join("\n");

    const systemPrompt = `You are a senior sales strategist analyzing a deal for Jake Dunlap, CEO of Skaled Consulting. You have deep expertise in B2B sales processes, pipeline management, and deal inspection. Provide honest, actionable analysis. Today is ${new Date().toISOString().split("T")[0]}.

${fullContext}`;

    const userPrompt = `Perform a deep inspection of the "${opp.Name}" opportunity. Analyze everything: deal progression, stakeholder engagement, activity patterns, field history, email engagement, and meeting cadence.

Return your analysis as JSON with exactly these fields:
{
  "healthScore": <number 1-10, where 10 is healthiest>,
  "riskFactors": ["<specific risks based on the data>"],
  "strengths": ["<what's going well>"],
  "nextSteps": ["<specific, actionable next steps>"],
  "timeline": [{"date": "YYYY-MM-DD", "event": "<description>"}],
  "stakeholderGaps": "<analysis of who is engaged vs who should be, missing personas like exec sponsor, champion, etc>",
  "summary": "<2-3 sentence executive summary>"
}

Be specific. Reference actual dates, names, and data from the context. Don't be generic.`;

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

    // Parse Claude's JSON response
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return Response.json({
          healthScore: analysis.healthScore || 5,
          riskFactors: analysis.riskFactors || [],
          strengths: analysis.strengths || [],
          nextSteps: analysis.nextSteps || [],
          timeline: analysis.timeline || [],
          stakeholderGaps: analysis.stakeholderGaps || "",
          summary: analysis.summary || "",
          oppName: opp.Name,
          accountName,
        });
      }
    } catch { /* fall through */ }

    // Fallback if JSON parsing fails
    return Response.json({
      healthScore: 5,
      riskFactors: ["Unable to parse structured analysis"],
      strengths: [],
      nextSteps: [],
      timeline: [],
      stakeholderGaps: "",
      summary: rawText.slice(0, 500),
      oppName: opp.Name,
      accountName,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/ai-deal-inspect" };
