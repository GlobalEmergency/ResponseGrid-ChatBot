# 01 · Plan de optimización de latencia — ResponseGrid ChatBot

## Objetivo

Reducir la latencia por turno, que hoy es la **causa nº 1 de abandono** (5 de 9
sesiones fueron de un solo mensaje). El primer "Hola" de un usuario nuevo llegó
a tardar **16 s**: peor imposible como primera impresión.

### Baseline medido (conversaciones reales, jul-2026)

| Métrica | Valor |
|---|---|
| Media por turno | 6,1 s |
| Mediana | 5,8 s |
| p90 | 10,4 s |
| p95 | 12,7 s |
| Máximo | 16,4 s |
| Turns > 10 s | 8 de 63 |

### Meta

| Métrica | Objetivo |
|---|---|
| Mediana | **< 3 s** |
| p90 | **< 6 s** |
| Primer saludo ("Hola") | **< 2 s** |

## Principio

**Medir → optimizar → medir.** Hoy solo registramos el tiempo TOTAL del turno
(`ms`), no dónde se va. Sin desglose, optimizar es adivinar. Por eso la Fase 0
es instrumentación.

### De dónde viene la latencia (hipótesis a confirmar con Fase 0)

1. **Round-trips al modelo.** Cada turno son 1..N llamadas al LLM. Con tools es
   secuencial: modelo → tool (HTTP a la API) → modelo → … Un turno con 2 tools =
   3 llamadas al modelo + 2 a la API, en serie.
2. **Modelo grande por defecto.** `OPENAI_MODEL` está vacío → el SDK usa su
   modelo por defecto (clase GPT-4). Cada round-trip son ~2-5 s.
3. **El saludo paga round-trip extra.** La bienvenida invoca `rg_present_options`
   (que es una *tool*): modelo → tool → modelo, solo para saludar.
4. **Sin streaming.** El usuario espera la respuesta COMPLETA antes de ver nada.
5. **`resolveEmergencyId` hace `GET /emergencies/by-slug` en cada llamada** que
   omite `emergencyId` — se repite dentro del mismo turno y entre turnos.
6. **Notas de voz:** transcripción (llamada extra a OpenAI) antes del agente.

---

## Fase 0 — Instrumentación (medir antes de tocar)

**Esfuerzo: S · Impacto: habilita todo lo demás**

- **[0.1]** Añadir al log estructurado de conversación (`conversation-logger.ts`
  + `conversation-service.ts`) métricas por fase: `ttfm` (time-to-first-model
  response), `nModelCalls`, `nToolCalls`, `toolMs` (suma de tiempo en tools),
  `transcribeMs` (si audio), además del `ms` total que ya existe.
- **[0.2]** Envolver cada `execute` de tool para medir su tiempo (un wrapper en
  `tools.ts`), y contar round-trips del modelo (hooks del SDK `@openai/agents`
  si los expone; si no, inferir por nº de tool-calls).
- **[0.3]** Un script `scripts/latency-stats.ts` que lea los logs y saque el
  desglose (dónde se va el tiempo, por tipo de turno: saludo / búsqueda /
  escritura). Reutiliza el consumidor de logs.

**Entregable:** un desglose real "X% modelo, Y% tools, Z% transcripción" que
prioriza las fases siguientes con datos, no hipótesis.

---

## Fase 1 — Quick wins (mayor impacto / menor esfuerzo)

### [1.1] Fast-path para saludos — **Esfuerzo S · Impacto ALTO**
Detectar saludos puros (`hola`, `buenas`, `hi`, `hello`, `/start`, `/casos`,
`/puntos`) en `ConversationService` **antes** de invocar al agente, y responder
con la bienvenida + botones **precomputados** (texto estático + `choices`
fijos), sin llamar al modelo. Elimina el peor caso (8-16 s → < 500 ms).
- *Dónde:* `conversation-service.ts` (guard antes de `run`), reusando el copy de
  bienvenida y las opciones que hoy define el prompt.
- *Riesgo:* que un "hola" con intención real se corte; mitigación: solo fast-path
  si el mensaje es **exclusivamente** un saludo (regex estricta) y no hay sesión
  en curso con contexto pendiente.

### [1.2] Modelo más rápido por defecto (o tiering) — **Esfuerzo S · Impacto ALTO**
La frontera de seguridad es la **API**, no el LLM, así que un modelo más rápido
es aceptable para la mayoría de turnos. Fijar `OPENAI_MODEL` a un modelo rápido
(p. ej. un `-mini`/tier veloz) y **medir la calidad** en los flujos reales
(inventario, necesidades, donación, catálogo). Si algún flujo pierde calidad,
enrutar solo esos al modelo grande (ver Fase 3).
- *Dónde:* `.env` del server (`OPENAI_MODEL`) + `agent.ts` ya lo respeta.
- *Riesgo:* peor razonamiento en flujos multi-tool → mitigar con tiering (3.1) y
  con un set de pruebas de regresión de conversación.

### [1.3] Cache de `emergencyId` por proceso — **Esfuerzo S · Impacto MEDIO**
Cachear el `slug → id` (una sola emergencia activa) en memoria con TTL, para no
hacer `GET /by-slug` en cada tool. Ahorra 1 HTTP (~0,3-1 s) por tool que lo use.
- *Dónde:* `resolveEmergencyId` en `tools.ts` (Map con TTL, o resolver una vez
  por turno y guardar en `AgentContext`).

---

## Fase 2 — Percepción y round-trips

### [2.1] Streaming de la respuesta — **Esfuerzo M · Impacto ALTO (percibido)**
Usar `run(..., { stream: true })` del SDK.
- **Telegram:** enviar un mensaje y **editarlo** con los tokens según llegan
  (Telegram permite editar) → el usuario ve texto casi al instante.
- **WhatsApp:** no permite streaming de edición; el beneficio es enviar en cuanto
  esté el primer bloque y mantener el indicador "escribiendo…". Menos impacto
  que en Telegram pero mejora el arranque.
- *Dónde:* `conversation-service.ts` + adaptadores de canal.

### [2.2] Reducir round-trips — **Esfuerzo M · Impacto MEDIO**
- `rg_present_options` fuerza un round-trip extra: evaluar resolverlo como
  **efecto de salida** del turno (el modelo declara las opciones en su respuesta
  final) en vez de como tool intermedia.
- Paralelizar tool-calls independientes si el SDK lo permite (búsquedas que no
  dependen entre sí).
- Recorte de listas ya está a 25 (`tool-result.ts`) — mantener.

---

## Fase 3 — Estructural (según datos de Fase 0)

### [3.1] Enrutado de modelo por complejidad — **Esfuerzo M**
Modelo rápido para turnos simples (saludo, consulta, una sola tool); modelo
capaz solo para flujos complejos (multi-tool, estandarización de catálogo,
validación). Clasificador barato (heurística por intención/nº de tools).

### [3.2] Adelgazar el prompt de sistema — **Esfuerzo M**
El system prompt es grande (~55 líneas) y se reenvía en cada turno (coste de
input tokens + tiempo). Separar en **núcleo conciso** + hints por-tool (en la
`description` de cada tool, donde el modelo ya los lee). Objetivo: system prompt
más corto sin perder reglas críticas (identidad, ubicación, donaciones).

### [3.3] Reutilización de conexión / prewarm — **Esfuerzo S-M**
Verificar keep-alive del cliente OpenAI y del `ApiClient` (HTTP agent con
`keepAlive`) para evitar coste de handshake por llamada.

---

## Orden recomendado

1. **Fase 0** (instrumentar) — imprescindible, barato.
2. **1.1 (fast-path saludos)** + **1.2 (modelo rápido)** — el 80% de la mejora
   percibida con poco esfuerzo.
3. **1.3 (cache emergencyId)** — barato, se cuela con lo anterior.
4. **2.1 (streaming Telegram)** — gran salto de percepción.
5. Revisar métricas de Fase 0 → decidir 2.2 / 3.x según dónde quede el tiempo.

## Cómo validamos

- Comparar el desglose de Fase 0 **antes y después** de cada palanca (no fiarse
  de la sensación).
- Set de **conversaciones de regresión** (inventario, necesidades, donación,
  catálogo "comida para bebés", publicar recurso) para asegurar que bajar el
  modelo o cambiar round-trips no rompe la calidad.
- KPI de negocio: **tasa de continuación** (sesiones con > 1 mensaje) debería
  subir al bajar la latencia del primer turno.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Modelo rápido pierde calidad en flujos complejos | Tiering (3.1) + regresión de conversación |
| Fast-path corta un saludo con intención | Regex estricta; solo si no hay contexto en curso |
| Streaming complica el manejo de errores/tools | Empezar solo por Telegram, texto; mantener no-streaming como fallback |
| Cache de emergencyId sirve datos viejos | TTL corto; solo hay una emergencia activa |
