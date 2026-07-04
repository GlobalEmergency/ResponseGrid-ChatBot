import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { agentTools } from "./agent/tools.js";
import { ApiClient } from "./api/api-client.js";
import { McpToolMapper } from "./channels/mcp/mcp-tool-mapper.js";
import "./config/env.js";

async function runMcpServer() {
  const apiClient = new ApiClient();
  const mapper = new McpToolMapper(apiClient);

  const server = new Server(
    {
      name: "responsegrid-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register all core tools on low-level server
  mapper.registerOnServer(server, agentTools as any);

  // Connect to the stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("ResponseGrid MCP Server started over Stdio transport.");
}

runMcpServer().catch((error) => {
  console.error("Failed to start ResponseGrid MCP Server:", error);
  process.exit(1);
});
