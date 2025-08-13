// src/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const ChatbotClient =
  process.env.NODE_ENV === "production"
    ? require("./clients/ChatbotClient")
    : require("./clients/MockChatbotClient");
const client = new ChatbotClient(process.env.OPENAI_API_KEY);

const { generateQuotePdfFromHtml } = require("./pdf/generateQuotePdfFromHtml");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// POST /api/chat
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "`messages` deve essere un array." });
  }
  try {
    const reply = await client.sendMessage(messages);
    res.json(reply);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore interno al chatbot" });
  }
});

app.post("/api/quote/pdf-from-html", async (req, res) => {
  try {
    const { customer, quoteText, meta } = req.body || {};
    if (!customer || typeof quoteText !== "string" || !quoteText.trim()) {
      return res
        .status(400)
        .json({ error: "Servono `customer` e `quoteText`." });
    }
    await generateQuotePdfFromHtml(res, {
      agency: {
        name: process.env.AGENCY_NAME || "La tua Web Agency",
        email: process.env.AGENCY_EMAIL || "info@tua-agency.com",
        phone: process.env.AGENCY_PHONE || "+39 000 0000000",
        logoUrl: process.env.AGENCY_LOGO_URL || "", // opzionale
      },
      customer,
      quoteText,
      meta: meta || {},
      filename: `preventivo-${(customer.name || "cliente").toLowerCase()}`,
    });
  } catch (err) {
    console.error("Errore /api/quote/pdf-from-html:", err);
    res.status(500).json({ error: "Errore nella generazione del PDF (HTML)" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(
    `Server avviato su http://localhost:${PORT} in modalità ${process.env.NODE_ENV}`
  );
});
