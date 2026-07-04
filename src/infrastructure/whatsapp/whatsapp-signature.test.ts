import test from "node:test";
import assert from "node:assert";
import { createHmac } from "node:crypto";
import { isValidWhatsAppSignature } from "./whatsapp-signature.js";

const appSecret = "test-secret";

function sign(body: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;
}

test("isValidWhatsAppSignature", async (t) => {
  await t.test("acepta una firma válida", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }));
    const signature = sign(body.toString());
    assert.strictEqual(isValidWhatsAppSignature(body, signature, appSecret), true);
  });

  await t.test("rechaza una firma con el cuerpo alterado", () => {
    const original = Buffer.from(JSON.stringify({ hello: "world" }));
    const signature = sign(original.toString());
    const tampered = Buffer.from(JSON.stringify({ hello: "mundo" }));
    assert.strictEqual(isValidWhatsAppSignature(tampered, signature, appSecret), false);
  });

  await t.test("rechaza si falta la cabecera", () => {
    const body = Buffer.from("{}");
    assert.strictEqual(isValidWhatsAppSignature(body, undefined, appSecret), false);
  });

  await t.test("rechaza si la cabecera no tiene el prefijo sha256=", () => {
    const body = Buffer.from("{}");
    assert.strictEqual(isValidWhatsAppSignature(body, "abc123", appSecret), false);
  });
});
