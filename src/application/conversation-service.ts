import { run as defaultRun } from "@openai/agents";
import { apiAgent } from "../agent/agent.js";
import type { AgentContext } from "../agent/context.js";
import type { Account } from "../domain/account.js";
import { accountKey } from "../domain/account.js";
import type { InboundMessage } from "../domain/inbound-message.js";
import type { MessagingChannel, SelectionOption } from "../domain/ports/messaging-channel.port.js";
import type { ConversationStore } from "../domain/ports/conversation-store.port.js";
import type { AuthStore } from "../domain/ports/auth-store.port.js";
import { ApiClient } from "../infrastructure/responsegrid/api-client.js";

export interface ConversationServiceDeps {
  getSession(account: Account, chatId: string): ConversationStore;
  authStore: AuthStore;
}

type RunFn = (agent: typeof apiAgent, input: string, options: { context: AgentContext; session: ConversationStore }) => Promise<{ finalOutput: unknown }>;

export class ConversationService {
  constructor(
    private readonly deps: ConversationServiceDeps,
    private readonly run: RunFn = defaultRun as unknown as RunFn,
  ) {}

  async handle(inbound: InboundMessage, channel: MessagingChannel): Promise<void> {
    const { account, chatId } = inbound;
    const key = accountKey(account, chatId);
    const session = this.deps.getSession(account, chatId);
    const userToken = this.deps.authStore.get(key);

    const context: AgentContext = {
      channel: account.channel,
      chatId,
      account,
      user: {},
      apiClient: userToken ? new ApiClient(userToken, "bearer") : new ApiClient(account.apiToken, "api-key"),
      authenticated: Boolean(userToken),
      verifiedPhone: inbound.verifiedPhone,
    };

    const userText = inbound.text ?? this.describeNonTextInbound(inbound);

    const result = await this.run(apiAgent, userText, { context, session });

    if (context.authenticatedToken) {
      this.deps.authStore.set(key, context.authenticatedToken);
    }

    await this.dispatchReply(chatId, context, channel, String(result.finalOutput));
  }

  private describeNonTextInbound(inbound: InboundMessage): string {
    if (inbound.location) {
      return `He compartido mi ubicación actual: latitud ${inbound.location.latitude}, longitud ${inbound.location.longitude}`;
    }
    if (inbound.selectionCallback) {
      return `He seleccionado el centro con ID: ${inbound.selectionCallback}`;
    }
    return "";
  }

  private async dispatchReply(
    chatId: string,
    context: AgentContext,
    channel: MessagingChannel,
    text: string,
  ): Promise<void> {
    const safeText = text && text.trim() !== "" ? text : "No he recibido respuesta del agente.";

    if (context.showLoginButton) {
      await channel.promptPhoneShare(chatId, safeText);
      return;
    }

    if (context.selectableResources && context.selectableResources.length > 0) {
      const options: SelectionOption[] = context.selectableResources
        .slice(0, 10)
        .map((r) => ({ id: r.id, label: r.name }));
      await channel.sendSelection(chatId, safeText, options);
      return;
    }

    await channel.sendText(chatId, safeText);
  }
}
