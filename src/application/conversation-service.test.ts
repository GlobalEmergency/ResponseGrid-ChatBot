import test from "node:test";
import assert from "node:assert";
import { ConversationService, MAX_TEXT_LENGTH } from "./conversation-service.js";
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

    await service.handle({ account, chatId: "111", text: "hola" }, channel);

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
