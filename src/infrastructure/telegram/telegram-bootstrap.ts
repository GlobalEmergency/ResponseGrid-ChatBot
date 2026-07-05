import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import { Telegraf } from "telegraf";
import type { TelegramAccount } from "../../domain/account.js";
import { accountKey } from "../../domain/account.js";
import type { AccountRegistry } from "../../application/account-registry.js";
import type { ConversationService } from "../../application/conversation-service.js";
import type { FileSessionRepository } from "../persistence/file-session-store.js";
import type { AuthStore } from "../../domain/ports/auth-store.port.js";
import { transcribeAudioFile } from "../../audio/transcribe.js";
import { TelegramChannelAdapter } from "./telegram-channel-adapter.js";

export function startTelegramBots(
  registry: AccountRegistry,
  conversationService: ConversationService,
  sessions: FileSessionRepository,
  authStore: AuthStore,
): Telegraf[] {
  const telegramAccounts = registry.all().filter((a): a is TelegramAccount => a.channel === "telegram");
  return telegramAccounts.map((account) => createBotForAccount(account, conversationService, sessions, authStore));
}

function createBotForAccount(
  account: TelegramAccount,
  conversationService: ConversationService,
  sessions: FileSessionRepository,
  authStore: AuthStore,
): Telegraf {
  const bot = new Telegraf(account.telegramBotToken);
  const channel = new TelegramChannelAdapter(bot);

  bot.start(async (ctx) => {
    await ctx.reply(
      "Hola. Soy tu agente conectado a la API. Puedes escribirme en texto, enviarme una nota de voz o compartir tu ubicación directamente.",
    );
  });

  bot.command("clear", async (ctx) => {
    const chatId = String(ctx.chat.id);
    await sessions.clear(account, chatId);
    authStore.delete(accountKey(account, chatId));
    await ctx.reply("Memoria de esta conversación borrada y sesión cerrada.");
  });

  bot.on("text", async (ctx) => {
    const chatId = String(ctx.chat.id);
    await conversationService.handle({ account, chatId, text: ctx.message.text }, channel);
  });

  bot.on("voice", async (ctx) => {
    await ctx.reply("Estoy escuchando tu nota de voz...");
    const chatId = String(ctx.chat.id);
    const fileId = ctx.message.voice.file_id;
    const audioPath = await downloadTelegramFile(bot, fileId);

    try {
      const transcript = await transcribeAudioFile(audioPath);
      await ctx.reply(`He entendido: "${transcript}"`);
      await conversationService.handle({ account, chatId, text: transcript }, channel);
    } finally {
      await unlink(audioPath).catch(() => undefined);
    }
  });

  bot.on("location", async (ctx) => {
    const location = ctx.message.location;
    if (!location) {
      await ctx.reply("No se pudo obtener la ubicación.");
      return;
    }
    const chatId = String(ctx.chat.id);
    const { latitude, longitude } = location;
    await ctx.reply(
      `He recibido tu ubicación: Latitud ${latitude}, Longitud ${longitude}. Buscando la información más cercana...`,
    );
    await conversationService.handle({ account, chatId, location: { latitude, longitude } }, channel);
  });

  bot.on("contact", async (ctx) => {
    const contact = ctx.message.contact;
    if (!contact) {
      await ctx.reply("No se pudo obtener el contacto.");
      return;
    }

    if (contact.user_id !== ctx.from.id) {
      await ctx.reply("❌ Error de seguridad: Debes compartir tu propio número de teléfono.");
      return;
    }

    const chatId = String(ctx.chat.id);
    const verifiedPhone = contact.phone_number.startsWith("+") ? contact.phone_number : `+${contact.phone_number}`;

    await conversationService.handle(
      { account, chatId, text: "He compartido mi teléfono para iniciar sesión.", verifiedPhone },
      channel,
    );
  });

  bot.on("callback_query", async (ctx) => {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !("data" in callbackQuery)) return;
    const callbackData = callbackQuery.data;
    if (!callbackData) return;

    // Selección de recurso (lista) o botón de respuesta rápida (qr:).
    let selectionCallback: string | undefined;
    if (callbackData.startsWith("select_resource:")) {
      selectionCallback = callbackData.replace("select_resource:", "");
    } else if (callbackData.startsWith("qr:")) {
      selectionCallback = callbackData.replace("qr:", "");
    }
    if (selectionCallback === undefined) return;

    await ctx.answerCbQuery().catch(() => undefined);

    const chatId = String(ctx.chat!.id);
    await conversationService.handle({ account, chatId, selectionCallback }, channel);
  });

  bot.on("message", async (ctx) => {
    await ctx.reply(
      "Ahora mismo puedo entender texto, notas de voz, ubicaciones compartidas, contactos y botones de selección.",
    );
  });

  bot.catch((error, ctx) => {
    console.error(`Error en Telegram bot (cuenta ${account.id})`, error);
    void ctx.reply("Ha ocurrido un error procesando el mensaje. Revisa los logs del servidor.");
  });

  return bot;
}

async function downloadTelegramFile(bot: Telegraf, fileId: string): Promise<string> {
  const fileUrl = await bot.telegram.getFileLink(fileId);
  const response = await fetch(fileUrl.href);

  if (!response.ok) {
    throw new Error(`No se pudo descargar el audio de Telegram: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const filePath = join(tmpdir(), `telegram-voice-${randomUUID()}.ogg`);
  await writeFile(filePath, Buffer.from(arrayBuffer));
  return filePath;
}
