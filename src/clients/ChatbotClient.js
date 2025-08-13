// src/clients/ChatbotClient.js
const OpenAI = require("openai"); // default export

class ChatbotClient {
  /**
   * @param {string} apiKey  la tua OPENAI_API_KEY
   */
  constructor(apiKey) {
    // Il parametro apiKey è opzionale se usi la variabile OPENAI_API_KEY
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Invia una chat completion all’API OpenAI (v4).
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} options   { model, temperature, maxTokens }
   * @returns {Promise<{role: string, content: string}>}
   */
  async sendMessage(messages, options = {}) {
    // Usando il namespace chat.completions.create in v4
    const response = await this.client.chat.completions.create({
      model: options.model || "gpt-3.5-turbo",
      messages,
      temperature: options.temperature ?? 0.5,
      max_tokens: options.maxTokens ?? 300,
    });
    // Ritorna il primo choice
    return response.choices[0].message;
  }
}

module.exports = ChatbotClient;
