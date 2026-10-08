import { getStore } from "@netlify/blobs";

function hitungSisaHari(expiry) {
  if (!expiry) return 0;
  try {
    let targetDate;
    if (expiry.includes("/")) {
      const [d, m, y] = expiry.split("/").map(x => parseInt(x));
      targetDate = new Date(y, m - 1, d);
    } else {
      targetDate = new Date(expiry);
    }
    if (isNaN(targetDate.getTime())) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  } catch { return 0; }
}

export default async (req, context) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  try {
    const { username, password, hwid } = await req.json();
    const store = getStore("panel-data");
    const users = await store.get("users", { type: "json" }) || {};
    const config = await store.get("config", { type: "json" }) || {};
    const messages = await store.get("messages", { type: "json" }) || [];

    if (config.maintenance === true) {
      return new Response(JSON.stringify({
        valid: false,
        maintenance: true,
        message: config.maintenance_msg || "Server sedang maintenance",
        app_name: config.app_name || "",
        version: config.version || ""
      }), { status: 200, headers });
    }

    const user = users[username];

    if (!user) {
      return new Response(JSON.stringify({ valid: false, message: "User tidak terdaftar" }), { status: 200, headers });
    }

    if (user.password !== password) {
      return new Response(JSON.stringify({ valid: false, message: "Password salah" }), { status: 200, headers });
    }

    if (user.status === "locked") {
      return new Response(JSON.stringify({ valid: false, message: "Akun Anda diblokir admin" }), { status: 200, headers });
    }

    const sisaRealtime = hitungSisaHari(user.expiry);

    if (sisaRealtime <= 0) {
      users[username].status = "expired";
      users[username].sisa_hari = 0;
      await store.setJSON("users", users);
      return new Response(JSON.stringify({ valid: false, message: "Masa aktif habis, silakan perpanjang" }), { status: 200, headers });
    }

    if (users[username].sisa_hari !== sisaRealtime) {
      users[username].sisa_hari = sisaRealtime;
      if (users[username].status !== "locked") users[username].status = "active";
      await store.setJSON("users", users);
    }

    if (!user.hwids) user.hwids = {};
    const hwidList = Object.keys(user.hwids).filter(k => user.hwids[k]);

    if (!user.hwids[hwid]) {
      if (hwidList.length >= 1) {
        return new Response(JSON.stringify({
          valid: false,
          message: "Token ini sudah terdaftar di HP lain. Hubungi admin untuk reset device."
        }), { status: 200, headers });
      }
      users[username].hwids[hwid] = true;
      await store.setJSON("users", users);
    }

    const userMessages = messages
      .filter(m => m.target === "all" || m.target === username)
      .slice(-5);

    return new Response(JSON.stringify({
      valid: true,
      message: "Login berhasil",
      user: {
        username,
        expiry: user.expiry,
        sisa_hari: sisaRealtime,
        max_devices: 1,
        note: user.note || ""
      },
      messages: userMessages,
      config: {
        app_name: config.app_name || "",
        version: config.version || "",
        admin_url: config.admin_url || ""
      }
    }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ valid: false, message: e.message }), { status: 500, headers });
  }
};

export const config = { path: "/api/validate" };
