// Auto-inject ke APK Median — Cek session user
(function() {
  "use strict";

  const API_URL = "https://abkpaneltokenserver.netlify.app/api/validate";

  function getHwid() {
    let hwid = localStorage.getItem("user_hwid");
    if (!hwid) {
      hwid = "DEV-" + Math.random().toString(36).slice(2, 10).toUpperCase() + "-" + Date.now().toString(36).toUpperCase();
      localStorage.setItem("user_hwid", hwid);
    }
    return hwid;
  }

  function showPopup(title, message, color) {
    const old = document.getElementById("apk-popup");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "apk-popup";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:999999;padding:20px;font-family:sans-serif;";
    overlay.innerHTML = `
      <div style="background:#1a1a1a;border:2px solid ${color};border-radius:16px;padding:28px 24px;max-width:340px;width:100%;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
        <div style="color:#fff;font-size:18px;font-weight:700;margin-bottom:12px;">${title}</div>
        <div style="color:#aaa;font-size:13px;line-height:1.6;margin-bottom:24px;">${message}</div>
        <button id="apk-popup-btn" style="background:${color};color:#fff;border:none;padding:12px 32px;border-radius:8px;font-weight:700;cursor:pointer;width:100%;">TUTUP</button>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById("apk-popup-btn").onclick = () => overlay.remove();
  }

  async function checkSession() {
    const token = localStorage.getItem("user_token");
    if (!token) return; // belum login, biarkan halaman login

    try {
      const t = JSON.parse(token);
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: t.username,
          password: t.password,
          hwid: getHwid()
        })
      });
      const data = await res.json();

      if (data.maintenance) {
        showPopup("MAINTENANCE", data.message || "Server maintenance", "#f59e0b");
        return;
      }

      if (!data.valid) {
        showPopup("ACCESS DENIED", data.message || "Token expired", "#ef4444");
        // Hapus token kalau invalid
        localStorage.removeItem("user_token");
        setTimeout(() => location.reload(), 5000);
        return;
      }

      // Update sisa hari
      t.sisa_hari = data.user.sisa_hari;
      t.expiry = data.user.expiry;
      localStorage.setItem("user_token", JSON.stringify(t));

      // Tampilkan pesan dari admin
      if (data.messages && data.messages.length > 0) {
        const msg = data.messages[data.messages.length - 1];
        const color = msg.type === "warning" ? "#ef4444" : msg.type === "update" ? "#0ea5e9" : "#f59e0b";
        showPopup(msg.type.toUpperCase(), msg.content, color);
      }

    } catch (e) {
      console.error("Error cek session:", e);
    }
  }

  // Auto-check setiap kali halaman selesai load
  window.addEventListener("load", () => setTimeout(checkSession, 1000));
})();
