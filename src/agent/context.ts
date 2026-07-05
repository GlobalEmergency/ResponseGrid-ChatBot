import type { ApiClient } from "../infrastructure/responsegrid/api-client.js";
import type { Account } from "../domain/account.js";
import type { ChoicePrompt } from "../domain/ports/messaging-channel.port.js";

export interface AgentContext {
  channel: "telegram" | "whatsapp" | "mcp";
  chatId: string;
  account: Account;
  user: {
    telegramUserId?: number;
    username?: string;
    firstName?: string;
    internalUserId?: string;
  };
  apiClient: ApiClient;
  /** true si el chat tiene un token de usuario vinculado (login) o es un canal de confianza (MCP local). */
  authenticated: boolean;
  /** Teléfono verificado por la plataforma de mensajería, si lo hay en este turno. */
  verifiedPhone?: string;
  /** Token JWT recién obtenido en este turno (login/registro), para que ConversationService lo persista. */
  authenticatedToken?: string;
  showLoginButton?: boolean;
  selectableResources?: Array<{ id: string; name: string }>;
  /** Botones tocables a mostrar en la respuesta (los pone la tool rg_present_options). */
  choices?: ChoicePrompt;
}
