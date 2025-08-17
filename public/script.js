// public/script.js

const chatWindow = document.getElementById("chatWindow");
const promptInput = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");
const chatModal = document.getElementById("chatModal");
const chatLauncher = document.getElementById("chatLauncher");
const chatClose = document.getElementById("chatClose");

const API_BASE = window.CHAT_API_BASE || "";

// System prompt: intervista -> preventivo testuale (niente JSON)
const systemPrompt = {
  role: "system",
  content: `
Sei un assistente per preventivi di una web agency. Parli in italiano in modo chiaro e professionale.

FLOW
- Fai 3–4 domande di chiarimento. Priorità:
  1) WordPress o custom? 2) E-commerce sì/no (e range prodotti)? 
  3) Funzionalità chiave (blog, contatti, newsletter, recensioni, multilingua, area riservata). 
  4) Numero pagine, lingue, deadline e budget (anche range).
- Se l’utente è sbrigativo, mantieni almeno 2 domande (e-commerce? pagine/lingue?).
- Quando hai info sufficienti, proponi il pacchetto più adatto (Start/Pro/Leader). Se utile, proponi 1 alternativa con differenze chiare.

PACCHETTI (caratteristiche di default)
- Start (1.500 €): Sito vetrina leggero, 1 pagina, 1 lingua, Area Servizi, Galleria foto, Contatti, Social, fino a 3 email, 2 GB spazio server. Perfetto per: piccolo imprenditore, budget definito, consegna rapida, sito veloce.
- Pro (2.500 €): 5 pagine, 1 lingua, Area Servizi, Galleria Instagram, Contatti, Social, fino a 10 email, 4 GB spazio server, Newsletter, Blog, Recensioni, Testi scritti da noi. Per PMI che vogliono più pagine e copertura SEO base.
- Leader (da 4.000 €): Pagine da definire, Multilingua, Blocco Servizi, Galleria Foto/Instagram, Contatti, Social, email illimitate, 6 GB spazio server, Newsletter, Blog, Recensioni, Copywriting, Area riservata. Massima personalizzazione e scalabilità.

PERCHÉ REALIZZARE QUESTI PACCHETTI (copy di riferimento)
- Start — perché:
  • Un sito professionale oggi è fondamentale per presentarsi al meglio, superare la concorrenza e raggiungere clienti in target.
  • Molte realtà non hanno un sito e perdono opportunità: Start ti rende subito presente online con rapidità e semplicità.
- Pro — perché:
  • È perfetto per presentarsi in modo professionale, comunicando valori e servizi con più pagine organizzate.
  • Più pagine = più spazio per differenziare servizi/prodotti e lavorare meglio su SEO e conversioni.
  • Se vuoi fare la differenza online e sentirti “un vero Pro”, questo è il passo giusto.
- Leader — perché:
  • Per aziende/imprenditori che vogliono il massimo e amano distinguersi.
  • Prodotto di altissima qualità, 100% su misura (come un abito sartoriale).
  • Funzioni aggiuntive anche ad hoc per performare “a tutto gas” su esigenze specifiche (integrazioni, area riservata, workflow).

ISTRUZIONE DI PRESENTAZIONE “PERCHÉ SCEGLIERLO”
- Quando consigli un pacchetto nel PREVENTIVO COMPLETO, inserisci una mini-sezione “Perché scegliere questo pacchetto” con 2–4 bullet tratti/adattati dal copy sopra, contestualizzati sull’uso del cliente.

PREZZI
- Emetti preventivi attorno a: Start 1.500 €, Pro 2.500 €, Leader 4.000 €+.
- Adatta +/- 10% secondo complessità: più pagine, multilingua, e-commerce, area riservata, integrazioni esterne, SEO avanzata, contenuti da produrre.
- Mostra cifre in EUR con formattazione italiana (es. 2.500,00 €). Specifica che i prezzi sono IVA esclusa, salvo diversa indicazione.

USCITA FINALE (quando sei pronto a quotare)
- Titolo: "PREVENTIVO COMPLETO".
- Sezioni (bullet points):
  • Riepilogo esigenza/contesto (2 righe).
  • “Perché scegliere questo pacchetto” (2–4 bullet).
  • Pacchetto consigliato (Start/Pro/Leader) + eventuale alternativa.
  • Elenco voci con prezzi riga per riga (setup, sviluppo, contenuti, integrazioni, hosting/maintenance).
  • Tempi di consegna indicativi: Start 7–14 gg lavorativi; Pro 2–3 settimane; Leader 4–8 settimane (in base a materiali).
  • Termini di pagamento (esempio: 50% anticipo, 50% saldo a collaudo) e validità offerta 30 giorni.
  • Note/Assunzioni.
- Totale finale in evidenza (IVA inclusa). Se utile, aggiungi sconto o range.

SEGNALE PER FRONTEND (MOSTRARE BOTTONE PDF SOLO QUANDO PRONTO)
- SOLO quando pubblichi il preventivo definitivo, chiudi il messaggio con un blocco JSON in un fence \`\`\`json (nessun altro JSON nella conversazione) con:
  {
    "pdfReady": true,
    "package": "Start|Pro|Leader",
    "subtotal": number,
    "discount": number|null,
    "total": number,
    "currency": "EUR",
    "deliveryTime": "string",
    "validityDays": 30
  }

TONO E FORMATO
- Professionale ma semplice; niente gergo superfluo; bullets chiari.
- Se mancano dati critici (es. n. pagine), esplicita le assunzioni usate per quotare.
- Non parlare di “prompt” o dettagli interni.

REGOLE DI CHIUSURA
- Se hai già consigliato un pacchetto, NELLA STESSA RISPOSTA passa subito all’USCITA FINALE con titolo "PREVENTIVO COMPLETO" e chiudi con il blocco JSON richiesto.
- NON chiedere altre conferme: quando ritieni di avere abbastanza info, produci direttamente il PREVENTIVO COMPLETO con totale e JSON finale.
`,
};

let chatHistory = [];
let lastAssistantText = null; // verrà settato SOLO se il messaggio AI sembra un preventivo finale
let showCustomerForm = false;

function openChat() {
  chatModal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden"); // blocca lo scroll sotto
  setTimeout(() => promptInput?.focus(), 0);
}
function closeChat() {
  chatModal.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

// Estrae il blocco ```json finale dal testo AI
function extractFinalJsonBlock(text) {
  if (!text) return null;
  const m = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

// Heuristica: il testo AI sembra un preventivo finale con prezzi
function shouldEnablePdf(text) {
  if (!text) return false;
  const meta = extractFinalJsonBlock(text);
  if (meta?.pdfReady === true) return true; // segnale forte
  if (/PREVENTIVO COMPLETO/i.test(text)) return true; // testo chiave
  return isLikelyFinalQuote(text); // fallback euristico
}

function isLikelyFinalQuote(text) {
  if (!text) return false;
  const hasTotal = /totale\s*[:\-–]\s*€?\s*\d[\d.,]*/i.test(text);
  const hasCurrencyPrice =
    /(€\s*\d[\d.,]*)|(\b\d[\d.,]*\s*(?:€|euro|eur)\b)/i.test(text);
  const hasBullets = /(^|\n)\s*[-•]/.test(text);
  const hasDelivery = /(tempi|consegna|giorni|lavorativ)/i.test(text);
  return hasTotal || (hasCurrencyPrice && (hasBullets || hasDelivery));
}

function renderChat() {
  chatWindow.innerHTML = "";

  for (const msg of chatHistory) {
    const wrap = document.createElement("div");
    wrap.className =
      msg.role === "user" ? "flex justify-end" : "flex justify-start";

    const bubble = document.createElement("div");
    bubble.className = [
      "max-w-[75%]",
      "px-4",
      "py-2",
      "rounded-lg",
      "break-words",
      msg.role === "user"
        ? "bg-blue-500 text-white rounded-br-none"
        : "bg-gray-200 text-gray-800 rounded-bl-none",
    ].join(" ");
    bubble.textContent = msg.content;
    wrap.appendChild(bubble);
    chatWindow.appendChild(wrap);
  }

  // Mostra azione PDF solo se l'ultimo messaggio AI è un preventivo finale con prezzi
  if (lastAssistantText) {
    const actions = document.createElement("div");
    actions.className = "mt-3 flex justify-end gap-2";
    const useBtn = document.createElement("button");
    useBtn.className =
      "bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded";
    useBtn.textContent = "Usa questo preventivo → PDF";
    useBtn.onclick = () => {
      showCustomerForm = true;
      renderChat();
    };
    actions.appendChild(useBtn);
    chatWindow.appendChild(actions);
  }

  if (showCustomerForm) {
    chatWindow.appendChild(buildCustomerForm());
  }

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function extractLastJsonBlock(text) {
  if (!text) return null;
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (let i = blocks.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(blocks[i][1]);
    } catch {}
  }
  return null;
}
function parseEuroToNumber(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v !== "string") return null;
  const n = Number(v.replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function normalizeMeta(meta, text) {
  const m = meta ? { ...meta } : {};
  m.subtotal = parseEuroToNumber(m.subtotal);
  m.discount = parseEuroToNumber(m.discount);
  m.total = parseEuroToNumber(m.total);
  if (!m.package) {
    const hit = String(text).match(/\b(Start|Pro|Leader)\b/i);
    if (hit)
      m.package = hit[1][0].toUpperCase() + hit[1].slice(1).toLowerCase();
  }
  return m;
}

// Trova numeri dopo etichette (Totale/Subtotale/Sconto), ignora % e intervalli tipo 7-10
function findNumberAfter(labelRegex, text) {
  const re = new RegExp(
    labelRegex +
      "\\s*[:\\-–]?\\s*(?:\\*\\*|__)?\\s*€?\\s*([\\d\\.,]+)(?!\\s*%)(?!\\s*-)",
    "i"
  );
  const m = String(text).match(re);
  return m ? parseEuroToNumber(m[1]) : null;
}

// Somma voci tipo "- Setup: 1.500,00 €" o "• **Setup**: 1.500,00 €" anche inline
function sumLineItems(text) {
  const re =
    /(?:^|\n|\s)[-•]\s*(?:\*\*|__)?[^:\n]+?(?:\*\*|__)?\s*:\s*([0-9][0-9\.,]*)\s*(?:€|euro)\b/gi;
  let sum = 0,
    hit = false,
    m;
  while ((m = re.exec(text))) {
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

function buildCustomerForm() {
  const box = document.createElement("div");
  box.className = "mt-4 p-4 bg-white border border-gray-300 rounded-lg";

  box.innerHTML = `
    <h3 class="font-semibold mb-3">Dati cliente per generare il PDF</h3>
    <div class="grid grid-cols-1 gap-2">
      <input id="c_name"    class="p-2 border rounded" placeholder="Nome e Cognome *" />
      <input id="c_company" class="p-2 border rounded" placeholder="Azienda (opzionale)" />
      <input id="c_email"   class="p-2 border rounded" placeholder="Email *" />
      <input id="c_phone"   class="p-2 border rounded" placeholder="Telefono" />
      <input id="c_address" class="p-2 border rounded" placeholder="Indirizzo" />
      <input id="c_vat"     class="p-2 border rounded" placeholder="P. IVA (opzionale)" />
      <input id="c_tax"     class="p-2 border rounded" placeholder="Codice Fiscale (opzionale)" />
    </div>
    <div class="text-right mt-3">
      <button id="btnPdf" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded">
        Genera PDF
      </button>
    </div>
  `;

  setTimeout(() => {
    const btn = box.querySelector("#btnPdf");
    btn?.addEventListener("click", async () => {
      const customer = {
        name: box.querySelector("#c_name")?.value?.trim(),
        company: box.querySelector("#c_company")?.value?.trim(),
        email: box.querySelector("#c_email")?.value?.trim(),
        phone: box.querySelector("#c_phone")?.value?.trim(),
        address: box.querySelector("#c_address")?.value?.trim(),
        vatId: box.querySelector("#c_vat")?.value?.trim(),
        taxCode: box.querySelector("#c_tax")?.value?.trim(),
      };
      if (!customer.name || !customer.email)
        return alert("Nome e Email sono obbligatori.");
      if (!lastAssistantText) return alert("Nessun preventivo trovato.");

      const rawMeta = extractLastJsonBlock(lastAssistantText);
      let meta = normalizeMeta(rawMeta, lastAssistantText);

      // Se il JSON manca o è incompleto, calcola dai testi
      if (!Number.isFinite(meta?.subtotal) || !Number.isFinite(meta?.total)) {
        const auto = buildMetaFromText(lastAssistantText);
        meta = {
          ...meta,
          subtotal: Number.isFinite(meta?.subtotal)
            ? meta.subtotal
            : auto.subtotal,
          discount: Number.isFinite(meta?.discount)
            ? meta.discount
            : auto.discount ?? 0,
          total: Number.isFinite(meta?.total) ? meta.total : auto.total,
        };
      }

      try {
        btn.disabled = true;
        const oldTxt = btn.textContent;
        btn.textContent = "Generazione…";

        // HTML + Tailwind
        const res = await fetch(`${API_BASE}/api/quote/pdf-from-html`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer,
            quoteText: lastAssistantText,
            meta,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || res.statusText);
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `preventivo-${(customer.name || "cliente").replace(
          /[^a-z0-9-_]+/gi,
          "_"
        )}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        btn.textContent = oldTxt;
        btn.disabled = false;
      } catch (e) {
        btn.disabled = false;
        btn.textContent = "Genera PDF";
        alert("Errore nella generazione del PDF: " + e.message);
      }
    });
  }, 0);

  return box;
}

sendBtn.addEventListener("click", onSend);
promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onSend();
});

chatLauncher?.addEventListener("click", openChat);
chatClose?.addEventListener("click", closeChat);

// chiudi cliccando sull'overlay
chatModal?.addEventListener("click", (e) => {
  if (e.target?.dataset?.close === "true") closeChat();
});

// chiudi con ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !chatModal.classList.contains("hidden")) {
    closeChat();
  }
});

async function onSend() {
  const text = promptInput.value.trim();
  if (!text) return alert("Inserisci un messaggio!");

  // Ogni nuovo input utente azzera il preventivo mostrato
  chatHistory.push({ role: "user", content: text });
  lastAssistantText = null;
  showCustomerForm = false;
  renderChat();
  promptInput.value = "";

  const messages = chatHistory.slice();
  if (messages[0]?.role !== "system") messages.unshift(systemPrompt);

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);

    const aiText = data.content ?? "";
    chatHistory.push({ role: "assistant", content: aiText });

    // SOLO se sembra un preventivo finale con prezzi, abilita il bottone PDF
    if (shouldEnablePdf(aiText)) {
      lastAssistantText = aiText;
    }

    renderChat();
  } catch (err) {
    chatHistory.push({
      role: "assistant",
      content: `❌ Errore: ${err.message}`,
    });
    renderChat();
  }
}
