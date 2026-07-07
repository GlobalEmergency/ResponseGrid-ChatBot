import test from "node:test";
import assert from "node:assert";
import { pruneItems, sanitizeItems } from "./file-session-store.js";

const msg = (i: number) => ({ type: "message", role: "user", content: `m${i}` });
const call = (i: number) => ({ type: "function_call", name: `t${i}`, callId: `c${i}` });
const result = (i: number) => ({ type: "function_call_result", name: `t${i}`, callId: `c${i}` });

test("pruneItems", async (t) => {
  await t.test("no toca un historial por debajo del máximo", () => {
    const items = [msg(1), msg(2), msg(3)];
    assert.deepStrictEqual(pruneItems(items, 60), items);
  });

  await t.test("recorta a los últimos `max` items", () => {
    const items = Array.from({ length: 100 }, (_, i) => msg(i));
    const pruned = pruneItems(items, 60);
    assert.strictEqual(pruned.length, 60);
    assert.strictEqual(pruned[pruned.length - 1].content, "m99", "conserva el más reciente");
  });

  await t.test("descarta resultados de tool huérfanos que deja el recorte", () => {
    // Tras recortar, el primer item sería un function_call_result sin su llamada.
    const items = [call(0), result(0), msg(1), msg(2)];
    const pruned = pruneItems(items, 3); // últimos 3 = [result(0), msg1, msg2] -> huérfano
    assert.ok(
      !pruned.some((it) => it.type === "function_call_result"),
      "no queda ningún resultado huérfano",
    );
    assert.strictEqual(pruned[0].type, "message");
  });

  await t.test("conserva una function_call con su resultado", () => {
    const items = [msg(0), call(1), result(1), msg(2)];
    const pruned = pruneItems(items, 3); // últimos 3 = [call1, result1, msg2]
    assert.strictEqual(pruned[0].type, "function_call", "la llamada con su resultado se conserva");
    assert.strictEqual(pruned.length, 3);
  });
});

test("sanitizeItems", async (t) => {
  await t.test("quita un resultado huérfano en medio del historial (el bug del crash)", () => {
    // Un resultado con callId cuya llamada no está: rompe la API de OpenAI.
    const items = [msg(0), result(7), msg(1)];
    const clean = sanitizeItems(items);
    assert.deepStrictEqual(clean, [msg(0), msg(1)]);
  });

  await t.test("conserva pares completos", () => {
    const items = [msg(0), call(1), result(1), msg(2)];
    assert.deepStrictEqual(sanitizeItems(items), items);
  });

  await t.test("solo con dropDanglingCalls quita una llamada sin resultado", () => {
    const items = [msg(0), call(3), msg(1)];
    assert.deepStrictEqual(sanitizeItems(items), items, "por defecto NO quita llamadas colgantes");
    assert.deepStrictEqual(
      sanitizeItems(items, { dropDanglingCalls: true }),
      [msg(0), msg(1)],
      "al cargar (reposo) sí las quita",
    );
  });

  await t.test("conserva resultados sin callId (no se pueden juzgar)", () => {
    const noId = { type: "function_call_result", name: "x" };
    assert.deepStrictEqual(sanitizeItems([msg(0), noId]), [msg(0), noId]);
  });
});
