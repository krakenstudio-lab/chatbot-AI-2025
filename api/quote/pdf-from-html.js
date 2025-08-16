// api/quote/pdf-from-html.js
const {
  generateQuotePdfFromHtml,
} = require("../src/pdf/generateQuotePdfFromHtml");

export const config = {
  maxDuration: 60,
  memory: 1024,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Usa POST" });
  }
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
        logoUrl: process.env.AGENCY_LOGO_URL || "",
      },
      customer,
      quoteText,
      meta: meta || {},
      filename: `preventivo-${(customer.name || "cliente").toLowerCase()}`,
    });
  } catch (err) {
    console.error("Errore /api/quote/pdf-from-html:", err);
    return res
      .status(500)
      .json({ error: "Errore nella generazione del PDF (HTML)" });
  }
}
