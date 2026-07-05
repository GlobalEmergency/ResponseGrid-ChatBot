import test from "node:test";
import assert from "node:assert";
import { RateLimiter } from "./rate-limiter.js";

test("RateLimiter", async (t) => {
  await t.test("permite hasta el límite por minuto y luego bloquea", () => {
    const rl = new RateLimiter(3, 100);
    const t0 = 1_000_000;
    assert.strictEqual(rl.check("a", t0).allowed, true);
    assert.strictEqual(rl.check("a", t0).allowed, true);
    assert.strictEqual(rl.check("a", t0).allowed, true);
    const blocked = rl.check("a", t0);
    assert.strictEqual(blocked.allowed, false);
    assert.strictEqual(blocked.scope, "minute");
    assert.ok((blocked.retryAfterMs ?? 0) > 0);
  });

  await t.test("resetea la ventana de minuto pasado 1 minuto", () => {
    const rl = new RateLimiter(2, 100);
    const t0 = 1_000_000;
    rl.check("a", t0);
    rl.check("a", t0);
    assert.strictEqual(rl.check("a", t0).allowed, false);
    assert.strictEqual(rl.check("a", t0 + 60_000).allowed, true, "tras 60s vuelve a permitir");
  });

  await t.test("aplica el límite diario aunque no se supere el de minuto", () => {
    const rl = new RateLimiter(1000, 5);
    let t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(rl.check("a", t0).allowed, true);
      t0 += 60_000; // avanza para no chocar con el límite por minuto
    }
    const blocked = rl.check("a", t0);
    assert.strictEqual(blocked.allowed, false);
    assert.strictEqual(blocked.scope, "day");
  });

  await t.test("las claves son independientes", () => {
    const rl = new RateLimiter(1, 100);
    assert.strictEqual(rl.check("a", 1).allowed, true);
    assert.strictEqual(rl.check("b", 1).allowed, true, "otra clave no se ve afectada");
    assert.strictEqual(rl.check("a", 1).allowed, false);
  });
});
