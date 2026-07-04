/**
 * Convierte un wa_id de WhatsApp (llega sin "+", p.ej. "34600123456") a su forma
 * canónica E.164 con prefijo "+", que es la misma forma que usa Telegram al
 * normalizar el contacto compartido. Mantener ambos canales en la misma forma
 * evita que la misma persona genere dos identidades distintas en el backend.
 */
export function canonicalPhone(waId: string): string {
  return waId.startsWith("+") ? waId : `+${waId}`;
}
