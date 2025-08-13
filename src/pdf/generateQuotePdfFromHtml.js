// src/pdf/generateQuotePdfFromHtml.js
const puppeteer = require("puppeteer");
const { renderQuoteHtml } = require("./renderQuoteHtml");

/**
 * Renderizza l'HTML con Tailwind e risponde con un PDF (Buffer) senza usare il filesystem.
 * @param {object} res Express response
 * @param {object} payload { agency, customer, quoteText, meta, filename }
 */
async function generateQuotePdfFromHtml(res, payload) {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const date = new Date().toLocaleDateString("it-IT");
    const html = renderQuoteHtml({
      agency: payload.agency,
      customer: payload.customer,
      quoteText: payload.quoteText,
      meta: payload.meta || {},
      date,
    });

    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", right: "14mm", bottom: "20mm", left: "14mm" },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${(payload.filename || "preventivo").replace(
        /[^a-z0-9-_]/gi,
        "_"
      )}.pdf"`
    );
    res.send(pdf);
  } finally {
    await browser.close();
  }
}

module.exports = { generateQuotePdfFromHtml };
