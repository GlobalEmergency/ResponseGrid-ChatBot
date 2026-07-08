import test from "node:test";
import assert from "node:assert";
import { ConversationService, MAX_TEXT_LENGTH, isCorruptedHistoryError, isTransientError } from "./conversation-service.js";
import { RateLimiter } from "./rate-limiter.js";
import type { Account } from "../domain/account.js";
import type { MessagingChannel, SelectionOption } from "../domain/ports/messaging-channel.port.js";
import type { AuthStore } from "../domain/ports/auth-store.port.js";
import type { ConversationStore } from "../domain/ports/conversation-store.port.js";

const account: Account = {
  id: "acc-1",
  channel: "telegram",
  emergencySlug: "sismo-2026",
  apiToken: "rg_live_test",
  telegramBotToken: "bot-1",
};

function makeFakeSession(): ConversationStore {
  return {
    getSessionId: async () => "fake",
    getItems: async () => [],
    addItems: async () => undefined,
    popItem: async () => undefined,
    clearSession: async () => undefined,
  };
}

function makeFakeAuthStore(initial: Record<string, string> = {}): AuthStore {
  const map = new Map(Object.entries(initial));
  return {
    get: (key) => map.get(key),
    set: (key, value) => void map.set(key, value),
    delete: (key) => void map.delete(key),
    clear: () => map.clear(),
  };
}

function makeFakeChannel() {
  const sent: Array<{ type: string; chatId: string; text: string; options?: SelectionOption[]; prompt?: any }> = [];
  const channel: MessagingChannel = {
    sendText: async (chatId, text) => void sent.push({ type: "text", chatId, text }),
    sendSelection: async (chatId, text, options) => void sent.push({ type: "selection", chatId, text, options }),
    sendChoices: async (chatId, prompt) => void sent.push({ type: "choices", chatId, text: prompt.text, prompt }),
    promptPhoneShare: async (chatId, text) => void sent.push({ type: "prompt-phone", chatId, text }),
    indicateReceived: async () => undefined,
  };
  return { channel, sent };
}

test("ConversationService", async (t) => {
  await t.test("envía la respuesta del agente como texto por defecto", async () => {
    const authStore = makeFakeAuthStore();
    const service = new ConversationService(
      { getSession: () => makeFakeSession(), authStore, log: () => {} },
      async () => ({ finalOutput: "Hola, ¿en qué puedo ayudarte?" }) as any,
    );
    const { channel, sent } = makeFakeChannel();

    await service.handle({ account, chatId: "111", text: "busca agua cerca" }, channel);

    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].type, "text");
    assert.strictEqual(sent[0].chatId, "111");
    assert.match(sent[0].text, /Hola/);
  });

  await t.test("persiste el token si el agente autenticó al usuario en este turno", async () => {
    const authStore = makeFakeAuthStore();
    const service = new ConversationService(
      { getSession: () => makeFakeSession(), authStore, log: () => {} },
      async (_agent, _input, options) => {
        (options.context as any).authenticatedToken = "jwt-nuevo";
        return { finalOutput: "Autenticado" } as any;
      },
    );
    const { channel } = makeFakeChannel();

    await service.handle({ account, chatId: "222", text: "login" }, channel);

    assert.strictEqual(authStore.get("acc-1:222"), "jwt-nuevo");
  });

  await t.test("usa el fallback cuando finalOutput es undefined", async () => {
    const authStore = makeFakeAuthStore();
    const service = new ConversationService(
      { getSession: () => makeFakeSession(), authStore, log: () => {} },
      async () => ({ finalOutput: undefined }) as any,
    );
    const { channel, sent } = makeFakeChannel();

    await service.handle({ account, chatId: "333", text: "test" }, channel);

    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].type, "text");
    assert.strictEqual(sent[0].chatId, "333");
    assert.strictEqual(sent[0].text, "No he recibido respuesta del agente.");
  });

  await t.test("bloquea y avisa cuando se supera el rate limit (no llama al agente)", async () => {
    const authStore = makeFakeAuthStore();
    let runCalls = 0;
    const service = new ConversationService(
      {
        getSession: () => makeFakeSession(),
        authStore,
        log: () => {},
        rateLimiter: new RateLimiter(1, 100), // 1 por minuto
      },
      async () => {
        runCalls += 1;
        return { finalOutput: "ok" } as any;
      },
    );
    const { channel, sent } = makeFakeChannel();

    await service.handle({ account, chatId: "555", text: "1" }, channel); // permitido
    await service.handle({ account, chatId: "555", text: "2" }, channel); // bloqueado

    assert.strictEqual(runCalls, 1, "el agente solo corre para el mensaje permitido");
    assert.strictEqual(sent.length, 2);
    assert.match(sent[1].text, /muy rápido/);
  });

  await t.test("rechaza mensajes demasiado largos sin llamar al agente", async () => {
    const authStore = makeFakeAuthStore();
    let runCalls = 0;
    const service = new ConversationService(
      { getSession: () => makeFakeSession(), authStore, log: () => {} },
      async () => {
        runCalls += 1;
        return { finalOutput: "ok" } as any;
      },
    );
    const { channel, sent } = makeFakeChannel();

    await service.handle({ account, chatId: "666", text: "x".repeat(MAX_TEXT_LENGTH + 1) }, channel);

    assert.strictEqual(runCalls, 0);
    assert.match(sent[0].text, /demasiado largo/);
  });

  await t.test("despacha botones cuando el agente presenta opciones (context.choices)", async () => {
    const authStore = makeFakeAuthStore();
    const service = new ConversationService(
      { getSession: () => makeFakeSession(), authStore, log: () => {} },
      async (_agent, _input, options) => {
        (options.context as any).choices = {
          text: "¿Qué quieres hacer?",
          options: [
            { id: "inv", label: "Ver inventario" },
            { id: "est", label: "Ver estado" },
          ],
        };
        return { finalOutput: "¿Qué quieres hacer?" } as any;
      },
    );
    const { channel, sent } = makeFakeChannel();

    await service.handle({ account, chatId: "444", text: "gestionar" }, channel);

    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].type, "choices");
    assert.strictEqual(sent[0].prompt.options.length, 2);
    assert.strictEqual(sent[0].prompt.options[0].id, "inv");
  });
});

test("isCorruptedHistoryError detecta el error de historial roto", () => {
  assert.ok(
    isCorruptedHistoryError(
      "400 No tool call found for function call output with call_id call_abc.",
    ),
  );
  assert.ok(!isCorruptedHistoryError("429 rate limited"));
});

test("ConversationService recupera de un historial corrupto sin propagar el error", async () => {
  const authStore = makeFakeAuthStore();
  let cleared = false;
  const session = { ...makeFakeSession(), clearSession: async () => void (cleared = true) } as ConversationStore;
  const service = new ConversationService(
    { getSession: () => session, authStore, log: () => {} },
    async () => {
      throw new Error("400 No tool call found for function call output with call_id call_x.");
    },
  );
  const { channel, sent } = makeFakeChannel();

  await service.handle({ account, chatId: "777", text: "busca agua cerca" }, channel); // no debe lanzar

  assert.ok(cleared, "reinicia la sesión corrupta");
  assert.strictEqual(sent.length, 1);
  assert.match(sent[0].text, /reiniciar/);
});

test("ConversationService · fast-path de bienvenida (saludo en sesión nueva) no invoca al agente", async () => {
  const authStore = makeFakeAuthStore();
  let runCalls = 0;
  const service = new ConversationService(
    { getSession: () => makeFakeSession(), authStore, log: () => {} },
    async () => {
      runCalls += 1;
      return { finalOutput: "no debería llamarse" } as any;
    },
  );
  const { channel, sent } = makeFakeChannel();

  await service.handle({ account, chatId: "888", text: "Hola!" }, channel);

  assert.strictEqual(runCalls, 0, "no invoca al modelo para un saludo nuevo");
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].type, "choices");
  assert.match(sent[0].text, /ResponseGrid/);
});

test("ConversationService · con historial, un saludo SÍ va al agente", async () => {
  const authStore = makeFakeAuthStore();
  let runCalls = 0;
  const session = { ...makeFakeSession(), getItems: async () => [{ type: "message" }] } as ConversationStore;
  const service = new ConversationService(
    { getSession: () => session, authStore, log: () => {} },
    async () => {
      runCalls += 1;
      return { finalOutput: "hola de nuevo" } as any;
    },
  );
  const { channel } = makeFakeChannel();

  await service.handle({ account, chatId: "889", text: "hola" }, channel);

  assert.strictEqual(runCalls, 1, "con contexto en curso, el saludo lo maneja el agente");
});

test("isTransientError", () => {
  assert.ok(isTransientError("500 server_error"));
  assert.ok(isTransientError("503 Service Unavailable overloaded"));
  assert.ok(isTransientError("request failed: ETIMEDOUT"));
  assert.ok(!isTransientError("400 bad request"));
  assert.ok(!isTransientError("No tool call found for function call output"));
});

test("ConversationService · reintenta 1 vez ante error transitorio y responde", async () => {
  const authStore = makeFakeAuthStore();
  let calls = 0;
  const service = new ConversationService(
    { getSession: () => makeFakeSession(), authStore, log: () => {} },
    async () => {
      calls += 1;
      if (calls === 1) throw new Error("500 server_error temporal de OpenAI");
      return { finalOutput: "ya te contesto" } as any;
    },
  );
  const { channel, sent } = makeFakeChannel();
  await service.handle({ account, chatId: "901", text: "consulta" }, channel);
  assert.strictEqual(calls, 2, "reintenta una vez");
  assert.strictEqual(sent.length, 1);
  assert.match(sent[0].text, /ya te contesto/);
});

test("ConversationService · si el reintento también falla, avisa sin lanzar", async () => {
  const authStore = makeFakeAuthStore();
  let calls = 0;
  const service = new ConversationService(
    { getSession: () => makeFakeSession(), authStore, log: () => {} },
    async () => {
      calls += 1;
      throw new Error("503 overloaded");
    },
  );
  const { channel, sent } = makeFakeChannel();
  await service.handle({ account, chatId: "902", text: "consulta" }, channel); // no debe lanzar
  assert.strictEqual(calls, 2);
  assert.match(sent[0].text, /problema técnico temporal/);
});

test("ConversationService · error no transitorio: avisa sin reintentar ni lanzar", async () => {
  const authStore = makeFakeAuthStore();
  let calls = 0;
  const service = new ConversationService(
    { getSession: () => makeFakeSession(), authStore, log: () => {} },
    async () => {
      calls += 1;
      throw new Error("algo raro y no transitorio");
    },
  );
  const { channel, sent } = makeFakeChannel();
  await service.handle({ account, chatId: "903", text: "consulta" }, channel);
  assert.strictEqual(calls, 1, "no reintenta");
  assert.match(sent[0].text, /problema procesando/);
});
