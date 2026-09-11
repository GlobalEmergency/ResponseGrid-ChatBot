/**
 * El modelo devolvió una respuesta incompleta SIN ninguna salida (status "incomplete" y
 * output vacío). No es transitorio: repetir la misma petición vuelve a fallar igual
 * (p. ej. un schema de tool rechazado agota max_output_tokens sin generar nada), así que
 * no se reintenta. Antes el SDK lo tomaba como "sin salida final", repetía turnos y
 * acababa en un MaxTurnsExceededError que ocultaba la causa (incidente 2026-09-11).
 */
export class ModelIncompleteResponseError extends Error {
  override readonly name = "ModelIncompleteResponseError";

  constructor(
    /** Motivo que da la API (`incomplete_details.reason`), p. ej. "max_output_tokens". */
    readonly reason: string,
    readonly responseId?: string,
  ) {
    super(`model-incomplete (${reason})`);
  }
}
