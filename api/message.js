const store = {};

export default async function handler(req, res) {
  const method = req.method;

  if (method === "GET") {
    const messages = store.messages || [];
    return res.json({ success: true, messages });
  }

  if (method === "POST") {
    const { target, type, content } = req.body;
    if (!content || !target) return res.status(400).json({ success: false, message: "Data tidak lengkap" });
    let messages = store.messages || [];
    const newMsg = {
      id: Date.now().toString(),
      target, type: type || "info", content,
      timestamp: new Date().toISOString()
    };
    messages.push(newMsg);
    if (messages.length > 100) messages = messages.slice(-100);
    store.messages = messages;
    return res.json({ success: true, message: "Pesan terkirim", data: newMsg });
  }

  if (method === "DELETE") {
    const id = req.query.id;
    let messages = store.messages || [];
    messages = messages.filter(m => m.id !== id);
    store.messages = messages;
    return res.json({ success: true, message: "Pesan dihapus" });
  }

  res.status(400).json({ success: false, message: "Method not allowed" });
}
