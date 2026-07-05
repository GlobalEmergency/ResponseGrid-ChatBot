/**
 * Serialización de resultados de tools con recorte de listas grandes.
 *
 * Los resultados de las tools se guardan en el historial de la conversación y se
 * REENVÍAN al LLM en cada turno. Una lista de cientos de recursos infla el coste
 * de tokens y el fichero de sesión. Aquí capamos las listas grandes a los primeros
 * N elementos y añadimos un aviso para que el agente filtre o pida uno concreto.
 */
const MAX_TOOL_ITEMS = 25;

function cap(arr: unknown[], maxItems: number) {
  return {
    total: arr.length,
    showing: maxItems,
    truncated: true,
    hint: `Se muestran los primeros ${maxItems} de ${arr.length}. Filtra por texto/categoría/país o pide uno concreto por id para ver el resto.`,
    results: arr.slice(0, maxItems),
  };
}

/** Recorta arrays grandes (sueltos o bajo results/items/data) dejando el resto intacto. */
export function capLargeArrays(result: unknown, maxItems: number = MAX_TOOL_ITEMS): unknown {
  if (Array.isArray(result)) {
    return result.length > maxItems ? cap(result, maxItems) : result;
  }
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    for (const key of ["results", "items", "data"]) {
      const arr = obj[key];
      if (Array.isArray(arr) && arr.length > maxItems) {
        return {
          ...obj,
          [key]: arr.slice(0, maxItems),
          total: arr.length,
          showing: maxItems,
          truncated: true,
          hint: `Se muestran los primeros ${maxItems} de ${arr.length}. Filtra o pide uno concreto por id.`,
        };
      }
    }
  }
  return result;
}

/** JSON legible para el LLM, con listas grandes ya recortadas. */
export function toToolJson(result: unknown, maxItems: number = MAX_TOOL_ITEMS): string {
  return JSON.stringify(capLargeArrays(result, maxItems), null, 2);
}
