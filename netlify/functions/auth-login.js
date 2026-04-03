const crypto = await import("node:crypto");

function signToken(secret, timestamp) {
  const payload = "jake-dunlap-ceo-cockpit" + timestamp;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  return hmac.digest("hex");
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { password } = await req.json();
    const expectedPassword = Netlify.env.get("COCKPIT_PASSWORD");
    const secret = Netlify.env.get("COCKPIT_SECRET");

    if (!expectedPassword || !secret) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (password !== expectedPassword) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid password" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const timestamp = Date.now().toString();
    const signature = signToken(secret, timestamp);
    const tokenValue = `${timestamp}.${signature}`;

    const maxAge = 30 * 24 * 60 * 60; // 30 days in seconds

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `cockpit_auth=${tokenValue}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Login failed", detail: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
