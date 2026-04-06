// Lazy enrichment: pulls Gmail + Chorus context for each action, then Claude writes specific suggestions
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { actions } = await req.json();
    if (!actions?.length) return Response.json({ enriched: [] });

    let gtoken = null;
    try { gtoken = await getAccessToken(); } catch {}

    // For each action, pull quick email/call context
    const enrichedContext = await Promise.all(
      actions.slice(0, 15).map(async (action, i) => {
        const accountName = action.subtitle?.split("·")[0]?.trim() || "";
        let emailContext = "";
        let callContext = "";

        let hasRecentEmail = false;
        let emailAge = 999;

        // Quick Gmail check — last email subject + who + recency
        if (gtoken && accountName && accountName !== "—" && accountName.length > 2) {
          try {
            const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=3&q="${accountName}" newer_than:30d`, { headers: { Authorization: `Bearer ${gtoken}` } });
            const data = await res.json();
            if (data.messages?.length) {
              const details = await Promise.all(data.messages.slice(0, 2).map(async m => {
                const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, { headers: { Authorization: `Bearer ${gtoken}` } });
                if (!r.ok) return null;
                const msg = await r.json();
                const h = {};
                (msg.payload?.headers || []).forEach(hdr => { h[hdr.name.toLowerCase()] = hdr.value; });
                return h;
              }));
              const valid = details.filter(Boolean);
              if (valid.length) {
                emailContext = `Last emails: ${valid.map(e => `"${e.subject}" from ${(e.from || "").split("<")[0].trim()} (${(e.date || "").split(",")[0]})`).join("; ")}`;
                // Check how recent the last email is
                try {
                  const lastDate = new Date(valid[0].date);
                  emailAge = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
                  if (emailAge <= 7) hasRecentEmail = true;
                } catch {}
              }
            } else {
              emailContext = "No emails found in last 30 days.";
            }
          } catch {}
        }

        return { index: i, title: action.title, subtitle: action.subtitle || "", priority: action.priority, criticalReason: action.criticalReason || "", currentContext: action.context || "", currentAction: action.suggestedAction || "", emailContext, dueTime: action.dueTime || "", hasRecentEmail, emailAge, channel: action.channel || "" };
      })
    );

    // Send all to Claude in one batch
    const summary = enrichedContext.map(e =>
      `${e.index}. [${e.priority}] ${e.title}\n  Account: ${e.subtitle}\n  Due: ${e.dueTime}\n  ${e.criticalReason ? "Why critical: " + e.criticalReason + "\n  " : ""}Current situation: ${e.currentContext}\n  Email data: ${e.emailContext || "No emails found"}\n  Email recency: ${e.hasRecentEmail ? "ACTIVE — emails within " + e.emailAge + " days" : e.emailAge < 999 ? "Last email " + e.emailAge + " days ago" : "No email history"}\n  Channel: ${e.channel}`
    ).join("\n\n");

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 2500,
        system: `You write action briefs for Jake Dunlap, CEO of Skaled Consulting. You have email data showing recent communications. For each action:

CONTEXT (2-3 sentences): What's actually happening with this deal/person based on the email history and deal data? Reference specific emails, subjects, and people. If there are no recent emails, say that clearly — it's a signal.

ACTION (1 sentence): What should Jake do RIGHT NOW? Be specific — "Send Larry a note asking if the Q2 budget cleared" not "Follow up." If there's an email thread, reference it.

Plain text, no markdown, no asterisks. Use names and dollar amounts.`,
        messages: [{ role: "user", content: `Today is ${new Date().toISOString().split("T")[0]}.\n\n${summary}\n\nIMPORTANT: If email data shows recent activity (within 7 days), the deal is NOT stale — adjust your context accordingly. Active email threads = engaged deal.\n\nReturn JSON array: [{ "index": 0, "context": "what's happening based on email + deal data", "action": "exactly what to do", "shouldRemove": false }]\n\nSet shouldRemove=true ONLY if the email data proves this action is no longer needed (e.g., deal shows as stale in SFDC but Gmail shows active emails this week).` }],
      }),
    });

    if (!claudeRes.ok) return Response.json({ enriched: [] });
    const data = await claudeRes.json();
    const raw = data.content?.[0]?.text || "";

    try {
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) return Response.json({ enriched: JSON.parse(match[0]) });
    } catch {}
    return Response.json({ enriched: [] });
  } catch (e) {
    return Response.json({ error: e.message, enriched: [] });
  }
};

export const config = { path: "/.netlify/functions/enrich-actions" };
