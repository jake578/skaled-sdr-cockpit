// Send email via Gmail API
import { getAccessToken } from "./google-auth.js";

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const { to, subject, body, cc, bcc } = await req.json();
    if (!to || !subject || !body) {
      return Response.json({ error: "Missing required fields: to, subject, body" }, { status: 400 });
    }

    const token = await getAccessToken();

    // Build RFC 2822 email with proper encoding
    const headers = [
      `From: me`,
      `To: ${to}`,
      cc ? `Cc: ${cc}` : "",
      bcc ? `Bcc: ${bcc}` : "",
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
    ].filter(Boolean).join("\r\n");

    // Convert body to HTML
    const htmlBody = body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
    const fullHtml = `<html><body style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">${htmlBody}</body></html>`;

    // Encode body as base64
    const bodyBase64 = btoa(unescape(encodeURIComponent(fullHtml)));

    const rawEmail = `${headers}\r\n\r\n${bodyBase64}`;

    // URL-safe base64 encode the entire message
    const raw = btoa(unescape(encodeURIComponent(rawEmail)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const res = await fetch(
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

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Gmail API error (${res.status}): ${err}` }, { status: res.status });
    }

    const data = await res.json();
    return Response.json({ success: true, messageId: data.id });
  } catch (e) {
    return Response.json({ error: `Send failed: ${e.message}` }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/send-email" };
