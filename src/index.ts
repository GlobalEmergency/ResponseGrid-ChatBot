import { join } from "node:path";
import "./config/env.js";
import { env } from "./config/env.js";
import { loadAccountsFromFile } from "./config/accounts.js";
import { AccountRegistry } from "./application/account-registry.js";
import { ConversationService } from "./application/conversation-service.js";
import { FileSessionRepository } from "./infrastructure/persistence/file-session-store.js";
import { JsonTokenStore } from "./infrastructure/persistence/json-token-store.js";
import { startTelegramBots } from "./infrastructure/telegram/telegram-bootstrap.js";
import { startWhatsAppWebhookServer } from "./infrastructure/whatsapp/whatsapp-webhook-server.js";

const accountsFile = process.env.ACCOUNTS_FILE ?? join(process.cwd(), "accounts.json");
const registry = new AccountRegistry(loadAccountsFromFile(accountsFile));

const sessions = new FileSessionRepository(join(process.cwd(), ".sessions"));
const authStore = new JsonTokenStore(join(process.cwd(), ".sessions", "tokens.json"));

const conversationService = new ConversationService({
  getSession: (account, chatId) => sessions.getOrCreate(account, chatId),
  authStore,
});

const telegramBots = startTelegramBots(registry, conversationService, sessions, authStore);
// Telegraf v4: bot.launch() no resuelve hasta que el bot se DETIENE, así que NO se puede
// await aquí — bloquearía el arranque del webhook de WhatsApp y del resto del proceso.
// Se lanza en segundo plano (el long polling mantiene vivo el proceso) y se registran
// los fallos de arranque (p. ej. token inválido) sin tumbar el resto.
for (const bot of telegramBots) {
  bot.launch().catch((error) => {
    console.error("Fallo al lanzar un bot de Telegram:", error);
  });
}

const hasWhatsAppAccounts = registry.all().some((account) => account.channel === "whatsapp");

let whatsappServer: import("node:http").Server | null = null;

if (hasWhatsAppAccounts) {
  if (!env.whatsappAppSecret || !env.whatsappVerifyToken) {
    throw new Error(
      "Hay cuentas de WhatsApp en accounts.json pero faltan WHATSAPP_APP_SECRET/WHATSAPP_VERIFY_TOKEN en el entorno.",
    );
  }

  whatsappServer = startWhatsAppWebhookServer(registry, conversationService, {
    appSecret: env.whatsappAppSecret,
    verifyToken: env.whatsappVerifyToken,
    port: env.whatsappWebhookPort ?? 8787,
  });
}

console.log(
  `ResponseGrid Agent arrancado: ${telegramBots.length} bot(s) de Telegram${hasWhatsAppAccounts ? " + webhook de WhatsApp" : ""}.`,
);

function shutdown(signal: "SIGINT" | "SIGTERM"): void {
  telegramBots.forEach((bot) => bot.stop(signal));
  whatsappServer?.close();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
