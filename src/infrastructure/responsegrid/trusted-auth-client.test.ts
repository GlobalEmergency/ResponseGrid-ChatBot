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

interface CapturedCall {
  url: string;
  init: RequestInit;
}

let lastCall: CapturedCall | null = null;

function withMockedFetch(handler: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  lastCall = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    lastCall = { url, init: init || {} };
    return handler(url, init);
  }) as unknown as typeof fetch;
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

        // Assert request URL, method, header, and body
        assert.ok(lastCall, "fetch should have been called");
        assert.ok(lastCall!.url.endsWith("/auth/trusted/login-by-phone"), `URL should end with /auth/trusted/login-by-phone, got: ${lastCall!.url}`);
        assert.strictEqual(lastCall!.init.method, "POST", "method should be POST");
        assert.strictEqual((lastCall!.init.headers as Record<string, string>)["X-API-Key"], account.apiToken, "X-API-Key header should match account.apiToken");
        const body = JSON.parse(lastCall!.init.body as string);
        assert.strictEqual(body.phone, "+34600000000", "body.phone should match input phone");
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

        // Assert request URL, method, header, and body
        assert.ok(lastCall, "fetch should have been called");
        assert.ok(lastCall!.url.endsWith("/auth/trusted/register-by-phone"), `URL should end with /auth/trusted/register-by-phone, got: ${lastCall!.url}`);
        assert.strictEqual(lastCall!.init.method, "POST", "method should be POST");
        assert.strictEqual((lastCall!.init.headers as Record<string, string>)["X-API-Key"], account.apiToken, "X-API-Key header should match account.apiToken");
        const body = JSON.parse(lastCall!.init.body as string);
        assert.strictEqual(body.phone, "+34600000000", "body.phone should match input phone");
        assert.strictEqual(body.name, "Ana", "body.name should match input name");
        assert.strictEqual(body.email, "ana@x.com", "body.email should match input email");
        assert.strictEqual(body.acceptedTerms, true, "body.acceptedTerms should be true");
        assert.strictEqual(body.acceptedPrivacy, true, "body.acceptedPrivacy should be true");
      },
    );
  });
});
