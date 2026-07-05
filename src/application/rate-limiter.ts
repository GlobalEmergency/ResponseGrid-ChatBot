/**
 * Rate limiter por clave (p. ej. por chat) con dos ventanas: por minuto y por día.
 * Protege el coste (cada mensaje dispara una llamada al agente/OpenAI).
 *
 * ponytail: contadores en memoria por clave; el Map crece con chats únicos. Para
 * una sola instancia y volumen bajo es suficiente. Si algún día hay varias
 * instancias o alta cardinalidad, mover a un store compartido (Redis) con TTL.
 */
export interface RateLimitResult {
  allowed: boolean;
  scope?: "minute" | "day";
  retryAfterMs?: number;
}

interface Bucket {
  minStart: number;
  minCount: number;
  dayStart: number;
  dayCount: number;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly perMinute = 20,
    private readonly perDay = 400,
  ) {}

  /** Registra un intento para `key`. Devuelve si se permite; si no, la ventana y cuánto esperar. */
  check(key: string, now: number = Date.now()): RateLimitResult {
    let b = this.buckets.get(key);
    if (!b) {
      b = { minStart: now, minCount: 0, dayStart: now, dayCount: 0 };
      this.buckets.set(key, b);
    }

    if (now - b.minStart >= MINUTE_MS) {
      b.minStart = now;
      b.minCount = 0;
    }
    if (now - b.dayStart >= DAY_MS) {
      b.dayStart = now;
      b.dayCount = 0;
    }

    if (b.minCount >= this.perMinute) {
      return { allowed: false, scope: "minute", retryAfterMs: MINUTE_MS - (now - b.minStart) };
    }
    if (b.dayCount >= this.perDay) {
      return { allowed: false, scope: "day", retryAfterMs: DAY_MS - (now - b.dayStart) };
    }

    b.minCount += 1;
    b.dayCount += 1;
    return { allowed: true };
  }
}
