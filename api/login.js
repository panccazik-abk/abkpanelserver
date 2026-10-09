export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const { username, password } = req.body;
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "panccazik@gmail.com";
  const ADMIN_PASS = process.env.ADMIN_PASS || "Menteng10310";

  const isValid = (username === ADMIN_EMAIL && password === ADMIN_PASS);

  if (!isValid) {
    return res.status(401).json({ success: false, message: "Email atau password salah" });
  }

  const token = Buffer.from(username + ":" + Date.now()).toString("base64");
  res.json({ success: true, token, username });
}
