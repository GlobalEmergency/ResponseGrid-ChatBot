import test from "node:test";
import assert from "node:assert";
import { Email } from "./email.js";

test("Email", async (t) => {
  await t.test("acepta emails con formato válido", () => {
    for (const raw of ["ana@x.com", "ana.perez+rg@correo.gob.ve", "a_b-c@sub.dominio.org"]) {
      const email = Email.tryCreate(raw);
      assert.ok(email, `debería aceptar ${raw}`);
      assert.strictEqual(email.value, raw);
    }
  });

  await t.test("recorta los espacios de alrededor", () => {
    const email = Email.tryCreate("  ana@x.com \n");
    assert.strictEqual(email?.value, "ana@x.com");
    assert.strictEqual(String(email), "ana@x.com");
  });

  await t.test("rechaza emails con formato no válido", () => {
    for (const raw of ["", "   ", "ana", "ana@", "@x.com", "ana@x", "ana@x.c", "ana x@y.com", "ana@@x.com", "ana@x .com"]) {
      assert.strictEqual(Email.tryCreate(raw), undefined, `debería rechazar '${raw}'`);
    }
  });
});
