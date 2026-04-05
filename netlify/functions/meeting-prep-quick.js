// Quick Meeting Prep — 90-second briefing before any meeting
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { eventSubject, attendees, accountName } = await req.json();
    if (!eventSubject && !attendees?.length && !accountName) {
      return Response.json({ error: "Need eventSubject, attendees, or accountName" }, { status: 400 });
    }

    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);

    let contextForClaude = `## Meeting Prep Request\nMeeting: "${eventSubject || "Unknown"}"\n`;
    if (attendees?.length) contextForClaude += `Attendees: ${attendees.join(", ")}\n`;
    if (accountName) contextForClaude += `Account: ${accountName}\n`;
    contextForClaude += "\n";

    const results = {
      brief: null,
      talkingPoints: [],
      opener: null,
      avoid: null,
      lastDiscussion: null,
      attendeeInfo: [],
      dealContext: null,
    };

    const safeName = (accountName || "").replace(/'/g, "");
    let gtoken = null;
    try { gtoken = await getAccessToken(); } catch {}

    // ── 1. Last 3 emails with attendee or account ──────────────
    if (gtoken) {
      const searchTerms = [];
      if (attendees?.length) {
        attendees.slice(0, 3).forEach(a => {
          const email = typeof a === "string" ? a : a.email;
          if (email && !email.includes("skaled.com") && !email.includes("jake")) {
            searchTerms.push(`from:${email} OR to:${email}`);
          }
        });
      }
      if (accountName) searchTerms.push(`"${safeName}"`);

      const query = searchTerms.length > 0 ? `(${searchTerms.join(" OR ")}) newer_than:90d` : null;

      if (query) {
        try {
          const listRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=${encodeURIComponent(query)}`,
            { headers: { Authorization: `Bearer ${gtoken}` } }
          );
          const listData = await listRes.json();

          if (listData.messages?.length) {
            const emails = await Promise.all(
              listData.messages.slice(0, 3).map(async (m) => {
                try {
                  const res = await fetch(
                    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
                    { headers: { Authorization: `Bearer ${gtoken}` } }
                  );
                  if (!res.ok) return null;
                  const d = await res.json();
                  const headers = d.payload?.headers || [];
                  return {
                    subject: headers.find(h => h.name === "Subject")?.value || "No subject",
                    from: headers.find(h => h.name === "From")?.value || "",
                    date: headers.find(h => h.name === "Date")?.value || "",
                    snippet: d.snippet || "",
                  };
                } catch { return null; }
              })
            );

            const validEmails = emails.filter(Boolean);
            if (validEmails.length) {
              contextForClaude += "## Recent Emails\n";
              validEmails.forEach(e => {
                contextForClaude += `- "${e.subject}" from ${e.from} (${e.date})\n  Preview: ${e.snippet?.substring(0, 150)}\n`;
              });
              contextForClaude += "\n";
              results.lastDiscussion = validEmails[0]?.subject || null;
            }
          }
        } catch (e) {
          contextForClaude += `## Emails\nError: ${e.message}\n\n`;
        }
      }
    }

    // ── 2. Last Chorus call with account ────────────────────────
    if (sfdcMatch && accountName) {
      try {
        const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));

        // Find Chorus events (they start with "Chorus - " in SFDC Events)
        const chorusRes = await fetch(
          `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(
            `SELECT Subject, StartDateTime, DurationInMinutes, Description FROM Event WHERE Subject LIKE 'Chorus%' AND (What.Name LIKE '%${safeName}%' OR Subject LIKE '%${safeName}%') ORDER BY StartDateTime DESC LIMIT 3`
          )}`,
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        );
        const chorusData = await chorusRes.json();

        if (chorusData.records?.length) {
          contextForClaude += "## Recent Chorus Calls\n";
          chorusData.records.forEach(c => {
            contextForClaude += `- ${c.Subject} on ${c.StartDateTime?.split("T")[0] || "—"} (${c.DurationInMinutes || "?"}min)\n`;
            if (c.Description) contextForClaude += `  Notes: ${c.Description.substring(0, 200)}\n`;
          });
          contextForClaude += "\n";
        }
      } catch {}
    }

    // ── 3. Opp details if account has open opps ─────────────────
    if (sfdcMatch && accountName) {
      try {
        const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));

        const oppRes = await fetch(
          `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(
            `SELECT Name, Amount, StageName, CloseDate, Probability, Group_Forecast_Category__c, Description FROM Opportunity WHERE Account.Name LIKE '%${safeName}%' AND IsClosed = false ORDER BY Amount DESC LIMIT 3`
          )}`,
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        );
        const oppData = await oppRes.json();

        if (oppData.records?.length) {
          results.dealContext = oppData.records.map(o => ({
            name: o.Name,
            amount: o.Amount,
            stage: o.StageName,
            closeDate: o.CloseDate,
            probability: o.Probability,
            forecastCategory: o.Group_Forecast_Category__c,
          }));

          contextForClaude += "## Open Opportunities\n";
          oppData.records.forEach(o => {
            contextForClaude += `- ${o.Name} | $${o.Amount || 0} | ${o.StageName} | Close: ${o.CloseDate || "—"} | ${o.Probability || 0}% prob\n`;
            if (o.Description) contextForClaude += `  Description: ${o.Description.substring(0, 200)}\n`;
          });
          contextForClaude += "\n";
        }

        // Also get key contacts
        const contactRes = await fetch(
          `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(
            `SELECT Name, Title, Email FROM Contact WHERE Account.Name LIKE '%${safeName}%' ORDER BY LastActivityDate DESC NULLS LAST LIMIT 5`
          )}`,
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        );
        const contactData = await contactRes.json();

        if (contactData.records?.length) {
          results.attendeeInfo = contactData.records.map(c => ({
            name: c.Name, title: c.Title, email: c.Email,
          }));

          contextForClaude += "## Key Contacts at Account\n";
          contactData.records.forEach(c => {
            contextForClaude += `- ${c.Name} — ${c.Title || "No title"} (${c.Email || "No email"})\n`;
          });
          contextForClaude += "\n";
        }
      } catch (e) {
        contextForClaude += `## SFDC\nError: ${e.message}\n\n`;
      }
    }

    // ── 4. Claude 90-second brief ───────────────────────────────
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (ANTHROPIC_KEY) {
      try {
        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            messages: [{
              role: "user",
              content: `You are a meeting prep assistant for Jake Dunlap, CEO of Skaled Consulting (a B2B sales consulting firm).

Give Jake a 90-SECOND PREP BRIEF for this meeting. Be extremely concise and actionable. Format as:

**WHO**: Who's in the meeting and their roles
**CONTEXT**: What was last discussed / where things stand
**GOAL**: What Jake should aim for in this meeting
**TALKING POINTS**: 3 bullet points to hit
**OPENER**: One natural conversation opener
**AVOID**: One thing to avoid or be careful about

${contextForClaude}`,
            }],
          }),
        });

        const claudeData = await claudeRes.json();
        const text = claudeData.content?.[0]?.text || "";
        results.brief = text;

        // Parse talking points
        const tpMatch = text.match(/TALKING POINTS[:\s]*([\s\S]*?)(?=\*\*|$)/i);
        if (tpMatch) {
          results.talkingPoints = tpMatch[1].split("\n").filter(l => l.trim().startsWith("-") || l.trim().startsWith("*")).map(l => l.replace(/^[\s\-\*]+/, "").trim()).filter(Boolean);
        }

        // Parse opener
        const openerMatch = text.match(/OPENER[:\s]*([\s\S]*?)(?=\*\*|$)/i);
        if (openerMatch) {
          results.opener = openerMatch[1].trim().replace(/^[\s\-\*]+/, "").trim();
        }

        // Parse avoid
        const avoidMatch = text.match(/AVOID[:\s]*([\s\S]*?)(?=\*\*|$)/i);
        if (avoidMatch) {
          results.avoid = avoidMatch[1].trim().replace(/^[\s\-\*]+/, "").trim();
        }

      } catch (e) {
        results.brief = `Could not generate AI brief: ${e.message}. See raw data above.`;
      }
    } else {
      results.brief = "Anthropic API key not configured. Raw context data gathered from Gmail, Calendar, and SFDC.";
      results.talkingPoints = ["Review last email exchange", "Check deal status", "Confirm next steps"];
      results.opener = `Following up on our ${results.lastDiscussion ? `last conversation about "${results.lastDiscussion}"` : "previous discussion"}`;
      results.avoid = "No AI analysis available — review emails before the meeting";
    }

    // ── 5. Compute meeting readiness score ─────────────────────
    let readinessScore = 0;
    const readinessFactors = [];

    // Do we know who's in the meeting?
    if (attendees?.length > 0) {
      readinessScore += 20;
      readinessFactors.push({ factor: "Attendees Known", score: 20, detail: `${attendees.length} attendees` });
    } else {
      readinessFactors.push({ factor: "Attendees Unknown", score: 0, detail: "No attendee list" });
    }

    // Do we have email history?
    if (results.lastDiscussion) {
      readinessScore += 25;
      readinessFactors.push({ factor: "Prior Emails", score: 25, detail: "Found recent email thread" });
    } else {
      readinessFactors.push({ factor: "No Prior Emails", score: 5, detail: "No recent emails found" });
      readinessScore += 5;
    }

    // Do we have deal context?
    if (results.dealContext?.length > 0) {
      readinessScore += 25;
      readinessFactors.push({ factor: "Deal Context", score: 25, detail: `${results.dealContext.length} open opps` });
    } else {
      readinessFactors.push({ factor: "No Deal Context", score: 5, detail: "No open opportunities" });
      readinessScore += 5;
    }

    // Do we know contacts at the account?
    if (results.attendeeInfo?.length > 0) {
      readinessScore += 15;
      readinessFactors.push({ factor: "Contact Intel", score: 15, detail: `${results.attendeeInfo.length} contacts found` });
    } else {
      readinessFactors.push({ factor: "No Contact Intel", score: 0, detail: "No contacts in SFDC" });
    }

    // Did Claude generate a brief?
    if (results.brief && !results.brief.includes("Error") && !results.brief.includes("not configured")) {
      readinessScore += 15;
      readinessFactors.push({ factor: "AI Brief", score: 15, detail: "Claude brief generated" });
    }

    results.readinessScore = Math.min(readinessScore, 100);
    results.readinessFactors = readinessFactors;
    results.readinessLevel = readinessScore >= 70 ? "Ready" : readinessScore >= 40 ? "Partial" : "Low";

    // ── 6. Generate follow-up template ──────────────────────────
    results.followUpTemplate = {
      subject: `Follow up: ${eventSubject || "Our meeting"}`,
      body: `Hi team,

Thanks for the time today. Here are the key takeaways and next steps from our conversation:

[Action items from the meeting]

1. [Action item 1] - Owner: [Name] - Due: [Date]
2. [Action item 2] - Owner: [Name] - Due: [Date]
3. [Action item 3] - Owner: [Name] - Due: [Date]

Let me know if I missed anything. Looking forward to our next conversation.

Best,
Jake`,
    };

    // ── 7. Suggested pre-meeting actions ────────────────────────
    results.preMeetingActions = [];

    if (!results.lastDiscussion) {
      results.preMeetingActions.push({
        action: "review-emails",
        label: "Search inbox for prior correspondence",
        priority: "high",
      });
    }

    if (!results.dealContext?.length) {
      results.preMeetingActions.push({
        action: "check-sfdc",
        label: "Check SFDC for any account/opp data",
        priority: "medium",
      });
    }

    if (results.attendeeInfo?.length) {
      results.preMeetingActions.push({
        action: "review-contacts",
        label: `Review profiles of ${results.attendeeInfo.length} known contacts`,
        priority: "medium",
      });
    }

    results.preMeetingActions.push({
      action: "set-objective",
      label: "Define one clear objective for this meeting",
      priority: "high",
    });

    return Response.json(results);

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};
