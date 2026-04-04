// Deal Score V2 — real engagement data, not estimates
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

    // ── Pull SFDC data in parallel ──────────────────────────
    const [oppArr, roles, tasks, history, chorusEvents, allContacts] = await Promise.all([
      sfdcQuery(`SELECT Name, Account.Name, Account.Industry, Amount, StageName, CloseDate, CreatedDate, LastActivityDate, Group_Forecast_Category__c, NextStep, Probability, Description FROM Opportunity WHERE Id = '${oppId}' LIMIT 1`),
      sfdcQuery(`SELECT Contact.Name, Contact.Title, Contact.Email, Role FROM OpportunityContactRole WHERE OpportunityId = '${oppId}'`),
      sfdcQuery(`SELECT Subject, CreatedDate, Status, Type FROM Task WHERE WhatId = '${oppId}' ORDER BY CreatedDate DESC LIMIT 50`),
      sfdcQuery(`SELECT Field, OldValue, NewValue, CreatedDate FROM OpportunityFieldHistory WHERE OpportunityId = '${oppId}' ORDER BY CreatedDate DESC LIMIT 30`),
      sfdcQuery(`SELECT Subject, StartDateTime, Who.Name FROM Event WHERE Subject LIKE 'Chorus%' AND WhatId = '${oppId}' ORDER BY StartDateTime DESC LIMIT 10`),
      sfdcQuery(`SELECT Name, Title, Email FROM Contact WHERE AccountId IN (SELECT AccountId FROM Opportunity WHERE Id = '${oppId}') LIMIT 20`),
    ]);

    const opp = oppArr[0];
    if (!opp) return Response.json({ error: "Opportunity not found" }, { status: 404 });

    const accountName = opp.Account?.Name || "";
    const amount = opp.Amount || 0;
    const safeName = accountName.replace(/'/g, "");

    // ── Get actual Gmail message counts (not estimates) ─────
    let emails = { total: 0, last7d: 0, last30d: 0, lastDate: null, threads: [] };
    try {
      const gtoken = await getAccessToken();
      if (safeName.length > 2) {
        // Get actual messages, not resultSizeEstimate
        const [recent, monthly] = await Promise.all([
          fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q="${safeName}" newer_than:7d`, { headers: { Authorization: `Bearer ${gtoken}` } }).then(r => r.json()),
          fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q="${safeName}" newer_than:30d`, { headers: { Authorization: `Bearer ${gtoken}` } }).then(r => r.json()),
        ]);
        emails.last7d = recent.messages?.length || 0;
        emails.last30d = monthly.messages?.length || 0;
        emails.total = emails.last30d;

        // Get last email date and subjects for context
        if (monthly.messages?.length) {
          const details = await Promise.all(
            monthly.messages.slice(0, 5).map(async m => {
              const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=From`, { headers: { Authorization: `Bearer ${gtoken}` } });
              if (!r.ok) return null;
              const msg = await r.json();
              const h = {};
              (msg.payload?.headers || []).forEach(hdr => { h[hdr.name.toLowerCase()] = hdr.value; });
              return h;
            })
          );
          const valid = details.filter(Boolean);
          if (valid.length) {
            emails.lastDate = valid[0].date ? new Date(valid[0].date).toISOString().split("T")[0] : null;
            emails.threads = valid.map(d => ({ subject: d.subject || "—", from: d.from?.split("<")[0]?.trim() || "—", date: d.date?.split(",")[0] || "—" }));
          }
        }
      }
    } catch {}

    // ── Get actual Calendar meetings ────────────────────────
    let meetings = { last30d: 0, upcoming: 0, nextDate: null, list: [] };
    try {
      const gtoken = await getAccessToken();
      if (safeName.length > 2) {
        const past30 = new Date(now.getTime() - 30 * 86400000).toISOString();
        const future30 = new Date(now.getTime() + 30 * 86400000).toISOString();
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(past30)}&timeMax=${encodeURIComponent(future30)}&maxResults=50&singleEvents=true&orderBy=startTime&q=${encodeURIComponent(safeName)}`, { headers: { Authorization: `Bearer ${gtoken}` } });
        if (res.ok) {
          const data = await res.json();
          const items = data.items || [];
          meetings.last30d = items.filter(e => new Date(e.start?.dateTime || e.start?.date) < now).length;
          const upcoming = items.filter(e => new Date(e.start?.dateTime || e.start?.date) >= now);
          meetings.upcoming = upcoming.length;
          if (upcoming.length) meetings.nextDate = upcoming[0].start?.dateTime?.split("T")[0] || upcoming[0].start?.date;
          meetings.list = items.slice(0, 5).map(e => ({
            title: e.summary || "—",
            date: (e.start?.dateTime || e.start?.date || "").split("T")[0],
            isPast: new Date(e.start?.dateTime || e.start?.date) < now,
          }));
        }
      }
    } catch {}

    // ── Drive documents ─────────────────────────────────────
    let docs = { count: 0, list: [] };
    try {
      const gtoken = await getAccessToken();
      if (safeName.length > 2) {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name contains '${safeName}' and trashed = false`)}&fields=files(id,name,mimeType,modifiedTime)&orderBy=modifiedTime desc&pageSize=5`, { headers: { Authorization: `Bearer ${gtoken}` } });
        if (res.ok) {
          const data = await res.json();
          docs.count = (data.files || []).length;
          docs.list = (data.files || []).map(f => ({ name: f.name, type: f.mimeType?.split(".").pop() || "file", modified: f.modifiedTime?.split("T")[0] }));
        }
      }
    } catch {}

    // ── Calculate real metrics ───────────────────────────────
    const daysInPipeline = opp.CreatedDate ? Math.floor((now - new Date(opp.CreatedDate)) / 86400000) : 0;
    const daysToClose = opp.CloseDate ? Math.floor((new Date(opp.CloseDate) - now) / 86400000) : 999;
    const daysSinceActivity = opp.LastActivityDate ? Math.floor((now - new Date(opp.LastActivityDate)) / 86400000) : 999;
    // Cross-reference: real last touch from Gmail/Cal
    const realLastTouch = [opp.LastActivityDate, emails.lastDate, meetings.list[0]?.date].filter(Boolean).sort().pop();
    const realDaysSince = realLastTouch ? Math.floor((now - new Date(realLastTouch)) / 86400000) : 999;

    const stakeholderCount = roles.length;
    const contactCount = allContacts.length;
    const chorusCallCount = chorusEvents.length;
    const stageChanges = history.filter(h => h.Field === "StageName").length;
    const closeDateMoves = history.filter(h => h.Field === "CloseDate").length;
    const amountChanges = history.filter(h => h.Field === "Amount").length;

    // Activity trend: compare last 7d vs prior 23d
    const emailTrend = emails.last7d > 0 && emails.last30d > 0
      ? emails.last7d / (emails.last30d - emails.last7d || 1) > 0.5 ? "accelerating" : "stable"
      : emails.last30d === 0 ? "no_activity" : "decelerating";

    // MEDDPICC signals from contact roles
    const hasChampion = roles.some(r => (r.Role || "").toLowerCase().match(/champion|sponsor|advocate/));
    const hasEconomicBuyer = roles.some(r => (r.Role || "").toLowerCase().match(/economic|executive|decision|buyer/));
    const hasTechnical = roles.some(r => (r.Role || "").toLowerCase().match(/technical|evaluator|user/));
    const hasNextStep = opp.NextStep && opp.NextStep.trim().length > 0;
    const hasUpcomingMeeting = meetings.upcoming > 0;
    const hasProposal = docs.count > 0;

    // ── Score calculation ───────────────────────────────────
    let score = 0;

    // Engagement velocity (0-30)
    score += Math.min(emails.last7d, 8) * 2;        // 0-16 for recent emails
    score += Math.min(emails.last30d, 15) * 0.5;    // 0-7.5 for monthly
    score += Math.min(meetings.last30d, 4) * 1.5;   // 0-6 for meetings

    // Stakeholder breadth (0-15)
    score += Math.min(stakeholderCount, 5) * 3;

    // Recency (0-15)
    if (realDaysSince <= 2) score += 15;
    else if (realDaysSince <= 7) score += 10;
    else if (realDaysSince <= 14) score += 5;
    else if (realDaysSince <= 21) score += 2;

    // Deal progression (0-15)
    score += stageChanges > 0 ? Math.min(stageChanges, 3) * 2 : 0;
    score += hasNextStep ? 4 : 0;
    score += hasUpcomingMeeting ? 5 : 0;

    // MEDDPICC completeness (0-15)
    score += hasChampion ? 5 : 0;
    score += hasEconomicBuyer ? 5 : 0;
    score += hasProposal ? 3 : 0;
    score += hasTechnical ? 2 : 0;

    // Penalties
    if (daysToClose < 0) score -= Math.min(Math.abs(daysToClose) * 0.5, 15);
    if (closeDateMoves >= 3) score -= 8;
    if (realDaysSince > 21) score -= 8;
    if (stakeholderCount <= 1 && amount >= 25000) score -= 5;
    if (emailTrend === "no_activity") score -= 10;

    score = Math.max(1, Math.min(100, Math.round(score)));
    const grade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 45 ? "C" : score >= 25 ? "D" : "F";
    const momentum = emailTrend === "accelerating" ? "accelerating" : emailTrend === "decelelerating" || realDaysSince > 14 ? "decelerating" : "stable";

    // ── Build signals from real data ────────────────────────
    const signals = [];
    if (emails.last7d >= 3) signals.push({ type: "email", text: `${emails.last7d} emails this week with ${accountName}`, sentiment: "positive" });
    else if (emails.last7d === 0 && emails.last30d > 0) signals.push({ type: "email", text: `No emails this week (${emails.last30d} in 30d)`, sentiment: "negative" });
    else if (emails.last30d === 0) signals.push({ type: "email", text: `No email activity in 30 days`, sentiment: "negative" });

    if (meetings.upcoming > 0) signals.push({ type: "meeting", text: `${meetings.upcoming} upcoming meeting${meetings.upcoming > 1 ? "s" : ""}, next: ${meetings.nextDate}`, sentiment: "positive" });
    else if (meetings.last30d > 0) signals.push({ type: "meeting", text: `${meetings.last30d} meetings in 30d but none upcoming`, sentiment: "neutral" });
    else signals.push({ type: "meeting", text: `No meetings in 30 days`, sentiment: "negative" });

    if (chorusCallCount > 0) signals.push({ type: "call", text: `${chorusCallCount} Chorus call${chorusCallCount > 1 ? "s" : ""} recorded`, sentiment: "positive" });
    if (docs.count > 0) signals.push({ type: "document", text: `${docs.count} doc${docs.count > 1 ? "s" : ""}: ${docs.list.map(d => d.name).join(", ")}`, sentiment: "positive" });
    if (stakeholderCount >= 3) signals.push({ type: "stakeholder", text: `${stakeholderCount} contacts on deal — multi-threaded`, sentiment: "positive" });
    else if (stakeholderCount <= 1) signals.push({ type: "stakeholder", text: `Only ${stakeholderCount} contact — single-threaded`, sentiment: "negative" });
    if (closeDateMoves >= 2) signals.push({ type: "timeline", text: `Close date pushed ${closeDateMoves} times`, sentiment: "negative" });
    if (daysToClose < 0) signals.push({ type: "timeline", text: `${Math.abs(daysToClose)} days past close date`, sentiment: "negative" });
    if (daysInPipeline > 90) signals.push({ type: "age", text: `${daysInPipeline} days in pipeline`, sentiment: "negative" });
    if (amountChanges > 0) signals.push({ type: "amount", text: `Deal amount changed ${amountChanges} time${amountChanges > 1 ? "s" : ""}`, sentiment: "neutral" });

    // Risks
    const risks = [];
    if (stakeholderCount <= 1) risks.push("Single-threaded: one contact leaving kills this deal");
    if (!hasNextStep) risks.push("No next step defined — deal will stall without clear action");
    if (closeDateMoves >= 3) risks.push(`Close date has slipped ${closeDateMoves} times — timeline credibility is low`);
    if (realDaysSince > 21) risks.push(`No touchpoint in ${realDaysSince} days across email, calendar, and calls`);
    if (daysToClose < 0) risks.push("Past due — needs commitment or close");
    if (!hasChampion && amount >= 25000) risks.push("No champion identified on a deal this size");
    if (emailTrend === "decelelerating") risks.push("Email engagement declining — momentum fading");

    // Recommendations
    const recs = [];
    if (!hasChampion) recs.push("Identify a champion: who inside the account is selling for you when you're not in the room?");
    if (stakeholderCount <= 1) recs.push("Multi-thread immediately: map the economic buyer, technical evaluator, and end users");
    if (!hasNextStep) recs.push("Define a concrete next step with a specific date — ambiguity kills deals");
    if (!hasUpcomingMeeting && realDaysSince > 7) recs.push("Schedule a meeting this week to re-establish momentum");
    if (emails.last7d === 0 && emails.last30d > 0) recs.push("Send a value-add email today — share a relevant insight, not a check-in");
    if (daysToClose < 0) recs.push("Either get a verbal commit with a real date or close lost — don't let it sit");
    if (!hasProposal && (opp.StageName || "").match(/proposal|negotiation/i)) recs.push("You're in proposal stage without a document — send the proposal");

    return Response.json({
      score, grade, momentum, signals, risks, recommendations: recs,
      projectedCloseDate: opp.CloseDate || null,
      confidence: Math.min(score + 10, 95),
      metrics: {
        emailsLast7d: emails.last7d, emailsLast30d: emails.last30d, emailTrend,
        meetingsLast30d: meetings.last30d, meetingsUpcoming: meetings.upcoming, nextMeeting: meetings.nextDate,
        chorusCallCount, stakeholderCount, contactCount, docCount: docs.count,
        daysInPipeline, daysToClose, realDaysSince,
        stageChanges, closeDateMoves, amountChanges,
        hasChampion, hasEconomicBuyer, hasTechnical, hasNextStep, hasUpcomingMeeting, hasProposal,
      },
      recentEmails: emails.threads,
      recentMeetings: meetings.list,
      documents: docs.list,
      contacts: roles.map(r => ({ name: r.Contact?.Name, title: r.Contact?.Title, email: r.Contact?.Email, role: r.Role })),
      allContacts: allContacts.map(c => ({ name: c.Name, title: c.Title, email: c.Email })),
      chorusCalls: chorusEvents.map(c => ({ subject: c.Subject?.replace("Chorus - ", ""), date: c.StartDateTime?.split("T")[0], who: c.Who?.Name })),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/deal-score-v2" };
