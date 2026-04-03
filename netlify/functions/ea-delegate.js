// EA Delegate — sends a formatted delegation email to Jake's EA via Gmail
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const { actionTitle, actionDetails, priority, dueDate, eaEmail } = await req.json();

    if (!actionTitle || !eaEmail) {
      return Response.json({ error: "Missing required fields: actionTitle, eaEmail" }, { status: 400 });
    }

    const validPriorities = ["low", "medium", "high", "urgent"];
    const selectedPriority = validPriorities.includes(priority) ? priority : "medium";

    const priorityColors = {
      low: "#6B7280",
      medium: "#3B82F6",
      high: "#F59E0B",
      urgent: "#EF4444",
    };

    const priorityLabels = {
      low: "Low Priority",
      medium: "Medium Priority",
      high: "High Priority",
      urgent: "URGENT",
    };

    const dueDateFormatted = dueDate
      ? new Date(dueDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : "No specific deadline";

    const subject = `[Delegated from Jake] ${actionTitle}`;

    const body = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1E293B; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0; font-size: 18px;">Delegated Action Item</h2>
    <p style="margin: 4px 0 0; opacity: 0.8; font-size: 13px;">From Jake Dunlap via Skaled Cockpit</p>
  </div>

  <div style="background: #F8FAFC; padding: 24px; border: 1px solid #E2E8F0; border-top: none;">
    <h3 style="margin: 0 0 16px; color: #1E293B; font-size: 16px;">${actionTitle}</h3>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
      <tr>
        <td style="padding: 8px 12px; background: white; border: 1px solid #E2E8F0; font-weight: 600; color: #64748B; width: 120px; font-size: 13px;">Priority</td>
        <td style="padding: 8px 12px; background: white; border: 1px solid #E2E8F0;">
          <span style="background: ${priorityColors[selectedPriority]}; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">${priorityLabels[selectedPriority]}</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; background: white; border: 1px solid #E2E8F0; font-weight: 600; color: #64748B; font-size: 13px;">Due Date</td>
        <td style="padding: 8px 12px; background: white; border: 1px solid #E2E8F0; font-size: 14px;">${dueDateFormatted}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; background: white; border: 1px solid #E2E8F0; font-weight: 600; color: #64748B; font-size: 13px;">Delegated</td>
        <td style="padding: 8px 12px; background: white; border: 1px solid #E2E8F0; font-size: 14px;">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</td>
      </tr>
    </table>

    ${actionDetails ? `
    <div style="background: white; border: 1px solid #E2E8F0; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <p style="margin: 0 0 8px; font-weight: 600; color: #64748B; font-size: 13px;">Details & Context</p>
      <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.6;">${actionDetails.replace(/\n/g, "<br>")}</p>
    </div>
    ` : ""}

    <div style="background: #FEF3C7; border: 1px solid #FCD34D; border-radius: 6px; padding: 12px 16px; font-size: 13px; color: #92400E;">
      Please reply to this email with any questions or when complete.
    </div>
  </div>

  <div style="background: #F1F5F9; padding: 12px 24px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 8px 8px; text-align: center;">
    <p style="margin: 0; font-size: 11px; color: #94A3B8;">Sent via Skaled CEO Cockpit</p>
  </div>
</div>`.trim();

    const token = await getAccessToken();

    // Build RFC 2822 email with proper MIME encoding
    const emailParts = [
      `From: me`,
      `To: ${eaEmail}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      body,
    ];

    const rawEmail = emailParts.join("\r\n");
    const raw = Buffer.from(rawEmail).toString("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const gmailRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      }
    );

    if (!gmailRes.ok) {
      const err = await gmailRes.text();
      return Response.json({ error: `Gmail send failed: ${err}` }, { status: gmailRes.status });
    }

    const gmailData = await gmailRes.json();
    return Response.json({ success: true, messageId: gmailData.id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/ea-delegate" };
