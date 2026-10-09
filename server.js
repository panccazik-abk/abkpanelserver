import express from "express";

const app = express();
app.use(express.json());
app.use(express.static("."));

// ===== IN-MEMORY STORE =====
const store = {
  users: {},
  admins: [{ username: "panccazik@gmail.com", role: "owner" }],
  messages: [],
  config: {},
  tokens: {} // Token tracking
};

// ===== HELPER: HITUNG SISA HARI =====
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

function autoUpdateStatus(user) {
  if (!user) return user;
  if (user.status === "locked") return user;
  const sisa = hitungSisaHari(user.expiry);
  user.sisa_hari = sisa;
  if (sisa <= 0) user.status = "expired";
  else if (user.status === "expired") user.status = "active";
  return user;
}

// ===== HELPER: GENERATE TOKEN =====
function generateToken(username) {
  return Buffer.from(username + ":" + Date.now() + ":" + Math.random()).toString("base64");
}

// ===== HELPER: VALIDASI TOKEN =====
function validateToken(token) {
  if (!token) return { valid: false, message: "Token kosong" };
  const data = store.tokens[token];
  if (!data) return { valid: false, message: "Token tidak valid" };
  if (data.expired_at < Date.now()) {
    delete store.tokens[token];
    return { valid: false, message: "Token Expired, login ulang" };
  }
  return { valid: true, data };
}

// ===== API: LOGIN ADMIN =====
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "panccazik@gmail.com";
  const ADMIN_PASS = process.env.ADMIN_PASS || "Menteng10310";

  let isValid = (username === ADMIN_EMAIL && password === ADMIN_PASS);

  if (!isValid) {
    const admins = store.admins || [];
    isValid = admins.some(a => a.username === username && a.password === password);
  }

  if (!isValid) {
    return res.status(401).json({ success: false, message: "Email atau password salah" });
  }

  const token = generateToken(username);
  store.tokens[token] = {
    username,
    role: "admin",
    created_at: Date.now(),
    expired_at: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 hari
  };

  res.json({ success: true, token, username });
});

// ===== API: REFRESH TOKEN =====
app.post("/api/refresh-token", async (req, res) => {
  const { username, password } = req.body;
  const users = store.users || {};
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "panccazik@gmail.com";
  const ADMIN_PASS = process.env.ADMIN_PASS || "Menteng10310";

  // Cek admin dulu
  if (username === ADMIN_EMAIL && password === ADMIN_PASS) {
    const newToken = generateToken(username);
    store.tokens[newToken] = {
      username,
      role: "admin",
      created_at: Date.now(),
      expired_at: Date.now() + (7 * 24 * 60 * 60 * 1000)
    };
    return res.json({ valid: true, token: newToken, role: "admin" });
  }

  // Cek user biasa
  const user = users[username];
  if (!user || user.password !== password) {
    return res.status(401).json({ valid: false, message: "Kredensial salah" });
  }

  const newToken = generateToken(username);
  store.tokens[newToken] = {
    username,
    role: "user",
    created_at: Date.now(),
    expired_at: Date.now() + (7 * 24 * 60 * 60 * 1000)
  };

  res.json({ valid: true, token: newToken, role: "user" });
});

// ===== API: VALIDATE (untuk APK user) =====
app.post("/api/validate", async (req, res) => {
  try {
    const { username, password, hwid, token } = req.body;
    const users = store.users || {};
    const config = store.config || {};
    const messages = store.messages || [];

    // Cek maintenance
    if (config.maintenance === true) {
      return res.json({
        valid: false,
        maintenance: true,
        message: config.maintenance_msg || "Server sedang maintenance"
      });
    }

    // Validasi token kalau ada
    if (token) {
      const tokenCheck = validateToken(token);
      if (!tokenCheck.valid) {
        return res.json({ valid: false, message: tokenCheck.message });
      }
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
      if (hwidList.length >= (user.max_devices || 1)) {
        return res.json({ valid: false, message: "Token sudah terdaftar di HP lain" });
      }
      users[username].hwids[hwid] = true;
      store.users = users;
    }

    // Generate token baru untuk session ini
    const newToken = generateToken(username);
    store.tokens[newToken] = {
      username,
      hwid,
      role: "user",
      created_at: Date.now(),
      expired_at: Date.now() + (7 * 24 * 60 * 60 * 1000)
    };

    const userMessages = messages.filter(m => m.target === "all" || m.target === username).slice(-5);

    res.json({
      valid: true,
      message: "Login berhasil",
      token: newToken,
      expired_at: store.tokens[newToken].expired_at,
      user: {
        username,
        expiry: user.expiry,
        sisa_hari: sisaRealtime,
        max_devices: user.max_devices || 1,
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
});

// ===== API: USERS =====
app.get("/api/users", async (req, res) => {
  const action = req.query.action;

  if (action === "config") {
    return res.json({ success: true, config: store.config || {} });
  }

  if (action === "list") {
    let users = store.users || {};
    for (const username of Object.keys(users)) {
      users[username] = autoUpdateStatus(users[username]);
    }
    store.users = users;
    return res.json({ success: true, users });
  }

  if (action === "admins") {
    const admins = store.admins || [{ username: "panccazik@gmail.com", role: "owner" }];
    return res.json({ success: true, admins });
  }

  if (action === "tokens") {
    return res.json({ success: true, tokens: store.tokens || {} });
  }

  res.status(400).json({ success: false, message: "Action tidak valid" });
});

app.post("/api/users", async (req, res) => {
  const body = req.body;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const action = url.searchParams.get("action");

  if (action === "reset-hwid") {
    const username = url.searchParams.get("username");
    const users = store.users || {};
    if (!users[username]) return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    users[username].hwids = {};
    store.users = users;
    return res.json({ success: true, message: "Device direset" });
  }

  if (body.action === "save-config") {
    store.config = {
      admin_url: body.admin_url || "",
      app_name: body.app_name || "",
      version: body.version || "",
      maintenance: !!body.maintenance,
      maintenance_msg: body.maintenance_msg || "",
      auto_extend: parseInt(body.auto_extend) || 0,
      preview_url: body.preview_url || ""
    };
    return res.json({ success: true, message: "Config disimpan" });
  }

  if (body.action === "remove-hwid") {
    const users = store.users || {};
    if (!users[body.username]) return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    if (users[body.username].hwids) delete users[body.username].hwids[body.hwid];
    store.users = users;
    return res.json({ success: true, message: "Device dihapus" });
  }

  if (body.action === "add-hwid-manual") {
    const users = store.users || {};
    if (!users[body.username]) return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    if (!body.hwid) return res.status(400).json({ success: false, message: "HWID kosong" });
    if (!users[body.username].hwids) users[body.username].hwids = {};
    if (users[body.username].hwids[body.hwid]) return res.status(400).json({ success: false, message: "HWID sudah ada" });
    const currentHwids = Object.keys(users[body.username].hwids).length;
    const maxDevices = users[body.username].max_devices || 1;
    if (currentHwids >= maxDevices) return res.status(400).json({ success: false, message: "Max device tercapai" });
    users[body.username].hwids[body.hwid] = true;
    store.users = users;
    return res.json({ success: true, message: "HWID ditambahkan" });
  }

  if (body.action === "add-admin") {
    let admins = store.admins || [{ username: "panccazik@gmail.com", role: "owner" }];
    if (admins.find(a => a.username === body.username)) return res.status(400).json({ success: false, message: "Admin sudah ada" });
    admins.push({ username: body.username, password: body.password, role: "admin" });
    store.admins = admins;
    return res.json({ success: true, message: "Admin ditambah" });
  }

  if (body.action === "remove-admin") {
    let admins = store.admins || [];
    admins = admins.filter(a => a.username !== body.username);
    store.admins = admins;
    return res.json({ success: true, message: "Admin dihapus" });
  }

  if (body.action === "auto-extend") {
    const users = store.users || {};
    const days = parseInt(body.days) || 30;
    let count = 0;
    for (const [username, data] of Object.entries(users)) {
      if (data.status !== "active" || !data.expiry) continue;
      let targetDate;
      if (data.expiry.includes("/")) {
        const [d, m, y] = data.expiry.split("/").map(x => parseInt(x));
        targetDate = new Date(y, m - 1, d);
      } else {
        targetDate = new Date(data.expiry);
      }
      targetDate.setDate(targetDate.getDate() + days);
      const dd = String(targetDate.getDate()).padStart(2, "0");
      const mm = String(targetDate.getMonth() + 1).padStart(2, "0");
      const yy = targetDate.getFullYear();
      users[username].expiry = `${dd}/${mm}/${yy}`;
      users[username].sisa_hari = hitungSisaHari(users[username].expiry);
      count++;
    }
    store.users = users;
    return res.json({ success: true, message: `${count} user diperpanjang`, count });
  }

  if (body.action === "revoke-token") {
    const { token } = body;
    if (store.tokens[token]) {
      delete store.tokens[token];
    }
    return res.json({ success: true, message: "Token dicabut" });
  }

  if (body.action === "revoke-all-tokens") {
    store.tokens = {};
    return res.json({ success: true, message: "Semua token dicabut" });
  }

  const { username, password, expiry, status, note, max_devices } = body;
  if (!username) return res.status(400).json({ success: false, message: "Username wajib" });

  const users = store.users || {};
  const sisaOtomatis = hitungSisaHari(expiry);
  let finalStatus = status || "active";
  if (finalStatus !== "locked") {
    finalStatus = sisaOtomatis > 0 ? "active" : "expired";
  }

  users[username] = {
    password: password || username,
    expiry: expiry || "",
    sisa_hari: sisaOtomatis,
    max_devices: parseInt(max_devices) || 1,
    status: finalStatus,
    note: note || "",
    hwids: users[username]?.hwids || {}
  };

  store.users = users;
  res.json({ success: true, message: "User disimpan", user: users[username] });
});

app.delete("/api/users", async (req, res) => {
  const username = req.query.username;
  const users = store.users || {};
  delete users[username];
  store.users = users;
  res.json({ success: true, message: "User dihapus" });
});

// ===== API: MESSAGE =====
app.get("/api/message", async (req, res) => {
  const messages = store.messages || [];
  res.json({ success: true, messages });
});

app.post("/api/message", async (req, res) => {
  const { target, type, content } = req.body;
  let messages = store.messages || [];
  const newMsg = {
    id: Date.now().toString(),
    target, type: type || "info", content,
    timestamp: new Date().toISOString()
  };
  messages.push(newMsg);
  if (messages.length > 100) messages = messages.slice(-100);
  store.messages = messages;
  res.json({ success: true, message: "Pesan terkirim", data: newMsg });
});

app.delete("/api/message", async (req, res) => {
  const id = req.query.id;
  let messages = store.messages || [];
  messages = messages.filter(m => m.id !== id);
  store.messages = messages;
  res.json({ success: true, message: "Pesan dihapus" });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

export default app;
