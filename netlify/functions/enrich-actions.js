// Lazy AI enrichment — called AFTER initial actions load for specific suggestions
export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { actions } = await req.json();
    if (!actions?.length) return Response.json({ enriched: [] });

    const actionSummary = actions.slice(0, 12).map((a, i) =>
      `${i}. [${a.priority}] ${a.title} | ${a.subtitle || ""} | ${a.dueTime || ""} | Channel: ${a.channel || ""}`
    ).join("\n");

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 2000,
        system: `You write specific, actionable suggested actions for Jake Dunlap, CEO of Skaled Consulting. For each action:

1. State exactly what Jake should DO (not "review" or "follow up" — say "Send Larry the AI GTM framework deck" or "Call Sarah to confirm the Q2 timeline")
2. If it's an email, write the first sentence of what the email should say
3. If it's a meeting, state the one thing Jake needs to accomplish in it
4. If it's a deal update, state exactly what to change and why

Be specific. Use names. Reference the deal context. Under 2 sentences each. Plain text, no markdown, no asterisks.`,
        messages: [{ role: "user", content: `Today is ${new Date().toISOString().split("T")[0]}. Enrich these actions:\n\n${actionSummary}\n\nReturn JSON array: [{ "index": 0, "suggestion": "specific action text" }]` }],
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
