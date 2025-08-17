// src/pdf/generateQuotePdfFromHtml.js
const { renderQuoteHtml } = require("./renderQuoteHtml");

async function generateQuotePdfFromHtml(
  res,
  { agency, customer, quoteText, meta, filename }
) {
  const html = renderQuoteHtml({
    agency,
    customer,
    quoteText,
    meta,
    date: new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }),
  });

  // Tentativo 1: ambiente serverless (Vercel)
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
    // Evita di restare appeso su risorse esterne (CDN):
    await page.setContent(html, { waitUntil: "load" });

    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}.pdf"`
    );
    return res.end(pdfBuffer);
  } catch (e1) {
    console.error("[PDF] Serverless launch failed:", e1?.stack || e1);
    // (Facoltativo) Fallback locale solo su VPS/classic server:
    try {
      const puppeteer = require("puppeteer");
      const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
      await browser.close();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}.pdf"`
      );
      return res.end(pdfBuffer);
    } catch (e2) {
      console.error("[PDF] Fallback launch failed:", e2?.stack || e2);
      throw e2;
    }
  }
}

module.exports = { generateQuotePdfFromHtml };
