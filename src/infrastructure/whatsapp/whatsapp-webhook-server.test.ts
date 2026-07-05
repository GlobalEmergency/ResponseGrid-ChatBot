import test from "node:test";
import assert from "node:assert";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { startWhatsAppWebhookServer } from "./whatsapp-webhook-server.js";
import { AccountRegistry } from "../../application/account-registry.js";
import type { ConversationService } from "../../application/conversation-service.js";

const APP_SECRET = "test-app-secret";
const VERIFY_TOKEN = "test-verify-token";

function sign(body: string): string {
  return `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;
}

async function withServer(run: (base: string) => Promise<void>) {
  const registry = new AccountRegistry([
    { id: "wa", channel: "whatsapp", emergencySlug: "e", apiToken: "t", whatsappPhoneNumberId: "PNID", whatsappAccessToken: "at" },
  ]);
  let handled = 0;
  const convStub = { handle: async () => void (handled += 1) } as unknown as ConversationService;

  const server = startWhatsAppWebhookServer(registry, convStub, {
    appSecret: APP_SECRET,
    verifyToken: VERIFY_TOKEN,
    port: 0,
  });
  await new Promise<void>((resolve) => (server.listening ? resolve() : server.once("listening", resolve)));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("whatsapp-webhook-server (seguridad)", async (t) => {
  await t.test("GET verify con token correcto devuelve el challenge", async () => {
    await withServer(async (base) => {
      const r = await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=xyz`);
      assert.strictEqual(r.status, 200);
      assert.strictEqual(await r.text(), "xyz");
    });
  });

  await t.test("GET verify con token incorrecto -> 403", async () => {
    await withServer(async (base) => {
      const r = await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=MAL&hub.challenge=xyz`);
      assert.strictEqual(r.status, 403);
    });
  });

  await t.test("POST sin firma -> 401 (no procesa nada)", async () => {
    await withServer(async (base) => {
      const r = await fetch(`${base}/webhook/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
      });
      assert.strictEqual(r.status, 401);
    });
  });

  await t.test("POST con firma inválida -> 401", async () => {
    await withServer(async (base) => {
      const r = await fetch(`${base}/webhook/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Hub-Signature-256": "sha256=deadbeef" },
        body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
      });
      assert.strictEqual(r.status, 401);
    });
  });

  await t.test("POST con firma válida -> 200", async () => {
    await withServer(async (base) => {
      const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
      const r = await fetch(`${base}/webhook/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sign(body) },
        body,
      });
      assert.strictEqual(r.status, 200);
    });
  });

  await t.test("ruta desconocida -> 404", async () => {
    await withServer(async (base) => {
      const r = await fetch(`${base}/otra`);
      assert.strictEqual(r.status, 404);
    });
  });
});
