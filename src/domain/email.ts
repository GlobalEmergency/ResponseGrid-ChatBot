// Formato mínimo "algo@dominio.tld". Deliberadamente simple y sin lookahead: la validación
// exhaustiva la hace la API de ResponseGrid (@IsEmail); aquí solo evitamos enviarle un email roto.
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Value object: email con formato válido y sin espacios alrededor. */
export class Email {
  private constructor(readonly value: string) {}

  /** Crea un Email si `raw` (recortado) tiene formato válido; si no, devuelve undefined. */
  static tryCreate(raw: string): Email | undefined {
    const trimmed = raw.trim();
    return EMAIL_FORMAT.test(trimmed) ? new Email(trimmed) : undefined;
  }

  toString(): string {
    return this.value;
  }
}
