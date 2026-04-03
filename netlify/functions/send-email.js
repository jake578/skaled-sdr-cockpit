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

    // Build RFC 2822 email
    const lines = [
      `To: ${to}`,
      cc ? `Cc: ${cc}` : null,
      bcc ? `Bcc: ${bcc}` : null,
      `Subject: ${subject}`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      body.replace(/\n/g, "<br>"),
    ].filter(Boolean);

    const raw = btoa(unescape(encodeURIComponent(lines.join("\r\n"))))
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
      return Response.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    return Response.json({ success: true, messageId: data.id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/send-email" };
