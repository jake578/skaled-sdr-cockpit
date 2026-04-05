// Lead Research — searches Gmail, Calendar, SFDC for prior interactions with a lead
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { leadId, leadName, company } = await req.json();
    if (!leadName && !company) return Response.json({ error: "Need leadName or company" }, { status: 400 });

    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);

    const results = {
      research: null,
      priorEmails: 0,
      priorMeetings: 0,
      existingAccount: null,
      recommendation: null,
      emailSubjects: [],
      meetingSubjects: [],
    };

    const searchTerm = company || leadName || "";
    const safeTerm = searchTerm.replace(/'/g, "");
    let contextForClaude = `Researching lead: ${leadName || "Unknown"} at ${company || "Unknown company"}.\n\n`;

    // ── 1. Search Gmail for emails mentioning the company ──────
    let gtoken = null;
    try {
      gtoken = await getAccessToken();
    } catch {}

    if (gtoken && searchTerm) {
      try {
        const gmailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=${encodeURIComponent(`"${safeTerm}" newer_than:180d`)}`,
          { headers: { Authorization: `Bearer ${gtoken}` } }
        );
        const gmailData = await gmailRes.json();

        if (gmailData.messages?.length) {
          results.priorEmails = gmailData.messages.length;

          // Get subjects of first 5
          const details = await Promise.all(
            gmailData.messages.slice(0, 5).map(async (m) => {
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
                  from: headers.find(h => h.name === "From")?.value || "Unknown",
                  date: headers.find(h => h.name === "Date")?.value || "",
                };
              } catch { return null; }
            })
          );

          results.emailSubjects = details.filter(Boolean);
          contextForClaude += `## Prior Emails (${results.priorEmails} found)\n`;
          results.emailSubjects.forEach(e => {
            contextForClaude += `- "${e.subject}" from ${e.from} (${e.date})\n`;
          });
          contextForClaude += "\n";
        } else {
          contextForClaude += "## Prior Emails\nNo prior emails found with this company.\n\n";
        }
      } catch (e) {
        contextForClaude += `## Prior Emails\nError searching Gmail: ${e.message}\n\n`;
      }
    }

    // ── 2. Search Calendar for meetings ─────────────────────────
    if (gtoken && searchTerm) {
      try {
        const now = new Date();
        const past180 = new Date(now.getTime() - 180 * 86400000);
        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=20&q=${encodeURIComponent(safeTerm)}&timeMin=${past180.toISOString()}&timeMax=${now.toISOString()}&singleEvents=true&orderBy=startTime`,
          { headers: { Authorization: `Bearer ${gtoken}` } }
        );
        const calData = await calRes.json();

        if (calData.items?.length) {
          results.priorMeetings = calData.items.length;
          results.meetingSubjects = calData.items.slice(0, 5).map(e => ({
            subject: e.summary || "Meeting",
            date: e.start?.dateTime || e.start?.date || "",
            attendees: (e.attendees || []).map(a => a.email).slice(0, 5),
          }));

          contextForClaude += `## Prior Meetings (${results.priorMeetings} found)\n`;
          results.meetingSubjects.forEach(m => {
            contextForClaude += `- "${m.subject}" on ${m.date} with ${m.attendees.join(", ")}\n`;
          });
          contextForClaude += "\n";
        } else {
          contextForClaude += "## Prior Meetings\nNo prior meetings found.\n\n";
        }
      } catch (e) {
        contextForClaude += `## Prior Meetings\nError searching Calendar: ${e.message}\n\n`;
      }
    }

    // ── 3. Check SFDC for existing account ───────────────────────
    if (sfdcMatch && company) {
      try {
        const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
        const safeCompany = company.replace(/'/g, "\\'");

        const accRes = await fetch(
          `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(`SELECT Id, Name, Industry, Type, NumberOfEmployees FROM Account WHERE Name LIKE '%${safeCompany}%' LIMIT 5`)}`,
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        );
        const accData = await accRes.json();

        if (accData.records?.length) {
          results.existingAccount = accData.records[0];
          contextForClaude += `## Existing SFDC Account Found\n`;
          accData.records.forEach(a => {
            contextForClaude += `- ${a.Name} | Industry: ${a.Industry || "—"} | Type: ${a.Type || "—"} | Employees: ${a.NumberOfEmployees || "—"}\n`;
          });
          contextForClaude += "\n";

          // Check for open opps with this account
          const oppRes = await fetch(
            `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(`SELECT Name, Amount, StageName, CloseDate FROM Opportunity WHERE AccountId = '${accData.records[0].Id}' AND IsClosed = false LIMIT 5`)}`,
            { headers: { Authorization: `Bearer ${tokens.access_token}` } }
          );
          const oppData = await oppRes.json();

          if (oppData.records?.length) {
            contextForClaude += `## Open Opportunities with ${company}\n`;
            oppData.records.forEach(o => {
              contextForClaude += `- ${o.Name} | $${o.Amount || 0} | ${o.StageName} | Close: ${o.CloseDate || "—"}\n`;
            });
            contextForClaude += "\n";
          }
        } else {
          contextForClaude += `## SFDC Account\nNo existing account found for "${company}". This would be a net-new account.\n\n`;
        }
      } catch (e) {
        contextForClaude += `## SFDC Account\nError checking SFDC: ${e.message}\n\n`;
      }
    }

    // ── 4. Claude analysis ──────────────────────────────────────
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
            max_tokens: 800,
            messages: [{
              role: "user",
              content: `You are a sales intelligence assistant for Jake Dunlap, CEO of Skaled Consulting (a B2B sales consulting firm that helps companies build and scale their sales organizations).

Research this lead for Jake. Based on all available data, provide:
1. A brief assessment: Is this a good fit for Skaled? Why or why not?
2. Any prior relationship or interactions we should know about
3. Recommended approach (if worth pursuing)
4. One key talking point or conversation opener

Keep it concise and actionable — this is for quick lead triage.

${contextForClaude}`,
            }],
          }),
        });

        const claudeData = await claudeRes.json();
        const text = claudeData.content?.[0]?.text || "";
        results.research = text;

        // Extract recommendation (first paragraph)
        const lines = text.split("\n").filter(l => l.trim());
        results.recommendation = lines[0] || text.substring(0, 200);
      } catch (e) {
        results.research = `Could not complete AI analysis: ${e.message}`;
      }
    } else {
      results.research = "Anthropic API key not configured. Data gathered from Gmail, Calendar, and SFDC above.";
      results.recommendation = results.existingAccount
        ? `Existing SFDC account found: ${results.existingAccount.Name}. ${results.priorEmails} prior emails, ${results.priorMeetings} prior meetings.`
        : `Net-new account. ${results.priorEmails} prior emails, ${results.priorMeetings} prior meetings found.`;
    }

    return Response.json(results);

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};
