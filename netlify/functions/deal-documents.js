// Deep deal context — pulls Google Docs, Drive files, and Gamma decks related to a deal
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { accountName, oppName } = await req.json();
    if (!accountName) return Response.json({ error: "Missing accountName" }, { status: 400 });

    const gtoken = await getAccessToken();
    const results = { docs: [], decks: [], files: [], emailAttachments: [] };

    // ── 1. Search Google Drive for docs mentioning the account ──
    try {
      const searchTerms = [accountName, oppName].filter(t => t && t !== "—" && t.length > 2);
      for (const term of searchTerms) {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name contains '${term.replace(/'/g, "")}' and trashed = false`)}&fields=files(id,name,mimeType,modifiedTime,webViewLink,owners)&orderBy=modifiedTime desc&pageSize=10`,
          { headers: { Authorization: `Bearer ${gtoken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          (data.files || []).forEach(f => {
            const isDeck = f.name.toLowerCase().includes("deck") || f.name.toLowerCase().includes("gamma") || f.name.toLowerCase().includes("presentation") || f.mimeType?.includes("presentation");
            const isDoc = f.mimeType?.includes("document") || f.name.toLowerCase().includes("sow") || f.name.toLowerCase().includes("proposal") || f.name.toLowerCase().includes("scope");
            const entry = {
              id: f.id, name: f.name, type: f.mimeType, modified: f.modifiedTime?.split("T")[0],
              link: f.webViewLink, owner: f.owners?.[0]?.displayName || "—",
            };
            if (isDeck && !results.decks.find(d => d.id === f.id)) results.decks.push(entry);
            else if (isDoc && !results.docs.find(d => d.id === f.id)) results.docs.push(entry);
            else if (!results.files.find(d => d.id === f.id)) results.files.push(entry);
          });
        }
      }
    } catch { /* Drive unavailable */ }

    // ── 2. Pull content from Google Docs for deeper context ──
    const docContents = [];
    for (const doc of results.docs.slice(0, 3)) {
      if (doc.type?.includes("document")) {
        try {
          const res = await fetch(
            `https://docs.googleapis.com/v1/documents/${doc.id}`,
            { headers: { Authorization: `Bearer ${gtoken}` } }
          );
          if (res.ok) {
            const docData = await res.json();
            // Extract text from document body
            let text = "";
            const extractText = (elements) => {
              (elements || []).forEach(el => {
                if (el.paragraph?.elements) {
                  el.paragraph.elements.forEach(pe => {
                    if (pe.textRun?.content) text += pe.textRun.content;
                  });
                }
                if (el.table?.tableRows) {
                  el.table.tableRows.forEach(row => {
                    (row.tableCells || []).forEach(cell => {
                      extractText(cell.content);
                    });
                  });
                }
              });
            };
            extractText(docData.body?.content);
            docContents.push({ name: doc.name, text: text.slice(0, 3000), link: doc.link });
          }
        } catch { /* Doc read failed */ }
      }
    }

    // ── 3. Search Gmail for Gamma links shared in emails ──
    try {
      const searchQuery = `${accountName} (gamma.app OR "gamma.app")`;
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=${encodeURIComponent(searchQuery)}`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const data = await res.json();
      if (data.messages?.length) {
        for (const m of data.messages.slice(0, 3)) {
          try {
            const msgRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
              { headers: { Authorization: `Bearer ${gtoken}` } }
            );
            if (msgRes.ok) {
              const msg = await msgRes.json();
              const headers = {};
              (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });
              const snippet = msg.snippet || "";
              // Extract gamma.app links from snippet/body
              const gammaLinks = (snippet.match(/https?:\/\/gamma\.app\/[^\s"<>)]+/g) || []);
              if (gammaLinks.length) {
                results.decks.push({
                  id: m.id, name: `Gamma: ${headers.subject || "deck"}`, type: "gamma",
                  modified: headers.date?.split(",")[0] || "—", link: gammaLinks[0],
                  owner: headers.from?.split("<")[0]?.trim() || "—",
                });
              }
            }
          } catch {}
        }
      }
    } catch { /* Gmail search failed */ }

    // ── 4. AI Summary of document context ──
    let documentSummary = "";
    if (docContents.length > 0) {
      try {
        const docContext = docContents.map(d => `Document: ${d.name}\n${d.text}`).join("\n\n---\n\n");
        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 512,
            system: "Summarize these deal documents in 3-5 bullet points. Focus on: scope of work, pricing, deliverables, timeline, and status. Plain text only, no markdown, no asterisks.",
            messages: [{ role: "user", content: docContext }],
          }),
        });
        if (claudeRes.ok) {
          const data = await claudeRes.json();
          documentSummary = data.content?.[0]?.text || "";
        }
      } catch {}
    }

    return Response.json({
      docs: results.docs.slice(0, 10),
      decks: results.decks.slice(0, 10),
      files: results.files.slice(0, 10),
      documentSummary,
      totalFound: results.docs.length + results.decks.length + results.files.length,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/deal-documents" };
