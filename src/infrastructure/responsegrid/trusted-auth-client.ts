import { env } from "../../config/env.js";
import type { Account } from "../../domain/account.js";

export interface TrustedAuthUser {
  id: string;
  name: string;
  email: string;
}

export interface TrustedAuthResult {
  accessToken: string;
  user: TrustedAuthUser;
}

export class PhoneNotFoundError extends Error {}
export class EmailAlreadyExistsError extends Error {}

export class TrustedAuthClient {
  constructor(private readonly baseUrl: string = env.apiBaseUrl ?? "") {}

  async loginByPhone(account: Account, phone: string): Promise<TrustedAuthResult> {
    const response = await fetch(`${this.baseUrl}/auth/trusted/login-by-phone`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": account.apiToken },
      body: JSON.stringify({ phone }),
    });

    if (response.status === 404) {
      throw new PhoneNotFoundError(`No existe usuario con el teléfono ${phone}`);
    }

    if (!response.ok) {
      console.error(`[trusted-auth] login-by-phone -> ${response.status} :: ${(await response.text()).slice(0, 500)}`);
      throw new Error(`login-by-phone falló con estado ${response.status}.`);
    }

    return (await response.json()) as TrustedAuthResult;
  }

  async registerByPhone(
    account: Account,
    input: { phone: string; name: string; email: string },
  ): Promise<TrustedAuthResult> {
    const response = await fetch(`${this.baseUrl}/auth/trusted/register-by-phone`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": account.apiToken },
      body: JSON.stringify({
        phone: input.phone,
        name: input.name,
        email: input.email,
        acceptedTerms: true,
        acceptedPrivacy: true,
      }),
    });

    if (response.status === 409) {
      throw new EmailAlreadyExistsError(`Ya existe una cuenta con el email ${input.email}`);
    }

    if (!response.ok) {
      console.error(`[trusted-auth] register-by-phone -> ${response.status} :: ${(await response.text()).slice(0, 500)}`);
      throw new Error(`register-by-phone falló con estado ${response.status}.`);
    }

    return (await response.json()) as TrustedAuthResult;
  }
}
