// src/clients/MockChatbotClient.js
/**
 * MockChatbotClient simula l’API senza consumare crediti.
 * Restituisce un echo del messaggio dell’utente o una risposta statica.
 */
class MockChatbotClient {
  /**
   * @param {Array<{role: string, content: string}>} messages  storico dei messaggi
   * @param {object} options  ignorato
   * @returns {Promise<{role: string, content: string}>}
   */
  async sendMessage(messages, options = {}) {
    const last = messages[messages.length - 1];
    const userText = last.content || "";
    // qui puoi personalizzare la logica di mock
    return {
      role: "assistant",
      content: `PREVENTIVO COMPLETO
- Sito Pro (5 pagine): 2.000,00 €
- Setup & training: 300,00 €
Totale: 2.300,00 €

\`\`\`json
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
\`\`\`
`,
    };
  }
}

module.exports = MockChatbotClient;
