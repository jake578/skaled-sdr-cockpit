// List all fields on Task object to find Outreach custom fields
export default async (req) => {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/sfdc_tokens=([^;]+)/);
  if (!match) return Response.json({ error: "not connected" }, { status: 401 });

  let tokens;
  try { tokens = JSON.parse(decodeURIComponent(match[1])); } catch { return Response.json({ error: "bad cookie" }, { status: 401 }); }

  try {
    const res = await fetch(
      `${tokens.instance_url}/services/data/v60.0/sobjects/Task/describe`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const data = await res.json();
    // Filter for custom fields and date/datetime fields that might have the real timestamp
    const interesting = data.fields
      .filter(f => f.custom || f.type === "datetime" || f.type === "date" || f.name.toLowerCase().includes("outreach"))
      .map(f => ({ name: f.name, label: f.label, type: f.type, custom: f.custom }));
    return Response.json({ totalFields: data.fields.length, interestingFields: interesting });
  } catch (e) {
    return Response.json({ error: e.message });
  }
};

export const config = { path: "/.netlify/functions/sfdc-task-fields" };
