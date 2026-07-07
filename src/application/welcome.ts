/**
 * Fast-path de bienvenida: cuando un usuario NUEVO solo saluda, respondemos con
 * una bienvenida precomputada + botones, sin invocar al modelo. Es el turno más
 * lento hoy (un "Hola" llegó a tardar 16 s) y no necesita razonamiento.
 */

export type Lang = "es" | "en";

// Saludo puro (todo el mensaje es un saludo), tolerando puntuación y repeticiones.
const GREETING_RE =
  /^[\s\p{P}]*(hola+|buenas(?:\s+(?:tardes|noches))?|buenos\s*d[ií]as|hey+|ey+|qu[eé]\s*tal|hi+|hello+|hey\s*there|good\s*(?:morning|afternoon|evening)|\/?start)[\s\p{P}]*$/iu;

const EN_RE = /\b(hi|hello|hey|good\s*(morning|afternoon|evening))\b/i;

/** Devuelve el idioma del saludo si el mensaje es SOLO un saludo; null si no. */
export function detectGreeting(text: string | undefined): Lang | null {
  if (!text) return null;
  if (!GREETING_RE.test(text)) return null;
  return EN_RE.test(text) ? "en" : "es";
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
