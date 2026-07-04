import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { MemorySession, run } from "@openai/agents";
import { Telegraf } from "telegraf";
import type { Context } from "telegraf";
import { apiAgent } from "../../agent/agent.js";
import type { AgentContext } from "../../agent/context.js";
import { ApiClient } from "../../api/api-client.js";
import { transcribeAudioFile } from "../../audio/transcribe.js";
import { env } from "../../config/env.js";

class FileSession extends MemorySession {
  private filePath: string;

  constructor(options: { sessionId: string; storageDir: string }) {
    super({ sessionId: options.sessionId });

    if (!existsSync(options.storageDir)) {
      mkdirSync(options.storageDir, { recursive: true });
    }

    const safeSessionId = options.sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
    this.filePath = join(options.storageDir, `${safeSessionId}.json`);

    if (existsSync(this.filePath)) {
      try {
        const fileContent = readFileSync(this.filePath, "utf8");
        const data = JSON.parse(fileContent);
        if (data && Array.isArray(data.items)) {
          (this as any).items = data.items;
        }
      } catch (err) {
        console.error(`Error loading session file for ${options.sessionId}:`, err);
      }
    }
  }

  private saveState() {
    try {
      const items = (this as any).items;
      writeFileSync(this.filePath, JSON.stringify({ items }, null, 2), "utf8");
    } catch (err) {
      console.error(`Error saving session file for ${this.getSessionId()}:`, err);
    }
  }

  override async addItems(items: any[]): Promise<void> {
    await super.addItems(items);
    this.saveState();
  }

  override async popItem(): Promise<any> {
    const result = await super.popItem();
    this.saveState();
    return result;
  }

  override async clearSession(): Promise<void> {
    await super.clearSession();
    this.saveState();
  }
}

const sessionsDir = join(process.cwd(), ".sessions");

class PersistentTokenStore {
  private filePath: string;
  private cache: Map<string, string>;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.cache = new Map<string, string>();
    this.load();
  }

  private load() {
    if (existsSync(this.filePath)) {
      try {
        const fileContent = readFileSync(this.filePath, "utf8");
        const data = JSON.parse(fileContent);
        if (data && typeof data === "object") {
          for (const [key, value] of Object.entries(data)) {
            if (typeof value === "string") {
              this.cache.set(key, value);
            }
          }
        }
      } catch (err) {
        console.error("Error loading persistent token store:", err);
      }
    }
  }

  private save() {
    try {
      const obj: Record<string, string> = {};
      for (const [key, value] of this.cache.entries()) {
        obj[key] = value;
      }
      writeFileSync(this.filePath, JSON.stringify(obj, null, 2), "utf8");
    } catch (err) {
      console.error("Error saving persistent token store:", err);
    }
  }

  get(chatId: number | string): string | undefined {
    return this.cache.get(String(chatId));
  }

  set(chatId: number | string, token: string): void {
    this.cache.set(String(chatId), token);
    this.save();
  }

  delete(chatId: number | string): void {
    this.cache.delete(String(chatId));
    this.save();
  }

  clear(): void {
    this.cache.clear();
    this.save();
  }
}

const sessions = new Map<number, FileSession>();
const apiClient = new ApiClient();
const userTokens = new PersistentTokenStore(join(sessionsDir, "tokens.json"));

function getSession(chatId: number): FileSession {
  const existing = sessions.get(chatId);

  if (existing) {
    return existing;
  }

  const session = new FileSession({
    sessionId: `telegram:${chatId}`,
    storageDir: sessionsDir,
  });
  sessions.set(chatId, session);
  return session;
}

function buildAgentContext(ctx: Context): AgentContext {
  const chatId = ctx.chat?.id ?? 0;
  const userToken = typeof chatId === "number" ? userTokens.get(chatId) : undefined;

  return {
    channel: "telegram",
    chatId: chatId,
    user: {
      telegramUserId: ctx.from?.id,
      username: ctx.from?.username,
      firstName: ctx.from?.first_name,
    },
    // Si el usuario tiene un token vinculado, creamos un ApiClient para él con modo bearer.
    // De lo contrario, usamos el apiClient global (que usa el token de servicio por defecto)
    // solo para lectura pública: sin login no hay acciones de escritura (ver requireAuth en tools.ts).
    apiClient: userToken
      ? new ApiClient(env.apiBaseUrl, userToken, "bearer")
      : apiClient,
    authenticated: Boolean(userToken),
  };
}

function markdownToHtml(text: string): string {
  // 1. Escape HTML entities
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 2. Pre-formatted code blocks: ```ts\ncode\n``` -> <pre>code</pre>
  html = html.replace(/```(?:[a-zA-Z0-9\-]+)?\n([\s\S]*?)\n```/g, "<pre>$1</pre>");
  html = html.replace(/```([\s\S]*?)```/g, "<pre>$1</pre>");

  // 3. Inline code: `code` -> <code>code</code>
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // 4. Bold: **text** -> <b>text</b>
  html = html.replace(/\*\*([^\*\n]+)\*\*/g, "<b>$1</b>");

  // 5. Italic: *text* or _text_ -> <i>text</i>
  html = html.replace(/\*([^\*\n]+)\*/g, "<i>$1</i>");
  html = html.replace(/_([^_\n]+)_/g, "<i>$1</i>");

  // 6. Strikethrough: ~~text~~ -> <s>text</s>
  html = html.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");

  // 7. Links: [text](url) -> <a href="$2">$1</a>
  html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');

  return html;
}

async function replyLongText(ctx: any, text: string): Promise<void> {
  const safeText = text && text.trim() !== "" ? text : "No he recibido respuesta del agente.";
  const chunks = safeText.match(/[\s\S]{1,3900}/g) ?? [safeText];

  for (const chunk of chunks) {
    const formatted = markdownToHtml(chunk);
    await ctx.reply(formatted, { parse_mode: "HTML" });
  }
}

async function downloadTelegramFile(ctx: any, fileId: string): Promise<string> {
  const fileUrl = await ctx.telegram.getFileLink(fileId);
  const response = await fetch(fileUrl.href);

  if (!response.ok) {
    throw new Error(`No se pudo descargar el audio de Telegram: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const filePath = join(tmpdir(), `telegram-voice-${randomUUID()}.ogg`);
  await writeFile(filePath, Buffer.from(arrayBuffer));
  return filePath;
}

async function handleUserInput(ctx: any, userText: string): Promise<void> {
  const chatId = ctx.chat.id as number;
  const session = getSession(chatId);
  const context = buildAgentContext(ctx);

  await ctx.sendChatAction("typing");

  const result = await run(apiAgent, userText, {
    context,
    session,
  });

  if (context.showLoginButton) {
    const formatted = markdownToHtml(String(result.finalOutput));
    await ctx.reply(formatted, {
      parse_mode: "HTML",
      reply_markup: {
        keyboard: [[{ text: "Compartir mi teléfono 📱", request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard: true,
      },
    });
  } else if (context.selectableResources && context.selectableResources.length > 0) {
    const buttons = context.selectableResources.slice(0, 10).map((r) => [
      {
        text: r.name,
        callback_data: `select_resource:${r.id}`,
      },
    ]);
    const formatted = markdownToHtml(String(result.finalOutput));
    await ctx.reply(formatted, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: buttons,
      },
    });
  } else {
    await replyLongText(ctx, String(result.finalOutput));
  }
}

export function createTelegramBot(): Telegraf {
  const bot = new Telegraf(env.telegramBotToken);

  bot.start(async (ctx) => {
    await ctx.reply(
      "Hola. Soy tu agente conectado a la API. Puedes escribirme en texto, enviarme una nota de voz o compartir tu ubicación directamente.",
    );
  });

  bot.command("clear", async (ctx) => {
    const chatId = ctx.chat.id;
    const session = getSession(chatId);
    await session.clearSession();
    userTokens.delete(chatId);
    await ctx.reply("Memoria de esta conversación borrada y sesión cerrada.");
  });

  bot.on("text", async (ctx) => {
    await handleUserInput(ctx, ctx.message.text);
  });

  bot.on("voice", async (ctx) => {
    await ctx.reply("Estoy escuchando tu nota de voz...");

    const fileId = ctx.message.voice.file_id;
    const audioPath = await downloadTelegramFile(ctx, fileId);

    try {
      const transcript = await transcribeAudioFile(audioPath);
      await ctx.reply(`He entendido: “${transcript}”`);
      await handleUserInput(ctx, transcript);
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
    const { latitude, longitude } = location;
    await ctx.reply(
      `He recibido tu ubicación: Latitud ${latitude}, Longitud ${longitude}. Buscando la información más cercana...`,
    );
    await handleUserInput(
      ctx,
      `He compartido mi ubicación actual: latitud ${latitude}, longitud ${longitude}`,
    );
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

    const chatId = ctx.chat.id;
    const phone = contact.phone_number;
    const cleanPhone = phone.replace(/^\+/, "").trim();
    const cleanEnvPhone = (env.userPhone ?? "").replace(/^\+/, "").trim();

    if (env.userPhone && env.userToken && cleanPhone === cleanEnvPhone) {
      userTokens.set(chatId, env.userToken);
      await ctx.reply("🔑 ¡Autenticado con éxito! Tus credenciales se han vinculado a este chat.", {
        reply_markup: {
          remove_keyboard: true,
        },
      });
      await handleUserInput(
        ctx,
        "He iniciado sesión con éxito compartiendo mi teléfono. Por favor continúa.",
      );
    } else {
      await ctx.reply(
        `❌ No se pudo encontrar una cuenta en ResponseGrid vinculada al teléfono ${phone}.\n\n` +
          `Asegúrate de configurar las variables USER_PHONE y USER_TOKEN en tu archivo .env para habilitar la simulación de inicio de sesión.`,
        {
          reply_markup: {
            remove_keyboard: true,
          },
        },
      );
    }
  });

  bot.on("callback_query", async (ctx) => {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !("data" in callbackQuery)) return;
    const callbackData = callbackQuery.data;
    if (!callbackData) return;

    if (callbackData.startsWith("select_resource:")) {
      const resourceId = callbackData.replace("select_resource:", "");
      
      // Detener el indicador de carga en Telegram
      await ctx.answerCbQuery().catch(() => undefined);
      
      await ctx.reply("Procesando selección del centro...");
      
      // Enviar la acción al agente
      await handleUserInput(ctx, `He seleccionado el centro con ID: ${resourceId}`);
    }
  });

  bot.on("message", async (ctx) => {
    await ctx.reply(
      "Ahora mismo puedo entender texto, notas de voz, ubicaciones compartidas, contactos y botones de selección.",
    );
  });

  bot.catch((error, ctx) => {
    console.error("Error en Telegram bot", error);
    void ctx.reply("Ha ocurrido un error procesando el mensaje. Revisa los logs del servidor.");
  });

  return bot;
}
