// Deep deal documents — reads Google Docs content, finds Gamma decks, extracts details
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { accountName, oppName } = await req.json();
    if (!accountName) return Response.json({ error: "Missing accountName" }, { status: 400 });

    const gtoken = await getAccessToken();
    const safeName = accountName.replace(/'/g, "");
    const results = { docs: [], decks: [], gammaDecks: [], allFiles: [] };

    // ── 1. Search Google Drive ──────────────────────────────
    const searchTerms = [accountName, oppName].filter(t => t && t !== "—" && t.length > 2);
    for (const term of searchTerms) {
      try {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name contains '${term.replace(/'/g, "")}' and trashed = false`)}&fields=files(id,name,mimeType,modifiedTime,webViewLink,owners,description)&orderBy=modifiedTime desc&pageSize=15`,
          { headers: { Authorization: `Bearer ${gtoken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          (data.files || []).forEach(f => {
            if (results.allFiles.find(e => e.id === f.id)) return;
            const entry = {
              id: f.id, name: f.name, type: f.mimeType, modified: f.modifiedTime?.split("T")[0],
              link: f.webViewLink, owner: f.owners?.[0]?.displayName || "—",
            };
            results.allFiles.push(entry);
            const nameLower = f.name.toLowerCase();
            if (nameLower.includes("deck") || nameLower.includes("presentation") || f.mimeType?.includes("presentation")) {
              results.decks.push(entry);
            } else if (f.mimeType?.includes("document") || nameLower.includes("sow") || nameLower.includes("proposal") || nameLower.includes("scope") || nameLower.includes("brief")) {
              results.docs.push(entry);
            }
          });
        }
      } catch {}
    }

    // ── 2. Read Google Doc contents ─────────────────────────
    const docContents = [];
    for (const doc of results.docs.slice(0, 4)) {
      if (doc.type?.includes("document")) {
        try {
          const res = await fetch(`https://docs.googleapis.com/v1/documents/${doc.id}`, { headers: { Authorization: `Bearer ${gtoken}` } });
          if (res.ok) {
            const docData = await res.json();
            let text = "";
            const extract = (elements) => {
              (elements || []).forEach(el => {
                if (el.paragraph?.elements) el.paragraph.elements.forEach(pe => { if (pe.textRun?.content) text += pe.textRun.content; });
                if (el.table?.tableRows) el.table.tableRows.forEach(row => (row.tableCells || []).forEach(cell => extract(cell.content)));
              });
            };
            extract(docData.body?.content);
            docContents.push({
              id: doc.id, name: doc.name, link: doc.link, modified: doc.modified,
              text: text.slice(0, 4000), wordCount: text.split(/\s+/).length,
              preview: text.slice(0, 500).replace(/\n{3,}/g, "\n\n"),
            });
          }
        } catch {}
      }
    }

    // ── 3. Find Gamma links in Gmail ────────────────────────
    try {
      for (const term of searchTerms) {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q="${term}" (gamma.app OR "gamma.app/docs")`,
          { headers: { Authorization: `Bearer ${gtoken}` } }
        );
        const data = await res.json();
        if (data.messages?.length) {
          for (const m of data.messages.slice(0, 5)) {
            try {
              const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, { headers: { Authorization: `Bearer ${gtoken}` } });
              if (!msgRes.ok) continue;
              const msg = await msgRes.json();
              const headers = {};
              (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });

              // Extract body text
              let bodyText = msg.snippet || "";
              const extractBody = (payload) => {
                if (!payload) return "";
                if (payload.mimeType === "text/plain" && payload.body?.data) {
                  try { return atob(payload.body.data.replace(/-/g, "+").replace(/_/g, "/")); } catch { return ""; }
                }
                for (const part of (payload.parts || [])) {
                  const r = extractBody(part);
                  if (r) return r;
                }
                return "";
              };
              const fullBody = extractBody(msg.payload) || bodyText;

              // Find all gamma.app links
              const gammaLinks = [...new Set((fullBody.match(/https?:\/\/gamma\.app\/[^\s"<>)\]]+/g) || []))];
              gammaLinks.forEach(link => {
                if (!results.gammaDecks.find(d => d.link === link)) {
                  results.gammaDecks.push({
                    link,
                    name: `Gamma: ${headers.subject || "deck"}`,
                    sharedBy: headers.from?.split("<")[0]?.trim() || "—",
                    sharedDate: headers.date?.split(",")[0]?.trim() || "—",
                    subject: headers.subject || "—",
                    emailSnippet: bodyText.slice(0, 200),
                  });
                }
              });
            } catch {}
          }
        }
      }
    } catch {}

    // ── 4. Fetch Gamma deck details via API ─────────────────
    const gammaApiKey = process.env.GAMMA_API_KEY;
    if (gammaApiKey && results.gammaDecks.length > 0) {
      for (const deck of results.gammaDecks.slice(0, 3)) {
        try {
          // Extract gamma ID from URL
          const gammaMatch = deck.link.match(/gamma\.app\/docs\/([a-zA-Z0-9]+)/);
          if (gammaMatch) {
            deck.gammaId = gammaMatch[1];
            // Note: Gamma public API doesn't have a read endpoint for existing docs,
            // but we can store the ID for future deck generation
          }
        } catch {}
      }
    }

    // ── 5. AI Summary of all documents ──────────────────────
    let documentSummary = "";
    const contextParts = [];
    if (docContents.length > 0) {
      docContents.forEach(d => contextParts.push(`Document: ${d.name} (${d.wordCount} words, modified ${d.modified})\n${d.text}`));
    }
    if (results.gammaDecks.length > 0) {
      contextParts.push(`\nGamma Decks Found:\n${results.gammaDecks.map(d => `- ${d.name} (shared by ${d.sharedBy} on ${d.sharedDate}) — ${d.link}`).join("\n")}`);
    }

    if (contextParts.length > 0) {
      try {
        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 512,
            system: "Summarize these deal documents for Jake Dunlap (CEO, Skaled Consulting). Focus on: scope of work, pricing/deal value, key deliverables, timeline, and current status. Note any proposals, SOWs, or decks that indicate deal progression. Plain text only, no markdown.",
            messages: [{ role: "user", content: contextParts.join("\n\n---\n\n") }],
          }),
        });
        if (claudeRes.ok) {
          const data = await claudeRes.json();
          documentSummary = (data.content?.[0]?.text || "").replace(/\*\*/g, "").replace(/\*/g, "");
        }
      } catch {}
    }

    return Response.json({
      docs: results.docs.slice(0, 10),
      docContents: docContents.slice(0, 4),
      decks: results.decks.slice(0, 10),
      gammaDecks: results.gammaDecks.slice(0, 10),
      allFiles: results.allFiles.slice(0, 15),
      documentSummary,
      totalFound: results.allFiles.length,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/deal-documents" };
