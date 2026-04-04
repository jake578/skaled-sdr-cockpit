// Global search across SFDC objects — opportunities, contacts, accounts, leads
export default async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  if (!q || !q.trim()) {
    return Response.json({ error: "Missing search query (?q=)" }, { status: 400 });
  }

  // Parse SFDC tokens from cookie
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

  const term = q.trim().replace(/'/g, "\\'");

  const sfdcQuery = async (soql) => {
    const res = await fetch(
      `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.records || [];
  };

  try {
    const [opportunities, contacts, accounts, leads] = await Promise.all([
      sfdcQuery(
        `SELECT Id, Name, Account.Name, Amount, StageName, CloseDate FROM Opportunity WHERE Name LIKE '%${term}%' OR Account.Name LIKE '%${term}%' ORDER BY Amount DESC NULLS LAST LIMIT 10`
      ),
      sfdcQuery(
        `SELECT Id, Name, Email, Title, Account.Name, Phone FROM Contact WHERE Name LIKE '%${term}%' OR Email LIKE '%${term}%' ORDER BY LastModifiedDate DESC LIMIT 10`
      ),
      sfdcQuery(
        `SELECT Id, Name, Industry, Website, AnnualRevenue FROM Account WHERE Name LIKE '%${term}%' ORDER BY AnnualRevenue DESC NULLS LAST LIMIT 10`
      ),
      sfdcQuery(
        `SELECT Id, Name, Company, Title, Status, Email, LeadSource FROM Lead WHERE Name LIKE '%${term}%' OR Company LIKE '%${term}%' ORDER BY CreatedDate DESC LIMIT 10`
      ),
    ]);

    const totalResults = opportunities.length + contacts.length + accounts.length + leads.length;

    return Response.json({
      opportunities,
      contacts,
      accounts,
      leads,
      totalResults,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/global-search" };
