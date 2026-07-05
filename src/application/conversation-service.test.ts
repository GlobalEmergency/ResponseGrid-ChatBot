import test from "node:test";
import assert from "node:assert";
import { ConversationService } from "./conversation-service.js";
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
  const sent: Array<{ type: string; chatId: string; text: string; options?: SelectionOption[] }> = [];
  const channel: MessagingChannel = {
    sendText: async (chatId, text) => void sent.push({ type: "text", chatId, text }),
    sendSelection: async (chatId, text, options) => void sent.push({ type: "selection", chatId, text, options }),
    promptPhoneShare: async (chatId, text) => void sent.push({ type: "prompt-phone", chatId, text }),
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
});
