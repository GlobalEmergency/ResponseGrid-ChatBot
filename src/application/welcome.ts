/**
 * Fast-path de bienvenida: cuando un usuario NUEVO solo saluda, respondemos con
 * una bienvenida precomputada + botones, sin invocar al modelo. Es el turno más
 * lento hoy (un "Hola" llegó a tardar 16 s) y no necesita razonamiento.
 */

export type Lang = "es" | "en";

// Saludos como CONJUNTO de tokens normalizados (minúsculas, sin acentos ni
// símbolos/espacios). Toleramos erratas comunes ("hlla", "ola", "buenass") que
// en logs reales se saltaban el fast-path y disparaban una llamada al modelo.
const ES_GREETINGS = new Set([
  "hola", "holaa", "holaaa", "holi", "holis", "holaptt", "holq",
  "ola", "olaa", "hlla", "hloa", "hoola", "hla", "wola", "olis",
  "buenas", "buenass", "buenasa", "wenas", "buenos", "bnas",
  "buenosdias", "buenasdias", "buenostardes", "buenastardes", "buenasnoches", "buenanoches",
  "ey", "eyy", "quetal", "holabuenas", "saludos", "holaa",
]);
const EN_GREETINGS = new Set([
  "hi", "hii", "hiii", "hy", "hey", "heyy", "heya", "heythere",
  "hello", "helo", "helloo", "hellothere", "yo",
  "goodmorning", "goodafternoon", "goodevening", "greetings", "gm",
]);
const START_TOKENS = new Set(["start"]);

function normalizeGreeting(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/[^a-z]/g, ""); // quita espacios, signos, dígitos
}

/** Devuelve el idioma del saludo si el mensaje es SOLO un saludo; null si no. */
export function detectGreeting(text: string | undefined): Lang | null {
  if (!text || text.length > 40) return null; // un saludo es corto
  const n = normalizeGreeting(text);
  if (!n) return null;
  if (EN_GREETINGS.has(n)) return "en";
  if (ES_GREETINGS.has(n) || START_TOKENS.has(n)) return "es";
  return null;
}

export interface Welcome {
  text: string;
  options: { id: string; label: string }[];
}

// Los ids coinciden con los que ya maneja el agente cuando el usuario pulsa
// (buscar_ayuda, etc.), para que el siguiente turno fluya igual.
export const WELCOME: Record<Lang, Welcome> = {
  es: {
    text:
      "¡Hola! Soy ResponseGrid, el asistente para coordinar la ayuda en una emergencia. " +
      "Puedo ayudarte a buscar recursos y ayuda cerca, registrar un punto de acopio o recurso, " +
      "actualizar inventario, y crear o gestionar necesidades. ¿En qué te ayudo?",
    options: [
      { id: "buscar_ayuda", label: "Buscar ayuda cerca" },
      { id: "gestionar_recursos", label: "Gestionar recursos" },
      { id: "crear_necesidad", label: "Crear necesidad" },
    ],
  },
  en: {
    text:
      "Hi! I'm ResponseGrid, the assistant for coordinating aid in an emergency. " +
      "I can help you find resources and aid nearby, register a collection point or resource, " +
      "update inventory, and create or manage needs. How can I help?",
    options: [
      { id: "buscar_ayuda", label: "Find aid nearby" },
      { id: "gestionar_recursos", label: "Manage resources" },
      { id: "crear_necesidad", label: "Create a need" },
    ],
  },
};
