import test from "node:test";
import assert from "node:assert";
import { RunContext } from "@openai/agents";
import { z } from "zod";
import { agentTools, rgCreateNeed, rgPreregisterDonation, rgRegisterByPhone } from "./tools.js";
import type { AgentContext } from "./context.js";
import type { Account } from "../domain/account.js";

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

// Lookahead `(?=`/`(?!` o lookbehind `(?<=`/`(?<!`; un grupo con nombre `(?<name>` no cuenta.
const LOOKAROUND = /\(\?<?[=!]/;

/** Recorre el JSON schema y devuelve los valores de `pattern` que usan lookaround. */
function patternsWithLookaround(schema: unknown): string[] {
  if (Array.isArray(schema)) return schema.flatMap(patternsWithLookaround);
  if (!schema || typeof schema !== "object") return [];
  return Object.entries(schema).flatMap(([key, value]) =>
    key === "pattern" && typeof value === "string"
      ? LOOKAROUND.test(value)
        ? [value]
        : []
      : patternsWithLookaround(value),
  );
}

test("patternsWithLookaround solo mira los valores de `pattern`", () => {
  // Lo que genera zod con `.email()` debe detectarse.
  assert.ok(patternsWithLookaround(z.toJSONSchema(z.object({ email: z.string().email() }))).length > 0);

  const schema = {
    type: "object",
    description: "Texto libre con (?=esto) que no es un pattern",
    properties: {
      year: { anyOf: [{ type: "string", pattern: "^(?<year>\\d{4})$" }, { type: "null" }] },
      tags: { type: "array", items: { type: "string", pattern: "(?<!x)y" } },
    },
  };
  assert.deepStrictEqual(patternsWithLookaround(schema), ["(?<!x)y"]);
});

test("ningún schema de tool usa lookaround en `pattern` (strict de OpenAI lo rechaza en silencio)", () => {
  // Un `pattern` con `(?!…)`/`(?=…)` (lo que genera zod con `.email()`) hace que la
  // Responses API devuelva `incomplete: max_output_tokens` sin output para TODO el
  // set de tools: el agente agota maxTurns y el bot deja de contestar a todos.
  for (const t of agentTools as any[]) {
    assert.deepStrictEqual(patternsWithLookaround(t.parameters), [], `${t.name} tiene un pattern con lookaround`);
  }
});

test("rg_record_inventory_entry se documenta como acción de staff, no de donación", () => {
  const inv = agentTools.find((t: any) => t.name === "rg_record_inventory_entry") as any;
  assert.match(inv.description, /rg_preregister_donation|donar|donaci/i);
});

const account: Account = {
  id: "acc-1",
  channel: "telegram",
  emergencySlug: "sismo-2026",
  apiToken: "rg_live_test",
  telegramBotToken: "bot-1",
};

const EMERGENCY_ID = "11111111-1111-4111-8111-111111111111";
const RESOURCE_ID = "22222222-2222-4222-8222-222222222222";

/** Contexto de agente con un apiClient falso que registra las peticiones. */
function fakeContext() {
  const requests: Array<{ method: string; path: string; body: any }> = [];
  const context = {
    channel: "telegram",
    chatId: "chat-1",
    account,
    user: {},
    authenticated: true,
    verifiedPhone: "+34600000000",
    apiClient: {
      request: async (method: string, path: string, body?: unknown) => {
        requests.push({ method, path, body });
        return { id: "creado" };
      },
    },
  } as unknown as AgentContext;
  return { runContext: new RunContext(context), requests };
}

/** Sustituye fetch (lo usa TrustedAuthClient) y cuenta las llamadas. */
async function withMockedFetch(response: () => Response, run: (calls: { count: number }) => Promise<void>) {
  const original = globalThis.fetch;
  const calls = { count: 0 };
  globalThis.fetch = (async () => {
    calls.count++;
    return response();
  }) as unknown as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

const donationItems = [{ name: "Agua", quantity: 10, category: "water" }];

test("validación de email en las tools", async (t) => {
  await t.test("rg_register_by_phone pide otro email si el formato no es válido, sin llamar a la API", async () => {
    const { runContext } = fakeContext();
    await withMockedFetch(
      () => new Response("{}", { status: 201 }),
      async (calls) => {
        const result = await rgRegisterByPhone.invoke(
          runContext,
          JSON.stringify({ name: "Ana Pérez", email: "ana@correo", acceptedTerms: true }),
        );
        assert.match(String(result), /El email 'ana@correo' no parece válido/);
        assert.match(String(result), /escriba de nuevo/);
        assert.strictEqual(calls.count, 0, "no debería llamar a register-by-phone");
      },
    );
  });

  await t.test("rg_register_by_phone pide revisar los datos si la API responde 400", async () => {
    const { runContext } = fakeContext();
    await withMockedFetch(
      () => new Response(JSON.stringify({ statusCode: 400, message: ["email must be an email"] }), { status: 400 }),
      async () => {
        const result = await rgRegisterByPhone.invoke(
          runContext,
          JSON.stringify({ name: "Ana Pérez", email: "ana@correo.com", acceptedTerms: true }),
        );
        assert.match(String(result), /no parece válido/);
        assert.doesNotMatch(String(result), /An error occurred/);
      },
    );
  });

  await t.test("rg_preregister_donation pide revisar u omitir un donorEmail no válido, sin llamar a la API", async () => {
    const { runContext, requests } = fakeContext();
    const result = await rgPreregisterDonation.invoke(
      runContext,
      JSON.stringify({
        emergencyId: EMERGENCY_ID,
        targetResourceId: RESOURCE_ID,
        donorName: "Ana Pérez",
        donorEmail: "ana(at)correo.com",
        items: donationItems,
      }),
    );
    assert.match(String(result), /El email 'ana\(at\)correo\.com' no parece válido/);
    assert.match(String(result), /omit/);
    assert.strictEqual(requests.length, 0);
  });

  await t.test("rg_preregister_donation envía el donorEmail válido recortado", async () => {
    const { runContext, requests } = fakeContext();
    await rgPreregisterDonation.invoke(
      runContext,
      JSON.stringify({
        emergencyId: EMERGENCY_ID,
        targetResourceId: RESOURCE_ID,
        donorName: "Ana Pérez",
        donorEmail: "  ana@correo.com ",
        items: donationItems,
      }),
    );
    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0]!.path, `/emergencies/${EMERGENCY_ID}/donation-intakes`);
    assert.strictEqual(requests[0]!.body.donorEmail, "ana@correo.com");
  });

  await t.test("rg_create_need rechaza un author.email no válido, sin llamar a la API", async () => {
    const { runContext, requests } = fakeContext();
    const result = await rgCreateNeed.invoke(
      runContext,
      JSON.stringify({
        emergencyId: EMERGENCY_ID,
        title: "Agua potable",
        location: { address: "Plaza Mayor", latitude: 10.5, longitude: -66.9 },
        priority: "high",
        items: donationItems,
        author: { name: "Ana", email: "ana@" },
      }),
    );
    assert.match(String(result), /El email 'ana@' no parece válido/);
    assert.strictEqual(requests.length, 0);
  });

  await t.test("rg_create_need envía el author.email válido recortado y conserva el resto del author", async () => {
    const { runContext, requests } = fakeContext();
    await rgCreateNeed.invoke(
      runContext,
      JSON.stringify({
        emergencyId: EMERGENCY_ID,
        title: "Agua potable",
        location: { address: "Plaza Mayor", latitude: 10.5, longitude: -66.9 },
        priority: "high",
        items: donationItems,
        author: { name: "Ana", email: " ana@correo.com  " },
      }),
    );
    assert.strictEqual(requests.length, 1);
    assert.deepStrictEqual(requests[0]!.body.author, { name: "Ana", email: "ana@correo.com" });
  });
});
