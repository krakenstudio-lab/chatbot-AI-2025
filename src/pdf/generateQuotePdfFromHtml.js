// src/pdf/generateQuotePdfFromHtml.js
const { renderQuoteHtml } = require("./renderQuoteHtml");

async function generateQuotePdfFromHtml(
  res,
  { agency, customer, quoteText, meta, filename }
) {
  const html = renderQuoteHtml({ agency, customer, quoteText, meta });

  // Tentativo 1: ambiente serverless (Vercel, AWS Lambda)
  try {
    const chromium = await import("@sparticuz/chromium");
    const puppeteer = await import("puppeteer-core");

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(), // path al binario corretto
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}.pdf"`
    );
    return res.end(pdfBuffer);
  } catch (e1) {
    // Tentativo 2: ambiente “server” classico (VPS/Docker) con puppeteer normale
    try {
      const puppeteer = require("puppeteer");
      const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
      await browser.close();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}.pdf"`
      );
      return res.end(pdfBuffer);
    } catch (e2) {
      // Ultimo fallback (opzionale): usa il generatore PDF “testuale” così almeno consegni qualcosa
      // const { generateQuotePdfFromText } = require("./generateQuotePdfFromText");
      // return generateQuotePdfFromText(res, { agency, customer, text: stripHtml(quoteText), filename });

      // Se preferisci fallire esplicitamente:
      throw e2;
    }
  }
}

module.exports = { generateQuotePdfFromHtml };
