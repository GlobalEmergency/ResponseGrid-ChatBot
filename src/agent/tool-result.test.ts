import test from "node:test";
import assert from "node:assert";
import { capLargeArrays, toToolJson } from "./tool-result.js";

test("capLargeArrays", async (t) => {
  await t.test("deja intacto un array pequeño", () => {
    const arr = [{ id: 1 }, { id: 2 }];
    assert.deepStrictEqual(capLargeArrays(arr, 25), arr);
  });

  await t.test("recorta un array suelto grande y añade total/hint", () => {
    const arr = Array.from({ length: 40 }, (_, i) => ({ id: i }));
    const capped = capLargeArrays(arr, 25) as any;
    assert.strictEqual(capped.total, 40);
    assert.strictEqual(capped.showing, 25);
    assert.strictEqual(capped.truncated, true);
    assert.strictEqual(capped.results.length, 25);
    assert.ok(typeof capped.hint === "string" && capped.hint.length > 0);
  });

  await t.test("recorta el array bajo results/items y conserva el resto del objeto", () => {
    const obj = { page: 2, results: Array.from({ length: 30 }, (_, i) => i) };
    const capped = capLargeArrays(obj, 10) as any;
    assert.strictEqual(capped.page, 2, "conserva otras claves del objeto");
    assert.strictEqual(capped.results.length, 10);
    assert.strictEqual(capped.total, 30);
  });

  await t.test("deja intacto un objeto sin listas grandes", () => {
    const obj = { id: "x", name: "Centro" };
    assert.deepStrictEqual(capLargeArrays(obj, 25), obj);
  });

  await t.test("toToolJson devuelve JSON válido recortado", () => {
    const arr = Array.from({ length: 100 }, (_, i) => i);
    const parsed = JSON.parse(toToolJson(arr, 25));
    assert.strictEqual(parsed.results.length, 25);
    assert.strictEqual(parsed.total, 100);
  });
});
