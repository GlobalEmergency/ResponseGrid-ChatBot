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

const apiAuthMode = optional("API_AUTH_MODE") ?? "bearer";

if (!["bearer", "api-key"].includes(apiAuthMode)) {
  throw new Error("API_AUTH_MODE debe ser bearer o api-key");
}

export const env = {
  openaiApiKey: required("OPENAI_API_KEY"),
  openaiModel: optional("OPENAI_MODEL"),
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),

  // ResponseGrid / API externa
  apiBaseUrl: optional("API_BASE_URL"),
  apiToken: optional("API_TOKEN"),
  apiAuthMode: apiAuthMode as "bearer" | "api-key",

  // Puedes fijar una emergencia por defecto para no tener que repetirla por Telegram.
  responsegridDefaultEmergencyId: optional("RESPONSEGRID_DEFAULT_EMERGENCY_ID"),
  responsegridDefaultEmergencySlug: optional("RESPONSEGRID_DEFAULT_EMERGENCY_SLUG"),

  // Simulación de login por teléfono (en desarrollo/demo)
  userPhone: optional("USER_PHONE"),
  userToken: optional("USER_TOKEN"),
};
