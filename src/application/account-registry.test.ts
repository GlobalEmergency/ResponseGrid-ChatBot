import test from "node:test";
import assert from "node:assert";
import { AccountRegistry } from "./account-registry.js";
import type { Account } from "../domain/account.js";

const fixtureAccounts: Account[] = [
  {
    id: "acc-tg",
    channel: "telegram",
    emergencySlug: "sismo-2026",
    apiToken: "token-tg",
    telegramBotToken: "bot-token-1",
  },
  {
    id: "acc-wa",
    channel: "whatsapp",
    emergencySlug: "sismo-2026",
    apiToken: "token-wa",
    whatsappPhoneNumberId: "phone-id-1",
    whatsappAccessToken: "wa-access-1",
  },
];

test("AccountRegistry", async (t) => {
  await t.test("all() devuelve todas las cuentas", () => {
    const registry = new AccountRegistry(fixtureAccounts);
    assert.strictEqual(registry.all().length, 2);
  });

  await t.test("findById encuentra por id", () => {
    const registry = new AccountRegistry(fixtureAccounts);
    assert.strictEqual(registry.findById("acc-tg")?.id, "acc-tg");
    assert.strictEqual(registry.findById("no-existe"), undefined);
  });

  await t.test("findByTelegramBotToken encuentra la cuenta correcta", () => {
    const registry = new AccountRegistry(fixtureAccounts);
    assert.strictEqual(registry.findByTelegramBotToken("bot-token-1")?.id, "acc-tg");
  });

  await t.test("findByWhatsappPhoneNumberId encuentra la cuenta correcta", () => {
    const registry = new AccountRegistry(fixtureAccounts);
    assert.strictEqual(registry.findByWhatsappPhoneNumberId("phone-id-1")?.id, "acc-wa");
  });
});
