// api/quote/save.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const config = { maxDuration: 60, memory: 1024 };

// ===== CORS base (preflight sempre OK) =====
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
    // niente credenziali → '*' va bene per la preflight
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

// ===== Helpers parsing dal testo =====
function parseEuroToNumber(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const n = Number(
    v.replace(/\s/g, "").replace(/\./g, "").replace(",", ".").replace(/€/g, "")
  );
  return Number.isFinite(n) ? n : null;
}
function findNumberAfter(labelRegex, text) {
  const re = new RegExp(
    labelRegex +
      "\\s*[:\\-–]?\\s*(?:\\*\\*|__)?\\s*€?\\s*([\\d\\.,]+)(?!\\s*%)(?!\\s*-)",
    "i"
  );
  const m = String(text || "").match(re);
  return m ? parseEuroToNumber(m[1]) : null;
}
function sumLineItems(text) {
  const re =
    /(?:^|\n|\s)[-•]\s*(?:\*\*|__)?[^:\n]+?(?:\*\*|__)?\s*:\s*([0-9][0-9\.,]*)\s*(?:€|euro)\b/gi;
  let sum = 0,
    hit = false,
    m;
  while ((m = re.exec(String(text || "")))) {
    const n = parseEuroToNumber(m[1]);
    if (Number.isFinite(n)) {
      sum += n;
      hit = true;
    }
  }
  return hit ? sum : null;
}
function buildMetaFromText(text) {
  const subtotalFromLabel = findNumberAfter(
    "(?:sub\\s*totale|subtotale)",
    text
  );
  const discountFromLabel = findNumberAfter("sconto", text);
  const totalFromLabel = findNumberAfter("totale(?:\\s*finale)?", text);
  const itemsSum = sumLineItems(text);

  let subtotal = subtotalFromLabel ?? itemsSum;
  let discount = discountFromLabel ?? 0;
  let total = totalFromLabel;

  if (!Number.isFinite(total) && Number.isFinite(subtotal)) {
    total = subtotal - (Number.isFinite(discount) ? discount : 0);
  }
  if (
    Number.isFinite(total) &&
    Number.isFinite(subtotal) &&
    total < subtotal * 0.2
  ) {
    total = subtotal - (Number.isFinite(discount) ? discount : 0);
  }

  return {
    subtotal: Number.isFinite(subtotal) ? subtotal : null,
    discount: Number.isFinite(discount) ? discount : null,
    total: Number.isFinite(total) ? total : null,
  };
}
function inferPackageFromText(text) {
  const m = String(text || "").match(/\b(Start|Pro|Leader)\b/i);
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : null;
}

export default async function handler(req, res) {
  // CORS prima di tutto
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const origin = req.headers.origin || "";
    const ip = (
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      ""
    )
      .toString()
      .split(",")[0]
      .trim();
    const ua = req.headers["user-agent"] || "";

    const { clientKey, customer, quoteText, finalJson, siteUrl, chatHistory } =
      req.body || {};
    if (!clientKey || !quoteText) {
      return res.status(400).json({ error: "Missing clientKey or quoteText" });
    }

    // Prisma solo ora (dopo header CORS)
    const { prisma, Prisma } = await getPrisma();

    // 1) Client lookup
    const client = await prisma.client.findFirst({
      where: { embedKey: clientKey, status: "active" },
    });
    if (!client) return res.status(401).json({ error: "Invalid clientKey" });

    // 2) CORS dinamico sulla POST in base a allowedOrigins nel DB
    const allowed = Array.isArray(client.allowedOrigins)
      ? client.allowedOrigins
      : [];
    if (allowed.length && origin && !allowed.includes(origin)) {
      return res.status(403).json({ error: "Origin not allowed" });
    }

    // 3) Persist (con fallback: se manca JSON, inferisci dal testo)
    const t = finalJson || {};
    const guessed = buildMetaFromText(quoteText);
    const pkg = t.package || inferPackageFromText(quoteText);

    const toDec = (v) =>
      v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v);

    const data = {
      uid:
        Math.random().toString(36).slice(2, 7).toUpperCase() +
        Math.random().toString(36).slice(2, 7).toUpperCase(),
      client: { connect: { id: client.id } },

      // NB: qui spesso customer è null (verrà aggiornato al PDF)
      customerName: customer?.name ?? null,
      customerEmail: customer?.email ?? null,
      customerPhone: customer?.phone ?? null,
      siteUrl: siteUrl ?? null,

      package: pkg ?? null,
      subtotal: toDec(
        Number.isFinite(t.subtotal) ? t.subtotal : guessed.subtotal
      ),
      discount: toDec(
        Number.isFinite(t.discount) ? t.discount : guessed.discount
      ),
      total: toDec(Number.isFinite(t.total) ? t.total : guessed.total),
      currency: t.currency ?? "EUR",
      deliveryTime: t.deliveryTime ?? null,
      validityDays:
        Number.isFinite(t.validityDays) && t.validityDays >= 0
          ? t.validityDays
          : null,

      quoteText,
      jsonFinal: finalJson ?? Prisma.JsonNull,
      chatHistory: chatHistory ?? Prisma.JsonNull,

      status: "final",
      ip,
      userAgent: ua,
    };

    const created = await prisma.quote.create({ data });
    return res.status(200).json({ id: created.id, uid: created.uid });
  } catch (e) {
    console.error("quote/save error:", e);
    return res
      .status(500)
      .json({ error: "Server error", details: String(e?.message || e) });
  }
}
