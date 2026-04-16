// Chorus Call Sentiment Analysis — pulls transcripts via Chorus API, analyzes per speaker
export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { accountName, contactEmails } = await req.json();
    if (!accountName && (!contactEmails || !contactEmails.length)) {
      return Response.json({ error: "Need accountName or contactEmails" }, { status: 400 });
    }

    const chorusToken = process.env.CHORUS_API_TOKEN;
    if (!chorusToken) return Response.json({ error: "Chorus API not configured" }, { status: 500 });

    const chorusV3 = { Authorization: `Bearer ${chorusToken}`, Accept: "application/json" };
    const chorusV1 = { Authorization: `Bearer ${chorusToken}`, Accept: "application/vnd.api+json" };

    // ── 1. Search Chorus engagements ────────────────────────
    const matchedCalls = [];
    let continuationKey = null;
    const contactSet = new Set((contactEmails || []).map(e => e.toLowerCase()));

    for (let page = 0; page < 4; page++) {
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (continuationKey) params.set("continuation_key", continuationKey);

        const res = await fetch(`https://chorus.ai/v3/engagements?${params}`, { headers: chorusV3 });
        if (!res.ok) break;
        const data = await res.json();

        for (const eng of (data.engagements || [])) {
          if (!["meeting", "call", "dialer"].includes(eng.engagement_type)) continue;
          if ((eng.duration || 0) < 60) continue;

          const participants = eng.participants || [];
          const participantEmails = new Set(participants.map(p => (p.email || "").toLowerCase()));

          // Match by contact emails or by subject containing account name
          const emailMatch = contactSet.size > 0 && [...contactSet].some(e => participantEmails.has(e));
          const nameMatch = accountName && (eng.subject || "").toLowerCase().includes(accountName.toLowerCase());

          if (emailMatch || nameMatch) {
            const dateTs = eng.date_time || 0;
            matchedCalls.push({
              engagementId: eng.engagement_id,
              subject: eng.subject || "Untitled Call",
              date: dateTs ? new Date(dateTs * 1000).toISOString().split("T")[0] : "—",
              durationMinutes: Math.round((eng.duration || 0) / 60),
              participants: participants.map(p => ({ name: p.name || p.email || "Unknown", email: p.email || "" })),
            });
          }

          if (matchedCalls.length >= 5) break;
        }

        if (matchedCalls.length >= 5) break;
        continuationKey = data.continuation_key;
        if (!continuationKey) break;
      } catch { break; }
    }

    if (matchedCalls.length === 0) {
      return Response.json({ calls: [], sentiment: null, analysis: "No Chorus calls found for this account." });
    }

    // ── 2. Fetch transcripts for matched calls (PARALLEL) ─────
    await Promise.all(matchedCalls.slice(0, 3).map(async (call) => {
      try {
        const res = await fetch(`https://chorus.ai/api/v1/conversations/${call.engagementId}`, { headers: chorusV1, signal: AbortSignal.timeout(8000) });
        if (!res.ok) return;
        const data = await res.json();
        const attrs = data.data?.attributes || {};
        const utterances = (attrs.recording || {}).utterances || [];

        call.summary = (attrs.summary || "").replace(/<br\/?>/g, "\n");
        call.actionItems = attrs.action_items || [];
        call.trackerHits = attrs.tracker_hits || [];

        const transcript = [];
        const speakerTalkTime = {};
        for (const u of utterances) {
          const speaker = u.speaker_name || "Unknown";
          const text = u.snippet || "";
          transcript.push({ speaker, text });
          speakerTalkTime[speaker] = (speakerTalkTime[speaker] || 0) + text.split(/\s+/).length;
        }
        call.transcript = transcript.slice(0, 100);
        call.speakerTalkTime = speakerTalkTime;
        call.totalUtterances = utterances.length;
      } catch {}
    }));

    // ── 3. AI Sentiment Analysis ────────────────────────────
    let sentimentAnalysis = null;
    const callsWithTranscripts = matchedCalls.filter(c => c.transcript?.length > 0);

    if (callsWithTranscripts.length > 0) {
      const transcriptContext = callsWithTranscripts.slice(0, 2).map(call => {
        const lines = call.transcript.slice(0, 60).map(u => `[${u.speaker}]: ${u.text}`).join("\n");
        const talkTime = Object.entries(call.speakerTalkTime || {}).map(([name, words]) => `${name}: ${words} words`).join(", ");
        return `Call: ${call.subject} (${call.date}, ${call.durationMinutes}min)\nParticipants: ${call.participants.map(p => p.name).join(", ")}\nTalk time: ${talkTime}\n${call.summary ? `Summary: ${call.summary}\n` : ""}${call.actionItems?.length ? `Action items: ${call.actionItems.join("; ")}\n` : ""}Transcript:\n${lines}`;
      }).join("\n\n=====\n\n");

      try {
        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 2048,
            system: "Analyze these sales call transcripts for Skaled Consulting (CEO Jake Dunlap). Provide deep sentiment analysis per speaker, identify deal progression signals, and flag risks. Plain text only, no markdown.",
            messages: [{
              role: "user",
              content: `${transcriptContext}\n\nReturn JSON: {
                "overallSentiment": "positive/neutral/negative/mixed",
                "dealMomentum": "accelerating/stable/decelerating",
                "speakers": [{ "name": "", "sentiment": "positive/neutral/negative", "engagement": "high/medium/low", "keyQuotes": [""], "concerns": [""], "buyingSignals": [""] }],
                "keyMoments": [{ "type": "buying_signal/objection/commitment/risk/enthusiasm", "speaker": "", "quote": "", "significance": "" }],
                "commitments": [{ "who": "", "what": "", "when": "" }],
                "objections": [{ "topic": "", "speaker": "", "status": "raised/addressed/unresolved" }],
                "overallAnalysis": "",
                "nextStepRecommendation": ""
              }`,
            }],
          }),
        });

        if (claudeRes.ok) {
          const data = await claudeRes.json();
          const raw = data.content?.[0]?.text || "";
          try {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) sentimentAnalysis = JSON.parse(match[0]);
          } catch {
            sentimentAnalysis = { overallAnalysis: raw.slice(0, 1000) };
          }
        }
      } catch {}
    }

    return Response.json({
      calls: matchedCalls.map(c => ({
        engagementId: c.engagementId,
        subject: c.subject,
        date: c.date,
        durationMinutes: c.durationMinutes,
        participants: c.participants,
        summary: c.summary || "",
        actionItems: c.actionItems || [],
        speakerTalkTime: c.speakerTalkTime || {},
        totalUtterances: c.totalUtterances || 0,
        hasTranscript: (c.transcript?.length || 0) > 0,
      })),
      sentiment: sentimentAnalysis,
      totalCalls: matchedCalls.length,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/chorus-sentiment" };
