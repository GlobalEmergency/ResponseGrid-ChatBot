import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`Falta la variable de entorno ${name}`);
  }

  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : undefined;
}

function optionalInt(name: string): number | undefined {
  const value = optional(name);
  return value ? Number.parseInt(value, 10) : undefined;
}

export const env = {
  openaiApiKey: required("OPENAI_API_KEY"),
  openaiModel: optional("OPENAI_MODEL"),

  // ResponseGrid / API externa — una sola instancia compartida por todas las cuentas.
  apiBaseUrl: optional("API_BASE_URL"),

  // WhatsApp Cloud API — compartidos por todas las cuentas de WhatsApp (1 solo Meta App/webhook).
  whatsappAppSecret: optional("WHATSAPP_APP_SECRET"),
  whatsappVerifyToken: optional("WHATSAPP_VERIFY_TOKEN"),
  whatsappWebhookPort: optionalInt("WHATSAPP_WEBHOOK_PORT"),
};
