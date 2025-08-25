// api/quote/save.js
import { PrismaClient, Prisma } from "@prisma/client";
import { customAlphabet } from "nanoid/non-secure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const config = { maxDuration: 60, memory: 1024 };

const prisma = new PrismaClient();
const nanoid = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 12);

// Preflight allow-list (static) so OPTIONS succeeds even senza body/clientKey
const ALLOWED_ORIGINS = [
  "https://vesewebdev.it",
  "https://www.vesewebdev.it",
  "https://chat.krakenstudio.it",
];

function setCors(req, res) {
  const origin = req.headers.origin || "";
  const reqHeaders = req.headers["access-control-request-headers"];

  // Mirror only if in our allow-list (no "*", so creds are OK if ever needed)
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  res.setHeader("Vary", "Origin, Access-Control-Request-Headers");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    reqHeaders || "Content-Type, Authorization"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req, res) {
  setCors(req, res);

  // Important: answer preflight early with headers already set
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

    // 2) Dynamic CORS check based on client.allowedOrigins (POST only)
    const allowed = Array.isArray(client.allowedOrigins)
      ? client.allowedOrigins
      : [];
    if (allowed.length && origin && !allowed.includes(origin)) {
      // headers are already set by setCors; this 403 will be a normal fetch error (not a CORS error)
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
    return res.status(500).json({ error: "Server error" });
  }
}
