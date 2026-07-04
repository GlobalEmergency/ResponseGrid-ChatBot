import type { ApiClient } from "../api/api-client.js";

export interface AgentContext {
  channel: "telegram" | "whatsapp" | "mcp";
  chatId: number | string;
  user: {
    telegramUserId?: number;
    username?: string;
    firstName?: string;
    internalUserId?: string;
  };
  apiClient: ApiClient;
  /** true si el chat tiene un token de usuario vinculado (login) o es un canal de confianza (MCP local). */
  authenticated: boolean;
  showLoginButton?: boolean;
  selectableResources?: Array<{ id: string; name: string }>;
}
