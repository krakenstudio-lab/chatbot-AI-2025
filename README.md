02/09/2025 13:59

# Chatbot AI — README

> **Chatbot AI Preventivi**  
> Webapp per generare preventivi guidati (Start/Pro/Leader) con PDF scaricabile, pensata per essere integrata in siti PHP/WordPress dei clienti.

---

## Indice

- [News Agosto 2025](#news-agosto-2025)
- [Panoramica](#panoramica)
- [Stack & Requisiti](#stack--requisiti)
- [Ambienti e Deploy](#ambienti-e-deploy)
- [Variabili d’Ambiente](#variabili-dambiente)
- [Struttura del Progetto](#struttura-del-progetto)
- [Analisi File per File](#analisi-file-per-file)
  - [vercel.json](#verceljson)
  - [package.json](#packagejson)
  - [.env](#env)
  - [src/index.js (nota su src7index.js)](#srcindexjs-nota-su-src7indexjs)
  - [src/clients/ChatbotClient.js](#srcclientschatbotclientjs)
  - [src/clients/MockChatbotClient.js](#srcclientsmockchatbotclientjs)
  - [src/pdf/generateQuotePdfFromHtml.js](#srcpdfgeneratequotepdffromhtmljs)
  - [src/pdf/renderQuoteHtml.js](#srcpdfrenderquotehtmljs)
  - [public/index.html](#publicindexhtml)
  - [public/script.js](#publicscriptjs)
  - [api/chat.js](#apichatjs)
  - [api/quote/save.js](#api-quote-save)
  - [api/quote/pdf-from-html.js](#apiquotepdf-from-htmljs)
  - [prisma/schema.prisma](#prisma)
  - [scripts/seed-client.js](#seed-cliente)
- [CORS, Sicurezza e Configurazioni Vercel](#cors-sicurezza-e-configurazioni-vercel)
- [Troubleshooting](#troubleshooting)
- [Guida Universale di Integrazione — Siti PHP](#guida-universale-di-integrazione--siti-php)
- [Guida di Integrazione — WordPress](#guida-di-integrazione--wordpress)
- [Note e Miglioramenti Futuri](#note-e-miglioramenti-futuri)

---

## News Agosto 2025

- Campi Quote popolati correttamente anche quando l’AI non produce il fence ```json:
  /api/quote/save ora estrae package, subtotal, discount, total dal testo come fallback.

- Salvataggio PDF nel DB: /api/quote/pdf-from-html salva il PDF in StoredPdfDb.bytes e aggiorna Quote.storedPdfId.

- Aggiornamento campi cliente + meta al PDF: quando si genera il PDF, il Quote viene aggiornato con customerName/Email/Phone, jsonFinal, deliveryTime, validityDays, ecc.

- Prisma lazy in tutte le Serverless Functions: l’istanza viene creata dentro l’handler (evita crash a import-time e preflight CORS che falliscono).

- CORS robusto: preflight OPTIONS risponde sempre con header corretti, anche in caso di errori DB.

- Build Prisma: aggiungere "postinstall": "prisma generate" è consigliato per prod.

---

## Panoramica

Chatbot AI è un widget di chat che:

1. **intervista** l’utente finale con 2–4 domande chiave (stack, e‑commerce, pagine/lingue, deadline/budget);
2. **propone un pacchetto** (Start/Pro/Leader) con voci di prezzo e condizioni;
3. genera un **PDF del preventivo** (A4) scaricabile dall’utente.

Il backend espone due API:

- `POST /api/chat` → inoltra i messaggi al modello (OpenAI o mock);
- `POST /api/quote/save` → salva il preventivo (testo + meta) nel DB.
- `POST /api/quote/pdf-from-html` → rende HTML e crea un PDF con Puppeteer/Chromium in ambiente serverless.

Il frontend è una **modale** apribile tramite bottone fisso in basso a destra e può essere **incorporata nei siti dei clienti** (PHP/WordPress) puntando alle API hostate su un subdominio (es. `chat.krakenstudio.it`).

---

## Stack & Requisiti

- **Node.js 20.x** (pin consigliato per Vercel: Node 20)
- **Express 5** (solo per dev/VPS)
- **Vercel Functions** (serverless) per `/api/*`
- **OpenAI SDK v5**
- **Puppeteer Core 24.10.2** + **@sparticuz/chromium 137.x** per PDF in serverless
- **Tailwind (CDN)** per il markup PDF (opzionale; si può sostituire con CSS locale)
- CORS abilitato verso i domini dei siti che incorporano il widget

---

## Ambienti e Deploy

- **Sviluppo locale / VPS**: server Express (`src/index.js`) serve `/public` e le API `/api/chat`, `/api/quote/pdf-from-html`.
- **Produzione (Vercel)**: i file sotto `/api` diventano **Serverless Functions**. Le pagine statiche sono servite da `/public`; le risorse del widget (es. `script.js`) possono essere richiamate cross‑origin dai siti clienti.

**Vercel settings consigliati**

- Node: **20.x**
- Fluid Compute: **off** per questa app
- `maxDuration` & `memory` set nei file `/api/*` (già presenti)
- CORS: consentire i domini dei clienti
- Prisma: aggiungere "postinstall": "prisma generate"

---

## Variabili d’Ambiente

Esempio `.env` (locale/VPS):

```env
OPENAI_API_KEY=your_key_here
PORT=3000
DATABASE_URL="mysql://krakens1_chatbotAdmin:ulU%23Mc%3F9aVizn4j2@86.105.14.19:3306/krakens1_chatbot"

AGENCY_NAME=Kraken Studio
AGENCY_EMAIL=info@krakenstudio.it
AGENCY_PHONE=+39 366 718 3543
AGENCY_LOGO_URL=https://krakenstudio.it/img/kraken-studio-contatti-ferrara.svg
```

**Nota**: le variabili AGENCY sono iniettate nel PDF (header).

---

## Struttura del Progetto

```
/api
  ├─ chat.js
  └─ quote
     ├─ save.js
     └─ pdf-from-html.js
/prisma
  └─ schema.prisma
/public
  ├─ index.html
  └─ script.js
/scripts
  └─ seed-client.js
/src
  ├─ clients
  │  ├─ ChatbotClient.js
  │  └─ MockChatbotClient.js
  ├─ pdf
  │  ├─ renderQuoteHtml.js      (CommonJS: module.exports = { renderQuoteHtml })
  │  └─ generateQuotePdfFromHtml.js (CommonJS; usato su Express/VPS)
  └─ index.js   (sviluppo locale)
package.json
vercel.json
.env
```

---

## Analisi File per File

### vercel.json

```json
{
  "rewrites": [
    { "source": "/", "destination": "/public/index.html" },
    { "source": "/((?!api/).*)", "destination": "/public/$1" }
  ]
}
```

- Reindirizza tutte le richieste non-API verso le risorse statiche di `/public`.
- Le route sotto `/api/*` vengono gestite come **Serverless Functions** in Vercel.

---

### package.json

- Script:
  - `dev`: avvia Express locale su `src/index.js`
  - `start`: avvio in modalità production su VPS
  - `postinstall`: "prisma generate"
- **Engines** (consigliato): `"engines": { "node": "20.x" }`
- Dipendenze chiave:
  - `openai@^5.x`
  - `puppeteer-core@24.10.2` + `@sparticuz/chromium@^137.x` (match Chrome 137)
  - `puppeteer@^24.16.0` (solo per fallback in ambienti non‑serverless)
  - `express@^5`, `cors`, `dotenv`

**Perché Puppeteer Core + Sparticuz?**  
In ambienti serverless (es. Vercel) non c’è Chrome “di sistema”; Sparticuz fornisce un binario Chromium compatibile.

---

### .env

Vedi sezione [Variabili d’Ambiente](#variabili-dambiente).

- `OPENAI_API_KEY` è necessaria per ChatbotClient (nei test si può usare il mock).

---

### src/index.js (nota su src7index.js)

File di server **Express** per sviluppo locale/VPS. Serve `/public` e definisce:

- `POST /api/chat` → inoltra a client OpenAI o mock secondo `NODE_ENV`
- `POST /api/quote/pdf-from-html` → genera PDF via `generateQuotePdfFromHtml`

> **Nota**: in repo è presente `src7index.js` ma gli script puntano a `src/index.js`. Rinomina a `src/index.js` o aggiorna gli script come preferisci.

---

### src/clients/ChatbotClient.js

Wrapper semplice su OpenAI v4 **chat.completions**:

- default `model: "gpt-3.5-turbo"`
- `temperature: 0.5`, `max_tokens: 300`
- Restituisce il primo `message` dei `choices`.

Usato in produzione (quando `NODE_ENV==="production"`).

---

### src/clients/MockChatbotClient.js

Client “finto” che ritorna sempre un **PREVENTIVO COMPLETO** di esempio, incluse cifre e un fence ```json finale con:

```json
{
  "pdfReady": true,
  "package": "Pro",
  "subtotal": 2300,
  "discount": 0,
  "total": 2300,
  "currency": "EUR",
  "deliveryTime": "2–3 settimane",
  "validityDays": 30
}
```

Utile in sviluppo senza consumare crediti.

---

### src/pdf/generateQuotePdfFromHtml.js

Funzione che riceve `agency`, `customer`, `quoteText`, `meta`, `filename`, costruisce l’HTML con `renderQuoteHtml()` e genera il PDF.

**Flusso:**

1. **Tentativo 1 (serverless)**: dynamic import

   ```js
   const { default: chromium } = await import("@sparticuz/chromium");
   const { default: puppeteer } = await import("puppeteer-core");
   const browser = await puppeteer.launch({
     executablePath: await chromium.executablePath(),
     headless: true,
     args: [
       ...chromium.args,
       "--no-sandbox",
       "--disable-setuid-sandbox",
       "--disable-dev-shm-usage",
     ],
     defaultViewport: chromium.defaultViewport ?? { width: 1280, height: 800 },
   });
   await page.setContent(html, { waitUntil: "load" });
   ```

   - **Importante**: usare `.default` perché `import()` in CommonJS ritorna l’oggetto in `default`.
   - `waitUntil: "load"` riduce i tempi morti se ci sono risorse esterne (es. CDN).

2. **Tentativo 2 (fallback)**: `require("puppeteer")` (solo ambienti non‑serverless con Chrome pacchettizzato).

3. **Headers PDF**:
   - `Content-Type: application/pdf`
   - `Content-Disposition: attachment; filename="preventivo-<nome>.pdf"`

**Consiglio**: per massima robustezza, sostituire il `<script src="https://cdn.tailwindcss.com"></script>` dell’HTML con un CSS locale (vedi Note).

---

### src/pdf/renderQuoteHtml.js

Genera l’HTML del preventivo (Tailwind-based). Punti chiave:

- **Sanitizzazione** (`escapeHtml`) e formattazione valute (`currency`).
- Parser numerico **robusto** (`toNumber`) che elimina `€`, punti, spazi non standard (NBSP `\u00A0`, NARROW NBSP `\u202F`) e converte a numero decimale.
- **Estrattori** dal testo:
  - `findMoneyAfter`/`totalsFromText`: cercano “Subtotale/Sconto/Totale” nel testo.
  - `sumLineItems`: somma prezzi **solo se** affiancati alla valuta (€, euro, EUR) per evitare falsi positivi (es. “7–14 gg”).
  - `inferPackageFromText`: prova a riconoscere Start/Pro/Leader.
  - `stripFinalJsonBlock`: rimuove l’ultimo fence ```json dal testo (evita di stamparlo nel PDF).
  - `extractFenceMeta`: se presente un fence ```json nell’output AI, lo **merge** con `meta` ricevuto.

**Fallback totale/subtotale/sconto:**

1. Prova dai `meta` (eventualmente fusi col fence).
2. Se mancano, prova dalle **etichette nel testo**.
3. Se ancora manca il **subtotale**, prova a **sommarlo** dalle righe prezzo (solo righe con valuta).
4. Sconto default = 0.
5. Se manca uno tra subtotale/totale, calcola l’altro con `totale = subtotale - sconto` / `subtotale = totale + sconto`.

**Layout HTML**:

- Header con logo e dati agenzia
- Box cliente + riepilogo (pacchetto, tempi, validità)
- Tabella economica (Subtotale/Sconto/Totale)
- Dettaglio tecnico/Note (testo AI ripulito dal fence JSON)
- Footer con disclaimer

---

### public/index.html

Pagina demo che contiene:

- **Bottone flottante** (in basso a destra) per aprire la modale
- **Modale Chat** (chat window, textarea, pulsante Invio)
- Include Tailwind CDN e **`script.js`**

Serve come **demo** ed è utile anche per testare il widget “standalone”.

---

### public/script.js

Logica del widget:

- **Rilevamento API base** (`API_BASE`):
  - autodetect dal **domain dello script** (`document.currentScript.src`), override possibile via `window.CHAT_API_BASE`
  - Le `fetch` usano sempre `${API_BASE}/api/...`, così da funzionare anche **cross‑origin** quando il widget è incorporato altrove.
- **System Prompt**: istruzioni in italiano per intervista + struttura “PREVENTIVO COMPLETO”, con fence ```json finale di segnalazione `pdfReady`.
- **Heuristics**:
  - `shouldEnablePdf()` → mostra il pulsante “Usa questo preventivo → PDF” **solo** quando il messaggio AI “sembra” un preventivo finale o è presente `pdfReady:true` nel fence JSON.
- **Estrazione dati economici** lato client:
  - `extractLastJsonBlock`/`normalizeMeta` + `buildMetaFromText` come fallback.
- **Form cliente**: raccoglie nome/email & co. per intestare il PDF, poi `POST` a `/api/quote/pdf-from-html` e scarica il file.
- **UI**: chat window con bubble, apertura/chiusura modale (anche via overlay/Esc).

---

### api/chat.js

Serverless Function Vercel che:

- Setta gli **header CORS** e risponde ai **preflight `OPTIONS`** (204)
- Accetta solo `POST` con `{ messages }`
- Sceglie **ChatbotClient** (prod) o **MockChatbotClient** (dev)
- Restituisce il `message` del modello come JSON

Header CORS (esempio):

```js
res.setHeader("Access-Control-Allow-Origin", "<dominio_del_cliente>"); // o "*"
res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
res.setHeader("Access-Control-Max-Age", "86400");
```

Export consigliati:

```js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const config = { maxDuration: 30, memory: 512 };
```

---

### api-quote-save

- CORS robusto + Prisma lazy.

Salva Quote con:

- quoteText, jsonFinal (se presente), chatHistory, siteUrl
- meta: da fence ```json oppure fall-back estratto dal testo (package/subtotal/discount/total).
- customer\* solitamente NULL (arrivano al PDF).
- Ritorna { id, uid }.

---

### api/quote/pdf-from-html.js

Serverless Function Vercel per la generazione PDF:

- Stessa gestione **CORS** e `OPTIONS`
- Accetta `POST` con `{ customer, quoteText, meta }`
- Chiama `generateQuotePdfFromHtml()` con i dati, compreso `agency` dalle **env**
- Restituisce direttamente il **buffer PDF** come `application/pdf`

Export consigliati:

```js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const config = { maxDuration: 60, memory: 1024 };
```

---

### prisma

Modelli Client, Quote, StoredPdfDb.
Quote include link opzionale storedPdfId → StoredPdfDb.

---

### seed-cliente

Crea un record Client (embedKey, allowedOrigins, status=active).
Usalo per “seme” in un DB vuoto o per aggiungere un nuovo tenant.

---

## CORS, Sicurezza e Configurazioni Vercel

- **CORS**: abilita gli origin dei clienti (es. `https://vesewebdev.it`). In alternativa, usa `*` per test rapidi.
- **Node 20**: obbligatorio per la compatibilità Sparticuz 137 ↔ Puppeteer Core 24.10.x.
- **Chromium**: mantieni allineate le versioni `@sparticuz/chromium` e `puppeteer-core` (Chrome 137).
- **Fluid Compute**: disabilitato per evitare lib mancanti durante il boot di Chromium.
- **Segreti**: mai esporre `OPENAI_API_KEY` lato client. È solo lato server.

---

## Troubleshooting

- **`Unexpected token '<'`** → stai fetchando l’origin della pagina (HTML 404) invece di `chat.krakenstudio.it`. Verifica che `API_BASE` sia corretto e che nella pagina sia incluso `window.CHAT_API_BASE = "https://chat.krakenstudio.it"` _prima_ di `script.js`.
- **CORS preflight fallisce** → assicurati che le function rispondano a `OPTIONS` con `204` + header `Access-Control-*` corretti.
- **`libnss3.so` / Chromium non parte (Vercel)** → versioni non allineate Puppeteer/Chromium o runtime Node sbagliato. Usa Node 20, `@sparticuz/chromium@137`, `puppeteer-core@24.10.2`, import `.default` nei dynamic import, `waitUntil: "load"`.
- **PDF “appeso” su Tailwind CDN** → valuta CSS locale (link `<link rel="stylesheet" href="/assets/tailwind-pdf.css" />`) invece dello script CDN.
- **Falso positivo numerico (es. “7–14 gg”)** → la regex `sumLineItems` richiede la presenza della **valuta** (€, euro, EUR) vicino al numero, evitando di sommare range/percentuali.

---

## Guida Universale di Integrazione — Siti PHP

### Obiettivo

Mostrare **sempre** il bottone della chat in basso a destra nel sito del cliente (PHP), e usare le API hostate su `https://chat.krakenstudio.it`.

### Passi

1. **Markup** (incollare prima di `</body>` della pagina PHP principale):

   ```html
   <!-- Bottone flottante -->
   <button
     id="chatLauncher"
     aria-label="Apri chat"
     style="position:fixed;right:16px;bottom:16px;z-index:9999;width:56px;height:56px;border-radius:50%;background:#2563eb;color:#fff;border:0;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -2px rgba(0,0,0,.05);cursor:pointer"
   >
     <svg
       xmlns="http://www.w3.org/2000/svg"
       width="28"
       height="28"
       fill="currentColor"
       viewBox="0 0 24 24"
     >
       <path
         d="M20 2H4a2 2 0 0 0-2 2v16l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"
       />
     </svg>
   </button>

   <!-- Modal -->
   <div
     id="chatModal"
     role="dialog"
     aria-modal="true"
     aria-labelledby="chatTitle"
     style="position:fixed;inset:0;z-index:10000;display:none"
   >
     <div
       class="overlay"
       data-close="true"
       style="position:absolute;inset:0;background:rgba(0,0,0,.4);backdrop-filter:saturate(100%) blur(1px)"
     ></div>
     <div
       class="wrap"
       style="position:absolute;left:0;right:0;bottom:0;padding:12px"
     >
       <div
         class="panel"
         style="background:#fff;border-radius:16px;box-shadow:0 20px 25px -5px rgba(0,0,0,.1),0 8px 10px -6px rgba(0,0,0,.1);width:100%;max-width:420px;height:85vh;margin:0 auto"
       >
         <header
           style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e5e7eb"
         >
           <h1 id="chatTitle" style="font-size:16px;margin:0">Chatbot AI</h1>
           <button
             id="chatClose"
             aria-label="Chiudi"
             style="background:none;border:0;cursor:pointer;padding:6px;border-radius:8px"
           >
             <svg
               xmlns="http://www.w3.org/2000/svg"
               width="20"
               height="20"
               stroke="currentColor"
               fill="none"
               viewBox="0 0 24 24"
             >
               <path
                 stroke-linecap="round"
                 stroke-linejoin="round"
                 stroke-width="2"
                 d="M6 18L18 6M6 6l12 12"
               />
             </svg>
           </button>
         </header>
         <div
           id="chatWindow"
           style="height:calc(100% - 140px);overflow:auto;padding:16px;background:#f9fafb"
         ></div>
         <footer style="padding:12px 16px;border-top:1px solid #e5e7eb">
           <textarea
             id="promptInput"
             rows="2"
             placeholder="Scrivi un messaggio..."
             style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:8px"
           ></textarea>
           <div style="text-align:right">
             <button
               id="sendBtn"
               style="margin-top:8px;background:#3b82f6;color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer"
             >
               Invia
             </button>
           </div>
         </footer>
       </div>
     </div>
   </div>

   <script>
     // Apri/chiudi modale senza dipendenze
     (function () {
       const modal = document.getElementById("chatModal");
       const open = () => {
         modal.style.display = "block";
       };
       const close = () => {
         modal.style.display = "none";
       };
       document.getElementById("chatLauncher")?.addEventListener("click", open);
       document.getElementById("chatClose")?.addEventListener("click", close);
       modal?.addEventListener("click", (e) => {
         if (e.target?.dataset?.close === "true") close();
       });
       document.addEventListener("keydown", (e) => {
         if (e.key === "Escape" && modal.style.display === "block") close();
       });
     })();
   </script>
   ```

2. **Script del widget** (sotto al markup):

   ```html
   <script>
     window.CHAT_API_BASE = "https://chat.krakenstudio.it";
     window.CHAT_CLIENT_KEY = "TUO_EMBED_KEY";
   </script>
   <script src="https://chat.krakenstudio.it/script.js?v=5"></script>
   ```

3. **CORS**: 
- assicurarsi che `chat.krakenstudio.it` consenta l’origine del sito del cliente. In `/api/*` sono impostati gli header per `OPTIONS`/`POST`.
- Assicurarsi che il dominio del cliente sia nei CORS (statici o Client.allowedOrigins).

4. **Test**: aprire DevTools → Network, inviare un messaggio e verificare che le chiamate vadano a `https://chat.krakenstudio.it/api/...` e ritornino JSON.

---

## Guida di Integrazione — WordPress

### Opzione 1 — Shortcode (consigliata)

In `functions.php` (o plugin tipo “Code Snippets”) inserire:

```php
add_action('wp_enqueue_scripts', function () {
  $inline = 'window.CHAT_API_BASE = "https://chat.krakenstudio.it";';
  wp_enqueue_script('chatbot-ai-widget', 'https://chat.krakenstudio.it/script.js?v=6', [], null, true);
  wp_add_inline_script('chatbot-ai-widget', $inline, 'before');

  $css = '#chatLauncher{position:fixed;right:16px;bottom:16px;z-index:9999;width:56px;height:56px;border-radius:50%;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -2px rgba(0,0,0,.05);border:0;cursor:pointer}#chatLauncher:hover{background:#1d4ed8}#chatModal{position:fixed;inset:0;z-index:10000;display:none}#chatModal.open{display:block}#chatModal .overlay{position:absolute;inset:0;background:rgba(0,0,0,.4);backdrop-filter:saturate(100%) blur(1px)}#chatModal .wrap{position:absolute;left:0;right:0;bottom:0;padding:12px}@media(min-width:640px){#chatModal .wrap{inset:0;display:flex;align-items:center;justify-content:center;padding:16px}}#chatModal .panel{background:#fff;border-radius:16px;box-shadow:0 20px 25px -5px rgba(0,0,0,.1),0 8px 10px -6px rgba(0,0,0,.1);width:100%;max-width:420px;height:85vh}#chatModal header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e5e7eb}#chatModal h1{font-size:16px;margin:0}#chatWindow{height:calc(100% - 140px);overflow:auto;padding:16px;background:#f9fafb}#chatModal footer{padding:12px 16px;border-top:1px solid #e5e7eb}#promptInput{width:100%;padding:8px;border:1px solid #d1d5db;border-radius:8px}#sendBtn{margin-top:8px;background:#3b82f6;color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer}#sendBtn:hover{background:#2563eb}';
  wp_register_style('chatbot-ai-widget-lite', false);
  wp_enqueue_style('chatbot-ai-widget-lite');
  wp_add_inline_style('chatbot-ai-widget-lite', $css);
});

add_shortcode('chatbot_ai', function () {
  ob_start(); ?>
  <button id="chatLauncher" aria-label="Apri chat">
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v16l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>
  </button>
  <div id="chatModal" role="dialog" aria-modal="true" aria-labelledby="chatTitle">
    <div class="overlay" data-close="true"></div>
    <div class="wrap">
      <div class="panel">
        <header>
          <h1 id="chatTitle">Chatbot AI</h1>
          <button id="chatClose" aria-label="Chiudi" style="background:none;border:0;cursor:pointer;padding:6px;border-radius:8px">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" stroke="currentColor" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </header>
        <div id="chatWindow"></div>
        <footer>
          <textarea id="promptInput" rows="2" placeholder="Scrivi un messaggio..."></textarea>
          <div style="text-align:right"><button id="sendBtn">Invia</button></div>
        </footer>
      </div>
    </div>
  </div>
  <script>(function(){const m=document.getElementById('chatModal');const o=()=>m.classList.add('open');const c=()=>m.classList.remove('open');document.getElementById('chatLauncher')?.addEventListener('click',o);document.getElementById('chatClose')?.addEventListener('click',c);m?.addEventListener('click',e=>{if(e.target?.dataset?.close==='true')c();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&m.classList.contains('open'))c();});})();</script>
  <?php return ob_get_clean();
});
```

**Uso:** inserire `[chatbot_ai]` in una pagina, nel footer o in un widget.

### Opzione 2 — Blocco “HTML personalizzato”

- Aggiungi un blocco “HTML” con **markup bottone+modal** (come nella guida PHP).
- In fondo alla pagina incolla:
  ```html
  <script>
    window.CHAT_API_BASE = "https://chat.krakenstudio.it";
    window.CHAT_CLIENT_KEY = "TUO_EMBED_KEY";
  </script>
  <script src="https://chat.krakenstudio.it/script.js?v=6"></script>
  <style>
    /* CSS leggero come sopra */
  </style>
  ```

**Note WP**

- Se usi plugin di ottimizzazione, escludi `chatbot-ai-widget` da concatenazione/defer se necessario.
- Aggiungi il dominio del sito WordPress alle **ALLOWED_ORIGINS** nelle API se limiti CORS.

---

## Aggiungere un nuovo sito cliente (es. sitonovocliente.it)

Obiettivo: incorporare il widget nel sito del cliente e collegarlo al proprio tenant (client) nel DB.

### Passo 1 — Creare/abilitare il Client nel DB

- Verifica se esiste un record Client per questo cliente; altrimenti crealo:

- Crea manualmente un record Client con:

name: nome cliente (es. “Sito Nuovo Cliente”)
embedKey: una chiave univoca (es. acme_live_ABC123...)
allowedOrigins: ["https://sitonovocliente.it","https://www.sitonovocliente.it","https://chat.krakenstudio.it"]
status: active

- L’embedKey verrà usato dal widget sul sito del cliente.

### Passo 2 — Aggiornare (se necessario) i CORS statici nelle API

Negli handler /api/* è presente un’allowlist statica per la preflight.
Puoi:
- Aggiungere https://sitonovocliente.it e https://www.sitonovocliente.it alle costanti ALLOWED_ORIGINS, oppure
- Lasciare il fallback * (già presente) per la preflight.

In ogni caso, /api/quote/save verifica anche Client.allowedOrigins dal DB.

### Passo 3 — Incollare il widget nel sito cliente
Inserisci (prima di </body>) markup bottone/modale (vedi “Guida PHP”) e script:

<script>
  window.CHAT_API_BASE = "https://chat.krakenstudio.it";
  window.CHAT_CLIENT_KEY = "acme_live_ABC123..."; // l'embedKey del Client
</script>
<script src="https://chat.krakenstudio.it/script.js?v=6"></script>

### Passo 4 — Test end-to-end
Apri il sito del cliente → invia messaggio → ottieni un “PREVENTIVO COMPLETO”.

Verifica:

POST /api/quote/save → risponde { id, uid } (controlla DB).

Clic su “Usa questo preventivo → PDF” → inserisci Nome/Email → scarica PDF.

In DB: Quote aggiornato con customer*, jsonFinal (se presente), status=pdf_generated, storedPdfId non NULL.

In StoredPdfDb → presente il record con bytes (PDF).

## Note e Miglioramenti Futuri

- **CSS PDF locale** invece di Tailwind CDN (più stabile in serverless).
- **Tema scuro** per il widget/modale.
- **Rate limiting** sull’API `/api/chat` (es. via IP + `node-cache`) per ridurre abusi.
- **Persistenza preventivi** (DB) con area admin (già sperimentata in una variante PHP).

---

© Kraken Studio — Chatbot AI Preventivi
