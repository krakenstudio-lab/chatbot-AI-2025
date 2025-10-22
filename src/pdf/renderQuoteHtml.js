// src/pdf/renderQuoteHtml.js

function currency(n) {
  if (typeof n !== "number") return "-";
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

// Escaper lato server per evitare injection e caratteri rotti
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toNumber(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    // rimuovi spazi normali, NBSP, NARROW NBSP e simbolo €
    const cleaned = v
      .replace(/[\s\u00A0\u202F]/g, "")
      .replace(/€/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function sumLineItems(text) {
  const src = String(text);

  // pattern A: "€ 1.500,00" (valuta prima del numero)
  const reBefore =
    /(?:^|\n)\s*[-•–]\s*(?:\*\*|__)?[^:\n]+?(?:\*\*|__)?\s*(?:[:\-–]\s*)?(?:€|euro|EUR)\s*([0-9][\d\.,]*)(?!\s*%)(?!\s*-\s*\d)/gi;

  // pattern B: "1.500,00 €" (valuta dopo il numero)
  const reAfter =
    /(?:^|\n)\s*[-•–]\s*(?:\*\*|__)?[^:\n]+?(?:\*\*|__)?\s*(?:[:\-–]\s*)?([0-9][\d\.,]*)\s*(?:€|euro|EUR)\b(?!\s*%)(?!\s*-\s*\d)/gi;

  let sum = 0,
    hit = false,
    m;

  while ((m = reBefore.exec(src))) {
    const n = toNumber(m[1]);
    if (Number.isFinite(n)) {
      sum += n;
      hit = true;
    }
  }
  while ((m = reAfter.exec(src))) {
    const n = toNumber(m[1]);
    if (Number.isFinite(n)) {
      sum += n;
      hit = true;
    }
  }

  return hit ? sum : null;
}

function findMoneyAfter(labelRegex, text) {
  const re = new RegExp(
    "(?:\\*\\*|__)?\\s*(?:" +
      labelRegex +
      ")\\s*(?:\\*\\*|__)?\\s*[:\\-–]?\\s*€?\\s*([\\d\\.,]+)(?!\\s*%)(?!\\s*-)",
    "i"
  );
  const m = String(text).match(re);
  return m ? toNumber(m[1]) : null;
}

function totalsFromText(text) {
  const total = findMoneyAfter("totale(?:\\s*finale)?", text);
  const subtotal = findMoneyAfter("(?:sub\\s*totale|subtotale)", text);
  const discount = findMoneyAfter("sconto", text);
  return { subtotal, discount, total };
}

function stripFinalJsonBlock(s) {
  if (!s) return "";
  // rimuove l'ultimo blocco ```json ... ```
  return String(s)
    .replace(/```json[\s\S]*?```/i, "")
    .trim();
}

/**
 * Ritorna una stringa HTML stilata con Tailwind pronta per la stampa in PDF.
 * @param {object} params
 * @param {object} params.agency { name, email, phone, logoUrl? }
 * @param {object} params.customer { name, company, email, phone, address, vatId, taxCode }
 * @param {string} params.quoteText  Testo del preventivo (grezzo dall'AI)
 * @param {object} params.meta  JSON finale dell'AI: { pdfReady, package, subtotal, discount, total, currency, deliveryTime, validityDays }
 * @param {string} params.date  "DD/MM/YYYY"
 */

function extractFenceMeta(text) {
  const m = String(text).match(/```json\s*([\s\S]*?)\s*```/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function renderQuoteHtml({ agency, customer, quoteText, meta = {}, date }) {
  // Unisci meta esplicito + quello nel fence JSON (se presente)
  const fenceMeta = extractFenceMeta(quoteText || "") || {};
  meta = { ...meta, ...fenceMeta };

  // ❌ NIENTE inferenza Start/Pro/Leader: usa solo ciò che arriva dal meta/fence
  const pkg = meta.package || "—";

  // leggi numeri dal meta (anche se sono stringhe "1.500,00")
  let nSubtotal = toNumber(meta.subtotal);
  let nDiscount = toNumber(meta.discount);
  let nTotal = toNumber(meta.total);

  // fallback dal testo (etichette Subtotale/Sconto/Totale)
  const t = totalsFromText(quoteText || "");
  if (!Number.isFinite(nSubtotal) && Number.isFinite(t.subtotal))
    nSubtotal = t.subtotal;
  if (!Number.isFinite(nDiscount) && Number.isFinite(t.discount))
    nDiscount = t.discount;
  if (!Number.isFinite(nTotal) && Number.isFinite(t.total)) nTotal = t.total;

  // fallback: se manca il Subtotale ma ci sono righe con importi, prova a sommarle
  if (!Number.isFinite(nSubtotal)) {
    const itemsSum = sumLineItems(quoteText || "");
    if (Number.isFinite(itemsSum)) nSubtotal = itemsSum;
  }

  // default sconto = 0
  if (!Number.isFinite(nDiscount)) nDiscount = 0;

  // se manca il subtotale ma abbiamo il totale, ricavalo
  if (!Number.isFinite(nSubtotal) && Number.isFinite(nTotal)) {
    nSubtotal = nTotal + nDiscount;
  }

  // se manca il totale ma abbiamo il subtotale, calcolalo
  if (!Number.isFinite(nTotal) && Number.isFinite(nSubtotal)) {
    nTotal = nSubtotal - nDiscount;
  }

  const subtotal = Number.isFinite(nSubtotal) ? currency(nSubtotal) : "—";
  const discount = Number.isFinite(nDiscount) ? currency(nDiscount) : "—";
  const total = Number.isFinite(nTotal)
    ? currency(nTotal)
    : Number.isFinite(nSubtotal)
    ? currency(nSubtotal - nDiscount)
    : "—";

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Preventivo</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @media print { @page { margin: 18mm 14mm 20mm 14mm; } }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body class="text-slate-800">
  <div class="max-w-3xl mx-auto">
    <!-- Header -->
    <header class="flex items-start justify-between gap-6 border-b pb-4">
      <div class="flex items-center gap-3">
        ${
          agency?.logoUrl
            ? `<img src="${agency.logoUrl}" alt="logo" class="w-14 h-14 object-contain">`
            : ""
        }
        <div>
          <h1 class="text-xl font-semibold">${escapeHtml(
            agency?.name || "La tua Web Agency"
          )}</h1>
          <p class="text-xs text-slate-500">Email: ${escapeHtml(
            agency?.email || "-"
          )} — Tel: ${escapeHtml(agency?.phone || "-")}</p>
        </div>
      </div>
      <div class="text-right">
        <div class="text-[11px] uppercase tracking-wide text-slate-500">Documento</div>
        <div class="text-lg font-semibold">PREVENTIVO</div>
        <div class="text-xs text-slate-500">Data: ${escapeHtml(
          date ||
            new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })
        )}</div>
      </div>
    </header>

    <!-- Intestazioni -->
    <section class="grid grid-cols-2 gap-6 mt-6">
      <div class="p-4 rounded-xl border bg-slate-50">
        <div class="text-xs font-semibold text-slate-500 uppercase">Cliente</div>
        <div class="mt-1 text-sm">
          <div><span class="font-medium">Nome:</span> ${escapeHtml(
            customer?.name || "-"
          )}</div>
          ${
            customer?.company
              ? `<div><span class="font-medium">Azienda:</span> ${escapeHtml(
                  customer.company
                )}</div>`
              : ""
          }
          <div><span class="font-medium">Email:</span> ${escapeHtml(
            customer?.email || "-"
          )}</div>
          ${
            customer?.phone
              ? `<div><span class="font-medium">Telefono:</span> ${escapeHtml(
                  customer.phone
                )}</div>`
              : ""
          }
          ${
            customer?.address
              ? `<div><span class="font-medium">Indirizzo:</span> ${escapeHtml(
                  customer.address
                )}</div>`
              : ""
          }
          ${
            customer?.vatId
              ? `<div><span class="font-medium">P. IVA:</span> ${escapeHtml(
                  customer.vatId
                )}</div>`
              : ""
          }
          ${
            customer?.taxCode
              ? `<div><span class="font-medium">Cod. Fiscale:</span> ${escapeHtml(
                  customer.taxCode
                )}</div>`
              : ""
          }
        </div>
      </div>
      <div class="p-4 rounded-xl border">
        <div class="text-xs font-semibold text-slate-500 uppercase">Riepilogo</div>
        <div class="mt-2 text-sm">
          <div><span class="font-medium">Pacchetto consigliato:</span> ${escapeHtml(
            pkg
          )}</div>
          ${
            meta?.deliveryTime
              ? `<div><span class="font-medium">Tempi di consegna:</span> ${escapeHtml(
                  meta.deliveryTime
                )}</div>`
              : ""
          }
          ${
            meta?.validityDays
              ? `<div><span class="font-medium">Validità offerta:</span> ${String(
                  meta.validityDays
                )} giorni</div>`
              : ""
          }
        </div>
      </div>
    </section>

    <!-- Tabella economica (se meta presente) -->
    <section class="mt-6">
      <div class="text-sm font-semibold mb-2">Dettaglio economico</div>
      <div class="overflow-hidden rounded-xl border">
        <table class="w-full text-sm">
          <thead class="bg-slate-100">
            <tr>
              <th class="text-left py-2 px-3">Voce</th>
              <th class="text-right py-2 px-3">Importo</th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-t">
              <td class="py-2 px-3">Subtotale</td>
              <td class="py-2 px-3 text-right">${subtotal}</td>
            </tr>
            <tr class="border-t">
              <td class="py-2 px-3">Sconto</td>
              <td class="py-2 px-3 text-right">${discount}</td>
            </tr>
            <tr class="border-t bg-slate-50">
              <td class="py-3 px-3 font-semibold text-base">Totale (IVA esclusa)</td>
              <td class="py-3 px-3 text-right font-bold text-base">${total}</td>
            </tr>
          </tbody>
        </table>
      </div>
      ${
        meta?.currency && meta.currency !== "EUR"
          ? `<p class="text-[11px] text-slate-500 mt-1">Valuta: ${escapeHtml(
              meta.currency
            )}</p>`
          : ""
      }
    </section>

    <!-- Testo del preventivo (fallback completo) -->
    <section class="mt-6">
      <div class="text-sm font-semibold mb-2">Dettaglio tecnico / Note</div>
      <div class="text-[13px] leading-6 whitespace-pre-wrap border rounded-xl p-4">
        ${(() => {
          const cleaned = stripFinalJsonBlock(quoteText);
          return cleaned ? escapeHtml(cleaned) : "—";
        })()}
      </div>
    </section>

    <!-- Footer -->
    <footer class="text-center text-[11px] text-slate-500 mt-8 pt-4 border-t">
      Questo preventivo è stato generato automaticamente e potrà essere soggetto a revisione.
    </footer>
  </div>
</body>
</html>`;
}

module.exports = { renderQuoteHtml };
