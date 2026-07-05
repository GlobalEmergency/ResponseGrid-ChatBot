import test from "node:test";
import assert from "node:assert";
import { pruneItems } from "./file-session-store.js";

const msg = (i: number) => ({ type: "message", role: "user", content: `m${i}` });
const call = (i: number) => ({ type: "function_call", name: `t${i}` });
const result = (i: number) => ({ type: "function_call_result", name: `t${i}` });

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

  await t.test("descarta resultados de tool huérfanos al principio", () => {
    // Tras recortar, el primer item sería un function_call_result sin su llamada.
    const items = [call(0), result(0), msg(1), msg(2)];
    const pruned = pruneItems(items, 3); // últimos 3 = [result(0), msg1, msg2] -> huérfano al frente
    assert.notStrictEqual(pruned[0].type, "function_call_result", "no empieza por un resultado huérfano");
    assert.strictEqual(pruned[0].type, "message");
  });

  await t.test("conserva una function_call al frente (su resultado viene después)", () => {
    const items = [msg(0), call(1), result(1), msg(2)];
    const pruned = pruneItems(items, 3); // últimos 3 = [call1, result1, msg2]
    assert.strictEqual(pruned[0].type, "function_call", "una llamada al frente sí se conserva");
    assert.strictEqual(pruned.length, 3);
  });
});
