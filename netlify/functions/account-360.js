// Account 360 — master account view: SFDC opps + contacts, Gmail, Calendar, Chorus, Drive, AI summary
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { accountId, accountName } = await req.json();
    if (!accountId && !accountName) return Response.json({ error: "Need accountId or accountName" }, { status: 400 });

    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    const now = new Date();
    const past90 = new Date(now.getTime() - 90 * 86400000);
    const future14 = new Date(now.getTime() + 14 * 86400000);

    let account = { name: accountName || "", industry: "—", employees: 0 };
    let opps = [], contacts = [];

    // ── 1. SFDC: Account, Opps, Contacts ───────────────────
    if (sfdcMatch) {
      const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
      const sfdcQuery = async (soql) => {
        const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        if (!res.ok) return [];
        return (await res.json()).records || [];
      };

      const acctFilter = accountId
        ? `Id = '${accountId}'`
        : `Name = '${(accountName || "").replace(/'/g, "\\'")}'`;

      const [acctRecs, oppRecs, contactRecs] = await Promise.all([
        sfdcQuery(`SELECT Id, Name, Industry, NumberOfEmployees FROM Account WHERE ${acctFilter} LIMIT 1`),
        sfdcQuery(`SELECT Id, Name, Amount, StageName, CloseDate, IsClosed, IsWon, Probability, CreatedDate, LastActivityDate, Group_Forecast_Category__c, NextStep FROM Opportunity WHERE AccountId IN (SELECT Id FROM Account WHERE ${acctFilter}) ORDER BY CloseDate DESC LIMIT 50`),
        sfdcQuery(`SELECT Id, Name, Title, Email, Phone, LastActivityDate FROM Contact WHERE AccountId IN (SELECT Id FROM Account WHERE ${acctFilter}) ORDER BY LastActivityDate DESC NULLS LAST LIMIT 50`),
      ]);

      if (acctRecs.length) {
        account = { name: acctRecs[0].Name, industry: acctRecs[0].Industry || "—", employees: acctRecs[0].NumberOfEmployees || 0 };
      }

      opps = oppRecs.map(o => ({
        id: o.Id, name: o.Name, amount: o.Amount || 0, stage: o.StageName,
        closeDate: o.CloseDate || "—", isClosed: o.IsClosed, isWon: o.IsWon,
        probability: o.Probability || 0, forecast: o.Group_Forecast_Category__c || "—",
        nextStep: o.NextStep || "—", createdDate: o.CreatedDate?.split("T")[0] || "—",
        lastActivity: o.LastActivityDate || "—",
      }));

      contacts = contactRecs.map(c => ({
        id: c.Id, name: c.Name, title: c.Title || "—", email: c.Email || "",
        phone: c.Phone || "", lastActivity: c.LastActivityDate || "—", source: "SFDC",
      }));
    }

    const acctName = account.name || accountName || "";
    const safeName = acctName.replace(/'/g, "");

    // ── 2. Gmail: email count + last 5 subjects ────────────
    let emailCount = 0, recentEmails = [];
    try {
      const gtoken = await getAccessToken();

      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${encodeURIComponent(`"${safeName}" newer_than:90d`)}`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const listData = await listRes.json();
      emailCount = listData.resultSizeEstimate || (listData.messages?.length || 0);

      if (listData.messages?.length) {
        const details = await Promise.all(
          listData.messages.slice(0, 5).map(async m => {
            const res = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
              { headers: { Authorization: `Bearer ${gtoken}` } }
            );
            if (!res.ok) return null;
            const msg = await res.json();
            const headers = {};
            (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });
            return {
              subject: headers.subject || "—",
              from: headers.from?.split("<")[0]?.trim()?.replace(/"/g, "") || "—",
              date: headers.date ? new Date(headers.date).toLocaleDateString("en-US", { timeZone: "America/Chicago" }) : "—",
            };
          })
        );
        recentEmails = details.filter(Boolean);
      }
    } catch { /* Gmail unavailable */ }

    // ── 3. Calendar: meetings last 90d + next 14d ──────────
    let meetingCount = 0, recentMeetings = [];
    try {
      const gtoken = await getAccessToken();
      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(past90.toISOString())}&timeMax=${encodeURIComponent(future14.toISOString())}` +
        `&maxResults=200&singleEvents=true&orderBy=startTime&q=${encodeURIComponent(safeName)}`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      if (calRes.ok) {
        const calData = await calRes.json();
        const items = calData.items || [];
        meetingCount = items.length;
        recentMeetings = items.slice(-10).reverse().map(e => {
          const start = e.start?.dateTime || e.start?.date || "";
          const attendees = (e.attendees || []).filter(a => !a.self).map(a => a.displayName || a.email || "—");
          return {
            subject: e.summary || "—",
            date: start ? new Date(start).toLocaleDateString("en-US", { timeZone: "America/Chicago" }) : "—",
            time: e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "",
            attendees: attendees.slice(0, 5),
            isFuture: new Date(start) > now,
          };
        });
      }
    } catch { /* Calendar unavailable */ }

    // ── 4. Chorus calls from SFDC Events ───────────────────
    let chorusCalls = [];
    if (sfdcMatch) {
      try {
        const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
        const sfdcQuery = async (soql) => {
          const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
          if (!res.ok) return [];
          return (await res.json()).records || [];
        };
        const acctFilter = accountId
          ? `AccountId = '${accountId}'`
          : `Account.Name = '${safeName}'`;
        const events = await sfdcQuery(`SELECT Id, Subject, StartDateTime, DurationInMinutes, Description FROM Event WHERE ${acctFilter} AND (Subject LIKE '%Chorus%' OR Subject LIKE '%call%' OR Subject LIKE '%Call%' OR Type = 'Call') AND StartDateTime >= ${past90.toISOString().split("T")[0]}T00:00:00Z ORDER BY StartDateTime DESC LIMIT 20`);
        chorusCalls = events.map(e => ({
          id: e.Id, subject: e.Subject || "—",
          date: e.StartDateTime ? new Date(e.StartDateTime).toLocaleDateString("en-US", { timeZone: "America/Chicago" }) : "—",
          duration: e.DurationInMinutes || 0,
          description: (e.Description || "").slice(0, 200),
        }));
      } catch {}
    }

    // ── 5. Google Drive docs ───────────────────────────────
    let documents = [];
    try {
      const gtoken = await getAccessToken();
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name contains '${safeName}' and trashed = false`)}&fields=files(id,name,mimeType,modifiedTime,webViewLink,owners)&orderBy=modifiedTime desc&pageSize=15`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      if (driveRes.ok) {
        const driveData = await driveRes.json();
        documents = (driveData.files || []).map(f => ({
          id: f.id, name: f.name, type: f.mimeType || "—",
          modified: f.modifiedTime?.split("T")[0] || "—",
          link: f.webViewLink || "",
          owner: f.owners?.[0]?.displayName || "—",
        }));
      }
    } catch { /* Drive unavailable */ }

    // ── 6. AI Health Summary ───────────────────────────────
    let healthScore = 5, aiSummary = "", recommendations = [];

    const openOpps = opps.filter(o => !o.isClosed);
    const wonOpps = opps.filter(o => o.isWon);
    const openPipeline = openOpps.reduce((s, o) => s + o.amount, 0);
    const wonRevenue = wonOpps.reduce((s, o) => s + o.amount, 0);

    const contextParts = [];
    contextParts.push(`ACCOUNT: ${acctName} | Industry: ${account.industry} | Employees: ${account.employees}`);
    contextParts.push(`OPPORTUNITIES: ${opps.length} total (${openOpps.length} open = $${openPipeline.toLocaleString()}, ${wonOpps.length} won = $${wonRevenue.toLocaleString()})\n${opps.slice(0, 10).map(o => `- ${o.name}: $${(o.amount || 0).toLocaleString()} | ${o.stage} | Close: ${o.closeDate} | ${o.isWon ? "WON" : o.isClosed ? "LOST" : "OPEN"}`).join("\n")}`);
    contextParts.push(`CONTACTS: ${contacts.length} total\n${contacts.slice(0, 10).map(c => `- ${c.name} (${c.title}) — ${c.email}`).join("\n")}`);
    contextParts.push(`EMAILS (90d): ${emailCount} total\nRecent: ${recentEmails.map(e => `${e.date}: "${e.subject}" from ${e.from}`).join("; ")}`);
    contextParts.push(`MEETINGS (90d + 14d future): ${meetingCount} total\nRecent: ${recentMeetings.slice(0, 5).map(m => `${m.date} ${m.time}: "${m.subject}" ${m.isFuture ? "(UPCOMING)" : ""}`).join("; ")}`);
    contextParts.push(`CHORUS CALLS: ${chorusCalls.length}\n${chorusCalls.slice(0, 5).map(c => `${c.date}: "${c.subject}" (${c.duration}min)`).join("; ")}`);
    contextParts.push(`DOCUMENTS: ${documents.length} files on Drive\n${documents.slice(0, 5).map(d => `- ${d.name} (${d.modified})`).join("\n")}`);

    try {
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1024,
          system: `You are Jake Dunlap's account intelligence advisor at Skaled Consulting. Assess overall account health based on ALL signals: deal activity, contact engagement, email frequency, meeting cadence, and document activity. Be specific and actionable. Plain text, no markdown.`,
          messages: [{
            role: "user",
            content: `${contextParts.join("\n\n========\n\n")}\n\nReturn JSON: {
              "healthScore": number 1-10 (10=thriving account, 1=dead),
              "aiSummary": "2-3 sentence executive account summary",
              "recommendations": ["specific action 1", "action 2", "action 3", "action 4"]
            }`,
          }],
        }),
      });

      if (claudeRes.ok) {
        const data = await claudeRes.json();
        const raw = data.content?.[0]?.text || "";
        try {
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            healthScore = Math.max(1, Math.min(10, parsed.healthScore || 5));
            aiSummary = parsed.aiSummary || "";
            recommendations = parsed.recommendations || [];
          }
        } catch {
          aiSummary = raw.slice(0, 500);
        }
      }
    } catch {}

    return Response.json({
      account,
      opps,
      contacts,
      emailCount,
      recentEmails,
      meetingCount,
      recentMeetings,
      chorusCalls,
      documents,
      healthScore,
      aiSummary,
      recommendations,
      generatedAt: now.toISOString(),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/account-360" };
