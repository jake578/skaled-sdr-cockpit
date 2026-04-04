// Predictive Deal Health Scoring — engagement velocity, stakeholder breadth, momentum
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { oppId } = await req.json();
    if (!oppId) return Response.json({ error: "Missing oppId" }, { status: 400 });

    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    if (!sfdcMatch) return Response.json({ error: "SFDC not connected" }, { status: 401 });

    const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
    const now = new Date();

    const sfdcQuery = async (soql) => {
      const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!res.ok) return [];
      return (await res.json()).records || [];
    };

    // Pull opp details, contacts, activities
    const [oppArr, contacts, tasks, events] = await Promise.all([
      sfdcQuery(`SELECT Name, Account.Name, Amount, StageName, CloseDate, CreatedDate, LastActivityDate, Group_Forecast_Category__c, NextStep, Probability FROM Opportunity WHERE Id = '${oppId}' LIMIT 1`),
      sfdcQuery(`SELECT Name, Title, Email FROM Contact WHERE AccountId IN (SELECT AccountId FROM Opportunity WHERE Id = '${oppId}') LIMIT 20`),
      sfdcQuery(`SELECT Subject, CreatedDate FROM Task WHERE WhatId = '${oppId}' ORDER BY CreatedDate DESC LIMIT 20`),
      sfdcQuery(`SELECT Subject, StartDateTime FROM Event WHERE What.Name IN (SELECT Account.Name FROM Opportunity WHERE Id = '${oppId}') AND Subject LIKE 'Chorus%' ORDER BY StartDateTime DESC LIMIT 10`),
    ]);

    const opp = oppArr[0];
    if (!opp) return Response.json({ error: "Opportunity not found" }, { status: 404 });

    const accountName = opp.Account?.Name || "";

    // Gmail engagement
    let emailCount = 0, lastEmailDate = null;
    try {
      const gtoken = await getAccessToken();
      if (accountName) {
        const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=in:sent newer_than:30d "${accountName}"`, { headers: { Authorization: `Bearer ${gtoken}` } });
        const data = await res.json();
        emailCount = data.resultSizeEstimate || data.messages?.length || 0;
        if (data.messages?.length) {
          const first = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${data.messages[0].id}?format=metadata&metadataHeaders=Date`, { headers: { Authorization: `Bearer ${gtoken}` } });
          const msg = await first.json();
          const dateH = msg.payload?.headers?.find(h => h.name.toLowerCase() === "date");
          if (dateH) lastEmailDate = new Date(dateH.value).toISOString().split("T")[0];
        }
      }
    } catch {}

    // Calendar meetings
    let meetingCount = 0, nextMeeting = null;
    try {
      const gtoken = await getAccessToken();
      if (accountName) {
        const past30 = new Date(now.getTime() - 30 * 86400000).toISOString();
        const future14 = new Date(now.getTime() + 14 * 86400000).toISOString();
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(past30)}&timeMax=${encodeURIComponent(future14)}&maxResults=50&singleEvents=true&q=${encodeURIComponent(accountName)}`, { headers: { Authorization: `Bearer ${gtoken}` } });
        const data = await res.json();
        const items = data.items || [];
        meetingCount = items.filter(e => new Date(e.start?.dateTime || e.start?.date) < now).length;
        const upcoming = items.filter(e => new Date(e.start?.dateTime || e.start?.date) >= now);
        if (upcoming.length) nextMeeting = upcoming[0].start?.dateTime?.split("T")[0] || upcoming[0].start?.date;
      }
    } catch {}

    // Google Drive — proposals, SOWs, decks
    let docContext = "";
    try {
      const gtoken = await getAccessToken();
      if (accountName) {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name contains '${accountName.replace(/'/g, "")}' and trashed = false`)}&fields=files(id,name,mimeType,modifiedTime)&orderBy=modifiedTime desc&pageSize=5`, { headers: { Authorization: `Bearer ${gtoken}` } });
        if (res.ok) {
          const data = await res.json();
          const files = data.files || [];
          if (files.length) {
            docContext = "\nDeal Documents Found:\n" + files.map(f => `- ${f.name} (${f.mimeType?.split(".").pop() || "file"}, modified ${f.modifiedTime?.split("T")[0]})`).join("\n");
          }
        }
      }
    } catch {}

    const chorusCallCount = events.length;
    const stakeholderCount = contacts.length;
    const daysInPipeline = opp.CreatedDate ? Math.floor((now - new Date(opp.CreatedDate)) / 86400000) : 0;
    const daysToClose = opp.CloseDate ? Math.floor((new Date(opp.CloseDate) - now) / 86400000) : 999;
    const daysSinceActivity = opp.LastActivityDate ? Math.floor((now - new Date(opp.LastActivityDate)) / 86400000) : 999;

    const context = `
Opportunity: ${opp.Name}
Account: ${accountName}
Amount: $${opp.Amount || 0}
Stage: ${opp.StageName}
Forecast Category: ${opp.Group_Forecast_Category__c || "None"}
Close Date: ${opp.CloseDate || "None"} (${daysToClose > 0 ? daysToClose + " days away" : Math.abs(daysToClose) + " days past due"})
Created: ${opp.CreatedDate?.split("T")[0]} (${daysInPipeline} days in pipeline)
Last SFDC Activity: ${opp.LastActivityDate || "None"} (${daysSinceActivity}d ago)
Next Step: ${opp.NextStep || "None"}
Probability: ${opp.Probability || 0}%

Engagement Metrics:
- Emails sent (30d): ${emailCount}
- Last email: ${lastEmailDate || "None"}
- Meetings (30d): ${meetingCount}
- Next meeting: ${nextMeeting || "None scheduled"}
- Chorus calls: ${chorusCallCount}
- Stakeholders on account: ${stakeholderCount}
- Contacts: ${contacts.map(c => `${c.Name} (${c.Title || "no title"})`).join(", ") || "None"}
${docContext}
`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 1024,
        system: "You are a deal scoring AI for Skaled Consulting. Score deals based on engagement patterns, stakeholder breadth, and timeline risk. Be specific and reference actual data points. Plain text only, no markdown, no asterisks.",
        messages: [{ role: "user", content: `Score this deal 1-100 for likelihood to close. Analyze engagement velocity, stakeholder breadth, timeline risk, deal momentum.\n\n${context}\n\nReturn JSON: { "score": number, "grade": "A/B/C/D/F", "momentum": "accelerating/stable/decelerating", "signals": [{ "type": "string", "text": "string", "sentiment": "positive/neutral/negative" }], "risks": ["string"], "recommendations": ["string"], "projectedCloseDate": "YYYY-MM-DD or null", "confidence": number 1-100 }` }],
      }),
    });

    if (!claudeRes.ok) return Response.json({ error: await claudeRes.text() }, { status: claudeRes.status });
    const raw = (await claudeRes.json()).content?.[0]?.text || "";
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) return Response.json(JSON.parse(match[0]));
    } catch {}
    return Response.json({ score: 50, grade: "C", momentum: "stable", signals: [], risks: [], recommendations: [], confidence: 30, raw });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/deal-score" };
