**Data:** 16/08/2025 09:42
# Chatbot AI per la generazione automatica di preventivi


## 📁 Struttura del progetto

chatbot-ai/
├─ src/
│ ├─ clients/ # Wrapper per OpenAI e mock client
│ │ ├─ ChatbotClient.js
│ │ └─ MockChatbotClient.js
│ └─ index.js # Server Express + static files + /api/chat
├─ public/ # Interfaccia web (HTML, JS, CSS)
│ ├─ index.html
│ └─ script.js
├─ .env # Variabili d’ambiente (API key, NODE_ENV, PORT)
├─ .gitignore # File e cartelle da ignorare in Git
├─ package.json # Dipendenze e script (dev & prod)
└─ README.md # Questo file

---

## 🚀 Installazione & Setup

1. **Clona il repository**  
   ```bash
   git clone https://github.com/Vese10/chatbot-ai.git
   cd chatbot-ai

2. **Installa le dipendenze**
npm install

3. **Configura le variabili d’ambiente**
Crea un file .env in root con:

OPENAI_API_KEY=sk-YOUR_KEY_HERE
PORT=3000

3. **NODE_ENV è gestito dagli script npm**
Script utili

npm run dev → avvia in development (NODE_ENV=development, nodemon)

npm start → avvia in production (NODE_ENV=production)

## 📖 Utilizzo
Interfaccia web: apri il browser su http://localhost:3000/

API Chat interattiva:

POST /api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "system", "content": "Le tue istruzioni private per l’intervista e il preventivo" },
    { "role": "user",   "content": "Descrizione iniziale dell’esigenza" }
    // …aggiungi qui le risposte dell’utente e le domande dell’AI
  ]
}
L’endpoint gestisce un flow step-by-step: l’AI pone fino a 3 domande di chiarimento, quindi genera il preventivo finale.

## 🧩 Descrizione dei moduli
Production: **src/clients/ChatbotClient.js**
OpenAI v4: crea il client con new OpenAI({ apiKey })

sendMessage(messages, options): chiama chat.completions.create() con model, temperature e max_tokens
Perché? Centralizza le chiamate all’API ufficiale e semplifica aggiornamenti di SDK o modelli.

Development: **src/clients/MockChatbotClient.js**
Mock: restituisce un echo "[MOCK] Hai detto: …" invece di chiamare l’API
Perché? Permette sviluppo e testing offline senza consumare crediti.

src/index.js
Serve i file statici in public/

Espone POST /api/chat

Seleziona ChatbotClient o MockChatbotClient in base a NODE_ENV
Perché? Unico endpoint REST per gestire l’intero flow di preventivo, consumabile da qualsiasi front-end.

### ⚙️ Prossimi passi per performance
Cache distribuita: Redis o Memcached in produzione

Clustering/PM2: più processi Node dietro un load balancer

Batching: unifica richieste multiple in un solo prompt

Monitoraggio: Grafana / Datadog per metriche, latenza e cache hit rate

### 🌐 Integrazione
WordPress
Shortcode custom o blocco Gutenberg che inserisce <div id="ai-chatbot-container"></div> e carica script.js

Configura CORS in src/index.js:

app.use(cors({ origin: 'https://tuo-sito.com' }))
Siti PHP “a codice”
Server-side (cURL): form PHP che POSTa a /api/chat

Client-side (fetch): JavaScript in pagina che chiama /api/chat

Importante:

Usa sempre HTTPS in produzione

NON esporre la tua OPENAI_API_KEY nel client

### 🎉 Conclusioni
Backend Node.js modulare e interfaccia web responsive per chat step-by-step e generazione di preventivi AI, facilmente estendibile e integrabile in diversi ambienti. Enjoy!!