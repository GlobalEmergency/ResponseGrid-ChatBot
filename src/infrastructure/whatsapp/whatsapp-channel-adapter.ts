import type { WhatsAppAccount } from "../../domain/account.js";
import type { ChoicePrompt, MessagingChannel, SelectionOption } from "../../domain/ports/messaging-channel.port.js";
import { GRAPH_API_VERSION } from "./graph-api.js";
import { markdownToWhatsApp } from "./whatsapp-format.js";
import { buildChoicePayload, buildReadWithTyping } from "./whatsapp-payloads.js";

export class WhatsAppChannelAdapter implements MessagingChannel {
  constructor(private readonly account: WhatsAppAccount) {}

  async sendText(chatId: string, text: string): Promise<void> {
    const formatted = markdownToWhatsApp(text);
    const chunks = formatted.match(/[\s\S]{1,4096}/g) ?? [formatted];
    for (const chunk of chunks) {
      await this.callSendApi({ messaging_product: "whatsapp", to: chatId, type: "text", text: { body: chunk } });
    }
  }

  async sendSelection(chatId: string, text: string, options: SelectionOption[]): Promise<void> {
    await this.callSendApi({
      messaging_product: "whatsapp",
      to: chatId,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: markdownToWhatsApp(text) },
        action: {
          button: "Seleccionar",
          sections: [
            {
              title: "Opciones",
              rows: options.slice(0, 10).map((o) => ({ id: o.id, title: o.label.slice(0, 24) })),
            },
          ],
        },
      },
    });
  }

  async sendChoices(chatId: string, prompt: ChoicePrompt): Promise<void> {
    await this.callSendApi(buildChoicePayload(chatId, prompt));
  }

  async promptPhoneShare(chatId: string, text: string): Promise<void> {
    // ponytail: WhatsApp ya entrega el teléfono verificado en cada mensaje (wa_id); no hace falta un botón.
    await this.sendText(chatId, text);
  }

  async indicateReceived(_chatId: string, messageId?: string): Promise<void> {
    // Marca leído + "escribiendo…" mientras el agente procesa. Requiere el wamid.
    // No debe tumbar el turno si falla, así que se ignoran los errores.
    if (!messageId) {
      return;
    }
    await this.callSendApi(buildReadWithTyping(messageId)).catch(() => undefined);
  }

  private async callSendApi(body: unknown): Promise<void> {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${this.account.whatsappPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.account.whatsappAccessToken}` },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      throw new Error(`Error enviando mensaje de WhatsApp: ${response.status} ${await response.text()}`);
    }
  }
}
