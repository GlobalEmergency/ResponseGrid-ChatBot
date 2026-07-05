/**
 * Constructores de payloads de la WhatsApp Cloud API (funciones puras y testeables).
 */
import type { ChoicePrompt, QuickReply } from "../../domain/ports/messaging-channel.port.js";
import { markdownToWhatsApp } from "./whatsapp-format.js";

/** Título de botón: WhatsApp limita a 20 caracteres. */
function buttonTitle(label: string): string {
  return label.slice(0, 20);
}

/** Mensaje con botones de respuesta rápida (máx. 3). */
export function buildReplyButtonsMessage(to: string, text: string, options: QuickReply[]) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: markdownToWhatsApp(text) },
      action: {
        buttons: options.slice(0, 3).map((o) => ({
          type: "reply",
          reply: { id: o.id, title: buttonTitle(o.label) },
        })),
      },
    },
  };
}

/** Mensaje con un botón CTA que abre una URL. */
export function buildCtaUrlMessage(to: string, text: string, url: string, urlLabel: string) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: { text: markdownToWhatsApp(text) },
      action: {
        name: "cta_url",
        parameters: { display_text: buttonTitle(urlLabel), url },
      },
    },
  };
}

/**
 * Elige el payload adecuado para una ChoicePrompt:
 * - con opciones -> botones de respuesta (si además hay url, se añade al texto)
 * - solo url -> botón CTA
 * - sin nada -> texto plano
 */
export function buildChoicePayload(to: string, prompt: ChoicePrompt): unknown {
  const hasOptions = prompt.options && prompt.options.length > 0;
  if (hasOptions) {
    const text =
      prompt.url && prompt.urlLabel ? `${prompt.text}\n\n${prompt.urlLabel}: ${prompt.url}` : prompt.text;
    return buildReplyButtonsMessage(to, text, prompt.options!);
  }
  if (prompt.url) {
    return buildCtaUrlMessage(to, prompt.text, prompt.url, prompt.urlLabel ?? "Abrir");
  }
  return { messaging_product: "whatsapp", to, type: "text", text: { body: markdownToWhatsApp(prompt.text) } };
}

/** Marca el mensaje entrante como leído y muestra el indicador "escribiendo…". */
export function buildReadWithTyping(messageId: string) {
  return {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
    typing_indicator: { type: "text" },
  };
}
