import { getStore } from "@netlify/blobs";
const crypto = await import("node:crypto");

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((pair) => {
    const [name, ...rest] = pair.trim().split("=");
    cookies[name] = rest.join("=");
  });
  return cookies;
}

function verifyToken(secret, tokenValue) {
  if (!tokenValue || !tokenValue.includes(".")) return false;

  const [timestamp, signature] = tokenValue.split(".");
  const payload = "jake-dunlap-ceo-cockpit" + timestamp;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expected = hmac.digest("hex");

  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex")
  );
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Verify authentication
    const secret = Netlify.env.get("COCKPIT_SECRET");
    if (!secret) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const cookieHeader = req.headers.get("cookie");
    const cookies = parseCookies(cookieHeader);
    const token = cookies["cockpit_auth"];

    if (!verifyToken(secret, token)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Write to Netlify Blobs
    const body = await req.json();
    const { key, value } = body;

    if (!key) {
      return new Response(
        JSON.stringify({ error: "Missing key" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const store = getStore("cockpit-data");
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    await store.set(key, serialized);

    return new Response(
      JSON.stringify({ success: true, key }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to write store", detail: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
