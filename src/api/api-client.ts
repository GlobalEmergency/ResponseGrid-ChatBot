import { env } from "../config/env.js";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export class ApiClient {
  constructor(
    private readonly baseUrl: string | undefined = env.apiBaseUrl,
    private readonly token: string | undefined = env.apiToken,
    private readonly authMode: "bearer" | "api-key" = env.apiAuthMode,
  ) {}

  async request<TResponse = unknown>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    query?: QueryParams,
  ): Promise<TResponse> {
    if (!this.baseUrl) {
      return {
        mock: true,
        message:
          "API_BASE_URL no está configurada. Esta es una respuesta simulada para desarrollo.",
        method,
        path,
        query,
        body,
      } as TResponse;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.token) {
      if (this.authMode === "api-key") {
        headers["X-API-Key"] = this.token;
      } else {
        headers.Authorization = `Bearer ${this.token}`;
      }
    }

    const url = new URL(
      `${this.baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`,
    );

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === "") {
        continue;
      }

      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 204) {
      return { ok: true, status: 204 } as TResponse;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new Error(
        `Error llamando a ResponseGrid: ${response.status} ${response.statusText}. Respuesta: ${JSON.stringify(payload)}`,
      );
    }

    return payload as TResponse;
  }
}
