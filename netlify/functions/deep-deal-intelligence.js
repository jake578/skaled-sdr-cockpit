// Deep Deal Intelligence — master orchestrator combining emails, docs, Chorus, SFDC
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { oppId, accountName } = await req.json();
    if (!oppId && !accountName) return Response.json({ error: "Need oppId or accountName" }, { status: 400 });

    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    const now = new Date();
    const origin = new URL(req.url).origin;

    let oppData = null, contacts = [];

    // ── 1. SFDC: Get opp + contacts ─────────────────────────
    if (sfdcMatch && oppId) {
      const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
      const sfdcQuery = async (soql) => {
        const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        if (!res.ok) return [];
        return (await res.json()).records || [];
      };

      const [opps, roles, allContacts] = await Promise.all([
        sfdcQuery(`SELECT Name, Account.Name, Account.Industry, Amount, StageName, CloseDate, CreatedDate, LastActivityDate, Group_Forecast_Category__c, NextStep, Probability, Description FROM Opportunity WHERE Id = '${oppId}' LIMIT 1`),
        sfdcQuery(`SELECT Contact.Name, Contact.Title, Contact.Email, Role FROM OpportunityContactRole WHERE OpportunityId = '${oppId}'`),
        sfdcQuery(`SELECT Name, Title, Email FROM Contact WHERE AccountId IN (SELECT AccountId FROM Opportunity WHERE Id = '${oppId}') LIMIT 20`),
      ]);

      if (opps.length) oppData = opps[0];
      contacts = roles.length > 0 ? roles.map(r => ({ name: r.Contact?.Name, title: r.Contact?.Title, email: r.Contact?.Email, role: r.Role })) : allContacts.map(c => ({ name: c.Name, title: c.Title, email: c.Email }));
    }

    const acctName = accountName || oppData?.Account?.Name || "";
    const contactEmails = contacts.filter(c => c.email).map(c => c.email);

    // ── 2. Call deep-email-analysis (internal) ──────────────
    let emailAnalysis = null;
    try {
      const res = await fetch(`${origin}/.netlify/functions/deep-email-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({ accountName: acctName, contactName: contacts[0]?.name, contactEmail: contactEmails[0] }),
      });
      if (res.ok) emailAnalysis = await res.json();
    } catch {}

    // ── 3. Call chorus-sentiment (internal) ──────────────────
    let chorusSentiment = null;
    try {
      const res = await fetch(`${origin}/.netlify/functions/chorus-sentiment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({ accountName: acctName, contactEmails }),
      });
      if (res.ok) chorusSentiment = await res.json();
    } catch {}

    // ── 4. Call deal-score-v2 (internal) ─────────────────────
    let dealScore = null;
    if (oppId) {
      try {
        const res = await fetch(`${origin}/.netlify/functions/deal-score-v2`, {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: cookieHeader },
          body: JSON.stringify({ oppId }),
        });
        if (res.ok) dealScore = await res.json();
      } catch {}
    }

    // ── 5. Master AI Synthesis ──────────────────────────────
    let masterAnalysis = null;
    const contextParts = [];

    if (oppData) {
      contextParts.push(`OPPORTUNITY: ${oppData.Name}\nAccount: ${acctName} (${oppData.Account?.Industry || "—"})\nAmount: $${(oppData.Amount || 0).toLocaleString()}\nStage: ${oppData.StageName} | Forecast: ${oppData.Group_Forecast_Category__c || "—"}\nClose Date: ${oppData.CloseDate || "—"}\nProbability: ${oppData.Probability || 0}%\nNext Step: ${oppData.NextStep || "None"}\nContacts: ${contacts.map(c => `${c.name} (${c.title || "—"}, ${c.role || "—"})`).join(", ")}`);
    }

    if (dealScore) {
      contextParts.push(`DEAL SCORE: ${dealScore.score}/100 (${dealScore.grade}) — Momentum: ${dealScore.momentum}\nSignals: ${(dealScore.signals || []).map(s => `${s.type}: ${s.text}`).join("; ")}\nRisks: ${(dealScore.risks || []).join("; ")}`);
    }

    if (emailAnalysis?.analysis) {
      contextParts.push(`EMAIL ANALYSIS (${emailAnalysis.totalEmails} emails):\n${emailAnalysis.analysis}`);
      if (emailAnalysis.documents?.googleDocs?.length) {
        contextParts.push(`DOCUMENTS READ:\n${emailAnalysis.documents.googleDocs.map(d => `${d.title} (${d.wordCount} words): ${d.text.slice(0, 1000)}`).join("\n---\n")}`);
      }
      if (emailAnalysis.documents?.gammaDecks?.length) {
        contextParts.push(`GAMMA DECKS: ${emailAnalysis.documents.gammaDecks.map(d => `${d.title} — ${d.url}`).join(", ")}`);
      }
    }

    if (chorusSentiment?.sentiment) {
      const s = chorusSentiment.sentiment;
      contextParts.push(`CALL SENTIMENT: ${s.overallSentiment} | Momentum: ${s.dealMomentum}\n${s.overallAnalysis || ""}\nKey Moments: ${(s.keyMoments || []).map(m => `[${m.type}] ${m.speaker}: "${m.quote}"`).join("; ")}\nCommitments: ${(s.commitments || []).map(c => `${c.who}: ${c.what} by ${c.when}`).join("; ")}\nObjections: ${(s.objections || []).map(o => `${o.topic} (${o.status})`).join("; ")}`);
    }

    if (contextParts.length > 0) {
      try {
        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 2048,
            system: `You are Jake Dunlap's deal intelligence advisor. Synthesize ALL available data (SFDC, emails, documents, call transcripts, sentiment) into a comprehensive deal assessment. Be brutally honest. Reference specific data points. Plain text, no markdown.`,
            messages: [{
              role: "user",
              content: `${contextParts.join("\n\n========\n\n")}\n\nReturn JSON: {
                "executiveBrief": "2-3 sentence deal summary for a CEO",
                "dealHealth": "healthy/at_risk/critical/unknown",
                "winProbability": number 0-100,
                "keyInsight": "the single most important thing Jake needs to know",
                "emailSentiment": "warming/cooling/stable/no_data",
                "callSentiment": "positive/neutral/negative/no_data",
                "documentStatus": "proposal_sent/sow_active/no_docs/deck_shared",
                "stakeholderAssessment": "multi-threaded/single-threaded/unknown",
                "timelineRisk": "on_track/slipping/past_due/no_date",
                "competitiveRisk": "none_detected/possible/confirmed",
                "recommendedActions": ["specific action 1", "action 2", "action 3"],
                "dealKillers": ["risk that could kill this deal"],
                "winAccelerators": ["what would speed up this close"],
                "nextConversation": "what Jake should say/do in the next interaction"
              }`,
            }],
          }),
        });

        if (claudeRes.ok) {
          const data = await claudeRes.json();
          const raw = data.content?.[0]?.text || "";
          try {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) masterAnalysis = JSON.parse(match[0]);
          } catch {
            masterAnalysis = { executiveBrief: raw.slice(0, 500) };
          }
        }
      } catch {}
    }

    return Response.json({
      opportunity: oppData ? {
        id: oppId, name: oppData.Name, account: acctName,
        amount: oppData.Amount, stage: oppData.StageName,
        closeDate: oppData.CloseDate, forecast: oppData.Group_Forecast_Category__c,
      } : null,
      contacts,
      dealScore: dealScore ? { score: dealScore.score, grade: dealScore.grade, momentum: dealScore.momentum } : null,
      emailIntelligence: emailAnalysis ? {
        totalEmails: emailAnalysis.totalEmails,
        linksSummary: emailAnalysis.linkSummary,
        googleDocsRead: emailAnalysis.documents?.googleDocs?.length || 0,
        gammaDecksFound: emailAnalysis.documents?.gammaDecks?.length || 0,
        analysis: emailAnalysis.analysis,
        documents: emailAnalysis.documents,
      } : null,
      callIntelligence: chorusSentiment ? {
        totalCalls: chorusSentiment.totalCalls,
        calls: chorusSentiment.calls,
        sentiment: chorusSentiment.sentiment,
      } : null,
      masterAnalysis,
      generatedAt: now.toISOString(),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/deep-deal-intelligence" };
