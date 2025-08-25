// api/quote/pdf-from-html.js
const {
  generateQuotePdfFromHtml,
} = require("../../src/pdf/generateQuotePdfFromHtml");
const { PrismaClient } = require("@prisma/client");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const config = { maxDuration: 60, memory: 1024 };

const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") global.__prisma = prisma;

const ALLOWED_ORIGINS = [
  "https://vesewebdev.it",
  "https://www.vesewebdev.it",
  "https://chat.krakenstudio.it",
];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function toSafeSlug(value, fallback = "cliente") {
  const base = String(value || fallback)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  return base
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Usa POST" });
  }

  try {
    const { customer, quoteText, meta, quoteId, filename } = req.body || {};
    if (!customer || typeof quoteText !== "string" || !quoteText.trim()) {
      return res
        .status(400)
        .json({ error: "Servono `customer` e `quoteText`." });
    }

    const safeName =
      filename && String(filename).trim() !== ""
        ? String(filename).trim()
        : `preventivo-${toSafeSlug(customer.name)}`;

    // 1) Genera e invia il PDF come risposta (Content-Disposition: attachment)
    await generateQuotePdfFromHtml(res, {
      agency: {
        name: process.env.AGENCY_NAME || "La tua Web Agency",
        email: process.env.AGENCY_EMAIL || "info@tua-agency.com",
        phone: process.env.AGENCY_PHONE || "+39 000 0000000",
        logoUrl: process.env.AGENCY_LOGO_URL || "",
      },
      customer,
      quoteText,
      meta: meta || {},
      filename: safeName,
    });

    // ATTENZIONE: a questo punto la risposta è stata inviata.
    // 2) Se ho un quoteId, aggiorno lo stato del preventivo -> pdf_generated
    if (quoteId) {
      try {
        await prisma.quote.update({
          where: { id: String(quoteId) },
          data: { status: "pdf_generated", pdfGeneratedAt: new Date() },
        });
      } catch (e) {
        // Non interrompere la funzione: il PDF è già stato inviato all'utente
        console.error("Impossibile aggiornare lo stato del preventivo:", e);
      }
    }
    // Non fare ulteriori res.* qui.
    return;
  } catch (err) {
    console.error("Errore /api/quote/pdf-from-html:", err);
    // Se non abbiamo ancora scritto la risposta, inviamo errore JSON
    if (!res.headersSent) {
      return res.status(500).json({
        error: "Errore nella generazione del PDF (HTML)",
        details: String(err?.message || err),
      });
    }
    // Se le intestazioni sono già state inviate, non possiamo più scrivere sul response.
  }
}
