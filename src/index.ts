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
await Promise.all(telegramBots.map((bot) => bot.launch()));

const hasWhatsAppAccounts = registry.all().some((account) => account.channel === "whatsapp");

if (hasWhatsAppAccounts) {
  if (!env.whatsappAppSecret || !env.whatsappVerifyToken) {
    throw new Error(
      "Hay cuentas de WhatsApp en accounts.json pero faltan WHATSAPP_APP_SECRET/WHATSAPP_VERIFY_TOKEN en el entorno.",
    );
  }

  startWhatsAppWebhookServer(registry, conversationService, {
    appSecret: env.whatsappAppSecret,
    verifyToken: env.whatsappVerifyToken,
    port: env.whatsappWebhookPort ?? 8787,
  });
}

console.log(
  `ResponseGrid Agent arrancado: ${telegramBots.length} bot(s) de Telegram${hasWhatsAppAccounts ? " + webhook de WhatsApp" : ""}.`,
);

process.once("SIGINT", () => telegramBots.forEach((bot) => bot.stop("SIGINT")));
process.once("SIGTERM", () => telegramBots.forEach((bot) => bot.stop("SIGTERM")));
