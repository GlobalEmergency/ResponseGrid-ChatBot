import test from "node:test";
import assert from "node:assert";
import { buildLogLine, truncate } from "./conversation-logger.js";

test("conversation-logger", async (t) => {
  await t.test("truncate aplana espacios y recorta a la longitud máxima", () => {
    assert.strictEqual(truncate("  hola   mundo  "), "hola mundo");
    const long = "a".repeat(300);
    const out = truncate(long, 240)!;
    assert.strictEqual(out.length, 241); // 240 + "…"
    assert.ok(out.endsWith("…"));
  });

  await t.test("buildLogLine incluye los campos base y omite los ausentes", () => {
    const line = buildLogLine(
      { kind: "inbound", channel: "whatsapp", accountId: "acc-1", chatId: "34600", userText: "hola" },
      "2026-07-05T18:00:00.000Z",
    );
    assert.strictEqual(line.t, "conv");
    assert.strictEqual(line.ts, "2026-07-05T18:00:00.000Z");
    assert.strictEqual(line.kind, "inbound");
    assert.strictEqual(line.channel, "whatsapp");
    assert.strictEqual(line.account, "acc-1");
    assert.strictEqual(line.chatId, "34600");
    assert.strictEqual(line.user, "hola");
    assert.ok(!("reply" in line), "no incluye campos ausentes");
    assert.ok(!("ms" in line));
  });

  await t.test("buildLogLine recorta previews largos de usuario y respuesta", () => {
    const line = buildLogLine(
      { kind: "turn", channel: "telegram", accountId: "a", chatId: "c", reply: "x".repeat(500), ms: 1200 },
      "2026-07-05T18:00:00.000Z",
    );
    assert.ok(String(line.reply).endsWith("…"));
    assert.strictEqual(line.ms, 1200);
  });

  await t.test("no filtra tokens: solo registra los campos que se le pasan", () => {
    const line = buildLogLine(
      { kind: "turn", channel: "telegram", accountId: "a", chatId: "c" },
      "2026-07-05T18:00:00.000Z",
    );
    const serialized = JSON.stringify(line);
    assert.ok(!/token|secret|bearer/i.test(serialized));
  });
});
