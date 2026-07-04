export interface AuthStore {
  get(key: string): string | undefined;
  set(key: string, token: string): void;
  delete(key: string): void;
  clear(): void;
}
