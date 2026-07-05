import test from "node:test";
import assert from "node:assert";
import {
  buildReplyButtonsMessage,
  buildCtaUrlMessage,
  buildChoicePayload,
  buildReadWithTyping,
} from "./whatsapp-payloads.js";

test("whatsapp-payloads", async (t) => {
  await t.test("reply buttons: máx 3 y título recortado a 20 chars", () => {
    const p = buildReplyButtonsMessage("34600", "Elige:", [
      { id: "a", label: "Ver inventario" },
      { id: "b", label: "Ver estado" },
      { id: "c", label: "Registrar una entrada muy larga de texto" },
      { id: "d", label: "Cuarta (se descarta)" },
    ]) as any;
    assert.strictEqual(p.interactive.type, "button");
    assert.strictEqual(p.interactive.action.buttons.length, 3);
    assert.strictEqual(p.interactive.action.buttons[0].reply.id, "a");
    assert.strictEqual(p.interactive.action.buttons[2].reply.title.length, 20);
  });

  await t.test("reply buttons: el body convierte markdown a WhatsApp", () => {
    const p = buildReplyButtonsMessage("34600", "**Elige** una", [{ id: "a", label: "A" }]) as any;
    assert.strictEqual(p.interactive.body.text, "*Elige* una");
  });

  await t.test("cta_url: botón con enlace", () => {
    const p = buildCtaUrlMessage("34600", "Míralo", "https://x.com", "Abrir web") as any;
    assert.strictEqual(p.interactive.type, "cta_url");
    assert.strictEqual(p.interactive.action.parameters.url, "https://x.com");
    assert.strictEqual(p.interactive.action.parameters.display_text, "Abrir web");
  });

  await t.test("buildChoicePayload elige botones cuando hay opciones", () => {
    const p = buildChoicePayload("34600", { text: "t", options: [{ id: "a", label: "A" }] }) as any;
    assert.strictEqual(p.interactive.type, "button");
  });

  await t.test("buildChoicePayload usa cta_url si solo hay url", () => {
    const p = buildChoicePayload("34600", { text: "t", url: "https://x.com", urlLabel: "Ver" }) as any;
    assert.strictEqual(p.interactive.type, "cta_url");
  });

  await t.test("buildChoicePayload cae a texto si no hay opciones ni url", () => {
    const p = buildChoicePayload("34600", { text: "hola" }) as any;
    assert.strictEqual(p.type, "text");
    assert.strictEqual(p.text.body, "hola");
  });

  await t.test("read+typing marca leído y muestra escribiendo", () => {
    const p = buildReadWithTyping("wamid.123") as any;
    assert.strictEqual(p.status, "read");
    assert.strictEqual(p.message_id, "wamid.123");
    assert.strictEqual(p.typing_indicator.type, "text");
  });
});
