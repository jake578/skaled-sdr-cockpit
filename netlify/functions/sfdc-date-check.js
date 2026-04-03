// Check all date fields including Outreach custom fields
export default async (req) => {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/sfdc_tokens=([^;]+)/);
  if (!match) return Response.json({ error: "not connected" }, { status: 401 });

  let tokens;
  try { tokens = JSON.parse(decodeURIComponent(match[1])); } catch { return Response.json({ error: "bad cookie" }, { status: 401 }); }

  const results = {};
  const fields = `Id, Subject, CreatedDate, ActivityDate, CompletedDateTime, LID__Date_Sent__c, Outreach_Sequence_Name__c, Outreach_Replied_At__c, Outreach_Open_Count__c, Click_Count__c, cirrusadv__First_Opened__c, cirrusadv__First_Reply__c, cirrusadv__Template_Name__c, cirrusadv__Day_Activity_Created__c, Who.Name`;
  const queries = {
    burtnett: `SELECT ${fields} FROM Task WHERE Who.Name = 'Damian Burtnett' ORDER BY CreatedDate DESC LIMIT 3`,
    dipietro: `SELECT ${fields} FROM Task WHERE Who.Name = 'Michael DiPietro' ORDER BY CreatedDate DESC LIMIT 3`,
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
