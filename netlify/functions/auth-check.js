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
  try {
    const secret = process.env.COCKPIT_SECRET;
    if (!secret) {
      return Response.json({ authenticated: false, error: "Server misconfigured" }, { status: 500 });
    }

    const cookieHeader = req.headers.get("cookie");
    const cookies = parseCookies(cookieHeader);
    const token = cookies["cockpit_auth"];

    const authenticated = await verifyToken(secret, token);
    return Response.json({ authenticated });
  } catch (err) {
    return Response.json({ authenticated: false, error: err.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/auth-check" };
