// src/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// helpers locali
function sanitize(s = "") {
  return String(s).replace(/\s+/g, " ").replace(/[<>]/g, "");
}
function short(s = "", max = 220) {
  return s.length > max ? s.slice(0, max).trim() + "…" : s;
}

const ChatbotClient =
  process.env.NODE_ENV === "production"
    ? require("./clients/ChatbotClient")
    : require("./clients/MockChatbotClient");
const client = new ChatbotClient(process.env.OPENAI_API_KEY);

const { generateQuotePdfFromHtml } = require("./pdf/generateQuotePdfFromHtml");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" })); // preventivi lunghi + meta
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
    // importa: se la funzione ha inviato il PDF correttamente, esci
    return;
  } catch (err) {
    console.error("Errore /api/quote/pdf-from-html:", err);
    // In debug mostra anche il messaggio reale:
    res.status(500).json({
      error: "Errore nella generazione del PDF (HTML)",
      details: String(err?.message || err),
    });
  }
});

// POST /api/prompt/services  ← NUOVA ROTTA
app.post("/api/prompt/services", async (req, res) => {
  try {
    const {
      serviziClientId = null, // numero o null → include anche globali (idCliente NULL)
      user = null,
      language = "it",
    } = req.body || {};

    const servizi = await prisma.servizi.findMany({
      where: {
        flagActive: 1,
        OR: [
          serviziClientId != null ? { idCliente: serviziClientId } : undefined,
          { idCliente: null },
        ].filter(Boolean),
      },
      orderBy: { nome: "asc" },
      select: { nome: true, prezzo: true, descrizione: true },
    });

    // Lista pacchetti per il prompt + array semplice per il client
    const servicesList = servizi.map((s) => ({
      nome: sanitize(s.nome || ""),
      descrizione: sanitize(s.descrizione || ""),
      prezzo: sanitize(s.prezzo || ""),
    }));

    const catalogLines = servicesList.map((s) => {
      const parts = [`- ${s.nome}`];
      if (s.prezzo) parts.push(`Prezzo: ${s.prezzo}`);
      if (s.descrizione) parts.push(short(s.descrizione));
      return parts.join(" — ");
    });

    const userLine = user?.name
      ? `Questa sessione è avviata da "${user.name}"${
          user?.role ? ` (ruolo: ${user.role})` : ""
        }.`
      : `Questa sessione non fornisce dati utente.`;

    // 🔥 Prompt totalmente dinamico:
    const systemPrompt = [
      `Sei un assistente preventivi per una web agency. Rispondi in italiano, chiaro e professionale.`,
      userLine,
      ``,
      `OBIETTIVO A DUE FASI`,
      `- FASE 1 (intervista): raccogli i DATI MINIMI OBBLIGATORI.`,
      `- FASE 2 (output): quando hai tutti i dati, produci un PREVENTIVO COMPLETO.`,
      ``,
      `DATI MINIMI OBBLIGATORI (tutti e 3)`,
      `A) Piattaforma: WordPress o custom.`,
      `B) E-commerce: sì/no. Se sì: ordine di grandezza prodotti iniziali.`,
      `C) Pagine/lingue + 1–3 funzionalità chiave (blog, newsletter, recensioni, multilingua, area riservata).`,
      ``,
      `REGOLE INTERVISTA (vincolanti)`,
      `- Fai 2–3 domande mirate per coprire A/B/C.`,
      `- NON scrivere cifre e NON generare "PREVENTIVO COMPLETO" finché manca uno dei tre punti.`,
      `- Se l’utente dà info parziali, chiedi solo ciò che manca. Quando tutto è noto, passa alla FASE 2.`,
      ``,
      `=== PACCHETTI DISPONIBILI (dal database) ===`,
      catalogLines.length
        ? catalogLines.join("\n")
        : `(Nessun pacchetto disponibile)`,
      `===========================================`,
      ``,
      `LINEE GUIDA PREZZI`,
      `- Se "Prezzo" è indicato accanto al pacchetto, usalo come riferimento.`,
      `- Se manca, stima coerente in base a complessità (pagine, lingue, e-commerce, area riservata, integrazioni, contenuti).`,
      `- Prezzi in formato italiano. Assume IVA inclusa salvo diversa indicazione del cliente.`,
      ``,
      `STILE DI USCITA (solo in FASE 2)`,
      `- Niente tabelle, niente emoji, niente gergo.`,
      `- Voci economiche in bullet con trattino: "- Nome voce: 1.500,00 €" (numero PRIMA, poi "€", formato IT).`,
      `- Includi tempi e termini standard (range settimane), pagamenti 50%/50%, validità 30 giorni.`,
      ``,
      `STRUTTURA DEL PREVENTIVO FINALE (FASE 2)`,
      `Titolo: "PREVENTIVO COMPLETO"`,
      `Sezioni (ordine): Riepilogo → Perché → Pacchetto consigliato (+ eventuale alternativa) → Voci → Tempi → Termini → Note → Totale finale.`,
      ``,
      `REGOLE FINALI (obbligatorie)`,
      `- NON produrre il preventivo finché A, B, C non sono tutti coperti.`,
      `- Il campo "package" nel JSON DEVE essere **esattamente** uno dei nomi elencati sopra.`,
      `- Chiudi con **UNO e un solo** blocco \`\`\`json (numeri non formattati, valuta "EUR"):`,
      `{ "pdfReady": true, "package": "UnoDeiPacchettiElencati", "subtotal": number, "discount": number|null, "total": number, "currency": "EUR", "deliveryTime": "string", "validityDays": 30 }`,
      `- Il totale deve rispettare: totale = subtotale − sconto.`,
      `- NON inserire altri blocchi di codice o JSON oltre a quello finale.`,
      `- Se ti accorgi di non aver aggiunto il blocco JSON, **appendilo** subito in coda e **non scrivere altro dopo il JSON**.`,
    ].join("\n");

    res.json({
      systemPrompt,
      services: servicesList, // ← usiamo questa nel client
      serviceNames: servicesList.map((s) => s.nome), // ← comodità per matching
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(
    `Server avviato su http://localhost:${PORT} in modalità ${process.env.NODE_ENV}`
  );
});
