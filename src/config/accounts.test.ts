import test from "node:test";
import assert from "node:assert";
import { parseAccounts } from "./accounts.js";

test("parseAccounts", async (t) => {
  await t.test("acepta una cuenta de telegram válida", () => {
    const accounts = parseAccounts(
      JSON.stringify([
        {
          id: "acc-telegram-1",
          channel: "telegram",
          emergencySlug: "terremoto-venezuela-2026",
          apiToken: "rg_live_xxx",
          telegramBotToken: "123:ABC",
        },
      ]),
    );
    assert.strictEqual(accounts.length, 1);
    assert.strictEqual(accounts[0].channel, "telegram");
  });

  await t.test("acepta una cuenta de whatsapp válida", () => {
    const accounts = parseAccounts(
      JSON.stringify([
        {
          id: "acc-whatsapp-1",
          channel: "whatsapp",
          emergencySlug: "terremoto-venezuela-2026",
          apiToken: "rg_live_yyy",
          whatsappPhoneNumberId: "1234567890",
          whatsappAccessToken: "EAAG...",
        },
      ]),
    );
    assert.strictEqual(accounts.length, 1);
    assert.strictEqual(accounts[0].channel, "whatsapp");
  });

  await t.test("rechaza ids duplicados", () => {
    const raw = JSON.stringify([
      { id: "dup", channel: "telegram", emergencySlug: "a", apiToken: "t", telegramBotToken: "b" },
      { id: "dup", channel: "telegram", emergencySlug: "a", apiToken: "t2", telegramBotToken: "b2" },
    ]);
    assert.throws(() => parseAccounts(raw), /duplicado/);
  });

  await t.test("rechaza una cuenta sin los campos requeridos por su canal", () => {
    const raw = JSON.stringify([{ id: "x", channel: "telegram", emergencySlug: "a", apiToken: "t" }]);
    assert.throws(() => parseAccounts(raw));
  });

  await t.test("rechaza un array vacío", () => {
    assert.throws(() => parseAccounts("[]"));
  });

  await t.test("rechaza JSON malformado con mensaje claro", () => {
    assert.throws(() => parseAccounts("{invalid json"), (err) => {
      return (err as Error).message.includes("accounts.json no es JSON válido");
    });
  });

  await t.test("rechaza un top-level JSON no-array", () => {
    assert.throws(() => parseAccounts("{}"));
  });
});
