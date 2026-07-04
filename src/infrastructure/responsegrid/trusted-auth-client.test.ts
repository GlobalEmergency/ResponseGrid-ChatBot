import test from "node:test";
import assert from "node:assert";
import {
  TrustedAuthClient,
  PhoneNotFoundError,
  EmailAlreadyExistsError,
} from "./trusted-auth-client.js";
import type { Account } from "../../domain/account.js";

const account: Account = {
  id: "acc-1",
  channel: "telegram",
  emergencySlug: "sismo-2026",
  apiToken: "rg_live_test",
  telegramBotToken: "bot-1",
};

function withMockedFetch(handler: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

test("TrustedAuthClient", async (t) => {
  await t.test("loginByPhone devuelve el token si el usuario existe", async () => {
    await withMockedFetch(
      (async () =>
        new Response(JSON.stringify({ accessToken: "jwt-123", user: { id: "u1", name: "Ana", email: "ana@x.com" } }), {
          status: 200,
        })) as unknown as typeof fetch,
      async () => {
        const client = new TrustedAuthClient("https://api.test");
        const result = await client.loginByPhone(account, "+34600000000");
        assert.strictEqual(result.accessToken, "jwt-123");
        assert.strictEqual(result.user.email, "ana@x.com");
      },
    );
  });

  await t.test("loginByPhone lanza PhoneNotFoundError en 404", async () => {
    await withMockedFetch(
      (async () => new Response("not found", { status: 404 })) as unknown as typeof fetch,
      async () => {
        const client = new TrustedAuthClient("https://api.test");
        await assert.rejects(() => client.loginByPhone(account, "+34600000000"), PhoneNotFoundError);
      },
    );
  });

  await t.test("registerByPhone lanza EmailAlreadyExistsError en 409", async () => {
    await withMockedFetch(
      (async () => new Response("conflict", { status: 409 })) as unknown as typeof fetch,
      async () => {
        const client = new TrustedAuthClient("https://api.test");
        await assert.rejects(
          () => client.registerByPhone(account, { phone: "+34600000000", name: "Ana", email: "ana@x.com" }),
          EmailAlreadyExistsError,
        );
      },
    );
  });

  await t.test("registerByPhone devuelve el token en éxito", async () => {
    await withMockedFetch(
      (async () =>
        new Response(JSON.stringify({ accessToken: "jwt-456", user: { id: "u2", name: "Ana", email: "ana@x.com" } }), {
          status: 201,
        })) as unknown as typeof fetch,
      async () => {
        const client = new TrustedAuthClient("https://api.test");
        const result = await client.registerByPhone(account, { phone: "+34600000000", name: "Ana", email: "ana@x.com" });
        assert.strictEqual(result.accessToken, "jwt-456");
      },
    );
  });
});
