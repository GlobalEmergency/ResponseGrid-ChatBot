import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MemorySession } from "@openai/agents";
import type { Account } from "../../domain/account.js";
import { accountKey } from "../../domain/account.js";

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
