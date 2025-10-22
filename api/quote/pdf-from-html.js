// api/quote/pdf-from-html.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const config = { maxDuration: 60, memory: 1024 };

// ===== CORS base =====
const ALLOWED_ORIGINS = [
  "https://vesewebdev.it",
  "https://www.vesewebdev.it",
  "https://chat.krakenstudio.it",
  "http://localhost:3000",
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
let __PrismaNS = null;
async function getPrisma() {
  if (__prisma) return { prisma: __prisma, Prisma: __PrismaNS };
  const mod = await import("@prisma/client");
  __PrismaNS = mod.Prisma;
  __prisma = new mod.PrismaClient();
  return { prisma: __prisma, Prisma: __PrismaNS };
}

// ===== Import render HTML (CJS) =====
import renderHelper from "../../src/pdf/renderQuoteHtml.js";
const { renderQuoteHtml } = renderHelper;

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

async function makePdfBuffer(html) {
  try {
    const { default: chromium } = await import("@sparticuz/chromium");
    const { default: puppeteer } = await import("puppeteer-core");
    const executablePath = await chromium.executablePath();

    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        ...chromium.args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
      defaultViewport: chromium.defaultViewport ?? { width: 1280, height: 800 },
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();
    return pdfBuffer;
  } catch (e1) {
    console.error(
      "[PDF] serverless path failed, trying fallback:",
      e1?.stack || e1
    );
    const puppeteer = (await import("puppeteer")).default;
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();
    return pdfBuffer;
  }
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

    const baseName =
      filename && String(filename).trim() !== ""
        ? String(filename)
            .trim()
            .replace(/\.pdf$/i, "")
        : `preventivo-${toSafeSlug(customer.name)}`;
    const outName = `${baseName}.pdf`;

    // 1) HTML
    const html = renderQuoteHtml({
      agency: {
        name: process.env.AGENCY_NAME || "La tua Web Agency",
        email: process.env.AGENCY_EMAIL || "info@tua-agency.com",
        phone: process.env.AGENCY_PHONE || "+39 000 0000000",
        logoUrl: process.env.AGENCY_LOGO_URL || "",
      },
      customer,
      quoteText,
      meta: meta || {},
      date: new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }),
    });

    // 2) PDF buffer
    const pdfBuffer = await makePdfBuffer(html);

    // 3) Persist nel DB: customer + meta + PDF
    if (quoteId) {
      try {
        const { prisma, Prisma } = await getPrisma();
        const toDec = (v) =>
          v === null || v === undefined || v === ""
            ? null
            : new Prisma.Decimal(v);

        // salva PDF
        const stored = await prisma.storedPdfDb.create({
          data: {
            filename: outName,
            contentType: "application/pdf",
            bytes: pdfBuffer,
            size: pdfBuffer.length,
            chatId: null,
          },
        });

        // aggiorna quote
        await prisma.quote.update({
          where: { id: String(quoteId) },
          data: {
            customerName: customer?.name ?? null,
            customerEmail: customer?.email ?? null,
            customerPhone: customer?.phone ?? null,

            package: meta?.package ?? undefined,
            subtotal: Number.isFinite(meta?.subtotal)
              ? toDec(meta.subtotal)
              : undefined,
            discount: Number.isFinite(meta?.discount)
              ? toDec(meta.discount)
              : undefined,
            total: Number.isFinite(meta?.total) ? toDec(meta.total) : undefined,
            currency: meta?.currency ?? undefined,
            deliveryTime: meta?.deliveryTime ?? undefined,
            validityDays:
              Number.isFinite(meta?.validityDays) && meta.validityDays >= 0
                ? meta.validityDays
                : undefined,

            jsonFinal:
              meta && Object.keys(meta).length > 0 ? meta : Prisma.JsonNull,

            status: "pdf_generated",
            pdfGeneratedAt: new Date(),
            storedPdfId: stored.id,
          },
        });
      } catch (e) {
        console.warn("Persist PDF/Quote update failed:", e);
        // non interrompiamo la risposta PDF all'utente
      }
    }

    // 4) Risposta PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${outName}"`);
    return res.end(pdfBuffer);
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
