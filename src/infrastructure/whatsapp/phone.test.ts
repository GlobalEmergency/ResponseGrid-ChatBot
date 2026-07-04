import test from "node:test";
import assert from "node:assert";
import { canonicalPhone } from "./phone.js";

test("canonicalPhone", async (t) => {
  await t.test("añade el prefijo + a un wa_id sin él", () => {
    assert.strictEqual(canonicalPhone("34600123456"), "+34600123456");
  });

  await t.test("no duplica el prefijo si ya viene con +", () => {
    assert.strictEqual(canonicalPhone("+34600123456"), "+34600123456");
  });
});
