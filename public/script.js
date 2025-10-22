// public/script.js

const chatWindow = document.getElementById("chatWindow");
const promptInput = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");
const chatModal = document.getElementById("chatModal");
const chatLauncher = document.getElementById("chatLauncher");
const chatClose = document.getElementById("chatClose");

const API_BASE = window.CHAT_API_BASE || "";
const CLIENT_KEY = window.CHAT_CLIENT_KEY || null;

const SERVIZI_CLIENT_ID = window.SERVIZI_CLIENT_ID ?? null; // numero o null
// opzionale: setta l'utente loggato da fuori (Clerk o altro)
window.__chatUser = window.__chatUser || null;
// esempio: window.__chatUser = { name: "Giulia Rossi", role: "sales", provider: "clerk", providerId: "user_123" };

let __dynamicSystemPrompt = null;

async function loadDynamicSystemPrompt() {
  if (__dynamicSystemPrompt) return __dynamicSystemPrompt;
  const res = await fetch(`${API_BASE}/api/prompt/services`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      serviziClientId: SERVIZI_CLIENT_ID,
      user: window.__chatUser
        ? { name: window.__chatUser.name, role: window.__chatUser.role }
        : null,
      language: "it",
    }),
  });
  if (!res.ok) {
    console.warn("Dynamic prompt fallback to static. HTTP", res.status);
    return (__dynamicSystemPrompt = DEFAULT_STATIC_PROMPT()); // fallback
  }
  const data = await res.json();
  console.log(
    "[prompt/services] caricata systemPrompt, lunghezza:",
    (data.systemPrompt || "").length
  );
  return (__dynamicSystemPrompt = data.systemPrompt || DEFAULT_STATIC_PROMPT());
}

// fallback in caso l’endpoint non risponda
function DEFAULT_STATIC_PROMPT() {
  return `
Sei un assistente preventivi per una web agency. Rispondi in italiano, chiaro e professionale.
(backup statico)`;
}

let chatHistory = [];
let lastAssistantText = null; // verrà settato SOLO se il messaggio AI sembra un preventivo finale
let showCustomerForm = false;

const WELCOME_TEXT = `Ciao! 👋
Ti aiuto a preparare un PREVENTIVO COMPLETO per il tuo sito.
Dimmi in poche parole cosa ti serve (es. vetrina, blog, e-commerce).
Se preferisci, posso farti 2-3 domande rapide per arrivare subito al preventivo.`;

let hasWelcomed = false;

let isThinking = false;

// CSS minimale per l'animazione "..." (iniettato a runtime)
(function addLoaderCss() {
  const css = `
  .typing { display:inline-block; vertical-align:baseline; }
  .typing .dot { display:inline-block; margin:0 2px; opacity:0.25; animation: blink 1.2s infinite ease-in-out; }
  .typing .dot:nth-child(2){ animation-delay: .2s; }
  .typing .dot:nth-child(3){ animation-delay: .4s; }
  @keyframes blink { 0%,80%,100%{opacity:.25} 40%{opacity:1} }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();

function openChat() {
  chatModal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden"); // blocca lo scroll sotto
  setTimeout(() => promptInput?.focus(), 0);

  // Mostra il messaggio di benvenuto una sola volta
  if (!hasWelcomed) {
    chatHistory.push({ role: "assistant", content: WELCOME_TEXT });
    hasWelcomed = true;
    renderChat();
  }
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

  // 1) Canale "sicuro": JSON finale con pdfReady:true
  const metaJson = extractFinalJsonBlock(text);
  if (metaJson && metaJson.pdfReady === true && Number.isFinite(metaJson.total))
    return true;

  // 2) è davvero un preventivo? accetta titoli markdown o frasi tipo "preventivo completo"
  const hasTitleOrPhrase =
    /(^|\n)\s*(?:#{1,6}\s*)?PREVENTIVO COMPLETO\s*($|\n)/i.test(text) ||
    /\bpreventivo\s+completo\b/i.test(text); // es. "Ecco il preventivo completo ..."

  // 3) ha cifre: somma voci o trova "Totale/Costo totale"
  const auto = buildMetaFromText(text); // {subtotal, discount, total}
  const hasMoney =
    (Number.isFinite(auto.total) && auto.total > 0) ||
    (Number.isFinite(auto.subtotal) && auto.subtotal > 0);

  // 4) fallback robusto per "Totale" (tollerante a 'finale', grassetto, spazi, parentesi)
  const hasTotalLabel =
    /\b(?:Totale(?:\s*finale)?|Costo\s*totale)\b[^0-9\n]*\d[\d\.,]*\s*(?:€|euro|eur)?/i.test(
      text
    );

  // 5) ulteriore rete di sicurezza: eur + bullet/tempi consegna
  const heuristic = isLikelyFinalQuote(text);

  return (hasTitleOrPhrase && (hasMoney || hasTotalLabel)) || heuristic;
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

// --- HIDE JSON: rimuove fence ```json e anche blocchi { ... } con "pdfReady" a fine testo
function stripPdfMetaBlock(s) {
  if (!s) return "";
  let out = String(s);

  // fence ```json ... ``` completo
  out = out.replace(/```json[\s\S]*?```/gi, "");

  // fence ```json senza chiusura fino a fine stringa
  out = out.replace(/```json[\s\S]*$/i, "");

  // qualunque fence che contenga "pdfReady"
  out = out.replace(/```[\s\S]*?"pdfReady"\s*:[\s\S]*?```/gi, "");

  // trailing JSON non-fenced che contiene "pdfReady" (anche racchiuso da **)
  out = out.replace(
    /\*?\*?\s*\{\s*[\s\S]*?"pdfReady"\s*:[\s\S]*?\}\s*\*?\*?\s*$/i,
    ""
  );

  return out.trim();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// --- RENDER: bold + intestazioni + liste pulite
function renderAssistantHtml(raw) {
  // 0) rimuovi JSON finale
  let s = stripPdfMetaBlock(raw || "");

  // 1) escape tutto
  s = escapeHtml(s);

  // 2) **bold** / __bold__
  s = s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>");

  // 3) riga per riga → intestazioni, paragrafi, liste
  const lines = s.split(/\r?\n/);
  let html = "";
  let inList = false;

  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      html += '<div class="h-2"></div>';
      continue;
    }

    // righe che iniziano con '-' o '•'
    const m = line.match(/^[-•]\s+(.*)$/);
    if (m) {
      const body = m[1];

      // A) intestazione tipo "- <strong>Titolo:</strong>" o "- <strong>Titolo:</strong> testo"
      const h1 = body.match(/^<strong>([^<]+)<\/strong>\s*:\s*(.*)$/);
      if (h1) {
        const title = h1[1].trim();
        const rest = h1[2].trim();
        closeList();
        if (rest) {
          // esempio: "- <strong>Riepilogo esigenza/contesto:</strong> testo..."
          html += `<p><strong>${title}:</strong> ${rest}</p>`;
        } else {
          // esempio: "- <strong>Voci di costo:</strong>"
          html += `<div class="font-semibold mt-2">${title}:</div>`;
        }
        continue;
      }

      // B) vero bullet (es. costi o punti elenco del "Perché")
      if (!inList) {
        html += '<ul class="list-disc pl-5 space-y-1">';
        inList = true;
      }
      html += `<li>${body}</li>`;
      continue;
    }

    // C) riga normale → paragrafo
    closeList();
    html += `<p>${line}</p>`;
  }
  closeList();

  // 4) titolo "PREVENTIVO COMPLETO" come header se è la prima riga
  html = html.replace(
    /^<p>\s*PREVENTIVO COMPLETO\s*<\/p>/i,
    '<div class="font-semibold uppercase tracking-wide mb-1">PREVENTIVO COMPLETO</div>'
  );

  return html;
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
      "whitespace-pre-wrap",
      "leading-6",
      msg.role === "user"
        ? "bg-blue-500 text-white rounded-br-none"
        : "bg-gray-200 text-gray-800 rounded-bl-none",
    ].join(" ");
    if (msg.role === "assistant") {
      bubble.innerHTML = renderAssistantHtml(msg.content);
    } else {
      bubble.textContent = msg.content;
    }
    wrap.appendChild(bubble);
    chatWindow.appendChild(wrap);
  }

  // Mostra azione PDF solo se l'ultimo messaggio AI è un preventivo finale con prezzi
  const lastMsg = chatHistory[chatHistory.length - 1];
  if (
    lastAssistantText &&
    lastMsg?.role === "assistant" &&
    lastMsg.content === lastAssistantText
  ) {
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

  // Loader "assistant sta scrivendo..."
  if (isThinking) {
    const wrap = document.createElement("div");
    wrap.className = "flex justify-start";
    const bubble = document.createElement("div");
    bubble.className = [
      "max-w-[75%]",
      "px-4",
      "py-2",
      "rounded-lg",
      "break-words",
      "whitespace-pre-wrap",
      "leading-6",
      "bg-gray-200",
      "text-gray-800",
      "rounded-bl-none",
    ].join(" ");
    bubble.innerHTML = `Sto preparando la risposta
    <span class="typing"><span class="dot">●</span><span class="dot">●</span><span class="dot">●</span></span>`;
    wrap.appendChild(bubble);
    chatWindow.appendChild(wrap);
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
function stripFinalJsonBlock(s) {
  if (!s) return "";
  // rimuove SOLO l'ultimo blocco ```json ... ```
  return String(s)
    .replace(/```json[\s\S]*?```(?![\s\S]*```)/i, "")
    .trim();
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
  // match sia "- Voce: 1.234,00 €" che "Voce: 1.234,00 €"
  const re =
    /(^|\n)\s*(?:[-•]\s*)?[^:\n]+:\s*([0-9][0-9\.,]*)\s*(?:€|euro)\b/gi;
  let sum = 0,
    hit = false,
    m;
  while ((m = re.exec(text))) {
    const n = parseEuroToNumber(m[2] || m[1]); // per sicurezza
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
        const safeFilename = `preventivo-${(customer.name || "cliente")
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-_]+/g, "-")}.pdf`;

        const res = await fetch(`${API_BASE}/api/quote/pdf-from-html`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer,
            quoteText: lastAssistantText,
            meta,
            quoteId: window.__lastQuoteId || null, // <— IMPORTANTE
            filename: safeFilename, // <— opzionale: suggerisci nome file
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
        a.download = safeFilename;
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
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // blocca il newline
    onSend();
  }
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

async function saveQuoteIfFinal(aiText) {
  try {
    if (!CLIENT_KEY) return; // se non è impostata, esci
    if (!shouldEnablePdf(aiText)) return; // non è finale? esci

    const finalJson = extractFinalJsonBlock(aiText); // blocco ```json ... ```

    const payload = {
      clientKey: CLIENT_KEY,
      customer: null, // i dati cliente arrivano dopo, al PDF
      quoteText: aiText,
      finalJson,
      siteUrl: location.href,
      chatHistory: chatHistory.slice(-20), // opzionale: ultime N battute
    };

    const res = await fetch(`${API_BASE}/api/quote/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      window.__lastQuoteId = data.id; // usato poi in /api/quote/pdf-from-html
      window.__lastQuoteUid = data.uid;
    } else {
      // non bloccare il flusso utente se il salvataggio fallisce
      console.warn("saveQuoteIfFinal failed:", await res.text());
    }
  } catch (e) {
    console.warn("saveQuoteIfFinal error:", e);
  }
}

async function onSend() {
  if (isThinking) return; // evita invii multipli mentre l'AI elabora

  const text = promptInput.value.trim();
  if (!text) return alert("Inserisci un messaggio!");

  chatHistory.push({ role: "user", content: text });
  lastAssistantText = null;
  showCustomerForm = false;
  promptInput.value = "";

  // attiva loader + disabilita pulsante
  isThinking = true;
  sendBtn.disabled = true;
  const oldSendTxt = sendBtn.textContent;
  sendBtn.textContent = "Sto scrivendo…";

  renderChat();

  const messages = chatHistory.slice();

  // 1) carica/usa il prompt dinamico
  const dynPrompt = await loadDynamicSystemPrompt();

  // 2) inserisci i due system message in testa (ordine: reminder, poi prompt completo)
  messages.unshift(
    {
      role: "system",
      content:
        "FASE 1 OBBLIGATORIA: fai 2–3 domande per raccogliere A/B/C. NON generare alcun preventivo o prezzi finché non hai A, B e C.",
    },
    {
      role: "system",
      content:
        "Quando A/B/C sono completi: 1) Titolo 'PREVENTIVO COMPLETO', 2) voci con importi reali in € formato IT, 3) chiudi con UN SOLO blocco ```json``` come da specifica.",
    },
    {
      role: "system",
      content: dynPrompt,
    }
  );

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        clientKey: CLIENT_KEY,
        serviziClientId: SERVIZI_CLIENT_ID,
        user: window.__chatUser
          ? {
              provider: window.__chatUser.provider,
              providerId: window.__chatUser.providerId,
              name: window.__chatUser.name,
              role: window.__chatUser.role,
            }
          : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);

    const aiText = data.content ?? "";
    chatHistory.push({ role: "assistant", content: aiText });

    // SOLO se sembra un preventivo finale con prezzi, abilita il bottone PDF
    if (shouldEnablePdf(aiText)) {
      lastAssistantText = aiText;
      window.__chatHistory = chatHistory.slice(-50); // opzionale
      await saveQuoteIfFinal(aiText); // <— SALVA nel DB
    }

    renderChat();
  } catch (err) {
    chatHistory.push({
      role: "assistant",
      content: `❌ Errore: ${err.message}`,
    });
    renderChat();
  } finally {
    isThinking = false;
    sendBtn.disabled = false;
    sendBtn.textContent = oldSendTxt;
    renderChat();
  }
}
