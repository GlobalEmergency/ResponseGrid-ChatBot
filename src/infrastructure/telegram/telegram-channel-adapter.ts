import type { Telegraf } from "telegraf";
import type { ChoicePrompt, MessagingChannel, SelectionOption } from "../../domain/ports/messaging-channel.port.js";

function markdownToHtml(text: string): string {
  let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  html = html.replace(/```(?:[a-zA-Z0-9\-]+)?\n([\s\S]*?)\n```/g, "<pre>$1</pre>");
  html = html.replace(/```([\s\S]*?)```/g, "<pre>$1</pre>");
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^\*\n]+)\*\*/g, "<b>$1</b>");
  html = html.replace(/\*([^\*\n]+)\*/g, "<i>$1</i>");
  html = html.replace(/_([^_\n]+)_/g, "<i>$1</i>");
  html = html.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');

  return html;
}

export class TelegramChannelAdapter implements MessagingChannel {
  constructor(private readonly bot: Telegraf) {}

  async sendText(chatId: string, text: string): Promise<void> {
    const chunks = text.match(/[\s\S]{1,3900}/g) ?? [text];
    for (const chunk of chunks) {
      await this.bot.telegram.sendMessage(chatId, markdownToHtml(chunk), { parse_mode: "HTML" });
    }
  }

  async sendSelection(chatId: string, text: string, options: SelectionOption[]): Promise<void> {
    const buttons = options.slice(0, 10).map((o) => [{ text: o.label, callback_data: `select_resource:${o.id}` }]);
    await this.bot.telegram.sendMessage(chatId, markdownToHtml(text), {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons },
    });
  }

  async sendChoices(chatId: string, prompt: ChoicePrompt): Promise<void> {
    type InlineButton = { text: string; callback_data: string } | { text: string; url: string };
    const rows: InlineButton[][] = [];
    for (const o of (prompt.options ?? []).slice(0, 3)) {
      rows.push([{ text: o.label, callback_data: `qr:${o.id}` }]);
    }
    if (prompt.url) {
      rows.push([{ text: prompt.urlLabel ?? "Abrir", url: prompt.url }]);
    }
    if (rows.length === 0) {
      await this.sendText(chatId, prompt.text);
      return;
    }
    await this.bot.telegram.sendMessage(chatId, markdownToHtml(prompt.text), {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: rows },
    });
  }

  async indicateReceived(chatId: string, _messageId?: string): Promise<void> {
    // Telegram: muestra "escribiendo…" mientras se procesa. No debe tumbar el turno.
    await this.bot.telegram.sendChatAction(chatId, "typing").catch(() => undefined);
  }

  async promptPhoneShare(chatId: string, text: string): Promise<void> {
    await this.bot.telegram.sendMessage(chatId, markdownToHtml(text), {
      parse_mode: "HTML",
      reply_markup: {
        keyboard: [[{ text: "Compartir mi teléfono 📱", request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard: true,
      },
    });
  }
}
