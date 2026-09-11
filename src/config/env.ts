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

/**
 * Modelo por defecto explícito (el verificado en producción). No delegamos en el
 * default del SDK: ya ha cambiado entre versiones de @openai/agents.
 */
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

/** OPENAI_MODEL si está definido y no vacío; si no, DEFAULT_OPENAI_MODEL. */
export function resolveOpenAIModel(value: string | undefined): string {
  return value && value.trim() !== "" ? value.trim() : DEFAULT_OPENAI_MODEL;
}

export const env = {
  openaiApiKey: required("OPENAI_API_KEY"),
  openaiModel: resolveOpenAIModel(process.env.OPENAI_MODEL),

  // ResponseGrid / API externa — una sola instancia compartida por todas las cuentas.
  apiBaseUrl: optional("API_BASE_URL"),

  // WhatsApp Cloud API — compartidos por todas las cuentas de WhatsApp (1 solo Meta App/webhook).
  whatsappAppSecret: optional("WHATSAPP_APP_SECRET"),
  whatsappVerifyToken: optional("WHATSAPP_VERIFY_TOKEN"),
  whatsappWebhookPort: optionalInt("WHATSAPP_WEBHOOK_PORT"),
};
