import test from "node:test";
import assert from "node:assert";
import { z } from "zod";
import { McpToolMapper, CoreTool } from "./mcp-tool-mapper.js";
import { ApiClient } from "../responsegrid/api-client.js";
import type { Account } from "../../domain/account.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

const dummyAccount: Account = {
  id: "acc-mcp-test",
  channel: "telegram",
  emergencySlug: "sismo-2026",
  apiToken: "rg_live_test",
  telegramBotToken: "bot-test",
};

function makeMockServer() {
  const handlers = new Map<any, Function>();
  const server = {
    setRequestHandler: (schema: any, handler: Function) => {
      handlers.set(schema, handler);
    },
  } as unknown as Server;
  return { server, handlers };
}

test("McpToolMapper - Unit Tests", async (t) => {
  const mockApiClient = {} as ApiClient;

  await t.test("should list only non-skipped tools", async () => {
    const mapper = new McpToolMapper(mockApiClient, dummyAccount);
    const { server, handlers } = makeMockServer();

    const dummyTool: CoreTool = {
      name: "dummy_tool",
      description: "A dummy tool for testing",
      parameters: z.object({ param1: z.string() }),
      invoke: async (_ctx, input) => `Success: ${JSON.parse(input).param1}`,
    };

    const loginTool: CoreTool = {
      name: "rg_request_user_login",
      description: "Interactive login, should be skipped",
      parameters: z.object({}),
      invoke: async () => "Skipped",
    };

    mapper.registerOnServer(server, [dummyTool, loginTool]);

    const listHandler = [...handlers.values()][0];
    const result = await listHandler({});

    assert.strictEqual(result.tools.length, 1);
    assert.strictEqual(result.tools[0].name, "dummy_tool");
    assert.strictEqual(result.tools[0].description, "A dummy tool for testing");
  });

  await t.test("should execute tool handler and return correct content structure", async () => {
    const mapper = new McpToolMapper(mockApiClient, dummyAccount);
    const { server, handlers } = makeMockServer();

    const dummyTool: CoreTool = {
      name: "dummy_tool",
      description: "Doubles a value",
      parameters: z.object({ value: z.number() }),
      invoke: async (_ctx, input) => {
        const { value } = JSON.parse(input);
        return { doubleValue: value * 2 };
      },
    };

    mapper.registerOnServer(server, [dummyTool]);

    const [, callHandler] = [...handlers.values()];
    const response = await callHandler({
      params: { name: "dummy_tool", arguments: { value: 5 } },
    });

    assert.deepStrictEqual(response, {
      content: [
        {
          type: "text",
          text: JSON.stringify({ doubleValue: 10 }, null, 2),
        },
      ],
    });
  });

  await t.test("should catch execution errors and return them as MCP error content", async () => {
    const mapper = new McpToolMapper(mockApiClient, dummyAccount);
    const { server, handlers } = makeMockServer();

    const errorTool: CoreTool = {
      name: "error_tool",
      description: "Always throws",
      parameters: z.object({}),
      invoke: async () => {
        throw new Error("Something went wrong");
      },
    };

    mapper.registerOnServer(server, [errorTool]);

    const [, callHandler] = [...handlers.values()];
    const response = await callHandler({
      params: { name: "error_tool", arguments: {} },
    });

    assert.deepStrictEqual(response, {
      content: [
        {
          type: "text",
          text: "Error executing error_tool: Something went wrong",
        },
      ],
      isError: true,
    });
  });
});
