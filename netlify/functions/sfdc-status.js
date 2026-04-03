// Returns whether user is authenticated with Salesforce
export default async (req) => {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/sfdc_tokens=([^;]+)/);

  if (!match) {
    return Response.json({ connected: false });
  }

  try {
    const tokens = JSON.parse(decodeURIComponent(match[1]));
    // Quick identity check
    const res = await fetch(`${tokens.instance_url}/services/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (res.ok) {
      const user = await res.json();
      return Response.json({ connected: true, user: { name: user.name, email: user.email } });
    }
    return Response.json({ connected: false, reason: "token_expired" });
  } catch {
    return Response.json({ connected: false });
  }
};

export const config = { path: "/.netlify/functions/sfdc-status" };
