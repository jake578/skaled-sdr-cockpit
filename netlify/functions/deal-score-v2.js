// Deal Score V2 — Gmail-first contact discovery, SFDC supplementary
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

    // ── SFDC data (parallel) ────────────────────────────────
    const [oppArr, roles, tasks, history, chorusEvents, sfdcContacts] = await Promise.all([
      sfdcQuery(`SELECT Name, Account.Name, Account.Industry, Amount, StageName, CloseDate, CreatedDate, LastActivityDate, Group_Forecast_Category__c, NextStep, Probability FROM Opportunity WHERE Id = '${oppId}' LIMIT 1`),
      sfdcQuery(`SELECT Contact.Name, Contact.Title, Contact.Email, Role FROM OpportunityContactRole WHERE OpportunityId = '${oppId}'`),
      sfdcQuery(`SELECT Subject, CreatedDate, Status, Type FROM Task WHERE WhatId = '${oppId}' ORDER BY CreatedDate DESC LIMIT 50`),
      sfdcQuery(`SELECT Field, OldValue, NewValue, CreatedDate FROM OpportunityFieldHistory WHERE OpportunityId = '${oppId}' ORDER BY CreatedDate DESC LIMIT 30`),
      sfdcQuery(`SELECT Subject, StartDateTime, Who.Name FROM Event WHERE Subject LIKE 'Chorus%' AND WhatId = '${oppId}' ORDER BY StartDateTime DESC LIMIT 10`),
      sfdcQuery(`SELECT Name, Title, Email FROM Contact WHERE AccountId IN (SELECT AccountId FROM Opportunity WHERE Id = '${oppId}') LIMIT 30`),
    ]);

    const opp = oppArr[0];
    if (!opp) return Response.json({ error: "Opportunity not found" }, { status: 404 });

    const accountName = opp.Account?.Name || "";
    const amount = opp.Amount || 0;

    // ── GMAIL-FIRST: Discover ALL contacts by searching email ──
    // This is the primary source of truth, not SFDC
    const sfdcEmailSet = new Set([
      ...sfdcContacts.map(c => (c.Email || "").toLowerCase()),
      ...roles.map(r => (r.Contact?.Email || "").toLowerCase()),
    ].filter(Boolean));

    const allDiscoveredContacts = new Map(); // email → { name, email, count, lastDate, inSFDC }
    let emailCount7d = 0, emailCount30d = 0, lastEmailDate = null;
    const recentEmails = [];
    let gtoken = null;

    try {
      gtoken = await getAccessToken();
    } catch {}

    // ── Run Gmail, Calendar, Drive ALL in parallel ──────────
    const searches = [`"${accountName}" newer_than:30d`];
    const knownEmails = [...sfdcEmailSet].slice(0, 3);
    if (knownEmails.length) searches.push(knownEmails.map(e => `from:${e} OR to:${e}`).join(" OR ") + " newer_than:30d");

    let meetingsLast30d = 0, meetingsUpcoming = 0, nextMeeting = null, meetingList = [];
    let docCount = 0, docList = [];

    const processEmailDetails = (details) => {
      details.filter(Boolean).forEach(d => {
        const dateStr = d.date ? new Date(d.date).toISOString().split("T")[0] : null;
        if (dateStr && (!lastEmailDate || dateStr > lastEmailDate)) lastEmailDate = dateStr;
        if (d.internalDate) { const msgAge = (now.getTime() - parseInt(d.internalDate)) / 86400000; if (msgAge <= 7) emailCount7d++; }
        if (recentEmails.length < 6) recentEmails.push({ subject: d.subject || "—", from: (d.from || "").split("<")[0].trim().replace(/"/g, ""), date: dateStr || "—" });
        const allAddrs = [d.from, d.to, d.cc].filter(Boolean).join(", ");
        const found = allAddrs.match(/([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) || [];
        found.forEach(email => {
          const lower = email.toLowerCase();
          if (lower.includes("skaled.com") || lower.includes("noreply") || lower.includes("no-reply") || lower.includes("calendar-notification") || lower.includes("google.com") || lower.includes("mailer-daemon")) return;
          const nameMatch = allAddrs.match(new RegExp(`([^<,;]+?)\\s*<${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>`, "i"));
          const name = nameMatch ? nameMatch[1].trim().replace(/"/g, "") : "";
          const existing = allDiscoveredContacts.get(lower) || { email: lower, name: "", count: 0, lastDate: null, inSFDC: sfdcEmailSet.has(lower) };
          existing.count++;
          if (name && !existing.name) existing.name = name;
          if (dateStr && (!existing.lastDate || dateStr > existing.lastDate)) existing.lastDate = dateStr;
          allDiscoveredContacts.set(lower, existing);
        });
      });
    };

    if (gtoken) {
      const gmailSearchPromises = searches.map(async (query) => {
        try {
          const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${gtoken}` }, signal: AbortSignal.timeout(6000) });
          const data = await res.json();
          if (!data.messages?.length) return;
          emailCount30d = Math.max(emailCount30d, data.messages.length);
          const details = await Promise.all(
            data.messages.slice(0, 8).map(async m => {
              try {
                const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Date&metadataHeaders=Subject`, { headers: { Authorization: `Bearer ${gtoken}` }, signal: AbortSignal.timeout(4000) });
                if (!r.ok) return null;
                const msg = await r.json();
                const h = {};
                (msg.payload?.headers || []).forEach(hdr => { h[hdr.name.toLowerCase()] = hdr.value; });
                return { ...h, internalDate: msg.internalDate };
              } catch { return null; }
            })
          );
          processEmailDetails(details);
        } catch {}
      });

      const calendarPromise = accountName.length > 2 ? (async () => {
        try {
          const past30 = new Date(now.getTime() - 30 * 86400000).toISOString();
          const future30 = new Date(now.getTime() + 30 * 86400000).toISOString();
          const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(past30)}&timeMax=${encodeURIComponent(future30)}&maxResults=50&singleEvents=true&orderBy=startTime&q=${encodeURIComponent(accountName)}`, { headers: { Authorization: `Bearer ${gtoken}` }, signal: AbortSignal.timeout(5000) });
          if (res.ok) {
            const data = await res.json();
            const items = data.items || [];
            meetingsLast30d = items.filter(e => new Date(e.start?.dateTime || e.start?.date) < now).length;
            const upcoming = items.filter(e => new Date(e.start?.dateTime || e.start?.date) >= now);
            meetingsUpcoming = upcoming.length;
            if (upcoming.length) nextMeeting = upcoming[0].start?.dateTime?.split("T")[0] || upcoming[0].start?.date;
            meetingList = items.slice(0, 5).map(e => ({ title: e.summary || "—", date: (e.start?.dateTime || e.start?.date || "").split("T")[0], isPast: new Date(e.start?.dateTime || e.start?.date) < now }));
          }
        } catch {}
      })() : Promise.resolve();

      const drivePromise = accountName.length > 2 ? (async () => {
        try {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name contains '${accountName.replace(/'/g, "")}' and trashed = false`)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=5`, { headers: { Authorization: `Bearer ${gtoken}` }, signal: AbortSignal.timeout(5000) });
          if (res.ok) { const data = await res.json(); docCount = (data.files || []).length; docList = (data.files || []).map(f => ({ name: f.name, modified: f.modifiedTime?.split("T")[0] })); }
        } catch {}
      })() : Promise.resolve();

      // ALL Google API calls run in parallel
      await Promise.all([...gmailSearchPromises, calendarPromise, drivePromise]);
    }

    // ── Calculate metrics ───────────────────────────────────
    const daysInPipeline = opp.CreatedDate ? Math.floor((now - new Date(opp.CreatedDate)) / 86400000) : 0;
    const daysToClose = opp.CloseDate ? Math.floor((new Date(opp.CloseDate) - now) / 86400000) : 999;
    const realLastTouch = [opp.LastActivityDate, lastEmailDate, meetingList[0]?.date].filter(Boolean).sort().pop();
    const realDaysSince = realLastTouch ? Math.floor((now - new Date(realLastTouch)) / 86400000) : 999;
    const chorusCallCount = chorusEvents.length;
    const stageChanges = history.filter(h => h.Field === "StageName").length;
    const closeDateMoves = history.filter(h => h.Field === "CloseDate").length;
    const amountChanges = history.filter(h => h.Field === "Amount").length;

    const emailTrend = emailCount7d > 3 ? "accelerating" : emailCount7d > 0 ? "stable" : emailCount30d > 0 ? "decelerating" : "no_activity";

    // MEDDPICC from roles (if any)
    const hasChampion = roles.some(r => (r.Role || "").toLowerCase().match(/champion|sponsor|advocate/));
    const hasEconomicBuyer = roles.some(r => (r.Role || "").toLowerCase().match(/economic|executive|decision|buyer/));
    const hasTechnical = roles.some(r => (r.Role || "").toLowerCase().match(/technical|evaluator|user/));
    const hasNextStep = opp.NextStep && opp.NextStep.trim().length > 0;
    const hasUpcomingMeeting = meetingsUpcoming > 0;
    const hasProposal = docCount > 0;

    // ── Score ───────────────────────────────────────────────
    let score = 0;
    // Engagement (0-30)
    score += Math.min(emailCount7d, 8) * 2;
    score += Math.min(emailCount30d, 15) * 0.5;
    score += Math.min(meetingsLast30d, 4) * 1.5;
    // Stakeholders — count ALL (Gmail + SFDC) (0-15)
    score += Math.min(totalStakeholders, 5) * 3;
    // Recency (0-15)
    if (realDaysSince <= 2) score += 15;
    else if (realDaysSince <= 7) score += 10;
    else if (realDaysSince <= 14) score += 5;
    else if (realDaysSince <= 21) score += 2;
    // Progression (0-15)
    score += stageChanges > 0 ? Math.min(stageChanges, 3) * 2 : 0;
    score += hasNextStep ? 4 : 0;
    score += hasUpcomingMeeting ? 5 : 0;
    // MEDDPICC (0-15)
    score += hasChampion ? 5 : 0;
    score += hasEconomicBuyer ? 5 : 0;
    score += hasProposal ? 3 : 0;
    score += hasTechnical ? 2 : 0;
    // Penalties
    if (daysToClose < 0) score -= Math.min(Math.abs(daysToClose) * 0.5, 15);
    if (closeDateMoves >= 3) score -= 8;
    if (realDaysSince > 21) score -= 8;
    if (totalStakeholders <= 1 && amount >= 25000) score -= 5;
    if (emailTrend === "no_activity") score -= 10;
    // Bonus: many contacts not in SFDC = active deal, SFDC is just stale
    if (notInSFDC.length >= 3) score += 5;

    score = Math.max(1, Math.min(100, Math.round(score)));
    const grade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 45 ? "C" : score >= 25 ? "D" : "F";
    const momentum = emailTrend === "accelerating" ? "accelerating" : realDaysSince > 14 || emailTrend === "no_activity" ? "decelerating" : "stable";

    // ── Signals ─────────────────────────────────────────────
    const signals = [];
    if (emailCount7d >= 3) signals.push({ type: "email", text: `${emailCount7d} emails this week`, sentiment: "positive" });
    else if (emailCount30d > 0 && emailCount7d === 0) signals.push({ type: "email", text: `No emails this week (${emailCount30d} in 30d)`, sentiment: "negative" });
    else if (emailCount30d === 0) signals.push({ type: "email", text: "No email activity in 30 days", sentiment: "negative" });
    if (totalStakeholders >= 3) signals.push({ type: "stakeholder", text: `${totalStakeholders} people engaged (${inSFDC.length} in SFDC, ${notInSFDC.length} Gmail-only)`, sentiment: "positive" });
    else if (totalStakeholders <= 1) signals.push({ type: "stakeholder", text: `Only ${totalStakeholders} contact — single-threaded`, sentiment: "negative" });
    if (notInSFDC.length > 0) signals.push({ type: "data_quality", text: `${notInSFDC.length} active contact${notInSFDC.length > 1 ? "s" : ""} not in Salesforce`, sentiment: "neutral" });
    if (meetingsUpcoming > 0) signals.push({ type: "meeting", text: `${meetingsUpcoming} upcoming meeting${meetingsUpcoming > 1 ? "s" : ""}, next: ${nextMeeting}`, sentiment: "positive" });
    else if (meetingsLast30d === 0) signals.push({ type: "meeting", text: "No meetings in 30 days", sentiment: "negative" });
    if (chorusCallCount > 0) signals.push({ type: "call", text: `${chorusCallCount} Chorus call${chorusCallCount > 1 ? "s" : ""}`, sentiment: "positive" });
    if (docCount > 0) signals.push({ type: "document", text: `${docCount} doc${docCount > 1 ? "s" : ""} in Drive`, sentiment: "positive" });
    if (closeDateMoves >= 2) signals.push({ type: "timeline", text: `Close date pushed ${closeDateMoves}x`, sentiment: "negative" });
    if (daysToClose < 0) signals.push({ type: "timeline", text: `${Math.abs(daysToClose)} days past due`, sentiment: "negative" });

    // Risks
    const risks = [];
    if (totalStakeholders <= 1) risks.push("Single-threaded — one contact leaving kills this deal");
    if (!hasNextStep) risks.push("No next step defined");
    if (closeDateMoves >= 3) risks.push("Close date slipping repeatedly");
    if (realDaysSince > 21) risks.push("No touchpoint in 3+ weeks across any channel");
    if (daysToClose < 0) risks.push("Past due — needs commitment or close");
    if (notInSFDC.length >= 3 && inSFDC.length <= 1) risks.push("Most contacts aren't in Salesforce — CRM data is incomplete");

    // Recommendations
    const recs = [];
    if (notInSFDC.length > 0) recs.push(`Add ${notInSFDC.length} Gmail contacts to Salesforce (${notInSFDC.slice(0, 3).map(c => c.name || c.email).join(", ")})`);
    if (!hasChampion) recs.push("Identify a champion inside the account");
    if (totalStakeholders <= 2) recs.push("Multi-thread: engage more stakeholders");
    if (!hasNextStep) recs.push("Define a concrete next step with a date");
    if (!hasUpcomingMeeting && realDaysSince > 7) recs.push("Schedule a meeting this week");
    if (daysToClose < 0) recs.push("Update close date or close lost");

    return Response.json({
      score, grade, momentum, signals, risks, recommendations: recs,
      projectedCloseDate: opp.CloseDate || null,
      confidence: Math.min(score + 10, 95),
      metrics: {
        emailsLast7d: emailCount7d, emailsLast30d: emailCount30d, emailTrend,
        meetingsLast30d, meetingsUpcoming, nextMeeting,
        chorusCallCount, totalStakeholders, sfdcContactCount: inSFDC.length, gmailOnlyCount: notInSFDC.length,
        docCount, daysInPipeline, daysToClose, realDaysSince,
        stageChanges, closeDateMoves, amountChanges,
        hasChampion, hasEconomicBuyer, hasTechnical, hasNextStep, hasUpcomingMeeting, hasProposal,
      },
      recentEmails,
      recentMeetings: meetingList,
      documents: docList,
      contacts: roles.map(r => ({ name: r.Contact?.Name, title: r.Contact?.Title, email: r.Contact?.Email, role: r.Role })),
      allContacts: inSFDC.map(c => ({ name: c.name, email: c.email, count: c.count, inSFDC: true })),
      gmailContacts: notInSFDC.slice(0, 15),
      missingFromSFDC: notInSFDC.length,
      chorusCalls: chorusEvents.map(c => ({ subject: c.Subject?.replace("Chorus - ", ""), date: c.StartDateTime?.split("T")[0], who: c.Who?.Name })),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/deal-score-v2" };
