import test from "node:test";
import assert from "node:assert";
import { agentTools } from "./tools.js";

test("agentTools registra las tools de donación", () => {
  const names = new Set(agentTools.map((t: any) => t.name));
  // Flujo de donante: público (llevar a un punto) y oferta autenticada.
  assert.ok(names.has("rg_preregister_donation"), "falta rg_preregister_donation");
  assert.ok(names.has("rg_submit_offer"), "falta rg_submit_offer");
  // Flujo de hacer público un recurso (verificar + publicar).
  assert.ok(names.has("rg_verify_resource"), "falta rg_verify_resource");
  assert.ok(names.has("rg_publish_resource"), "falta rg_publish_resource");
  // La tool de inventario sigue existiendo (es de staff, no de donantes).
  assert.ok(names.has("rg_record_inventory_entry"));
});

test("rg_record_inventory_entry se documenta como acción de staff, no de donación", () => {
  const inv = agentTools.find((t: any) => t.name === "rg_record_inventory_entry") as any;
  assert.match(inv.description, /rg_preregister_donation|donar|donaci/i);
});
