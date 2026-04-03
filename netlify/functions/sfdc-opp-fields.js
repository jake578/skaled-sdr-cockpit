// List picklist values for ForecastCategoryName on Opportunity
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

    const forecastField = data.fields.find(f => f.name === "ForecastCategoryName" || f.name === "ForecastCategory");
    const forecastCustom = data.fields.filter(f => f.custom && (f.label.toLowerCase().includes("forecast") || f.name.toLowerCase().includes("forecast")));

    return Response.json({
      forecastField: forecastField ? { name: forecastField.name, label: forecastField.label, type: forecastField.type, picklistValues: forecastField.picklistValues?.map(p => ({ value: p.value, label: p.label, active: p.active })) } : null,
      forecastCustomFields: forecastCustom.map(f => ({ name: f.name, label: f.label, type: f.type, picklistValues: f.picklistValues?.map(p => ({ value: p.value, label: p.label, active: p.active })) })),
    });
  } catch (e) {
    return Response.json({ error: e.message });
  }
};

export const config = { path: "/.netlify/functions/sfdc-opp-fields" };
