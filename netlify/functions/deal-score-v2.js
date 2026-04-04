// Enhanced Deal Scoring V2 — hybrid algorithm with recency decay, engagement velocity, MEDDPICC signals
import { getAccessToken } from "./google-auth.js";

const recencyScore = (daysOld, decayDays = 14) => Math.exp(-daysOld / decayDays);

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

    // Pull everything in parallel
    const [oppArr, contacts, roles, tasks, history, chorusEvents] = await Promise.all([
      sfdcQuery(`SELECT Name, Account.Name, Account.Industry, Amount, StageName, CloseDate, CreatedDate, LastActivityDate, Group_Forecast_Category__c, NextStep, Probability FROM Opportunity WHERE Id = '${oppId}' LIMIT 1`),
      sfdcQuery(`SELECT Name, Title, Email FROM Contact WHERE AccountId IN (SELECT AccountId FROM Opportunity WHERE Id = '${oppId}') LIMIT 20`),
      sfdcQuery(`SELECT Contact.Name, Contact.Title, Role FROM OpportunityContactRole WHERE OpportunityId = '${oppId}'`),
      sfdcQuery(`SELECT Subject, CreatedDate, Status FROM Task WHERE WhatId = '${oppId}' ORDER BY CreatedDate DESC LIMIT 30`),
      sfdcQuery(`SELECT Field, OldValue, NewValue, CreatedDate FROM OpportunityFieldHistory WHERE OpportunityId = '${oppId}' ORDER BY CreatedDate DESC LIMIT 20`),
      sfdcQuery(`SELECT Subject, StartDateTime FROM Event WHERE Subject LIKE 'Chorus%' AND WhatId = '${oppId}' ORDER BY StartDateTime DESC LIMIT 5`),
    ]);

    const opp = oppArr[0];
    if (!opp) return Response.json({ error: "Opportunity not found" }, { status: 404 });

    const accountName = opp.Account?.Name || "";
    const amount = opp.Amount || 0;

    // ── Engagement Metrics ──────────────────────────────────
    // Email velocity
    let emailCount = 0, emailsLast7d = 0, emailsLast30d = 0;
    try {
      const gtoken = await getAccessToken();
      if (accountName) {
        const [recent, monthly] = await Promise.all([
          fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q=in:sent "${accountName}" newer_than:7d`, { headers: { Authorization: `Bearer ${gtoken}` } }).then(r => r.json()),
          fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q=in:sent "${accountName}" newer_than:30d`, { headers: { Authorization: `Bearer ${gtoken}` } }).then(r => r.json()),
        ]);
        emailsLast7d = recent.resultSizeEstimate || 0;
        emailsLast30d = monthly.resultSizeEstimate || 0;
        emailCount = emailsLast30d;
      }
    } catch {}

    // Meeting cadence
    let meetingsLast30d = 0, nextMeeting = null;
    try {
      const gtoken = await getAccessToken();
      if (accountName) {
        const past30 = new Date(now.getTime() - 30 * 86400000).toISOString();
        const future14 = new Date(now.getTime() + 14 * 86400000).toISOString();
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(past30)}&timeMax=${encodeURIComponent(future14)}&maxResults=50&singleEvents=true&q=${encodeURIComponent(accountName)}`, { headers: { Authorization: `Bearer ${gtoken}` } });
        const data = await res.json();
        const items = data.items || [];
        meetingsLast30d = items.filter(e => new Date(e.start?.dateTime || e.start?.date) < now).length;
        const upcoming = items.filter(e => new Date(e.start?.dateTime || e.start?.date) >= now);
        if (upcoming.length) nextMeeting = upcoming[0].start?.dateTime?.split("T")[0] || upcoming[0].start?.date;
      }
    } catch {}

    // Google Drive documents
    let docCount = 0;
    try {
      const gtoken = await getAccessToken();
      if (accountName) {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name contains '${accountName.replace(/'/g, "")}' and trashed = false`)}&fields=files(id)&pageSize=10`, { headers: { Authorization: `Bearer ${gtoken}` } });
        if (res.ok) { const data = await res.json(); docCount = (data.files || []).length; }
      }
    } catch {}

    // ── Calculated Signals ──────────────────────────────────
    const daysInPipeline = opp.CreatedDate ? Math.floor((now - new Date(opp.CreatedDate)) / 86400000) : 0;
    const daysToClose = opp.CloseDate ? Math.floor((new Date(opp.CloseDate) - now) / 86400000) : 999;
    const daysSinceActivity = opp.LastActivityDate ? Math.floor((now - new Date(opp.LastActivityDate)) / 86400000) : 999;
    const stakeholderCount = roles.length;
    const chorusCallCount = chorusEvents.length;
    const stageChanges = history.filter(h => h.Field === "StageName").length;
    const closeDateMoves = history.filter(h => h.Field === "CloseDate").length;
    const activityCount = tasks.length;
    const emailVelocity = emailsLast7d > 0 ? "accelerating" : emailsLast30d > emailsLast7d * 4 ? "decelerating" : "stable";

    // ── MEDDPICC Signals ────────────────────────────────────
    const hasChampion = roles.some(r => (r.Role || "").toLowerCase().includes("champion") || (r.Role || "").toLowerCase().includes("decision"));
    const hasEconomicBuyer = roles.some(r => (r.Role || "").toLowerCase().includes("economic") || (r.Role || "").toLowerCase().includes("executive"));
    const hasNextStep = opp.NextStep && opp.NextStep.trim().length > 0;
    const hasUpcomingMeeting = !!nextMeeting;
    const hasProposal = docCount > 0;

    // ── Hybrid Score Calculation ────────────────────────────
    let score = 0;

    // Engagement (0-30 points)
    score += Math.min(emailCount, 10) * 1.5; // up to 15
    score += Math.min(meetingsLast30d, 4) * 2.5; // up to 10
    score += Math.min(chorusCallCount, 3) * 1.67; // up to 5

    // Stakeholder breadth (0-15 points)
    score += Math.min(stakeholderCount, 5) * 3;

    // Recency (0-15 points)
    score += recencyScore(daysSinceActivity, 14) * 15;

    // Deal progression (0-15 points)
    score += stageChanges > 0 ? Math.min(stageChanges, 3) * 3 : 0; // up to 9
    score += hasNextStep ? 3 : 0;
    score += hasUpcomingMeeting ? 3 : 0;

    // MEDDPICC (0-15 points)
    score += hasChampion ? 5 : 0;
    score += hasEconomicBuyer ? 5 : 0;
    score += hasProposal ? 5 : 0;

    // Penalties
    if (daysToClose < 0) score -= Math.min(Math.abs(daysToClose), 20); // past due penalty
    if (closeDateMoves >= 3) score -= 10; // slipping deal
    if (daysSinceActivity > 21) score -= 10; // gone cold
    if (stakeholderCount <= 1 && amount >= 25000) score -= 5; // single-threaded on big deal

    // Normalize to 1-100
    score = Math.max(1, Math.min(100, Math.round(score)));

    const grade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 45 ? "C" : score >= 25 ? "D" : "F";
    const momentum = emailVelocity === "accelerating" && meetingsLast30d >= 2 ? "accelerating" : daysSinceActivity > 14 || emailVelocity === "decelerating" ? "decelerating" : "stable";

    // ── Build Signals ───────────────────────────────────────
    const signals = [];
    if (emailsLast7d > 3) signals.push({ type: "engagement", text: `${emailsLast7d} emails this week — high velocity`, sentiment: "positive" });
    else if (emailsLast30d === 0) signals.push({ type: "engagement", text: "No emails in 30 days", sentiment: "negative" });
    if (meetingsLast30d >= 3) signals.push({ type: "engagement", text: `${meetingsLast30d} meetings in 30d — strong cadence`, sentiment: "positive" });
    else if (meetingsLast30d === 0) signals.push({ type: "engagement", text: "No meetings in 30 days", sentiment: "negative" });
    if (nextMeeting) signals.push({ type: "timeline", text: `Next meeting: ${nextMeeting}`, sentiment: "positive" });
    if (hasChampion) signals.push({ type: "meddpicc", text: "Champion identified", sentiment: "positive" });
    if (hasEconomicBuyer) signals.push({ type: "meddpicc", text: "Economic buyer engaged", sentiment: "positive" });
    if (hasProposal) signals.push({ type: "document", text: `${docCount} document${docCount > 1 ? "s" : ""} in Drive`, sentiment: "positive" });
    if (stakeholderCount >= 3) signals.push({ type: "breadth", text: `${stakeholderCount} stakeholders — multi-threaded`, sentiment: "positive" });
    if (closeDateMoves >= 2) signals.push({ type: "risk", text: `Close date moved ${closeDateMoves}x`, sentiment: "negative" });
    if (daysToClose < 0) signals.push({ type: "risk", text: `${Math.abs(daysToClose)} days past due`, sentiment: "negative" });
    if (daysInPipeline > 90) signals.push({ type: "risk", text: `${daysInPipeline} days in pipeline — aging`, sentiment: "negative" });

    // ── Risks ───────────────────────────────────────────────
    const risks = [];
    if (stakeholderCount <= 1) risks.push("Single-threaded — one contact leaving kills the deal");
    if (!hasNextStep) risks.push("No next step defined — deal will stall");
    if (closeDateMoves >= 3) risks.push("Close date slipping repeatedly — timeline may not be real");
    if (daysSinceActivity > 21) risks.push("Gone cold — no activity in 3+ weeks");
    if (daysToClose < 0) risks.push("Past due — needs immediate attention or close");
    if (!hasChampion && amount >= 50000) risks.push("No champion identified on a $50K+ deal");

    // ── Recommendations ─────────────────────────────────────
    const recs = [];
    if (!hasChampion) recs.push("Identify and develop a champion within the account");
    if (stakeholderCount <= 1) recs.push("Multi-thread: add more contacts (economic buyer, technical evaluator)");
    if (!hasNextStep) recs.push("Define a specific next step with a date");
    if (!hasUpcomingMeeting) recs.push("Schedule a meeting to maintain momentum");
    if (daysSinceActivity > 14) recs.push("Re-engage immediately — send a relevant email or call");
    if (daysToClose < 0) recs.push("Update the close date to a realistic target or close lost");
    if (!hasProposal && opp.StageName?.includes("Proposal")) recs.push("Send the proposal — deal is in proposal stage without documents");

    return Response.json({
      score, grade, momentum, signals, risks, recommendations: recs,
      projectedCloseDate: opp.CloseDate || null,
      confidence: Math.min(score + 10, 95),
      metrics: {
        emailsLast7d, emailsLast30d, meetingsLast30d, chorusCallCount,
        stakeholderCount, docCount, daysInPipeline, daysToClose, daysSinceActivity,
        stageChanges, closeDateMoves, activityCount,
        hasChampion, hasEconomicBuyer, hasNextStep, hasUpcomingMeeting, hasProposal,
      },
      contacts: roles.map(r => ({ name: r.Contact?.Name, title: r.Contact?.Title, role: r.Role })),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/deal-score-v2" };
