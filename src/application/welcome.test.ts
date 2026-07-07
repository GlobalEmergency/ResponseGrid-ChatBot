import test from "node:test";
import assert from "node:assert";
import { detectGreeting } from "./welcome.js";

test("detectGreeting", () => {
  // Saludos puros en español.
  assert.strictEqual(detectGreeting("Hola"), "es");
  assert.strictEqual(detectGreeting("hola!!"), "es");
  assert.strictEqual(detectGreeting("Buenas"), "es");
  assert.strictEqual(detectGreeting("Buenos días"), "es");
  assert.strictEqual(detectGreeting("buenas tardes"), "es");
  assert.strictEqual(detectGreeting("/start"), "es");

  // Saludos puros en inglés.
  assert.strictEqual(detectGreeting("Hi"), "en");
  assert.strictEqual(detectGreeting("hello"), "en");
  assert.strictEqual(detectGreeting("good morning"), "en");

  // NO son saludos puros -> null (va al agente).
  assert.strictEqual(detectGreeting("hola, quiero llevar agua"), null);
  assert.strictEqual(detectGreeting("busca agua cerca"), null);
  assert.strictEqual(detectGreeting(""), null);
  assert.strictEqual(detectGreeting(undefined), null);
});
