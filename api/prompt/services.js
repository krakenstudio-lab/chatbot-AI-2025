// api/prompt/services.js   (serverless) — oppure la stessa logica in una route Express
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
      serviziClientId = null, // numero o null → include anche servizi globali
      user = null, // { name?: string, role?: string }
      language = "it", // per ora IT fisso
    } = req.body || {};

    // 1) Leggi i servizi attivi per clientId o globali
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

    // 2) Normalizza per il prompt + restituisci anche la lista al client
    const services = servizi.map((s) => ({
      nome: sanitize(s.nome || ""),
      descrizione: sanitize(s.descrizione || ""),
      prezzo: sanitize(s.prezzo || ""),
    }));
    const serviceNames = services.map((s) => s.nome).filter(Boolean);

    const catalogLines = services.map((s) => {
      const bits = [`- ${s.nome}`];
      if (s.prezzo) bits.push(`Prezzo: ${s.prezzo}`);
      if (s.descrizione) bits.push(short(s.descrizione));
      return bits.join(" — ");
    });

    const userLine = user?.name
      ? `Questa sessione è avviata da "${user.name}"${
          user?.role ? ` (ruolo: ${user.role})` : ""
        }.`
      : `Questa sessione non fornisce dati utente.`;

    // 3) Prompt DINAMICO: via "PACCHETTI DISPONIBILI" dal DB
    const packageHint =
      serviceNames.length > 0
        ? `Uno dei seguenti: ${serviceNames.join(" | ")}`
        : `Un nome presente nei pacchetti sopra (se vuoto, usa un nome coerente col contesto)`;

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
      `=== PACCHETTI DISPONIBILI (dal database) ===`,
      catalogLines.length
        ? catalogLines.join("\n")
        : `(Nessun pacchetto disponibile)`,
      `===========================================`,
      ``,
      `LINEE GUIDA PREZZI`,
      `- Se "Prezzo" è indicato accanto al pacchetto, usalo come riferimento.`,
      `- Se manca, stima coerente in base a complessità (pagine, lingue, e-commerce, area riservata, integrazioni, contenuti).`,
      `- Prezzi in formato italiano. Assume IVA inclusa salvo diversa indicazione del cliente.`,
      ``,
      `STILE DI USCITA (solo in FASE 2)`,
      `- Niente tabelle, niente emoji, niente gergo.`,
      `- Voci economiche in bullet con trattino: "- Nome voce: 1.500,00 €" (numero PRIMA, poi "€", formato IT).`,
      `- Includi tempi e termini standard (range settimane), pagamenti 50%/50%, validità 30 giorni.`,
      ``,
      `STRUTTURA DEL PREVENTIVO FINALE (FASE 2)`,
      `Titolo: "PREVENTIVO COMPLETO"`,
      `Sezioni (ordine): Riepilogo → Perché → Pacchetto consigliato (+ eventuale alternativa) → Voci → Tempi → Termini → Note → Totale finale.`,
      ``,
      `REGOLE FINALI (obbligatorie)`,
      `- NON produrre il preventivo finché A, B, C non sono tutti coperti.`,
      `- Il campo "package" nel JSON DEVE essere **esattamente** uno dei nomi elencati sopra.`,
      `- Chiudi con **UNO e un solo** blocco \`\`\`json (numeri non formattati, valuta "EUR"):`,
      `{ "pdfReady": true, "package": "UnoDeiPacchettiElencati", "subtotal": number, "discount": number|null, "total": number, "currency": "EUR", "deliveryTime": "string", "validityDays": 30 }`,
      `- Il totale deve rispettare: totale = subtotale − sconto.`,
      `- NON inserire altri blocchi di codice o JSON oltre a quello finale.`,
      `- Se ti accorgi di non aver aggiunto il blocco JSON, **appendilo** subito in coda e **non scrivere altro dopo il JSON**.`,
    ].join("\n");

    console.log(
      "[prompt/services] servizi:",
      services.length,
      "clientId:",
      serviziClientId
    );
    // RITORNiamo anche i nomi pacchetto per matching lato client
    res.json({ systemPrompt, services, serviceNames });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
}
