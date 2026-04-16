// Email triage — pull unread, classify with Claude, return actionable only
// Returns both external emails and internal (Skaled team) emails needing Jake's action
import { getAccessToken } from "./google-auth.js";

const extractBody = (payload) => {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    try { return atob(payload.body.data.replace(/-/g, "+").replace(/_/g, "/")); } catch { return ""; }
  }
  for (const part of (payload.parts || [])) { const r = extractBody(part); if (r) return r; }
  return "";
};

const fetchEmailDetails = async (messages, gtoken, filterFn) => {
  const rawEmails = [];
  for (const m of messages.slice(0, 12)) {
    try {
      const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, { headers: { Authorization: `Bearer ${gtoken}` } });
      if (!r.ok) continue;
      const msg = await r.json();
      const headers = {};
      (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });

      const from = headers.from || "";
      if (filterFn && !filterFn(from, headers)) continue;

      let body = msg.snippet || "";
      body = extractBody(msg.payload) || body;

      rawEmails.push({
        id: m.id, from, subject: headers.subject || "", date: headers.date || "",
        body: body.slice(0, 500), snippet: msg.snippet || "",
        to: headers.to || "", cc: headers.cc || "",
      });
    } catch {}
  }
  return rawEmails;
};

export default async (req) => {
  try {
    const gtoken = await getAccessToken();

    // Pull BOTH external and internal emails in parallel
    const [extRes, intRes] = await Promise.all([
      // External: non-Skaled, non-promo
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=in:inbox is:unread newer_than:7d -from:skaled.com -category:promotions -category:social -category:updates -category:forums`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      ).then(r => r.json()).catch(() => ({ messages: [] })),
      // Internal: from Skaled team members
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=in:inbox is:unread newer_than:14d from:skaled.com`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      ).then(r => r.json()).catch(() => ({ messages: [] })),
    ]);

    // Fetch details for both sets in parallel
    const [rawExternal, rawInternal] = await Promise.all([
      extRes.messages?.length ? fetchEmailDetails(extRes.messages, gtoken, (from) => {
        const emailAddr = from.toLowerCase();
        return !(emailAddr.includes("noreply") || emailAddr.includes("no-reply") || emailAddr.includes("notifications") || emailAddr.includes("mailer-daemon") || emailAddr.includes("calendar-notification") || emailAddr.includes("jenni"));
      }) : [],
      intRes.messages?.length ? fetchEmailDetails(intRes.messages, gtoken, (from) => {
        const emailAddr = from.toLowerCase();
        // Skip automated/calendar/noreply even from skaled.com
        return !(emailAddr.includes("noreply") || emailAddr.includes("no-reply") || emailAddr.includes("notifications") || emailAddr.includes("calendar-notification"));
      }) : [],
    ]);

    // Combine for a single Claude classification call
    const allRaw = [
      ...rawExternal.map(e => ({ ...e, _source: "external" })),
      ...rawInternal.map(e => ({ ...e, _source: "internal" })),
    ];

    if (allRaw.length === 0) return Response.json({ emails: [], internalEmails: [] });

    const emailSummary = allRaw.map((e, i) =>
      `${i}. [${e._source.toUpperCase()}] From: ${e.from}\nSubject: ${e.subject}\nBody: ${e.body.slice(0, 300)}`
    ).join("\n---\n");

    try {
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1500,
          system: `You triage emails for Jake Dunlap, CEO of Skaled Consulting. Emails are marked [EXTERNAL] or [INTERNAL].

For EXTERNAL emails:
NEEDS_ACTION: Direct question to Jake, decision needed, prospect/client asking something, money on the line, time-sensitive
FYI_ONLY: Newsletters, automated, CC threads, status updates, confirmations, marketing
CAN_WAIT: Non-urgent asks, informational

For INTERNAL emails (from @skaled.com team):
NEEDS_ACTION: Team member asking Jake for a decision, approval, input, or help. Questions directed at Jake. Requests that need his sign-off.
FYI_ONLY: CC'd threads, status updates, FYIs, team announcements, things that don't need Jake to respond
CAN_WAIT: Low-urgency asks that can wait a day or two

Be VERY strict. 70%+ should be FYI_ONLY. Only NEEDS_ACTION if ignoring it blocks someone or costs something.`,
          messages: [{ role: "user", content: `Classify:\n\n${emailSummary}\n\nReturn JSON: [{ "index": 0, "classification": "NEEDS_ACTION/FYI_ONLY/CAN_WAIT", "why": "what they want from Jake", "action": "what Jake should do" }]` }],
        }),
      });

      if (claudeRes.ok) {
        const cData = await claudeRes.json();
        const raw = cData.content?.[0]?.text || "";
        let classifications = [];
        try { const match = raw.match(/\[[\s\S]*\]/); if (match) classifications = JSON.parse(match[0]); } catch {}

        const emails = [];
        const internalEmails = [];

        allRaw.forEach((msg, i) => {
          const cls = classifications.find(c => c.index === i);
          const classification = cls?.classification || "CAN_WAIT";
          if (classification === "FYI_ONLY") return;

          const nameMatch = msg.from.match(/^([^<]+)/);
          const contactName = nameMatch ? nameMatch[1].trim().replace(/"/g, "") : msg.from;
          const dateStr = msg.date ? new Date(msg.date).toISOString().split("T")[0] : "—";
          const now = new Date();
          const isToday = dateStr === now.toISOString().split("T")[0];

          const item = {
            id: `gmail-${msg.id}`,
            type: "email",
            priority: classification === "NEEDS_ACTION" ? (isToday ? "critical" : "high") : "medium",
            criticalReason: classification === "NEEDS_ACTION" ? (cls?.why || `${contactName} needs your response`) : null,
            title: `${contactName} — ${msg.subject || "No subject"}`,
            subtitle: cls?.why || "Unread email",
            context: cls?.why || null,
            channel: "email",
            dueTime: isToday ? "Today" : dateStr,
            suggestedAction: cls?.action || `Review and respond to "${msg.subject}"`,
            contact: contactName,
            gmailId: msg.id,
          };

          if (msg._source === "internal") {
            internalEmails.push(item);
          } else {
            emails.push(item);
          }
        });

        return Response.json({ emails, internalEmails });
      }
    } catch {}

    // Fallback — no classification
    const fallbackMap = (msg) => {
      const nameMatch = msg.from.match(/^([^<]+)/);
      const contactName = nameMatch ? nameMatch[1].trim().replace(/"/g, "") : msg.from;
      return {
        id: `gmail-${msg.id}`, type: "email", priority: "medium",
        title: `${contactName} — ${msg.subject}`, subtitle: "Unread", channel: "email",
        dueTime: "—", suggestedAction: `Review: "${msg.subject}"`, contact: contactName, gmailId: msg.id,
      };
    };
    return Response.json({
      emails: rawExternal.slice(0, 5).map(fallbackMap),
      internalEmails: rawInternal.slice(0, 5).map(fallbackMap),
    });
  } catch (e) {
    return Response.json({ emails: [], internalEmails: [], error: e.message });
  }
};

export const config = { path: "/.netlify/functions/emails-fast" };
