// AI Email Writer — pulls full email bodies + Chorus calls, uses Jake's actual voice
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const { action, tone, to, subject: inputSubject, context: userContext } = await req.json();

    const contactName = action?.contact || to || "";
    const accountName = action?.subtitle?.split("·")[0]?.trim() || "";
    const oppName = action?.title || "";
    const selectedTone = ["professional", "casual", "urgent", "breakup"].includes(tone) ? tone : "professional";
    const oppId = action?.id?.startsWith("opp-") ? action.id.replace("opp-", "") : null;

    // ── 1. Pull full email thread bodies from Gmail ───────────
    let emailContext = "";
    let emailBodies = [];
    try {
      const gtoken = await getAccessToken();

      // Search by contact name and account name
      const searchTerms = [contactName, accountName].filter(t => t && t !== "—" && t.length > 2);
      const searchQuery = searchTerms.map(t => `"${t}"`).join(" OR ");

      if (searchQuery) {
        const gmailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=${encodeURIComponent(searchQuery)}`,
          { headers: { Authorization: `Bearer ${gtoken}` } }
        );
        const gmailData = await gmailRes.json();

        if (gmailData.messages?.length) {
          // Fetch full message content (not just snippets)
          const msgs = await Promise.all(
            gmailData.messages.slice(0, 8).map(async m => {
              const res = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
                { headers: { Authorization: `Bearer ${gtoken}` } }
              );
              if (!res.ok) return null;
              const msg = await res.json();
              const headers = {};
              (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });

              // Extract plain text body
              const body = extractBody(msg.payload);

              return {
                from: headers.from || "",
                to: headers.to || "",
                subject: headers.subject || "",
                date: headers.date || "",
                body: body.slice(0, 2000), // Cap per message
              };
            })
          );

          const validMsgs = msgs.filter(Boolean);
          if (validMsgs.length > 0) {
            emailContext += `\n## Email Thread History\n`;
            validMsgs.forEach(m => {
              emailContext += `\n### [${m.date}] ${m.subject}\nFrom: ${m.from}\nTo: ${m.to}\n\n${m.body}\n---\n`;
              emailBodies.push(m);
            });
          }
        }
      }
    } catch { /* Gmail unavailable */ }

    // ── 2. Pull Chorus call context from SFDC Events ──────────
    let callContext = "";
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);

    let sfdcContext = "";
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

        // Opp details if we have an opp ID
        if (oppId) {
          const oppDetails = await sfdcQuery(
            `SELECT Name, Account.Name, Amount, StageName, CloseDate, NextStep, Group_Forecast_Category__c FROM Opportunity WHERE Id = '${oppId}' LIMIT 1`
          );
          if (oppDetails.length) {
            const o = oppDetails[0];
            sfdcContext += `\n## Deal Details\n- ${o.Name}\n- Account: ${o.Account?.Name || "—"}\n- Stage: ${o.StageName} | Forecast: ${o.Group_Forecast_Category__c || "—"}\n- Amount: $${o.Amount || 0} | Close: ${o.CloseDate || "—"}\n- Next Step: ${o.NextStep || "—"}\n`;
          }
        }

        // Chorus calls mentioning account
        if (accountName && accountName !== "—") {
          const chorusCalls = await sfdcQuery(
            `SELECT Subject, StartDateTime, Who.Name, What.Name FROM Event WHERE Subject LIKE 'Chorus%' AND What.Name LIKE '%${accountName.replace(/'/g, "\\'")}%' ORDER BY StartDateTime DESC LIMIT 5`
          );
          if (chorusCalls.length) {
            callContext += `\n## Recent Calls (Chorus)\n`;
            chorusCalls.forEach(c => {
              callContext += `- [${c.StartDateTime?.split("T")[0]}] ${c.Subject?.replace("Chorus - ", "")} with ${c.Who?.Name || "—"}\n`;
            });
          }
        }
      }
    }

    // ── 3. Pull upcoming Calendar meetings ────────────────────
    let calContext = "";
    try {
      const gtoken = await getAccessToken();
      const now = new Date();
      const future14 = new Date(now.getTime() + 14 * 86400000).toISOString();

      if (accountName && accountName !== "—") {
        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
          `timeMin=${encodeURIComponent(now.toISOString())}&timeMax=${encodeURIComponent(future14)}` +
          `&maxResults=10&singleEvents=true&orderBy=startTime&q=${encodeURIComponent(accountName)}`,
          { headers: { Authorization: `Bearer ${gtoken}` } }
        );
        const calData = await calRes.json();
        if (calData.items?.length) {
          calContext += `\n## Upcoming Meetings\n`;
          calData.items.forEach(e => {
            calContext += `- ${e.start?.dateTime?.split("T")[0] || e.start?.date} — ${e.summary}\n`;
          });
        }
      }
    } catch { /* Calendar unavailable */ }

    // ── 4. Build prompt using Jake's actual email voice ────────
    const toneInstructions = {
      professional: "Professional, warm but business-focused. Be direct and value-driven.",
      casual: "Casual, friendly. Keep it light but still purposeful. Use contractions.",
      urgent: "Convey time sensitivity clearly. Reference deadlines or closing timelines.",
      breakup: "Breakup email — prospect has gone silent. Respectful but clearly final outreach. 3-4 sentences max.",
    };

    const fullContext = [sfdcContext, emailContext, callContext, calContext].filter(Boolean).join("\n");

    // Using Jake's actual email prompt from his meeting prep build
    const systemPrompt = `You are writing a follow-up email from Jake Dunlap, CEO of Skaled Consulting.

Write a clean, short, professional follow-up email. Do not over-produce it. Do not add flair, catchphrases, or personality flourishes. Write it like a busy CEO dashing off a clear, warm, specific note.

Structure:
1. One-line opener (personal if context exists, otherwise just "Hey [Name] —")
2. Reference the SPECIFIC context from prior emails or calls below — what was discussed, what they asked about, what was promised
3. 2-4 bullets reflecting their priorities or next steps. Frame forward — goals, not problems.
4. Clear next step with a specific ask
5. Close with "Jake"

Rules:
- Under 200 words for simple follow-ups. Under 300 for complex ones.
- No catchphrases. No forced warmth. No "just following up" or "circling back."
- No negative descriptions of their team or org.
- No hedging. Say what you will do and by when.
- Reference SPECIFIC details from the email thread or call history below to show genuine context
- The email should read like Jake typed it in 3 minutes because he already knows what to say

Today: ${new Date().toISOString().split("T")[0]}

${fullContext}

${userContext ? `\nJake's notes: ${userContext}` : ""}`;

    const userPrompt = `Draft a follow-up email to ${contactName} regarding ${oppName || accountName || "our conversation"}.

Tone: ${selectedTone} — ${toneInstructions[selectedTone]}

IMPORTANT: Use the actual email thread content and call history above to write a contextually relevant response. Reference specific things they said or discussed.

Return JSON: { "subject": "...", "body": "..." }
Body should be plain text with \\n line breaks, not HTML. Do not include a signature.`;

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

    // Parse JSON response
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
    if (emailContext) contextSources.push("gmail (" + emailBodies.length + " emails)");
    if (callContext) contextSources.push("chorus");
    if (calContext) contextSources.push("calendar");

    return Response.json({ subject, body, context_used: contextSources });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

// Extract plain text body from Gmail message payload (same approach as meeting prep build)
function extractBody(payload) {
  if (!payload) return "";

  if (payload.mimeType === "text/plain") {
    const data = payload.body?.data || "";
    if (data) return atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  }

  const parts = payload.parts || [];
  for (const part of parts) {
    if (part.mimeType === "text/plain") {
      const data = part.body?.data || "";
      if (data) return atob(data.replace(/-/g, "+").replace(/_/g, "/"));
    }
  }

  for (const part of parts) {
    const result = extractBody(part);
    if (result) return result;
  }

  return "";
}

export const config = { path: "/.netlify/functions/ai-email-writer" };
