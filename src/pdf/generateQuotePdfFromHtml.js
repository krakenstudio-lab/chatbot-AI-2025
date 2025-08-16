// src/pdf/generateQuotePdfFromHtml.js
const isVercel = !!process.env.VERCEL;

// Usa puppeteer-core + chromium su Vercel, puppeteer classico in locale/VPS
const puppeteer = isVercel ? require("puppeteer-core") : require("puppeteer");
const chromium = isVercel ? require("@sparticuz/chromium") : null;

const { renderQuoteHtml } = require("./renderQuoteHtml");

async function launchBrowser() {
  if (isVercel) {
    const executablePath = await chromium.executablePath();
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });
  } else {
    return puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: "new",
    });
  }
}

/**
 * Renderizza l'HTML con Tailwind e risponde con un PDF (Buffer) senza usare il filesystem.
 * @param {object} res Express/Serverless response
 * @param {object} payload { agency, customer, quoteText, meta, filename }
 */
async function generateQuotePdfFromHtml(res, payload) {
  const browser = await launchBrowser();
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
