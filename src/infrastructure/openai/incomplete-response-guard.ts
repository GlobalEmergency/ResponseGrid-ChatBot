import {
  OpenAIProvider,
  Runner,
  type Model,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type ModelRetryAdviceRequest,
} from "@openai/agents";
import { ModelIncompleteResponseError } from "../../application/model-incomplete-response-error.js";

/**
 * Guard de respuestas incompletas de la Responses API (incidente 2026-09-11).
 *
 * Si la API devuelve `status: "incomplete"` con `output` vacío, `@openai/agents` lo toma
 * como "sin salida final", repite el turno y acaba en `MaxTurnsExceededError` sin pista de
 * la causa. Este decorador de `Model` lo corta en el primer turno con un error con nombre.
 *
 * Se engancha como `ModelProvider` (y no con un `fetch` propio del cliente OpenAI): un
 * error lanzado dentro de `fetch` lo convierte el cliente en `APIConnectionError` y lo
 * reintenta, perdiendo el tipo. Tampoco se pasa un `Model` a `Agent.model`: el SDK solo
 * aplica los modelSettings por defecto del modelo (reasoning/verbosity) si es un string.
 */

/** Respuesta incompleta que SÍ trae salida (p. ej. truncada por longitud): solo se registra. */
export interface IncompletePartialResponse {
  reason: string;
  responseId?: string;
  outputItems: number;
}

export type IncompletePartialLogger = (info: IncompletePartialResponse) => void;

const logIncompletePartial: IncompletePartialLogger = (info) =>
  console.warn(JSON.stringify({ t: "model", kind: "incomplete-partial", ...info }));

export class IncompleteResponseGuardModel implements Model {
  constructor(
    private readonly inner: Model,
    private readonly logPartial: IncompletePartialLogger = logIncompletePartial,
  ) {}

  async getResponse(request: ModelRequest): Promise<ModelResponse> {
    const response = await this.inner.getResponse(request);
    // `providerData` es la respuesta cruda de /v1/responses (status, incomplete_details…).
    if (response.providerData?.status !== "incomplete") {
      return response;
    }

    const reason: string = response.providerData.incomplete_details?.reason ?? "unknown";
    if (response.output.length === 0) {
      throw new ModelIncompleteResponseError(reason, response.responseId);
    }

    this.logPartial({ reason, responseId: response.responseId, outputItems: response.output.length });
    return response;
  }

  // Sin guard: el bot llama siempre con stream: false.
  getStreamedResponse(request: ModelRequest) {
    return this.inner.getStreamedResponse(request);
  }

  getRetryAdvice(args: ModelRetryAdviceRequest) {
    return this.inner.getRetryAdvice?.(args);
  }
}

export class IncompleteResponseGuardModelProvider implements ModelProvider {
  constructor(
    private readonly inner: ModelProvider,
    private readonly logPartial?: IncompletePartialLogger,
  ) {}

  async getModel(modelName?: string): Promise<Model> {
    return new IncompleteResponseGuardModel(await this.inner.getModel(modelName), this.logPartial);
  }
}

/**
 * Runner de producción: mismo proveedor que registra `@openai/agents` por defecto, con el
 * guard de respuestas incompletas. El resto de la configuración es la del runner por defecto.
 */
export function createOpenAIRunner(): Runner {
  return new Runner({
    modelProvider: new IncompleteResponseGuardModelProvider(
      new OpenAIProvider({ cacheResponsesWebSocketModels: false }),
    ),
  });
}
