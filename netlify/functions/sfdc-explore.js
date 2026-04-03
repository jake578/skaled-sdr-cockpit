// Explore what activity data exists in SFDC
export default async (req) => {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/sfdc_tokens=([^;]+)/);
  if (!match) return Response.json({ error: "not connected" }, { status: 401 });

  let tokens;
  try { tokens = JSON.parse(decodeURIComponent(match[1])); } catch { return Response.json({ error: "bad cookie" }, { status: 401 }); }

  const results = {};
  const queries = {
    // What types of Tasks exist
    taskTypes: "SELECT Type, COUNT(Id) cnt FROM Task GROUP BY Type ORDER BY COUNT(Id) DESC LIMIT 20",
    // What subjects look like (recent 20)
    recentTasks: "SELECT Subject, Type, Status, CreatedDate, Who.Name, What.Name FROM Task ORDER BY CreatedDate DESC LIMIT 20",
    // Are there Events (meetings, calls)?
    eventTypes: "SELECT Type, COUNT(Id) cnt FROM Event GROUP BY Type ORDER BY COUNT(Id) DESC LIMIT 20",
    recentEvents: "SELECT Subject, Type, StartDateTime, Who.Name, What.Name FROM Event ORDER BY CreatedDate DESC LIMIT 20",
    // Are there EmailMessage records? (Email-to-Case or enhanced email)
    emailMessages: "SELECT Id, Subject, FromAddress, ToAddress, MessageDate, Status FROM EmailMessage ORDER BY MessageDate DESC LIMIT 10",
    // Activity history via ActivityHistory isn't directly queryable — check Task statuses
    taskStatuses: "SELECT Status, COUNT(Id) cnt FROM Task GROUP BY Status ORDER BY COUNT(Id) DESC",
    // Total counts
    taskCount: "SELECT COUNT(Id) cnt FROM Task",
    eventCount: "SELECT COUNT(Id) cnt FROM Event",
  };

  for (const [key, soql] of Object.entries(queries)) {
    try {
      const res = await fetch(
        `${tokens.instance_url}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const data = await res.json();
      results[key] = { status: res.status, totalSize: data.totalSize, records: data.records, error: data[0]?.message || null };
    } catch (e) {
      results[key] = { error: e.message };
    }
  }

  return Response.json(results);
};

export const config = { path: "/.netlify/functions/sfdc-explore" };
