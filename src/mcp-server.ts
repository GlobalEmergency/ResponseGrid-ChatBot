import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { agentTools } from "./agent/tools.js";
import { ApiClient } from "./infrastructure/responsegrid/api-client.js";
import { McpToolMapper } from "./infrastructure/mcp/mcp-tool-mapper.js";
import { loadAccountsFromFile } from "./config/accounts.js";
import { AccountRegistry } from "./application/account-registry.js";
import "./config/env.js";

function resolveAccountId(): string | undefined {
  const argIndex = process.argv.indexOf("--account");
  if (argIndex !== -1 && process.argv[argIndex + 1]) {
    return process.argv[argIndex + 1];
  }
  return process.env.MCP_ACCOUNT_ID;
}

async function runMcpServer() {
  const accountsFile = process.env.ACCOUNTS_FILE ?? join(process.cwd(), "accounts.json");
  const registry = new AccountRegistry(loadAccountsFromFile(accountsFile));

  const accountId = resolveAccountId();
  const account = accountId ? registry.findById(accountId) : registry.all()[0];

  if (!account) {
    throw new Error(
      accountId
        ? `No existe ninguna cuenta con id "${accountId}" en ${accountsFile}`
        : `${accountsFile} no tiene ninguna cuenta configurada`,
    );
  }

  const apiClient = new ApiClient(account.apiToken, "api-key");
  const mapper = new McpToolMapper(apiClient, account);

  const server = new Server({ name: "responsegrid-mcp-server", version: "1.0.0" }, { capabilities: { tools: {} } });
  mapper.registerOnServer(server, agentTools as any);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`ResponseGrid MCP Server started over Stdio transport (cuenta: ${account.id}).`);
}

runMcpServer().catch((error) => {
  console.error("Failed to start ResponseGrid MCP Server:", error);
  process.exit(1);
});
