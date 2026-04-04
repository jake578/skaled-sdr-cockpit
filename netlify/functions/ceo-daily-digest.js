// CEO Daily Digest — morning email with pipeline snapshot, actions, and alerts
// Inspired by JourneyAI metrics email pattern
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const sfdcMatch = cookieHeader.match(/sfdc_tokens=([^;]+)/);
    if (!sfdcMatch) return Response.json({ error: "SFDC not connected" }, { status: 401 });

    const tokens = JSON.parse(decodeURIComponent(sfdcMatch[1]));
    const now = new Date();
    const todayStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });

    const sfdcQuery = async (soql) => {
      const res = await fetch(`${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!res.ok) return [];
      return (await res.json()).records || [];
    };

    const fmt = (n) => "$" + (n || 0).toLocaleString();

    // Pull data
    const [openOpps, pastDue, closingThisWeek, newLeads] = await Promise.all([
      sfdcQuery(`SELECT Amount, Group_Forecast_Category__c FROM Opportunity WHERE IsClosed = false`),
      sfdcQuery(`SELECT Name, Account.Name, Amount, CloseDate FROM Opportunity WHERE IsClosed = false AND CloseDate < ${now.toISOString().split("T")[0]} ORDER BY Amount DESC LIMIT 5`),
      sfdcQuery(`SELECT Name, Account.Name, Amount, CloseDate FROM Opportunity WHERE IsClosed = false AND CloseDate >= ${now.toISOString().split("T")[0]} AND CloseDate <= ${new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0]} ORDER BY CloseDate ASC LIMIT 5`),
      sfdcQuery(`SELECT Name, Company FROM Lead WHERE IsConverted = false AND CreatedDate >= LAST_N_DAYS:7 LIMIT 5`),
    ]);

    const weights = { "Commit": 0.9, "Best Case": 0.6, "Pipeline": 0.3, "Omitted": 0 };
    const totalPipeline = openOpps.reduce((s, o) => s + (o.Amount || 0), 0);
    const weighted = openOpps.reduce((s, o) => s + (o.Amount || 0) * (weights[o.Group_Forecast_Category__c] ?? 0.3), 0);

    // Calendar today
    let meetingsToday = [];
    try {
      const gtoken = await getAccessToken();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const calRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(todayStart)}&timeMax=${encodeURIComponent(todayEnd)}&maxResults=20&singleEvents=true&orderBy=startTime`, { headers: { Authorization: `Bearer ${gtoken}` } });
      const calData = await calRes.json();
      meetingsToday = (calData.items || []).map(e => ({
        time: e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "All day",
        title: e.summary || "Meeting",
        attendees: (e.attendees || []).filter(a => !a.self).length,
      }));
    } catch {}

    // Build HTML email
    const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #0F172A; color: #E2E8F0; border-radius: 12px; overflow: hidden;">
  <div style="background: linear-gradient(135deg, #10B981, #059669); padding: 24px; text-align: center;">
    <h1 style="margin: 0; font-size: 22px; color: white;">Good Morning, Jake</h1>
    <p style="margin: 6px 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">${todayStr}</p>
  </div>

  <div style="padding: 20px;">
    <h2 style="color: #F1F5F9; font-size: 16px; margin: 0 0 12px; border-bottom: 1px solid #1E293B; padding-bottom: 8px;">Pipeline Snapshot</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px; text-align: center; background: #1E293B; border-radius: 6px;">
          <div style="font-size: 22px; font-weight: 700; color: #F1F5F9;">${fmt(Math.round(totalPipeline))}</div>
          <div style="font-size: 11px; color: #64748B;">TOTAL PIPELINE</div>
        </td>
        <td style="width: 8px;"></td>
        <td style="padding: 8px; text-align: center; background: #1E293B; border-radius: 6px;">
          <div style="font-size: 22px; font-weight: 700; color: #10B981;">${fmt(Math.round(weighted))}</div>
          <div style="font-size: 11px; color: #64748B;">WEIGHTED</div>
        </td>
        <td style="width: 8px;"></td>
        <td style="padding: 8px; text-align: center; background: #1E293B; border-radius: 6px;">
          <div style="font-size: 22px; font-weight: 700; color: ${pastDue.length > 0 ? '#EF4444' : '#10B981'};">${pastDue.length}</div>
          <div style="font-size: 11px; color: #64748B;">PAST DUE</div>
        </td>
      </tr>
    </table>

    ${meetingsToday.length > 0 ? `
    <h2 style="color: #F1F5F9; font-size: 16px; margin: 20px 0 12px; border-bottom: 1px solid #1E293B; padding-bottom: 8px;">Today's Meetings (${meetingsToday.length})</h2>
    ${meetingsToday.map(m => `<div style="background: #1E293B; border-radius: 6px; padding: 10px 14px; margin-bottom: 4px;">
      <span style="color: #10B981; font-weight: 600;">${m.time}</span> — ${m.title} ${m.attendees > 0 ? `<span style="color: #64748B;">(${m.attendees} attendees)</span>` : ""}
    </div>`).join("")}` : ""}

    ${closingThisWeek.length > 0 ? `
    <h2 style="color: #F59E0B; font-size: 16px; margin: 20px 0 12px; border-bottom: 1px solid #1E293B; padding-bottom: 8px;">Closing This Week</h2>
    ${closingThisWeek.map(o => `<div style="background: #1E293B; border-radius: 6px; padding: 10px 14px; margin-bottom: 4px; display: flex; justify-content: space-between;">
      <div><strong>${o.Name}</strong><br><span style="color: #94A3B8; font-size: 12px;">${o.Account?.Name || ""} · ${o.CloseDate}</span></div>
      <div style="font-size: 16px; font-weight: 700; color: #F1F5F9;">${fmt(o.Amount)}</div>
    </div>`).join("")}` : ""}

    ${pastDue.length > 0 ? `
    <h2 style="color: #EF4444; font-size: 16px; margin: 20px 0 12px; border-bottom: 1px solid #1E293B; padding-bottom: 8px;">Past Due — Needs Attention</h2>
    ${pastDue.map(o => `<div style="background: #1E293B; border-radius: 6px; padding: 10px 14px; margin-bottom: 4px; border-left: 3px solid #EF4444;">
      <strong>${o.Name}</strong> — ${fmt(o.Amount)}<br><span style="color: #EF4444; font-size: 12px;">Was due ${o.CloseDate}</span>
    </div>`).join("")}` : ""}

    ${newLeads.length > 0 ? `
    <h2 style="color: #3B82F6; font-size: 16px; margin: 20px 0 12px; border-bottom: 1px solid #1E293B; padding-bottom: 8px;">New Leads This Week (${newLeads.length})</h2>
    ${newLeads.map(l => `<div style="background: #1E293B; border-radius: 6px; padding: 8px 14px; margin-bottom: 4px;">
      <strong>${l.Name}</strong> — ${l.Company || "—"}
    </div>`).join("")}` : ""}

    <div style="text-align: center; margin-top: 24px;">
      <a href="https://skaled-sdr-cockpit.netlify.app" style="display: inline-block; background: #10B981; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 700; font-size: 14px;">Open CEO Cockpit</a>
    </div>
  </div>

  <div style="padding: 12px; text-align: center; border-top: 1px solid #1E293B;">
    <span style="font-size: 11px; color: #475569;">Skaled CEO Cockpit · Automated Morning Digest</span>
  </div>
</div>`;

    // Send via Gmail
    const gtoken = await getAccessToken();
    const emailParts = [
      `From: me`,
      `To: jake@skaled.com`,
      `Subject: =?UTF-8?B?${Buffer.from(`CEO Cockpit — ${todayStr}`).toString("base64")}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      html,
    ].join("\r\n");

    const raw = Buffer.from(emailParts).toString("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const sendRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${gtoken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      return Response.json({ error: `Send failed: ${err}`, html }, { status: sendRes.status });
    }

    return Response.json({ success: true, preview: html });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/ceo-daily-digest" };
