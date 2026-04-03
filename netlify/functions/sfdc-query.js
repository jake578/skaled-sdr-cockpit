// Proxies SOQL queries to Salesforce — keeps tokens server-side
export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Parse tokens from cookie
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/sfdc_tokens=([^;]+)/);
  if (!match) {
    return Response.json({ error: "not_authenticated", message: "Please connect Salesforce first" }, { status: 401 });
  }

  let tokens;
  try {
    tokens = JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return Response.json({ error: "invalid_token", message: "Invalid token cookie" }, { status: 401 });
  }

  const { query } = await req.json();
  if (!query) {
    return Response.json({ error: "missing_query", message: "No SOQL query provided" }, { status: 400 });
  }

  // Try query with current access token
  let res = await sfdcQuery(tokens.instance_url, tokens.access_token, query);

  // If expired, refresh and retry
  if (res.status === 401) {
    const refreshed = await refreshToken(tokens.refresh_token, tokens.instance_url);
    if (!refreshed) {
      return Response.json({ error: "refresh_failed", message: "Session expired — please reconnect Salesforce" }, { status: 401 });
    }
    tokens.access_token = refreshed.access_token;
    res = await sfdcQuery(tokens.instance_url, tokens.access_token, query);

    // Update cookie with new access token
    const tokenData = JSON.stringify(tokens);
    const cookie = `sfdc_tokens=${encodeURIComponent(tokenData)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;
    const data = await res.json();
    return Response.json(data, { headers: { "Set-Cookie": cookie } });
  }

  const data = await res.json();
  return Response.json(data);
};

async function sfdcQuery(instanceUrl, accessToken, query) {
  return fetch(`${instanceUrl}/services/data/v60.0/query?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function refreshToken(refreshToken, instanceUrl) {
  const loginUrl = process.env.SFDC_LOGIN_URL || "https://login.salesforce.com";
  const res = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.SFDC_CLIENT_ID,
      client_secret: process.env.SFDC_CLIENT_SECRET,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

export const config = { path: "/.netlify/functions/sfdc-query" };
