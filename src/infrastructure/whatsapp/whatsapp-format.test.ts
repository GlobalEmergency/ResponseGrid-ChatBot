import test from "node:test";
import assert from "node:assert";
import { markdownToWhatsApp } from "./whatsapp-format.js";

test("markdownToWhatsApp", async (t) => {
  await t.test("convierte **negrita** a *negrita* (un asterisco)", () => {
    assert.strictEqual(markdownToWhatsApp("Inventario de **TEST HOSPITAL DEV**:"), "Inventario de *TEST HOSPITAL DEV*:");
  });

  await t.test("convierte varias negritas en una línea", () => {
    assert.strictEqual(markdownToWhatsApp("- **Nolotil** — 10 cajas y **Atorvastatina**"), "- *Nolotil* — 10 cajas y *Atorvastatina*");
  });

  await t.test("no deja asteriscos sueltos con negrita al final de frase", () => {
    const out = markdownToWhatsApp("el **inventario real** es:");
    assert.strictEqual(out, "el *inventario real* es:");
    assert.ok(!out.includes("**"));
  });

  await t.test("tachado ~~x~~ -> ~x~", () => {
    assert.strictEqual(markdownToWhatsApp("~~viejo~~"), "~viejo~");
  });

  await t.test("títulos Markdown -> negrita", () => {
    assert.strictEqual(markdownToWhatsApp("## Necesidades"), "*Necesidades*");
  });

  await t.test("enlaces Markdown -> texto (url)", () => {
    assert.strictEqual(
      markdownToWhatsApp("Mira [el panel](https://responsegrid.app/x)"),
      "Mira el panel (https://responsegrid.app/x)",
    );
  });

  await t.test("deja intacto el texto sin markdown", () => {
    assert.strictEqual(markdownToWhatsApp("Hola, ¿en qué te ayudo?"), "Hola, ¿en qué te ayudo?");
  });
});
