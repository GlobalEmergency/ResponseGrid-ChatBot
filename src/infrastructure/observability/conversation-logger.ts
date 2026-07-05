/**
 * Logging estructurado de conversaciones (una línea JSON por evento).
 *
 * Va a stdout, que PM2 recoge en logs/bot-out.log. Permite monitorizar el flujo
 * real (mensaje del usuario, respuesta del bot, latencia, errores) con grep/jq
 * sin tener que descargar los ficheros de sesión. Los textos se recortan.
 *
 * No registra tokens ni secretos: solo canal, cuenta, chatId y previews de texto.
 */
export interface ConversationLogFields {
  kind: "inbound" | "turn" | "error";
  channel: string;
  accountId: string;
  chatId: string;
  authenticated?: boolean;
  userText?: string;
  reply?: string;
  ms?: number;
  error?: string;
}

const PREVIEW_MAX = 240;

export function truncate(text: string | undefined, max: number = PREVIEW_MAX): string | undefined {
  if (text == null) {
    return undefined;
  }
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Construye la línea de log (objeto plano) — separado de la emisión para poder testearlo. */
export function buildLogLine(
  fields: ConversationLogFields,
  timestamp: string,
): Record<string, unknown> {
  return {
    t: "conv",
    ts: timestamp,
    kind: fields.kind,
    channel: fields.channel,
    account: fields.accountId,
    chatId: fields.chatId,
    ...(fields.authenticated !== undefined ? { auth: fields.authenticated } : {}),
    ...(fields.userText !== undefined ? { user: truncate(fields.userText) } : {}),
    ...(fields.reply !== undefined ? { reply: truncate(fields.reply) } : {}),
    ...(fields.ms !== undefined ? { ms: fields.ms } : {}),
    ...(fields.error !== undefined ? { error: truncate(fields.error, 500) } : {}),
  };
}

export function logConversation(fields: ConversationLogFields): void {
  console.log(JSON.stringify(buildLogLine(fields, new Date().toISOString())));
}
