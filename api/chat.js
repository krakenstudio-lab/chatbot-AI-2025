const ChatbotClient =
  process.env.NODE_ENV === "production"
    ? require("../src/clients/ChatbotClient")
    : require("../src/clients/MockChatbotClient");

const client = new ChatbotClient(process.env.OPENAI_API_KEY);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const config = { maxDuration: 30, memory: 512 };

// opzionale: restringi ai tuoi domini
const ALLOWED_ORIGINS = [
  "https://vesewebdev.it",
  "https://www.vesewebdev.it",
  "https://chat.krakenstudio.it",
];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    // in alternativa, apri a tutti: res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    // rispondi OK al preflight
    return res.status(204).end();
  }

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
