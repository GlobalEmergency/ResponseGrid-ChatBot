export type AccountId = string;

export interface BaseAccount {
  id: AccountId;
  emergencySlug: string;
  apiToken: string;
}

export interface TelegramAccount extends BaseAccount {
  channel: "telegram";
  telegramBotToken: string;
}

export interface WhatsAppAccount extends BaseAccount {
  channel: "whatsapp";
  whatsappPhoneNumberId: string;
  whatsappAccessToken: string;
}

export type Account = TelegramAccount | WhatsAppAccount;

export function accountKey(account: Account, chatId: string): string {
  return `${account.id}:${chatId}`;
}
