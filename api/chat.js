// api/chat.js
const ChatbotClient =
  process.env.NODE_ENV === "production"
    ? require("../src/clients/ChatbotClient")
    : require("../src/clients/MockChatbotClient");

const client = new ChatbotClient(process.env.OPENAI_API_KEY);

export const config = {
  maxDuration: 30,
  memory: 512,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Usa POST" });
  }
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages)) {
      return res
        .status(400)
        .json({ error: "`messages` deve essere un array." });
    }
    const reply = await client.sendMessage(messages);
    return res.status(200).json(reply);
  } catch (err) {
    console.error("Errore /api/chat:", err);
    return res.status(500).json({ error: "Errore interno al chatbot" });
  }
}
