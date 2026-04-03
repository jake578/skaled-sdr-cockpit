// Check all date fields on specific records to find the right one
export default async (req) => {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/sfdc_tokens=([^;]+)/);
  if (!match) return Response.json({ error: "not connected" }, { status: 401 });

  let tokens;
  try { tokens = JSON.parse(decodeURIComponent(match[1])); } catch { return Response.json({ error: "bad cookie" }, { status: 401 }); }

  const results = {};
  const queries = {
    burtnett_task: `SELECT Id, Subject, CreatedDate, LastModifiedDate, ActivityDate, CompletedDateTime, Status, Type, Who.Name FROM Task WHERE Who.Name = 'Damian Burtnett' ORDER BY CreatedDate DESC LIMIT 3`,
    dipietro_task: `SELECT Id, Subject, CreatedDate, LastModifiedDate, ActivityDate, CompletedDateTime, Status, Type, Who.Name FROM Task WHERE Who.Name = 'Michael DiPietro' ORDER BY CreatedDate DESC LIMIT 3`,
    // Also check if there are Outreach-specific fields
    task_fields: `SELECT Id, Subject, CreatedDate, LastModifiedDate, ActivityDate, CompletedDateTime FROM Task ORDER BY CreatedDate DESC LIMIT 1`,
  };

  for (const [key, soql] of Object.entries(queries)) {
    try {
      const res = await fetch(
        `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const data = await res.json();
      results[key] = { status: res.status, records: data.records, error: data[0]?.message || null };
    } catch (e) {
      results[key] = { error: e.message };
    }
  }

  return Response.json(results);
};

export const config = { path: "/.netlify/functions/sfdc-date-check" };
