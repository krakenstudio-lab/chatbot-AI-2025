// api/chat.js
const ChatbotClient =
  process.env.NODE_ENV === "production"
    ? require("../src/clients/ChatbotClient")
    : require("../src/clients/MockChatbotClient");

const openaiClient = new ChatbotClient(process.env.OPENAI_API_KEY);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const config = { maxDuration: 30, memory: 512 };

// opzionale: restringi ai tuoi domini
const ALLOWED_ORIGINS = [
  "https://vesewebdev.it",
  "https://www.vesewebdev.it",
  "https://chat.krakenstudio.it",
  "http://localhost:3000",
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

// ===== Prisma lazy (solo quando serve) =====
let __prisma = null;
async function getPrisma() {
  if (__prisma) return __prisma;
  const mod = await import("@prisma/client");
  __prisma = new mod.PrismaClient();
  return __prisma;
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
    const { messages, clientKey } = req.body || {};
    if (!Array.isArray(messages)) {
      return res
        .status(400)
        .json({ error: "`messages` deve essere un array." });
    }

    // ---- Gate: client disabilitato o inesistente -> offline message ----
    if (clientKey) {
      try {
        const prisma = await getPrisma();
        const client = await prisma.client.findFirst({
          where: { embedKey: String(clientKey) },
          select: { status: true },
        });

        if (!client || client.status === "disabled") {
          return res.status(200).json({
            role: "assistant",
            content:
              "Chatbot attualmente fuori servizio. Ci scusiamo per il disagio.",
          });
        }
      } catch (e) {
        // In caso di errore DB, fail-closed (meglio bloccare che rispondere col modello)
        console.warn("Client status check failed:", e);
        return res.status(200).json({
          role: "assistant",
          content:
            "Chatbot attualmente fuori servizio. Ci scusiamo per il disagio.",
        });
      }
    }
    // -------------------------------------------------------------------

    const reply = await openaiClient.sendMessage(messages);
    return res.status(200).json(reply);
  } catch (err) {
    console.error("Errore /api/chat:", err);
    return res.status(500).json({ error: "Errore interno al chatbot" });
  }
}
