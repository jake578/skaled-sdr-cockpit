// Detect email contacts not in SFDC — suggest adding them
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { oppId, accountId, accountName } = await req.json();
    if (!accountName) return Response.json({ error: "Missing accountName" }, { status: 400 });

    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    if (!sfdcMatch) return Response.json({ error: "SFDC not connected" }, { status: 401 });

    const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
    const sfdcQuery = async (soql) => {
      const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!res.ok) return [];
      return (await res.json()).records || [];
    };

    // Get existing contacts for this account
    const acctFilter = accountId ? `AccountId = '${accountId}'` : `Account.Name LIKE '%${accountName.replace(/'/g, "")}%'`;
    const existingContacts = await sfdcQuery(`SELECT Email FROM Contact WHERE ${acctFilter} AND Email != null`);
    const existingEmails = new Set(existingContacts.map(c => c.Email.toLowerCase()));

    // Search Gmail for emails with this account
    const gtoken = await getAccessToken();
    const safeName = accountName.replace(/'/g, "");
    const searchRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30&q="${safeName}" newer_than:90d`, { headers: { Authorization: `Bearer ${gtoken}` } });
    const searchData = await searchRes.json();

    const discoveredContacts = new Map(); // email → { name, email, domain, messageCount, lastDate, subjects }

    for (const m of (searchData.messages || []).slice(0, 20)) {
      try {
        const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Date&metadataHeaders=Subject`, { headers: { Authorization: `Bearer ${gtoken}` } });
        if (!res.ok) continue;
        const msg = await res.json();
        const headers = {};
        (msg.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });

        const dateStr = headers.date ? new Date(headers.date).toISOString().split("T")[0] : null;
        const subject = headers.subject || "";

        // Extract all email addresses from From, To, Cc
        const allAddresses = [headers.from, headers.to, headers.cc].filter(Boolean).join(", ");
        const emailRegex = /([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
        const found = allAddresses.match(emailRegex) || [];

        for (const email of found) {
          const lower = email.toLowerCase();
          // Skip internal Skaled emails and existing contacts
          if (lower.includes("skaled.com")) continue;
          if (existingEmails.has(lower)) continue;
          // Skip common noreply/system emails
          if (lower.includes("noreply") || lower.includes("no-reply") || lower.includes("notifications") || lower.includes("mailer-daemon") || lower.includes("calendar-notification")) continue;

          // Extract name from "Name <email>" pattern
          const nameMatch = allAddresses.match(new RegExp(`([^<,;]+?)\\s*<${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>`, "i"));
          const name = nameMatch ? nameMatch[1].trim().replace(/"/g, "") : "";

          const existing = discoveredContacts.get(lower) || { email: lower, name, domain: lower.split("@")[1], messageCount: 0, lastDate: null, subjects: [] };
          existing.messageCount++;
          if (dateStr && (!existing.lastDate || dateStr > existing.lastDate)) existing.lastDate = dateStr;
          if (subject && existing.subjects.length < 3) existing.subjects.push(subject);
          if (name && !existing.name) existing.name = name;
          discoveredContacts.set(lower, existing);
        }
      } catch {}
    }

    // Filter to only contacts whose domain matches the account or who appear frequently
    const suggestions = [...discoveredContacts.values()]
      .filter(c => {
        // Include if domain matches common company domain patterns
        const domainBase = c.domain?.split(".")[0]?.toLowerCase() || "";
        const acctLower = accountName.toLowerCase().replace(/[^a-z0-9]/g, "");
        return domainBase.includes(acctLower) || acctLower.includes(domainBase) || c.messageCount >= 3;
      })
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 10);

    return Response.json({
      suggestions,
      existingCount: existingContacts.length,
      discoveredCount: discoveredContacts.size,
      matchedCount: suggestions.length,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/suggest-contacts" };
