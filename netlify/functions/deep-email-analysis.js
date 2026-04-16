// Deep Email Analysis — reads emails, extracts ALL links, follows Google Docs/Gamma, reads content
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { accountName, contactName, contactEmail } = await req.json();
    if (!accountName && !contactEmail) return Response.json({ error: "Need accountName or contactEmail" }, { status: 400 });

    const gtoken = await getAccessToken();
    const searchTerms = [contactEmail, contactName, accountName].filter(t => t && t !== "—" && t.length > 2);
    const query = searchTerms.map(t => t.includes("@") ? `from:${t} OR to:${t}` : `"${t}"`).join(" OR ");

    // ── 1. Pull emails with full bodies (PARALLEL) ────────────
    const emailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(query + " newer_than:60d")}`, { headers: { Authorization: `Bearer ${gtoken}` } });
    const emailData = await emailRes.json();

    const allLinks = new Map();

    // Fetch all email details in parallel (not sequential)
    const emailResults = await Promise.all(
      (emailData.messages || []).slice(0, 8).map(async (m) => {
        try {
          const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, { headers: { Authorization: `Bearer ${gtoken}` }, signal: AbortSignal.timeout(5000) });
          if (!res.ok) return null;
          const msg = await res.json();
          const headers = {};
          (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });
          const body = extractBody(msg.payload);
          const links = extractLinks(body);
          return { id: m.id, from: headers.from || "", to: headers.to || "", subject: headers.subject || "", date: headers.date || "", body: body.slice(0, 3000), linkCount: links.length, links: links.slice(0, 5), _links: links, _subject: headers.subject || "email" };
        } catch { return null; }
      })
    );

    const emails = emailResults.filter(Boolean);
    emails.forEach(e => {
      (e._links || []).forEach(link => {
        const existing = allLinks.get(link.url) || { url: link.url, type: link.type, sources: [], count: 0 };
        existing.sources.push(e._subject);
        existing.count++;
        allLinks.set(link.url, existing);
      });
      delete e._links; delete e._subject;
    });

    // ── 2. Follow Google Doc + Gamma links in PARALLEL ──────
    const googleDocLinks = [...allLinks.values()].filter(l => l.type === "google_doc").slice(0, 3);
    const gammaLinks = [...allLinks.values()].filter(l => l.type === "gamma").slice(0, 3);

    const [docContents, gammaDecks] = await Promise.all([
      // Google Docs
      Promise.all(googleDocLinks.map(async (link) => {
        try {
          const docId = extractGoogleDocId(link.url);
          if (!docId) return null;
          const res = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, { headers: { Authorization: `Bearer ${gtoken}` }, signal: AbortSignal.timeout(5000) });
          if (!res.ok) return null;
          const docData = await res.json();
          let text = "";
          const extract = (elements) => {
            (elements || []).forEach(el => {
              if (el.paragraph?.elements) el.paragraph.elements.forEach(pe => { if (pe.textRun?.content) text += pe.textRun.content; });
              if (el.table?.tableRows) el.table.tableRows.forEach(row => (row.tableCells || []).forEach(cell => extract(cell.content)));
            });
          };
          extract(docData.body?.content);
          return { url: link.url, id: docId, title: docData.title || "Untitled", text: text.slice(0, 5000), wordCount: text.split(/\s+/).length, foundIn: link.sources.slice(0, 3) };
        } catch { return null; }
      })).then(r => r.filter(Boolean)),

      // Gamma decks
      Promise.all(gammaLinks.map(async (link) => {
        try {
          const res = await fetch(link.url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(4000) });
          if (res.ok) {
            const html = await res.text();
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i) || html.match(/og:title[^>]*content="([^"]+)"/i);
            const descMatch = html.match(/og:description[^>]*content="([^"]+)"/i);
            return { url: link.url, title: titleMatch?.[1]?.trim() || "Gamma Deck", description: descMatch?.[1]?.trim() || "", foundIn: link.sources.slice(0, 3) };
          }
          return { url: link.url, title: "Gamma Deck", description: "", foundIn: link.sources };
        } catch { return { url: link.url, title: "Gamma Deck", description: "", foundIn: link.sources }; }
      })),
    ]);

    // ── 3. Collect other links ──────────────────────────────
    const sheetLinks = [...allLinks.values()].filter(l => l.type === "google_sheet").slice(0, 2);
    const sheets = sheetLinks.map(l => ({ url: l.url, title: "Google Sheet", foundIn: l.sources }));
    const slideLinks = [...allLinks.values()].filter(l => l.type === "google_slides").slice(0, 2);
    const slides = slideLinks.map(l => ({ url: l.url, title: "Google Slides", foundIn: l.sources }));
    const otherLinks = [...allLinks.values()].filter(l => !["google_doc", "gamma", "google_sheet", "google_slides", "skaled_internal"].includes(l.type)).slice(0, 10);

    // ── 7. AI analysis of everything ────────────────────────
    let analysis = "";
    const contextParts = [];
    if (emails.length > 0) {
      contextParts.push(`## ${emails.length} Emails (last 60 days)\n${emails.slice(0, 6).map(e => `[${e.date?.split(",")[0]}] From: ${e.from?.split("<")[0]}\nSubject: ${e.subject}\n${e.body.slice(0, 800)}`).join("\n---\n")}`);
    }
    if (docContents.length > 0) {
      contextParts.push(`## ${docContents.length} Google Docs Read\n${docContents.map(d => `Title: ${d.title} (${d.wordCount} words)\n${d.text.slice(0, 1500)}`).join("\n---\n")}`);
    }
    if (gammaDecks.length > 0) {
      contextParts.push(`## ${gammaDecks.length} Gamma Decks Found\n${gammaDecks.map(d => `${d.title}: ${d.description || d.url}`).join("\n")}`);
    }

    if (contextParts.length > 0) {
      try {
        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1024,
            system: "Analyze this email thread and document context for Jake Dunlap (CEO, Skaled Consulting). Synthesize: 1) Relationship trajectory (warming/cooling/stable), 2) Key topics and commitments made, 3) Documents shared and their significance, 4) What needs to happen next, 5) Any red flags or positive signals. Be specific — reference actual emails and docs. Plain text, no markdown.",
            messages: [{ role: "user", content: contextParts.join("\n\n") }],
          }),
        });
        if (claudeRes.ok) {
          const data = await claudeRes.json();
          analysis = (data.content?.[0]?.text || "").replace(/\*\*/g, "").replace(/\*/g, "");
        }
      } catch {}
    }

    return Response.json({
      emails: emails.slice(0, 12),
      totalEmails: emailData.messages?.length || 0,
      documents: {
        googleDocs: docContents,
        gammaDecks,
        sheets,
        slides,
        otherLinks,
      },
      linkSummary: {
        total: allLinks.size,
        googleDocs: googleDocLinks.length,
        gamma: gammaLinks.length,
        sheets: sheetLinks.length,
        slides: slideLinks.length,
        other: otherLinks.length,
      },
      analysis,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

// ── Helpers ─────────────────────────────────────────────────────

function extractBody(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    try {
      const binary = atob(payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder("utf-8").decode(bytes);
    } catch { return ""; }
  }
  if (payload.mimeType === "text/html" && payload.body?.data && !payload.parts?.length) {
    try {
      const binary = atob(payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const html = new TextDecoder("utf-8").decode(bytes);
      return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    } catch { return ""; }
  }
  for (const part of (payload.parts || [])) {
    const r = extractBody(part);
    if (r) return r;
  }
  return "";
}

function extractLinks(text) {
  const links = [];
  const urlRegex = /https?:\/\/[^\s"<>)\]]+/g;
  const matches = text.match(urlRegex) || [];
  const seen = new Set();

  for (const url of matches) {
    const clean = url.replace(/[.,;:!?)]+$/, "");
    if (seen.has(clean)) continue;
    seen.add(clean);

    let type = "other";
    if (clean.includes("docs.google.com/document")) type = "google_doc";
    else if (clean.includes("docs.google.com/spreadsheets")) type = "google_sheet";
    else if (clean.includes("docs.google.com/presentation") || clean.includes("slides.google.com")) type = "google_slides";
    else if (clean.includes("gamma.app")) type = "gamma";
    else if (clean.includes("drive.google.com")) type = "google_drive";
    else if (clean.includes("loom.com")) type = "loom";
    else if (clean.includes("calendly.com")) type = "calendly";
    else if (clean.includes("skaled.com") || clean.includes("skaled.my.salesforce.com")) type = "skaled_internal";
    else if (clean.includes("zoom.us")) type = "zoom";

    links.push({ url: clean, type });
  }
  return links;
}

function extractGoogleDocId(url) {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
}

export const config = { path: "/.netlify/functions/deep-email-analysis" };
