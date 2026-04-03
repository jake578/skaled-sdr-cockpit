// Fetches recent Gmail sent/received emails for the activity feed
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  try {
    const token = await getAccessToken();

    // Get sent emails (last 30 days, skip internal skaled.com)
    const sentRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=in:sent newer_than:30d -to:skaled.com`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const sentData = await sentRes.json();

    // Get received emails (last 30 days, skip internal)
    const inboxRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=in:inbox newer_than:30d -from:skaled.com -category:promotions -category:social -category:updates`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const inboxData = await inboxRes.json();

    // Fetch message details
    const activities = [];

    const fetchMsg = async (id, direction) => {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return null;
      const msg = await res.json();
      const headers = {};
      (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });

      const dateStr = headers.date ? new Date(headers.date).toISOString() : "";
      const from = headers.from || "";
      const to = headers.to || "";

      // Extract name and email
      const nameMatch = (direction === "inbound" ? from : to).match(/^([^<]+)/);
      const contactName = nameMatch ? nameMatch[1].trim().replace(/"/g, "") : (direction === "inbound" ? from : to);

      // Skip if it's internal skaled
      const emailAddr = (direction === "inbound" ? from : to).toLowerCase();
      if (emailAddr.includes("skaled.com")) return null;

      return {
        date: dateStr ? dateStr.split("T")[0] : "—",
        time: dateStr ? new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "",
        type: "email",
        direction,
        subject: headers.subject || "—",
        contact: contactName,
        company: "—",
        source: "Gmail",
        sortDate: dateStr,
      };
    };

    // Fetch up to 25 sent + 25 received in parallel
    const sentIds = (sentData.messages || []).slice(0, 25);
    const inboxIds = (inboxData.messages || []).slice(0, 25);

    const results = await Promise.all([
      ...sentIds.map(m => fetchMsg(m.id, "outbound")),
      ...inboxIds.map(m => fetchMsg(m.id, "inbound")),
    ]);

    results.forEach(r => { if (r) activities.push(r); });
    activities.sort((a, b) => (b.sortDate || "").localeCompare(a.sortDate || ""));

    return Response.json({ activities, count: activities.length });
  } catch (e) {
    return Response.json({ error: e.message, activities: [] }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/gmail-activities" };
