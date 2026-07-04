import type { Account } from "../domain/account.js";

export class AccountRegistry {
  private readonly byId = new Map<string, Account>();
  private readonly byTelegramBotToken = new Map<string, Account>();
  private readonly byWhatsappPhoneNumberId = new Map<string, Account>();

  constructor(accounts: Account[]) {
    for (const account of accounts) {
      this.byId.set(account.id, account);
      if (account.channel === "telegram") {
        this.byTelegramBotToken.set(account.telegramBotToken, account);
      } else {
        this.byWhatsappPhoneNumberId.set(account.whatsappPhoneNumberId, account);
      }
    }
  }

  all(): Account[] {
    return [...this.byId.values()];
  }

  findById(id: string): Account | undefined {
    return this.byId.get(id);
  }

  findByTelegramBotToken(token: string): Account | undefined {
    return this.byTelegramBotToken.get(token);
  }

  findByWhatsappPhoneNumberId(phoneNumberId: string): Account | undefined {
    return this.byWhatsappPhoneNumberId.get(phoneNumberId);
  }
}
