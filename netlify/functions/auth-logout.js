export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie":
          "cockpit_auth=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Logout failed", detail: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
