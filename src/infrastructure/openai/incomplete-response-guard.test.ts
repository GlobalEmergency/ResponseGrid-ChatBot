import test from "node:test";
import assert from "node:assert";
import {
  Agent,
  MaxTurnsExceededError,
  Runner,
  Usage,
  setTracingDisabled,
  type Model,
  type ModelProvider,
  type ModelResponse,
} from "@openai/agents";
import { ModelIncompleteResponseError } from "../../application/model-incomplete-response-error.js";
import {
  IncompleteResponseGuardModel,
  IncompleteResponseGuardModelProvider,
  type IncompletePartialResponse,
} from "./incomplete-response-guard.js";

// Ningún test llama a OpenAI: el modelo es un doble que devuelve respuestas fijas.
// `tracingDisabled` del Runner no basta: el run abre igualmente una traza global que el
// exportador por defecto enviaría a OpenAI. Se desactiva el tracing para este proceso.
setTracingDisabled(true);

/** Respuesta tal y como la vio producción el 2026-09-11: incompleta, sin output y 0 tokens. */
const emptyIncomplete: ModelResponse = {
  usage: new Usage(),
  output: [],
  responseId: "resp_vacia",
  providerData: { id: "resp_vacia", status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] },
};

const partialIncomplete: ModelResponse = {
  usage: new Usage(),
  output: [
    {
      type: "message",
      role: "assistant",
      status: "incomplete",
      content: [{ type: "output_text", text: "Respuesta truncada…" }],
    },
  ],
  responseId: "resp_truncada",
  providerData: { id: "resp_truncada", status: "incomplete", incomplete_details: { reason: "max_output_tokens" } },
};

const completed: ModelResponse = {
  usage: new Usage(),
  output: [
    {
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: "Hola" }],
    },
  ],
  responseId: "resp_ok",
  providerData: { id: "resp_ok", status: "completed" },
};

function fakeModel(response: ModelResponse) {
  let calls = 0;
  const model: Model = {
    getResponse: async () => {
      calls += 1;
      return response;
    },
    getStreamedResponse: () => {
      throw new Error("no se usa: el bot llama con stream: false");
    },
  };
  return { model, calls: () => calls };
}

function providerOf(model: Model): ModelProvider {
  return { getModel: () => model };
}

const request = {} as Parameters<Model["getResponse"]>[0];

test("IncompleteResponseGuardModel", async (t) => {
  await t.test("lanza ModelIncompleteResponseError con el motivo si la respuesta es incompleta y vacía", async () => {
    const guard = new IncompleteResponseGuardModel(fakeModel(emptyIncomplete).model, () => {});

    await assert.rejects(guard.getResponse(request), (error: unknown) => {
      assert.ok(error instanceof ModelIncompleteResponseError);
      assert.strictEqual(error.reason, "max_output_tokens");
      assert.strictEqual(error.responseId, "resp_vacia");
      assert.strictEqual(error.message, "model-incomplete (max_output_tokens)");
      return true;
    });
  });

  await t.test("usa 'unknown' si la API no informa del motivo", async () => {
    const guard = new IncompleteResponseGuardModel(
      fakeModel({ ...emptyIncomplete, providerData: { status: "incomplete" } }).model,
      () => {},
    );

    await assert.rejects(guard.getResponse(request), /model-incomplete \(unknown\)/);
  });

  await t.test("incompleta CON output: no corta el flujo, solo lo registra", async () => {
    const warnings: IncompletePartialResponse[] = [];
    const guard = new IncompleteResponseGuardModel(fakeModel(partialIncomplete).model, (w) => void warnings.push(w));

    const response = await guard.getResponse(request);

    assert.strictEqual(response, partialIncomplete);
    assert.deepStrictEqual(warnings, [{ reason: "max_output_tokens", responseId: "resp_truncada", outputItems: 1 }]);
  });

  await t.test("respuesta completa: la devuelve tal cual sin registrar nada", async () => {
    const warnings: IncompletePartialResponse[] = [];
    const guard = new IncompleteResponseGuardModel(fakeModel(completed).model, (w) => void warnings.push(w));

    assert.strictEqual(await guard.getResponse(request), completed);
    assert.strictEqual(warnings.length, 0);
  });
});

test("IncompleteResponseGuardModelProvider · envuelve los modelos del proveedor", async () => {
  const provider = new IncompleteResponseGuardModelProvider(providerOf(fakeModel(emptyIncomplete).model), () => {});

  const model = await provider.getModel("gpt-5.4-mini");

  assert.ok(model instanceof IncompleteResponseGuardModel);
});

test("Runner del SDK · respuesta incompleta y vacía", async (t) => {
  const agent = new Agent({ name: "test", instructions: "test" });

  await t.test("sin guard: el SDK repite turnos hasta MaxTurnsExceededError (el síntoma del incidente)", async () => {
    const fake = fakeModel(emptyIncomplete);
    const runner = new Runner({ modelProvider: providerOf(fake.model) });

    await assert.rejects(runner.run(agent, "hola", { maxTurns: 3 }), MaxTurnsExceededError);
    assert.strictEqual(fake.calls(), 3);
  });

  await t.test("con guard: falla en el primer turno con ModelIncompleteResponseError", async () => {
    const fake = fakeModel(emptyIncomplete);
    const runner = new Runner({
      modelProvider: new IncompleteResponseGuardModelProvider(providerOf(fake.model), () => {}),
    });

    await assert.rejects(runner.run(agent, "hola", { maxTurns: 3 }), ModelIncompleteResponseError);
    assert.strictEqual(fake.calls(), 1, "no repite turnos");
  });
});
