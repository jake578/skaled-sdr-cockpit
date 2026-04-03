import { getStore } from "@netlify/blobs";

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((pair) => {
    const [name, ...rest] = pair.trim().split("=");
    cookies[name] = rest.join("=");
  });
  return cookies;
}

async function verifyToken(secret, tokenValue) {
  if (!tokenValue || !tokenValue.includes(".")) return false;
  const [timestamp, signature] = tokenValue.split(".");
  const payload = "jake-dunlap-ceo-cockpit" + timestamp;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
  return signature === expected;
}

export default async (req) => {
  if (req.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const secret = process.env.COCKPIT_SECRET;
    if (!secret) return Response.json({ error: "Server misconfigured" }, { status: 500 });

    const cookies = parseCookies(req.headers.get("cookie"));
    if (!await verifyToken(secret, cookies["cockpit_auth"])) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const key = new URL(req.url).searchParams.get("key");
    if (!key) return Response.json({ error: "Missing key" }, { status: 400 });

    const store = getStore("cockpit-data");
    const value = await store.get(key);

    if (value === null || value === undefined) {
      return Response.json({ key, value: null });
    }

    let parsed;
    try { parsed = JSON.parse(value); } catch { parsed = value; }
    return Response.json({ key, value: parsed });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/store-get" };
