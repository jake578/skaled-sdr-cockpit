// Unified Timeline — merges Gmail, Calendar, Chorus (SFDC Events), SFDC Tasks into one chronological feed
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { accountName, contactEmail } = await req.json();
    if (!accountName && !contactEmail) return Response.json({ error: "Need accountName or contactEmail" }, { status: 400 });

    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    const now = new Date();
    const past60 = new Date(now.getTime() - 60 * 86400000);

    const timeline = [];
    const sources = { gmail: 0, calendar: 0, chorus: 0, sfdc: 0 };

    const safeName = (accountName || "").replace(/'/g, "");
    const searchQuery = contactEmail
      ? `(from:${contactEmail} OR to:${contactEmail})${accountName ? ` OR "${safeName}"` : ""}`
      : `"${safeName}"`;

    // ── 1. Gmail emails (last 60d) ─────────────────────────
    try {
      const gtoken = await getAccessToken();
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${encodeURIComponent(`${searchQuery} newer_than:60d`)}`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      const listData = await listRes.json();

      if (listData.messages?.length) {
        const details = await Promise.all(
          listData.messages.slice(0, 40).map(async m => {
            const res = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
              { headers: { Authorization: `Bearer ${gtoken}` } }
            );
            if (!res.ok) return null;
            const msg = await res.json();
            const headers = {};
            (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });

            const from = headers.from || "";
            const to = headers.to || "";
            const dateStr = headers.date ? new Date(headers.date).toISOString() : "";
            const fromName = from.split("<")[0]?.trim()?.replace(/"/g, "") || from;
            const isOutbound = from.toLowerCase().includes("skaled.com") || from.toLowerCase().includes("jake");
            const toName = to.split("<")[0]?.trim()?.replace(/"/g, "") || to;

            return {
              date: dateStr ? dateStr.split("T")[0] : "—",
              time: dateStr ? new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "",
              type: "email",
              subject: headers.subject || "—",
              from: isOutbound ? `To: ${toName}` : `From: ${fromName}`,
              source: "Gmail",
              direction: isOutbound ? "outbound" : "inbound",
              sortDate: dateStr,
            };
          })
        );
        details.filter(Boolean).forEach(item => { timeline.push(item); sources.gmail++; });
      }
    } catch { /* Gmail unavailable */ }

    // ── 2. Calendar meetings (last 60d) ────────────────────
    try {
      const gtoken = await getAccessToken();
      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(past60.toISOString())}&timeMax=${encodeURIComponent(now.toISOString())}` +
        `&maxResults=100&singleEvents=true&orderBy=startTime&q=${encodeURIComponent(safeName || contactEmail || "")}`,
        { headers: { Authorization: `Bearer ${gtoken}` } }
      );
      if (calRes.ok) {
        const calData = await calRes.json();
        (calData.items || []).forEach(event => {
          const subject = event.summary || "—";
          const subjectLower = subject.toLowerCase();

          // Skip internal Skaled meetings
          if (subjectLower.includes("skaled") && (
            subjectLower.includes("l10") || subjectLower.includes("1:1") ||
            subjectLower.includes("all-hands") || subjectLower.includes("sync") ||
            subjectLower.includes("internal") || subjectLower.includes("staffing") ||
            subjectLower.includes("p&l") || subjectLower.includes("leadership")
          )) return;

          if (subjectLower.includes("lunch") || subjectLower.includes("block") ||
              subjectLower.includes("focus time") || subjectLower.includes("ooo") ||
              subjectLower.includes("out of office")) return;

          const start = event.start?.dateTime || event.start?.date || "";
          const attendees = (event.attendees || []).filter(a => !a.self && !(a.email || "").includes("skaled.com"));

          timeline.push({
            date: start ? start.split("T")[0] : "—",
            time: event.start?.dateTime ? new Date(event.start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "",
            type: "meeting",
            subject,
            from: attendees.length > 0 ? `With: ${attendees.map(a => a.displayName || a.email || "—").slice(0, 3).join(", ")}` : "—",
            source: "Calendar",
            direction: "outbound",
            sortDate: start,
          });
          sources.calendar++;
        });
      }
    } catch { /* Calendar unavailable */ }

    // ── 3. Chorus calls from SFDC Events ───────────────────
    if (sfdcMatch) {
      try {
        const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
        const sfdcQuery = async (soql) => {
          const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
          if (!res.ok) return [];
          return (await res.json()).records || [];
        };

        const nameFilter = accountName ? `Account.Name = '${safeName}'` : "";
        const contactFilter = contactEmail ? `Who.Email = '${contactEmail}'` : "";
        const filter = [nameFilter, contactFilter].filter(Boolean).join(" OR ");

        if (filter) {
          const events = await sfdcQuery(`SELECT Id, Subject, StartDateTime, DurationInMinutes, Who.Name FROM Event WHERE (${filter}) AND (Subject LIKE '%Chorus%' OR Subject LIKE '%call%' OR Subject LIKE '%Call%' OR Type = 'Call') AND StartDateTime >= ${past60.toISOString().split("T")[0]}T00:00:00Z ORDER BY StartDateTime DESC LIMIT 30`);
          events.forEach(e => {
            const start = e.StartDateTime || "";
            timeline.push({
              date: start ? new Date(start).toLocaleDateString("en-US", { timeZone: "America/Chicago" }).split(",")[0] : "—",
              time: start ? new Date(start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "",
              type: "call",
              subject: e.Subject || "Call",
              from: e.Who?.Name ? `With: ${e.Who.Name}` : "—",
              source: "Chorus",
              direction: "outbound",
              sortDate: start,
            });
            sources.chorus++;
          });
        }
      } catch {}
    }

    // ── 4. SFDC Tasks/Activities ───────────────────────────
    if (sfdcMatch) {
      try {
        const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
        const sfdcQuery = async (soql) => {
          const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
          if (!res.ok) return [];
          return (await res.json()).records || [];
        };

        const nameFilter = accountName ? `Account.Name = '${safeName}'` : "";
        const contactFilter = contactEmail ? `Who.Email = '${contactEmail}'` : "";
        const filter = [nameFilter, contactFilter].filter(Boolean).join(" OR ");

        if (filter) {
          const tasks = await sfdcQuery(`SELECT Id, Subject, ActivityDate, Status, Who.Name, Type FROM Task WHERE (${filter}) AND ActivityDate >= ${past60.toISOString().split("T")[0]} ORDER BY ActivityDate DESC LIMIT 30`);
          tasks.forEach(t => {
            const dateStr = t.ActivityDate || "—";
            timeline.push({
              date: dateStr,
              time: "",
              type: "task",
              subject: t.Subject || "Task",
              from: t.Who?.Name ? `Assigned: ${t.Who.Name}` : "—",
              source: "SFDC",
              direction: t.Type === "Inbound" ? "inbound" : "outbound",
              sortDate: dateStr ? `${dateStr}T12:00:00Z` : "",
            });
            sources.sfdc++;
          });
        }
      } catch {}
    }

    // Sort by date DESC
    timeline.sort((a, b) => (b.sortDate || "").localeCompare(a.sortDate || ""));

    return Response.json({
      timeline,
      totalItems: timeline.length,
      sources,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/unified-timeline" };
