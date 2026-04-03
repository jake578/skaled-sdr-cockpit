async function signToken(secret, timestamp) {
  const payload = "jake-dunlap-ceo-cockpit" + timestamp;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { password } = await req.json();
    const expectedPassword = process.env.COCKPIT_PASSWORD;
    const secret = process.env.COCKPIT_SECRET;

    if (!expectedPassword || !secret) {
      return Response.json({ error: "Server misconfigured" }, { status: 500 });
    }

    if (password !== expectedPassword) {
      return Response.json({ success: false, error: "Invalid password" }, { status: 401 });
    }

    const timestamp = Date.now().toString();
    const signature = await signToken(secret, timestamp);
    const tokenValue = `${timestamp}.${signature}`;
    const maxAge = 30 * 24 * 60 * 60;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `cockpit_auth=${tokenValue}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`,
      },
    });
  } catch (err) {
    return Response.json({ error: "Login failed: " + err.message }, { status: 500 });
  }
};

export const config = { path: "/.netlify/functions/auth-login" };
