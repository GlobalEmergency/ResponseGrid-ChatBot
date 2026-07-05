import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AuthStore } from "../../domain/ports/auth-store.port.js";

export class JsonTokenStore implements AuthStore {
  private cache: Map<string, string>;

  constructor(private readonly filePath: string) {
    this.cache = new Map<string, string>();
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.load();
  }

  private load() {
    if (existsSync(this.filePath)) {
      try {
        const fileContent = readFileSync(this.filePath, "utf8");
        const data = JSON.parse(fileContent);
        if (data && typeof data === "object") {
          for (const [key, value] of Object.entries(data)) {
            if (typeof value === "string") {
              this.cache.set(key, value);
            }
          }
        }
      } catch (err) {
        console.error("Error loading persistent token store:", err);
      }
    }
  }

  private save() {
    try {
      const obj: Record<string, string> = {};
      for (const [key, value] of this.cache.entries()) {
        obj[key] = value;
      }
      writeFileSync(this.filePath, JSON.stringify(obj, null, 2), "utf8");
      // Guarda JWT de usuario en claro: restringe a solo-propietario (servidor compartido).
      chmodSync(this.filePath, 0o600);
    } catch (err) {
      console.error("Error saving persistent token store:", err);
    }
  }

  get(key: string): string | undefined {
    return this.cache.get(key);
  }

  set(key: string, token: string): void {
    this.cache.set(key, token);
    this.save();
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.save();
  }

  clear(): void {
    this.cache.clear();
    this.save();
  }
}
