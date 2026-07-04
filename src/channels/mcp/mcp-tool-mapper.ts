import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { RunContext } from "@openai/agents";
import type { AgentContext } from "../../agent/context.js";
import type { ApiClient } from "../../api/api-client.js";

/**
 * Interface that abstracts the shape of core chatbot tools.
 * Decouples the MCP adapter layer from the specific framework (@openai/agents).
 */
export interface CoreTool {
  name: string;
  description: string;
  parameters: any; // JSON Schema
  invoke: (runContext: RunContext<AgentContext>, input: string) => Promise<any>;
}

/**
 * McpToolMapper maps ResponseGrid CoreTools to a low-level MCP Server instance.
 * Following the Single Responsibility Principle, its sole job is translating schemas and context.
 */
export class McpToolMapper {
  constructor(private readonly apiClient: ApiClient) {}

  /**
   * Registers a list of CoreTools to a low-level MCP Server instance.
   * @param server The MCP Server instance.
   * @param tools List of tools from the agent layer.
   */
  registerOnServer(server: Server, tools: CoreTool[]): void {
    const activeTools = tools.filter((t) => !this.shouldSkipTool(t.name));

    // Register List Tools handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: activeTools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.parameters,
        })),
      };
    });

    // Register Call Tool handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const toolArgs = request.params.arguments ?? {};

      const tool = activeTools.find((t) => t.name === toolName);
      if (!tool) {
        throw new Error(`Tool ${toolName} not found`);
      }

      const runContext: RunContext<AgentContext> = {
        context: {
          channel: "mcp",
          chatId: "mcp-session",
          user: {
            username: "mcp-user",
          },
          apiClient: this.apiClient,
          // El servidor MCP corre local por stdio (ej. Claude Desktop del propio operador),
          // no está expuesto a desconocidos como el bot de Telegram: se trata como canal de confianza.
          authenticated: true,
        },
      } as any;

      try {
        const result = await tool.invoke(runContext, JSON.stringify(toolArgs));
        const textResult = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        return {
          content: [
            {
              type: "text",
              text: textResult,
            },
          ],
        };
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error executing ${toolName}: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Determines if a tool should be skipped for MCP channel (e.g., telegram login buttons).
   */
  private shouldSkipTool(name: string): boolean {
    const skippedTools = ["rg_request_user_login"];
    return skippedTools.includes(name);
  }
}
