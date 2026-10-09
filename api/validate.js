const store = {};

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ valid: false, message: "Method not allowed" });
  }

  try {
    const { username, password, hwid } = req.body;
    const users = store.users || {};
    const config = store.config || {};
    const messages = store.messages || [];

    if (config.maintenance === true) {
      return res.json({
        valid: false,
        maintenance: true,
        message: config.maintenance_msg || "Server sedang maintenance"
      });
    }

    const user = users[username];

    if (!user) return res.json({ valid: false, message: "User tidak terdaftar" });
    if (user.password !== password) return res.json({ valid: false, message: "Password salah" });
    if (user.status === "locked") return res.json({ valid: false, message: "Akun Anda diblokir admin" });

    const sisaRealtime = hitungSisaHari(user.expiry);
    if (sisaRealtime <= 0) {
      users[username].status = "expired";
      users[username].sisa_hari = 0;
      store.users = users;
      return res.json({ valid: false, message: "Masa aktif habis" });
    }

    if (!user.hwids) user.hwids = {};
    const hwidList = Object.keys(user.hwids).filter(k => user.hwids[k]);

    if (!user.hwids[hwid]) {
      if (hwidList.length >= 1) {
        return res.json({ valid: false, message: "Token sudah terdaftar di HP lain" });
      }
      users[username].hwids[hwid] = true;
      store.users = users;
    }

    const userMessages = messages.filter(m => m.target === "all" || m.target === username).slice(-5);

    res.json({
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
    });
  } catch (e) {
    res.status(500).json({ valid: false, message: e.message });
  }
}
