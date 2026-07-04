# Telegram + OpenAI Agents SDK + ResponseGrid API

MVP en TypeScript para probar un agente IA conectado a la API real de ResponseGrid usando Telegram como canal de texto y voz.

La API usada por defecto es:

```text
https://api.responsegrid.app
```

Y la documentación OpenAPI está en:

```text
https://api.responsegrid.app/docs-json
https://api.responsegrid.app/docs
```

## Qué incluye

- Bot de Telegram con `telegraf`.
- OpenAI Agents SDK para TypeScript.
- Tools específicas para ResponseGrid.
- Transcripción de notas de voz de Telegram.
- Memoria por chat con `MemorySession`.
- Cliente HTTP compatible con `Authorization: Bearer` y `X-API-Key`.
- Docker y `docker-compose`.
- Estructura preparada para añadir WhatsApp después.

## Arquitectura

```text
Telegram texto/audio
   ↓
Telegraf bot, long polling
   ↓
Transcripción si es nota de voz
   ↓
OpenAI Agent
   ↓
Tools ResponseGrid
   ↓
ResponseGrid API
   ↓
Respuesta a Telegram
```

## 1. Crear bot en Telegram

Habla con `@BotFather` en Telegram:

```text
/newbot
```

Guarda el token que te da.

## 2. Configurar variables

Copia el ejemplo:

```bash
cp .env.example .env
```

Edita `.env`:

```env
OPENAI_API_KEY=sk-...
TELEGRAM_BOT_TOKEN=123456789:AA...

API_BASE_URL=https://api.responsegrid.app

# Usa api-key si tienes una service account de ResponseGrid.
API_AUTH_MODE=api-key
API_TOKEN=rg_live_...

# O usa bearer si vas a usar JWT de usuario:
# API_AUTH_MODE=bearer
# API_TOKEN=eyJhbGciOi...

# Opcional, pero muy recomendable para operar por Telegram sin repetir IDs.
RESPONSEGRID_DEFAULT_EMERGENCY_SLUG=terremoto-venezuela-2026
# RESPONSEGRID_DEFAULT_EMERGENCY_ID=...
```

## 3. Ejecutar en local

```bash
npm install
npm run dev
```

Luego escribe a tu bot en Telegram.

Pruebas sugeridas:

```text
Hola, ¿qué puedes hacer en ResponseGrid?
```

```text
Lista las emergencias activas
```

```text
Busca puntos de acopio de agua en la emergencia por defecto
```

```text
Qué recursos gestiono yo?
```

```text
Busca necesidades urgentes de material médico
```

También puedes enviar una nota de voz con cualquiera de esos mensajes.

## 4. Ejecutar con Docker

```bash
docker compose up --build
```

## 5. Tools incluidas

El agente tiene wrappers seguros para estas acciones:

### Identidad y emergencias

```text
rg_get_api_identity
rg_list_emergencies
rg_get_emergency_by_slug
```

### Recursos públicos

```text
rg_list_public_resources
rg_find_nearby_resources
rg_get_public_resource
rg_get_resource_facets
```

### Recursos gestionados e inventario

```text
rg_list_my_managed_resources
rg_register_resource
rg_get_resource_inventory
rg_update_resource_inventory
rg_record_inventory_entry
rg_update_resource_status
```

### Necesidades

```text
rg_list_public_needs
rg_find_nearby_needs
rg_create_need
rg_list_need_queue
rg_validate_need
```

### Notificaciones

```text
rg_get_notifications
```

## 6. Ejemplos de uso por Telegram

### Buscar recursos

```text
Busca puntos de acopio de agua en Caracas
```

El agente usará `rg_list_public_resources`. Si tiene configurada una emergencia por defecto, no te pedirá el `emergencyId`.

### Buscar recursos cercanos

```text
Busca puntos activos cerca de 10.4806, -66.9036 en un radio de 5 km
```

El agente usará `rg_find_nearby_resources`.

### Registrar un recurso

```text
Registra un punto de acopio llamado Centro Madrid, dirección Calle Mayor 1, coordenadas 40.4168 -3.7038, acepta agua y comida, contacto +34 600 000 000
```

El agente usará `rg_register_resource` si tiene todos los campos mínimos. Si falta latitud/longitud, debe preguntarlas.

### Crear una necesidad

```text
Crea una necesidad urgente: agua para 50 familias en Caracas, coordenadas 10.4806 -66.9036, 200 litros de agua
```

El agente usará `rg_create_need`.

### Inventario

```text
Añade entrada de inventario al recurso <uuid>: 20 cajas de agua y 10 mantas
```

El agente usará `rg_record_inventory_entry`.

## 7. Seguridad operativa

Este proyecto está pensado como MVP funcional, pero con algunas cautelas:

- No expone toda la API como endpoint arbitrario; usa tools concretas.
- Las acciones sensibles están descritas en el prompt para pedir confirmación.
- El cliente soporta service accounts con `X-API-Key`.
- El cliente también soporta JWT con `Authorization: Bearer`.
- No metas claves en Git.
- Para producción añade auditoría persistente de tool calls.

## 8. Limitaciones actuales

- La memoria es `MemorySession`; se pierde al reiniciar el proceso.
- No hay vinculación Telegram → usuario interno todavía.
- No hay panel de revisión ni auditoría persistente.
- No hay WhatsApp todavía, pero la estructura lo permite.
- No hay geocodificación automática: si el usuario da una dirección sin coordenadas, el agente debe preguntarlas o tendrás que añadir una tool de geocoding.

## 9. Pasar luego a WhatsApp

La parte importante del agente está separada:

```text
src/agent/
src/api/
src/audio/
```

Telegram vive en:

```text
src/channels/telegram/
```

Cuando añadas WhatsApp, crea algo así:

```text
src/channels/whatsapp/
  whatsapp-webhook.ts
  whatsapp-sender.ts
  whatsapp-media.ts
```

Y reutiliza el mismo `apiAgent`.
