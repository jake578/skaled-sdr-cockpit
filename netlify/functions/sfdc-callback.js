// Handles OAuth callback — exchanges code for tokens, stores refresh token
export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response("Missing authorization code", { status: 400 });
  }

  const clientId = process.env.SFDC_CLIENT_ID;
  const clientSecret = process.env.SFDC_CLIENT_SECRET;
  const loginUrl = process.env.SFDC_LOGIN_URL || "https://login.salesforce.com";
  const redirectUri = `${url.origin}/.netlify/functions/sfdc-callback`;

  const tokenRes = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return new Response(`Token exchange failed: ${err}`, { status: 400 });
  }

  const tokens = await tokenRes.json();

  // Store tokens in a secure httpOnly cookie
  const tokenData = JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    instance_url: tokens.instance_url,
  });

  const cookie = `sfdc_tokens=${encodeURIComponent(tokenData)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": cookie,
    },
  });
};

export const config = { path: "/.netlify/functions/sfdc-callback" };
