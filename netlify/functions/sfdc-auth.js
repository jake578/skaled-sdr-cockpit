// Redirects user to Salesforce OAuth login
export default async (req) => {
  const clientId = process.env.SFDC_CLIENT_ID;
  const loginUrl = process.env.SFDC_LOGIN_URL || "https://login.salesforce.com";
  const redirectUri = `${new URL(req.url).origin}/.netlify/functions/sfdc-callback`;

  const authUrl = `${loginUrl}/services/oauth2/authorize?` +
    `response_type=code&client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent("api refresh_token openid")}`;

  return new Response(null, { status: 302, headers: { Location: authUrl } });
};

export const config = { path: "/.netlify/functions/sfdc-auth" };
