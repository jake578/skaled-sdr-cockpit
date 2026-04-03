// Debug endpoint — returns raw SFDC query results to verify live data
export default async (req) => {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/sfdc_tokens=([^;]+)/);
  if (!match) {
    return Response.json({ error: "not connected" }, { status: 401 });
  }

  let tokens;
  try {
    tokens = JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return Response.json({ error: "bad cookie" }, { status: 401 });
  }

  const results = {};

  // Test each query independently so we can see which ones fail
  const queries = {
    opps: "SELECT Id, Name, Account.Name, Amount, StageName FROM Opportunity WHERE IsClosed = false ORDER BY Amount DESC LIMIT 5",
    activities: "SELECT Id, Subject, ActivityDate, Who.Name, What.Name FROM Task ORDER BY ActivityDate DESC LIMIT 5",
    accounts: "SELECT Id, Name, Industry, NumberOfEmployees FROM Account ORDER BY LastActivityDate DESC LIMIT 5",
    leads: "SELECT Id, Name, Company, Title, Status FROM Lead WHERE IsConverted = false LIMIT 5",
  };

  for (const [key, soql] of Object.entries(queries)) {
    try {
      const res = await fetch(
        `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const data = await res.json();
      results[key] = {
        status: res.status,
        totalSize: data.totalSize,
        records: data.records?.slice(0, 3),
        error: data[0]?.message || data.message || null,
      };
    } catch (e) {
      results[key] = { error: e.message };
    }
  }

  return Response.json({ instance_url: tokens.instance_url, results }, { status: 200 });
};

export const config = { path: "/.netlify/functions/sfdc-debug" };
