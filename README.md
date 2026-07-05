# Telegram + WhatsApp + OpenAI Agents SDK + ResponseGrid API

Agente IA multi-cuenta conectado a la API real de ResponseGrid, con Telegram y WhatsApp como canales de texto y voz. Cada cuenta (una emergencia, un canal) se configura de forma independiente en `accounts.json`.

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

- Bots de Telegram (`telegraf`, long polling) y webhook de WhatsApp Cloud API, uno por cuenta.
- Soporte multi-cuenta: varias emergencias y varios canales corriendo en el mismo proceso, definidos en `accounts.json`.
- OpenAI Agents SDK para TypeScript.
- Tools específicas para ResponseGrid.
- Transcripción de notas de voz (Telegram y WhatsApp).
- Memoria por chat persistida en disco (`FileSessionRepository`).
- Cliente HTTP compatible con `Authorization: Bearer` y `X-API-Key`.
- Docker y `docker-compose` (solo para desarrollo local).

## Arquitectura

```text
Telegram texto/audio          WhatsApp texto/audio/ubicación
   ↓                              ↓
Telegraf bot, long polling    Webhook HTTP (firma HMAC + verify token)
   ↓                              ↓
        Transcripción si es nota de voz
                    ↓
              OpenAI Agent
                    ↓
            Tools ResponseGrid
                    ↓
             ResponseGrid API
                    ↓
      Respuesta al canal de origen
```

## 1. Crear las credenciales de cada canal

### Telegram

Habla con `@BotFather` en Telegram:

```text
/newbot
```

Guarda el token que te da (`telegramBotToken` en `accounts.json`).

### WhatsApp (Meta Cloud API)

Crea una app de WhatsApp Business en [Meta for Developers](https://developers.facebook.com/) y anota:

- `whatsappPhoneNumberId` (el Phone Number ID del número de prueba/producción).
- `whatsappAccessToken` (token de acceso permanente o del sistema).
- El `App Secret` de la app de Meta (va en `.env` como `WHATSAPP_APP_SECRET`, es compartido por todas las cuentas de WhatsApp).

## 2. Configurar variables

### `.env` — solo configuración global, compartida por todas las cuentas

Copia el ejemplo:

```bash
cp .env.example .env
```

Edita `.env`:

```env
OPENAI_API_KEY=sk-...
# Opcional. Si lo dejas vacío, el SDK usará su modelo por defecto.
OPENAI_MODEL=

API_BASE_URL=https://api.responsegrid.app

# Solo si tienes alguna cuenta channel=whatsapp en accounts.json:
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_WEBHOOK_PORT=8787
```

### `accounts.json` — credenciales por cuenta (una emergencia + un canal)

Copia el ejemplo:

```bash
cp accounts.example.json accounts.json
```

Cada entrada del array es una cuenta independiente:

| Campo | Descripción |
|---|---|
| `id` | Identificador único de la cuenta (uso interno, para logs y sesiones). |
| `channel` | `"telegram"` o `"whatsapp"`. |
| `emergencySlug` | Slug de la emergencia de ResponseGrid a la que se conecta esta cuenta. |
| `apiToken` | Token de ResponseGrid (`rg_live_...`) de la service account de esta cuenta. |
| `telegramBotToken` | Solo si `channel: "telegram"`. Token de BotFather. |
| `whatsappPhoneNumberId` | Solo si `channel: "whatsapp"`. Phone Number ID de Meta. |
| `whatsappAccessToken` | Solo si `channel: "whatsapp"`. Access token de Meta. |

No metas `accounts.json` en Git (ya está en `.gitignore`); solo el `accounts.example.json` con placeholders.

## 3. Ejecutar en local

```bash
npm install
npm run dev
```

Si tienes cuentas de Telegram, escribe a tu bot en Telegram. Si tienes cuentas de WhatsApp, necesitas exponer el puerto del webhook (p.ej. con un túnel) para que Meta pueda llamarlo; ver la sección de despliegue más abajo para la configuración de producción.

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

## 6. Ejemplos de uso (Telegram o WhatsApp)

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

- No hay panel de revisión ni auditoría persistente.
- No hay geocodificación automática: si el usuario da una dirección sin coordenadas, el agente debe preguntarlas o tendrás que añadir una tool de geocoding.

## 9. Estructura del código

El proyecto sigue una arquitectura hexagonal (DDD):

```text
src/domain/           entidades y puertos (Account, MessagingChannel, AuthStore...)
src/application/      casos de uso (ConversationService, AccountRegistry)
src/agent/            integración con OpenAI Agents SDK y tools de ResponseGrid
src/audio/            transcripción de notas de voz
src/infrastructure/
  telegram/           bot de Telegram (adapter + bootstrap)
  whatsapp/           webhook de WhatsApp Cloud API (adapter + servidor HTTP)
  responsegrid/       cliente HTTP de la API de ResponseGrid
  persistence/        sesiones y tokens en disco
src/config/           carga de env.ts y accounts.json
```

Cada canal (Telegram, WhatsApp) implementa el mismo puerto `MessagingChannel` y comparte `ConversationService`, `ResponseGrid` y el agente de OpenAI.

## 10. Despliegue en srv07 (Plesk) — automático vía GitHub Actions

El despliegue es **automático en cada merge a `main`**. El workflow
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):

1. **CI** (siempre, también en PRs): `npm ci` + `typecheck` + `build` + `test` en Node 24.
2. **Deploy** (solo en push a `main`, si CI pasa): construye los artefactos en el
   runner, los copia por SSH a srv07 (`rsync`/`scp` de `dist/`, `package.json`,
   `package-lock.json`, `ecosystem.config.cjs`) y en el servidor ejecuta
   `npm ci --omit=dev` + `pm2 startOrReload`. No toca `.env`, `accounts.json`,
   `.sessions/` ni `node_modules` del servidor.

### Secrets de GitHub necesarios (repo → Settings → Secrets and variables → Actions)

| Secret | Valor |
|--------|-------|
| `SRV07_HOST` | host SSH de srv07 |
| `SRV07_USER` | usuario de sistema Plesk del dominio (p. ej. `globalemergency.online`) |
| `SRV07_PORT` | puerto SSH (normalmente `22`) |
| `SRV07_SSH_KEY` | clave privada del par de deploy (la pública va en el `authorized_keys` del usuario) |
| `SRV07_DEPLOY_PATH` | ruta del checkout en el servidor (p. ej. `/var/www/vhosts/globalemergency.online/responsegrid-bot.globalemergency.online/app`) |

### Provisión del servidor (una sola vez)

Node 24 y PM2 los gestiona Plesk (`/opt/plesk/node/24`). Por cada suscripción hay
una unidad `pm2-<usuario>.service` (systemd) que resucita los procesos tras
reinicio. El proceso corre **como el usuario de sistema del dominio**, no como root.

En Plesk, el subdominio `responsegrid-bot.globalemergency.online` proxya el webhook
al proceso local mediante una directiva nginx adicional
(`/var/www/vhosts/system/<subdominio>/conf/vhost_nginx.conf`):

```nginx
location /webhook/whatsapp {
  proxy_pass http://127.0.0.1:8787;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

El SSL (Let's Encrypt) del subdominio se gestiona desde Plesk — obligatorio, Meta
Cloud API exige HTTPS para el webhook.

### Config del servidor (rellenar con valores reales)

En la ruta del deploy conviven, **fuera de git**, `.env` (globales: `OPENAI_API_KEY`,
`API_BASE_URL`, y si hay WhatsApp `WHATSAPP_APP_SECRET`/`WHATSAPP_VERIFY_TOKEN`/
`WHATSAPP_WEBHOOK_PORT`) y `accounts.json` (una entrada por bot de Telegram o número
de WhatsApp, con su `apiToken` de ResponseGrid y su emergencia). El proceso no
arranca hasta que `accounts.json` tenga al menos una cuenta con credenciales válidas.

### Webhook de WhatsApp en Meta

En Meta for Developers, configurar el webhook con
`https://responsegrid-bot.globalemergency.online/webhook/whatsapp` y el mismo
`WHATSAPP_VERIFY_TOKEN` que en `.env`.

El `Dockerfile`/`docker-compose.yml` de este repo son solo para desarrollo local;
no se usan en `srv07`.
