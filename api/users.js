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

function autoUpdateStatus(user) {
  if (!user) return user;
  if (user.status === "locked") return user;
  const sisa = hitungSisaHari(user.expiry);
  user.sisa_hari = sisa;
  if (sisa <= 0) user.status = "expired";
  else if (user.status === "expired") user.status = "active";
  return user;
}

export default async function handler(req, res) {
  const action = req.query.action;
  const method = req.method;

  if (method === "GET" && action === "config") {
    return res.json({ success: true, config: store.config || {} });
  }

  if (method === "GET" && action === "list") {
    let users = store.users || {};
    for (const username of Object.keys(users)) {
      users[username] = autoUpdateStatus(users[username]);
    }
    store.users = users;
    return res.json({ success: true, users });
  }

  if (method === "GET" && action === "admins") {
    const admins = store.admins || [{ username: "panccazik@gmail.com", role: "owner" }];
    return res.json({ success: true, admins });
  }

  if (method === "POST" && action === "reset-hwid") {
    const username = req.query.username;
    const users = store.users || {};
    if (!users[username]) return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    users[username].hwids = {};
    store.users = users;
    return res.json({ success: true, message: "Device direset" });
  }

  if (method === "POST") {
    const body = req.body;

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
    return res.json({ success: true, message: "User disimpan", user: users[username] });
  }

  if (method === "DELETE") {
    const username = req.query.username;
    const users = store.users || {};
    delete users[username];
    store.users = users;
    return res.json({ success: true, message: "User dihapus" });
  }

  res.status(400).json({ success: false, message: "Action tidak valid" });
    }
