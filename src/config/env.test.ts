import test from "node:test";
import assert from "node:assert";
import { DEFAULT_OPENAI_MODEL, resolveOpenAIModel } from "./env.js";

test("resolveOpenAIModel", async (t) => {
  await t.test("sin OPENAI_MODEL usa el modelo por defecto explícito (no el del SDK)", () => {
    assert.strictEqual(DEFAULT_OPENAI_MODEL, "gpt-5.4-mini");
    assert.strictEqual(resolveOpenAIModel(undefined), "gpt-5.4-mini");
    assert.strictEqual(resolveOpenAIModel(""), "gpt-5.4-mini");
    assert.strictEqual(resolveOpenAIModel("   "), "gpt-5.4-mini");
  });

  await t.test("respeta OPENAI_MODEL si está definido", () => {
    assert.strictEqual(resolveOpenAIModel("gpt-5.5"), "gpt-5.5");
    assert.strictEqual(resolveOpenAIModel(" gpt-5.5 "), "gpt-5.5");
  });
});
