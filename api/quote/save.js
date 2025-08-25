// api/quote/save.js
import { PrismaClient, Prisma } from "@prisma/client";
import { customAlphabet } from "nanoid/non-secure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const config = { maxDuration: 60, memory: 1024 };

const prisma = globalThis.__prisma || new PrismaClient();
if (!globalThis.__prisma) globalThis.__prisma = prisma;

const nanoid = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 12);

// Allow-list STATIC per la preflight (OPTIONS) — la POST avrà anche il check dinamico da DB
const ALLOWED_ORIGINS = [
  "https://vesewebdev.it",
  "https://www.vesewebdev.it",
  "https://chat.krakenstudio.it",
];

function setCors(req, res) {
  const origin = req.headers.origin || "";
  const reqHeaders = req.headers["access-control-request-headers"];

  // Per la preflight facciamo passare SEMPRE con ACAO valorizzato
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    // Non usiamo credenziali, quindi '*' va bene per sbloccare la preflight
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Vary", "Origin, Access-Control-Request-Headers");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    reqHeaders || "Content-Type, Authorization"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  // Per safety, esponiamo intestazioni utili (anche se qui non servono)
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
}

export default async function handler(req, res) {
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

    // 1) Client lookup
    const client = await prisma.client.findFirst({
      where: { embedKey: clientKey, status: "active" },
    });
    if (!client) return res.status(401).json({ error: "Invalid clientKey" });

    // 2) CORS dinamico sulla POST in base a allowedOrigins del client
    const allowed = Array.isArray(client.allowedOrigins)
      ? client.allowedOrigins
      : [];
    if (allowed.length && origin && !allowed.includes(origin)) {
      return res.status(403).json({ error: "Origin not allowed" });
    }

    // 3) Persist
    const t = finalJson || {};
    const toDec = (v) =>
      v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v);

    const data = {
      uid: nanoid(),
      client: { connect: { id: client.id } },
      customerName: customer?.name ?? null,
      customerEmail: customer?.email ?? null,
      customerPhone: customer?.phone ?? null,
      siteUrl: siteUrl ?? null,

      package: t.package ?? null,
      subtotal: toDec(t.subtotal),
      discount: toDec(t.discount),
      total: toDec(t.total),
      currency: t.currency ?? "EUR",
      deliveryTime: t.deliveryTime ?? null,
      validityDays: Number.isFinite(t.validityDays) ? t.validityDays : null,

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
