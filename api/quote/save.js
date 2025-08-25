// api/quote/save.js
import { PrismaClient, Prisma } from "@prisma/client";
import { customAlphabet } from "nanoid/non-secure";

const prisma = new PrismaClient();
// short UID leggibile (A-Z + 0-9 senza ambiguità), 10-12 char
const nanoid = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 12);

function ok(res, body, origin) {
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  return res.status(200).json(body);
}
function err(res, code, body, origin) {
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  return res.status(code).json(body);
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  if (req.method === "OPTIONS") return ok(res, { ok: true }, origin);
  if (req.method !== "POST")
    return err(res, 405, { error: "Method not allowed" }, origin);

  try {
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
    if (!clientKey || !quoteText)
      return err(res, 400, { error: "Missing clientKey or quoteText" }, origin);

    // 1) client
    const client = await prisma.client.findFirst({
      where: { embedKey: clientKey, status: "active" },
    });
    if (!client) return err(res, 401, { error: "Invalid clientKey" }, origin);

    // 2) CORS restrittivo se configurato
    const allowed = Array.isArray(client.allowedOrigins)
      ? client.allowedOrigins
      : [];
    if (allowed.length && origin && !allowed.includes(origin)) {
      return err(res, 403, { error: "Origin not allowed" }, origin);
    }

    // 3) estrai totali (gestisci decimal come string/Decimal)
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
      jsonFinal: finalJson || Prisma.JsonNull,
      chatHistory: chatHistory || Prisma.JsonNull,

      status: "final",
      ip,
      userAgent: ua,
    };

    const created = await prisma.quote.create({ data });
    return ok(res, { id: created.id, uid: created.uid }, origin);
  } catch (e) {
    console.error("quote/save error:", e);
    return err(res, 500, { error: "Server error" }, origin);
  }
}
