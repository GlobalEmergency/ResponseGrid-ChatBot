import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MemorySession } from "@openai/agents";
import type { Account } from "../../domain/account.js";
import { accountKey } from "../../domain/account.js";

/** Máximo de items del historial que se conservan por conversación. */
export const MAX_SESSION_ITEMS = 60;

function callIdOf(item: any): string | undefined {
  return item?.callId ?? item?.call_id;
}

function isFunctionCall(item: any): boolean {
  return item?.type === "function_call" || item?.type === "tool_call";
}

function isFunctionResult(item: any): boolean {
  const type = item?.type;
  return (
    type === "function_call_result" ||
    type === "function_call_output" ||
    type === "tool_call_result" ||
    item?.role === "tool"
  );
}

/**
 * Elimina pares de tool incompletos del historial, que hacen que la API de OpenAI
 * rechace la petición ("No tool call found for function call output ..."). Ocurre
 * cuando un run se corta a media tool-call o el recorte separa la llamada de su
 * resultado. SIEMPRE descarta resultados/salidas huérfanas (sin su llamada), en
 * cualquier posición. Con `dropDanglingCalls` (solo al cargar, cuando la sesión
 * está en reposo) descarta también llamadas sin resultado; en pleno run NO se usa
 * porque el resultado puede estar a punto de añadirse.
 */
export function sanitizeItems(
  items: any[],
  opts: { dropDanglingCalls?: boolean } = {},
): any[] {
  if (!Array.isArray(items)) {
    return items;
  }
  const callIds = new Set<string>();
  const resultIds = new Set<string>();
  for (const item of items) {
    const id = callIdOf(item);
    if (!id) continue;
    if (isFunctionCall(item)) callIds.add(id);
    else if (isFunctionResult(item)) resultIds.add(id);
  }
  return items.filter((item) => {
    const id = callIdOf(item);
    if (isFunctionResult(item)) {
      // Descarta un resultado solo si tiene callId y su llamada no está presente.
      // Sin callId no se puede juzgar: se conserva.
      return id ? callIds.has(id) : true;
    }
    if (opts.dropDanglingCalls && isFunctionCall(item)) {
      return id ? resultIds.has(id) : true;
    }
    return true;
  });
}

/**
 * Recorta el historial a los últimos `max` items para que el fichero de sesión
 * (y el contexto reenviado al LLM) no crezca sin límite, y sanea los pares de
 * tool incompletos (resultados huérfanos) que el recorte pueda dejar.
 */
export function pruneItems(items: any[], max: number = MAX_SESSION_ITEMS): any[] {
  if (!Array.isArray(items)) {
    return items;
  }
  const trimmed = items.length > max ? items.slice(items.length - max) : items;
  return sanitizeItems(trimmed);
}

export class FileSession extends MemorySession {
  private filePath: string;

  constructor(options: { sessionId: string; storageDir: string }) {
    super({ sessionId: options.sessionId });

    if (!existsSync(options.storageDir)) {
      mkdirSync(options.storageDir, { recursive: true });
    }

    const safeSessionId = options.sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
    this.filePath = join(options.storageDir, `${safeSessionId}.json`);

    if (existsSync(this.filePath)) {
      try {
        const fileContent = readFileSync(this.filePath, "utf8");
        const data = JSON.parse(fileContent);
        if (data && Array.isArray(data.items)) {
          // Repara sesiones ya corruptas en disco (pares de tool incompletos):
          // al cargar, la sesión está en reposo, así que también quitamos
          // llamadas sin resultado, no solo resultados sin llamada.
          (this as any).items = sanitizeItems(data.items, { dropDanglingCalls: true });
        }
      } catch (err) {
        console.error(`Error loading session file for ${options.sessionId}:`, err);
      }
    }
  }

  private saveState() {
    try {
      const items = (this as any).items;
      writeFileSync(this.filePath, JSON.stringify({ items }, null, 2), "utf8");
      // Historial de conversación (datos del usuario): restringe a solo-propietario.
      chmodSync(this.filePath, 0o600);
    } catch (err) {
      console.error(`Error saving session file for ${this.getSessionId()}:`, err);
    }
  }

  override async addItems(items: any[]): Promise<void> {
    await super.addItems(items);
    (this as any).items = pruneItems((this as any).items);
    this.saveState();
  }

  override async popItem(): Promise<any> {
    const result = await super.popItem();
    this.saveState();
    return result;
  }

  override async clearSession(): Promise<void> {
    await super.clearSession();
    this.saveState();
  }
}

export class FileSessionRepository {
  private readonly sessions = new Map<string, FileSession>();

  constructor(private readonly storageDir: string) {}

  getOrCreate(account: Account, chatId: string): FileSession {
    const key = accountKey(account, chatId);
    const existing = this.sessions.get(key);
    if (existing) {
      return existing;
    }
    const session = new FileSession({ sessionId: key, storageDir: this.storageDir });
    this.sessions.set(key, session);
    return session;
  }

  async clear(account: Account, chatId: string): Promise<void> {
    const key = accountKey(account, chatId);
    const existing = this.sessions.get(key);
    if (existing) {
      await existing.clearSession();
    }
    this.sessions.delete(key);
  }
}
