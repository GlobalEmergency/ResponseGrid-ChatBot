import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Account } from "../domain/account.js";

const baseFields = {
  id: z.string().min(1),
  emergencySlug: z.string().min(1),
  apiToken: z.string().min(1),
};

const telegramAccountSchema = z.object({
  ...baseFields,
  channel: z.literal("telegram"),
  telegramBotToken: z.string().min(1),
});

const whatsappAccountSchema = z.object({
  ...baseFields,
  channel: z.literal("whatsapp"),
  whatsappPhoneNumberId: z.string().min(1),
  whatsappAccessToken: z.string().min(1),
});

const accountSchema = z.discriminatedUnion("channel", [telegramAccountSchema, whatsappAccountSchema]);
const accountsFileSchema = z.array(accountSchema).min(1, "accounts.json no puede estar vacío");

export function parseAccounts(rawJson: string): Account[] {
  const parsed = accountsFileSchema.parse(JSON.parse(rawJson));

  const seenIds = new Set<string>();
  for (const account of parsed) {
    if (seenIds.has(account.id)) {
      throw new Error(`accounts.json: id de cuenta duplicado "${account.id}"`);
    }
    seenIds.add(account.id);
  }

  return parsed as Account[];
}

export function loadAccountsFromFile(filePath: string): Account[] {
  let rawJson: string;
  try {
    rawJson = readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error(`No se pudo leer el fichero de cuentas "${filePath}": ${(err as Error).message}`);
  }
  return parseAccounts(rawJson);
}
