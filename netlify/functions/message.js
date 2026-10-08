import { getStore } from "@netlify/blobs";

async function verifyToken(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return false;
  try {
    const store = getStore("panel-data");
    const sessions = await store.get("sessions", { type: "json" }) || {};
    const s = sessions[token];
    return s && s.expires_at >= Date.now();
  } catch { return false; }
}

export default async (req, context) => {
  const store = getStore("panel-data");
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const method = req.method;

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  if (method === "OPTIONS") return new Response(null, { status: 204, headers });

  try {
    if (method === "GET" && action === "list") {
      const messages = await store.get("messages", { type: "json" }) || [];
      return new Response(JSON.stringify({ success: true, messages }), { status: 200, headers });
    }

    const isAuth = await verifyToken(req);
    if (!isAuth) {
      return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), { status: 401, headers });
    }

    if (method === "POST") {
      const body = await req.json();
      const { target, type, content } = body;
      if (!content) throw new Error("Pesan kosong");
      if (!target) throw new Error("Target tidak valid");

      let messages = await store.get("messages", { type: "json" }) || [];
      const newMsg = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
        target, type: type || "info", content,
        timestamp: new Date().toISOString(),
        read: false
      };
      messages.push(newMsg);
      if (messages.length > 100) messages = messages.slice(-100);

      await store.setJSON("messages", messages);
      return new Response(JSON.stringify({ success: true, message: "Pesan terkirim", data: newMsg }), { status: 200, headers });
    }

    if (method === "DELETE") {
      const id = url.searchParams.get("id");
      let messages = await store.get("messages", { type: "json" }) || [];
      messages = messages.filter(m => m.id !== id);
      await store.setJSON("messages", messages);
      return new Response(JSON.stringify({ success: true, message: "Pesan dihapus" }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ success: false, message: "Action tidak valid" }), { status: 400, headers });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: e.message }), { status: 500, headers });
  }
};

export const config = { path: "/api/message" };
