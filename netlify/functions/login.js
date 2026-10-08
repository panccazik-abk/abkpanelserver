import { getStore } from "@netlify/blobs";


const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS  = process.env.ADMIN_PASS;

export default async (req, context) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, message: "Method not allowed" }), { status: 405, headers });
  }

  try {
    const { username, password } = await req.json();

    let isValid = (username === ADMIN_EMAIL && password === ADMIN_PASS);

    if (!isValid) {
      try {
        const store = getStore("panel-data");
        const admins = await store.get("admins", { type: "json" }) || [];
        isValid = admins.some(a => a.username === username && a.password === password);
      } catch (e) { console.error("Error cek admins:", e); }
    }

    if (!isValid) {
      return new Response(JSON.stringify({ success: false, message: "Email atau password salah" }), { status: 401, headers });
    }

    const randomPart = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const token = btoa(username + ":" + Date.now() + ":" + randomPart);

    const store = getStore("panel-data");
    let sessions = await store.get("sessions", { type: "json" }) || {};
    sessions[token] = { username, created_at: Date.now(), expires_at: Date.now() + (24 * 60 * 60 * 1000) };

    const now = Date.now();
    for (const t of Object.keys(sessions)) {
      if (sessions[t].expires_at < now) delete sessions[t];
    }
    await store.setJSON("sessions", sessions);

    return new Response(JSON.stringify({ success: true, token, username }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: "Error: " + e.message }), { status: 500, headers });
  }
};

export const config = { path: "/api/login" };
