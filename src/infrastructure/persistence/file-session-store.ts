import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MemorySession } from "@openai/agents";
import type { Account } from "../../domain/account.js";
import { accountKey } from "../../domain/account.js";

/** Máximo de items del historial que se conservan por conversación. */
export const MAX_SESSION_ITEMS = 60;

/**
 * Recorta el historial a los últimos `max` items para que el fichero de sesión
 * (y el contexto reenviado al LLM) no crezca sin límite. Descarta al principio
 * los resultados/salidas de tool "huérfanos" (cuya llamada quedó fuera del
 * recorte), que confundirían al modelo; conserva mensajes y llamadas.
 */
export function pruneItems(items: any[], max: number = MAX_SESSION_ITEMS): any[] {
  if (!Array.isArray(items) || items.length <= max) {
    return items;
  }
  let trimmed = items.slice(items.length - max);
  while (trimmed.length > 0 && isOrphanLeadingResult(trimmed[0])) {
    trimmed = trimmed.slice(1);
  }
  return trimmed;
}

function isOrphanLeadingResult(item: any): boolean {
  const type = item?.type;
  return (
    type === "function_call_result" ||
    type === "function_call_output" ||
    type === "tool_call_result" ||
    item?.role === "tool"
  );
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
          (this as any).items = data.items;
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
