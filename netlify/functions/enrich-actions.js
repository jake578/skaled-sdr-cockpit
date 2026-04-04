// Lazy AI enrichment — generates CONTEXT (what's happening) + ACTION (what to do)
export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { actions } = await req.json();
    if (!actions?.length) return Response.json({ enriched: [] });

    const actionSummary = actions.slice(0, 12).map((a, i) =>
      `${i}. [${a.priority}${a.criticalReason ? " — " + a.criticalReason : ""}] ${a.title} | ${a.subtitle || ""} | ${a.dueTime || ""} | Channel: ${a.channel || ""} | Current: ${a.suggestedAction || "none"}`
    ).join("\n");

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 2500,
        system: `You write action briefs for Jake Dunlap, CEO of Skaled Consulting. For each action, provide TWO things:

1. CONTEXT (1-2 sentences): What's the situation? What happened? Why does this matter? Use specifics — deal size, how long it's been, what stage, who's involved. This is the backstory.

2. ACTION (1 sentence): Exactly what Jake should do RIGHT NOW. Not "follow up" — say "Send Larry the proposal with Q2 pricing" or "Call Sarah to confirm the $65K is still in her Q2 budget." If it's an email, write the opening line.

Be specific. Use names and dollar amounts from the data. Plain text, no markdown, no asterisks. Keep it tight — a CEO is scanning this in 3 seconds.`,
        messages: [{ role: "user", content: `Today is ${new Date().toISOString().split("T")[0]}. Write context + action for each:\n\n${actionSummary}\n\nReturn JSON array: [{ "index": 0, "context": "what's happening", "action": "what to do" }]` }],
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
