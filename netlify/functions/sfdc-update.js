// Write/update records in Salesforce
export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/sfdc_tokens=([^;]+)/);
  if (!match) return Response.json({ error: "not_authenticated" }, { status: 401 });

  let tokens;
  try { tokens = JSON.parse(decodeURIComponent(match[1])); } catch { return Response.json({ error: "invalid_token" }, { status: 401 }); }

  const { action, object, id, fields, batch } = await req.json();

  const headers = {
    Authorization: `Bearer ${tokens.access_token}`,
    "Content-Type": "application/json",
  };
  const base = `${tokens.instance_url}/services/data/v60.0/sobjects`;

  // ── Single record update ──────────────────────────────────
  if (action === "update" && object && id && fields) {
    const res = await fetch(`${base}/${object}/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(fields),
    });
    if (res.status === 204) return Response.json({ success: true });
    const err = await res.json();
    return Response.json({ error: err }, { status: res.status });
  }

  // ── Create a task/activity ────────────────────────────────
  if (action === "logActivity" && fields) {
    const res = await fetch(`${base}/Task`, {
      method: "POST",
      headers,
      body: JSON.stringify({ Status: "Completed", ...fields }),
    });
    const data = await res.json();
    if (data.success) return Response.json({ success: true, id: data.id });
    return Response.json({ error: data }, { status: 400 });
  }

  // ── Batch update (up to 25 records) ───────────────────────
  if (action === "batch" && batch && Array.isArray(batch)) {
    const compositeReq = {
      allOrNone: false,
      compositeRequest: batch.slice(0, 25).map((item, i) => ({
        method: "PATCH",
        url: `/services/data/v60.0/sobjects/${item.object}/${item.id}`,
        referenceId: `ref${i}`,
        body: item.fields,
      })),
    };
    const res = await fetch(`${tokens.instance_url}/services/data/v60.0/composite`, {
      method: "POST",
      headers,
      body: JSON.stringify(compositeReq),
    });
    const data = await res.json();
    const results = (data.compositeResponse || []).map(r => ({
      referenceId: r.referenceId,
      success: r.httpStatusCode >= 200 && r.httpStatusCode < 300,
      status: r.httpStatusCode,
    }));
    return Response.json({ results });
  }

  return Response.json({ error: "Invalid action. Use: update, logActivity, or batch" }, { status: 400 });
};

export const config = { path: "/.netlify/functions/sfdc-update" };
