import { createTelegramBot } from "./channels/telegram/telegram-bot.js";
import "./config/env.js";

const bot = createTelegramBot();

await bot.launch();

console.log("Telegram OpenAI Agent arrancado con long polling.");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
