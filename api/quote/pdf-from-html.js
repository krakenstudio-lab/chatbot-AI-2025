// api/quote/pdf-from-html.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const config = { maxDuration: 60, memory: 1024 };

// ===== CORS base =====
const ALLOWED_ORIGINS = [
  "https://vesewebdev.it",
  "https://www.vesewebdev.it",
  "https://chat.krakenstudio.it",
];

function setCors(req, res) {
  const origin = req.headers.origin || "";
  const reqHeaders = req.headers["access-control-request-headers"];

  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Vary", "Origin, Access-Control-Request-Headers");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    reqHeaders || "Content-Type, Authorization"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
}

// ===== Prisma lazy =====
let __prisma = null;
async function getPrisma() {
  if (__prisma) return __prisma;
  const mod = await import("@prisma/client");
  __prisma = new mod.PrismaClient();
  return __prisma;
}

// ===== PDF helper (CJS) via default import =====
import pdfHelper from "../../src/pdf/generateQuotePdfFromHtml.js";
const { generateQuotePdfFromHtml } = pdfHelper;

// ===== utils =====
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

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST" });

  try {
    const { customer, quoteText, meta, quoteId, filename } = req.body || {};
    if (!customer || typeof quoteText !== "string" || !quoteText.trim()) {
      return res
        .status(400)
        .json({ error: "Servono `customer` e `quoteText`." });
    }

    // normalizza filename: passiamo al renderer un nome SENZA .pdf; lui la aggiunge se manca
    const baseName =
      filename && String(filename).trim() !== ""
        ? String(filename)
            .trim()
            .replace(/\.pdf$/i, "")
        : `preventivo-${toSafeSlug(customer.name)}`;

    // Stream PDF (se va a buon fine, gli header sono già inviati)
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
      filename: baseName,
    });

    // Best-effort: aggiorna stato preventivo dopo l'invio
    if (quoteId) {
      try {
        const prisma = await getPrisma();
        await prisma.quote.update({
          where: { id: String(quoteId) },
          data: { status: "pdf_generated", pdfGeneratedAt: new Date() },
        });
      } catch (e) {
        console.warn("Impossibile aggiornare lo stato del preventivo:", e);
      }
    }
    return;
  } catch (err) {
    console.error("Errore /api/quote/pdf-from-html:", err);
    if (!res.headersSent) {
      return res.status(500).json({
        error: "Errore nella generazione del PDF (HTML)",
        details: String(err?.message || err),
      });
    }
  }
}
