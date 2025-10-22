// api/prompt/servizi.js  (serverless)  — oppure route Express
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

function sanitize(s = "") {
  return String(s).replace(/\s+/g, " ").replace(/[<>]/g, "");
}
function short(s = "", max = 220) {
  return s.length > max ? s.slice(0, max).trim() + "…" : s;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const {
      serviziClientId = null, // numero o null → mostra anche servizi globali
      user = null, // { name?: string, role?: string }
      language = "it", // “it” default
    } = req.body || {};

    const servizi = await prisma.servizi.findMany({
      where: {
        flagActive: 1,
        OR: [
          serviziClientId != null ? { idCliente: serviziClientId } : undefined,
          { idCliente: null },
        ].filter(Boolean),
      },
      orderBy: { nome: "asc" },
      select: { nome: true, prezzo: true, descrizione: true },
    });

    const lines = servizi.map((s) => {
      const nome = sanitize(s.nome || "");
      const prezzo = sanitize(s.prezzo || "");
      const descr = short(sanitize(s.descrizione || ""));
      return `- ${nome}${prezzo ? ` — Prezzo: ${prezzo}` : ""}${
        descr ? ` — ${descr}` : ""
      }`;
    });

    // Piccola personalizzazione su utente (solo saluto/tono)
    const userLine = user?.name
      ? `Questa sessione è avviata da "${user.name}"${
          user?.role ? ` (ruolo: ${user.role})` : ""
        }.`
      : `Questa sessione non fornisce dati utente.`;

    const systemPrompt = [
      `Sei un assistente preventivi per una web agency. Rispondi in italiano, chiaro e professionale.`,
      userLine,
      ``,
      `OBIETTIVO A DUE FASI`,
      `- FASE 1 (intervista): raccogli i DATI MINIMI OBBLIGATORI.`,
      `- FASE 2 (output): quando hai tutti i dati, produci un PREVENTIVO COMPLETO.`,
      ``,
      `DATI MINIMI OBBLIGATORI (tutti e 3)`,
      `A) Piattaforma: WordPress o custom.`,
      `B) E-commerce: sì/no. Se sì: ordine di grandezza prodotti iniziali.`,
      `C) Pagine/lingue + 1–3 funzionalità chiave (blog, newsletter, recensioni, multilingua, area riservata).`,
      ``,
      `REGOLE INTERVISTA (vincolanti)`,
      `- Fai 2–3 domande mirate per coprire A/B/C.`,
      `- NON scrivere cifre e NON generare "PREVENTIVO COMPLETO" finché manca uno dei tre punti.`,
      `- Se l’utente dà info parziali, chiedi solo ciò che manca. Quando tutto è noto, passa alla FASE 2.`,
      ``,
      `=== CATALOGO SERVIZI DISPONIBILI ===`,
      lines.length
        ? lines.join("\n")
        : `(Nessun servizio disponibile al momento)`,
      `====================================`,
      ``,
      `GUIDA AI PREZZI`,
      `- Parti da: Start 2.500 €, Pro 4.000 €, Leader 6.000 €+.`,
      `- Adatta ±10% per complessità (pagine, lingue, e-commerce, area riservata, integrazioni, contenuti).`,
      `- Tutti i prezzi **IVA inclusa**.`,
      ``,
      `PACCHETTI (default)`,
      `- Start (2.500 €): vetrina 1 pagina...`,
      `- Pro (4.000 €): 5 pagine...`,
      `- Leader (da 6.000 €): su misura...`,
      ``,
      `STILE DI USCITA (solo in FASE 2)`,
      `- Niente tabelle, niente emoji, niente gergo.`,
      `- Voci economiche in bullet con trattino: "- Nome voce: 1.500,00 €" (numero PRIMA, poi "€", formato IT).`,
      `- Includi tempi e termini standard (Start 2–3 sett.; Pro 3–4 sett.; Leader 4–8 sett.). Pagamenti 50%/50%. Validità 30 giorni.`,
      ``,
      `STRUTTURA DEL PREVENTIVO FINALE (FASE 2)`,
      `Titolo: "PREVENTIVO COMPLETO"`,
      `Sezioni (ordine): Riepilogo → Perché → Pacchetto consigliato (+ alternativa) → Voci → Tempi → Termini → Note → Totale finale.`,
      ``,
      `REGOLE FINALI (obbligatorie)`,
      `- NON produrre il preventivo finché A, B, C non sono tutti coperti.`,
      `- Quando produci il preventivo, **chiudi SEMPRE** il messaggio con **UNO e un solo** blocco \`\`\`json esattamente così (numeri non formattati, valuta "EUR"):`,
      `{ "pdfReady": true, "package": "Start|Pro|Leader", "subtotal": number, "discount": number|null, "total": number, "currency": "EUR", "deliveryTime": "string", "validityDays": 30 }`,
      `- Il totale deve rispettare: totale = subtotale − sconto.`,
      `- NON inserire altri blocchi di codice o JSON oltre a quello finale.`,
      `- Se ti accorgi di non aver aggiunto il blocco JSON, **correggi immediatamente** appendendolo in coda e **non scrivere altro dopo il JSON**.`,
    ].join("\n");

    console.log(
      "[prompt/services] servizi caricati:",
      servizi.length,
      "clientId:",
      serviziClientId
    );
    res.json({ systemPrompt });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
}
