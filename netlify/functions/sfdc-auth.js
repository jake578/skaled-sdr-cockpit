// Redirects user to Salesforce OAuth login with PKCE
export default async (req) => {
  const clientId = process.env.SFDC_CLIENT_ID;
  const loginUrl = process.env.SFDC_LOGIN_URL || "https://login.salesforce.com";
  const redirectUri = `${new URL(req.url).origin}/.netlify/functions/sfdc-callback`;

  // Generate PKCE code_verifier (random 64-char string)
  const array = new Uint8Array(48);
  crypto.getRandomValues(array);
  const codeVerifier = base64url(array);

  // Hash to code_challenge
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(codeVerifier));
  const codeChallenge = base64url(new Uint8Array(digest));

  const authUrl = `${loginUrl}/services/oauth2/authorize?` +
    `response_type=code&client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent("api refresh_token openid")}` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256`;

  // Store verifier in httpOnly cookie so callback can read it
  const cookie = `sfdc_pkce=${codeVerifier}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      "Set-Cookie": cookie,
    },
  });
};

function base64url(buffer) {
  const str = btoa(String.fromCharCode(...buffer));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const config = { path: "/.netlify/functions/sfdc-auth" };
