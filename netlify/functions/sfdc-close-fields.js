// Find the Close Lost reason fields on Opportunity
export default async (req) => {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/sfdc_tokens=([^;]+)/);
  if (!match) return Response.json({ error: "not connected" }, { status: 401 });

  let tokens;
  try { tokens = JSON.parse(decodeURIComponent(match[1])); } catch { return Response.json({ error: "bad cookie" }, { status: 401 }); }

  try {
    const res = await fetch(
      `${tokens.instance_url}/services/data/v60.0/sobjects/Opportunity/describe`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const data = await res.json();

    // Find loss reason fields
    const candidates = data.fields.filter(f =>
      f.name.toLowerCase().includes("loss") ||
      f.name.toLowerCase().includes("lost") ||
      f.name.toLowerCase().includes("close") ||
      f.name.toLowerCase().includes("reason") ||
      f.label.toLowerCase().includes("loss") ||
      f.label.toLowerCase().includes("lost") ||
      f.label.toLowerCase().includes("reason")
    ).map(f => ({
      name: f.name,
      label: f.label,
      type: f.type,
      custom: f.custom,
      required: f.nillable === false,
      picklistValues: f.picklistValues?.filter(p => p.active).map(p => ({ value: p.value, label: p.label })),
    }));

    return Response.json({ fields: candidates });
  } catch (e) {
    return Response.json({ error: e.message });
  }
};

export const config = { path: "/.netlify/functions/sfdc-close-fields" };
