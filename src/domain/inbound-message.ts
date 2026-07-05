import type { Account } from "./account.js";

export interface InboundMessage {
  account: Account;
  chatId: string;
  text?: string;
  location?: { latitude: number; longitude: number };
  selectionCallback?: string;
  /** Teléfono ya verificado por la plataforma de mensajería. Telegram: solo tras compartir contacto. WhatsApp: siempre. */
  verifiedPhone?: string;
  /** Id del mensaje entrante en la plataforma (WhatsApp wamid) para acuse de recibo/leído. */
  messageId?: string;
}
