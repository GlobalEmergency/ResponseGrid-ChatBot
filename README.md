# ResponseGrid ChatBot

> **Español:** see [`README.es.md`](README.es.md) for the full Spanish version.

A multichannel **Telegram + WhatsApp** assistant that lets people operate the
[ResponseGrid](https://responsegrid.app) humanitarian-aid platform in plain
language — by text or voice note — from the chat apps they already use.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen)
[![CI](https://github.com/GlobalEmergency/ResponseGrid-ChatBot/actions/workflows/deploy.yml/badge.svg)](https://github.com/GlobalEmergency/ResponseGrid-ChatBot/actions/workflows/deploy.yml)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

When a disaster hits, the bottleneck is rarely goodwill — it's coordination.
ResponseGrid coordinates resources, collection points, inventory and needs per
emergency. This bot is its conversational front door: a volunteer running a
collection point at 2 a.m. won't open a dashboard, but they already have
WhatsApp open. The bot lets them find aid nearby, register resources, update
inventory and manage needs, all in natural language.

**Try the live bots:** [Telegram](https://t.me/donacionesvenezuela_bot) ·
[WhatsApp](https://wa.me/15559386039) · [Web app](https://responsegrid.app)

---

## Contents

- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Quickstart](#quickstart)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Available tools](#available-tools)
- [Security model](#security-model)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## How it works

```text
Telegram text/audio           WhatsApp text/audio/location
   │                              │
Telegraf bot (long polling)   HTTP webhook (HMAC signature + verify token)
   │                              │
   └──────────────┬───────────────┘
                  │  (voice notes → transcription)
                  ▼
            OpenAI Agent  ──►  ResponseGrid tools  ──►  ResponseGrid API
                  │
                  ▼
        Reply on the originating channel
```

The codebase follows **hexagonal architecture (DDD)** with clear layers:
`domain` (entities, ports) → `application` (the `ConversationService`
orchestrator) → `infrastructure` (Telegram, WhatsApp, ResponseGrid HTTP client,
persistence, observability). Each channel implements the same
`MessagingChannel` port, so adding a new channel means writing one adapter.

**Multi-account:** several emergencies and channels run in the same process.
Each account (one channel + one emergency) is configured independently in
`accounts.json`.

## Tech stack

- **Runtime:** Node.js ≥ 24 (ESM, `NodeNext`), TypeScript (strict)
- **Agent:** [`@openai/agents`](https://github.com/openai/openai-agents-js) SDK
- **Telegram:** [`telegraf`](https://telegraf.js.org/) (long polling)
- **WhatsApp:** Meta WhatsApp Cloud API (Graph API `v25.0`) via a self-hosted webhook
- **Validation:** [`zod`](https://zod.dev/)
- **Tests:** `node:test` via [`tsx`](https://tsx.is/) (no test framework)
- **Voice:** OpenAI transcription for voice notes

## Quickstart

```bash
# Node 24+ required (see .nvmrc)
npm install
cp .env.example .env               # fill in OPENAI_API_KEY, API_BASE_URL
cp accounts.example.json accounts.json   # add at least one Telegram or WhatsApp account
npm run dev
```

Then message your Telegram bot, or (for WhatsApp) expose the webhook port
through a tunnel so Meta can reach it. Try:

```text
Hola, ¿qué puedes hacer en ResponseGrid?
List the active emergencies
Find water collection points in the default emergency
What resources do I manage?
```

You can also send any of these as a **voice note**.

Common scripts:

| Script | What it does |
|---|---|
| `npm run dev` | Run in watch mode (`tsx`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm test` | Run the test suite (`node:test`) |
| `npm run typecheck` | Type-check without emitting |
| `npm run mcp` | Run the MCP server (exposes the tools over MCP) |

## Configuration

Two files, both git-ignored (only their `*.example.*` counterparts are tracked):

**`.env`** — global config shared by every account:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=                     # optional; empty = SDK default
API_BASE_URL=https://api.responsegrid.app

# Only if you have any channel="whatsapp" account:
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_WEBHOOK_PORT=8787
```

**`accounts.json`** — one entry per account (one channel + one emergency):

| Field | Description |
|---|---|
| `id` | Unique account id (internal, for logs/sessions) |
| `channel` | `"telegram"` or `"whatsapp"` |
| `emergencySlug` | ResponseGrid emergency this account is bound to |
| `apiToken` | ResponseGrid service-account token for this account |
| `telegramBotToken` | Telegram only — token from [@BotFather](https://t.me/BotFather) |
| `whatsappPhoneNumberId` | WhatsApp only — Meta Phone Number ID |
| `whatsappAccessToken` | WhatsApp only — Meta access token |

The process refuses to start until `accounts.json` has at least one account with
valid credentials. See [`README.es.md`](README.es.md) for step-by-step credential
setup (BotFather, Meta Cloud API).

## Project structure

```text
src/
├── domain/              Entities & ports (Account, InboundMessage, MessagingChannel)
├── application/         ConversationService orchestrator, rate limiter
├── agent/               OpenAI agent, dynamic instructions, ResponseGrid tools
├── audio/               Voice-note transcription
├── config/              Env & accounts.json loading (zod-validated)
└── infrastructure/
    ├── telegram/        Telegraf adapter & bootstrap
    ├── whatsapp/        Cloud API webhook, HMAC verification, payload builders
    ├── responsegrid/    HTTP API client & trusted phone-login client
    ├── persistence/     File-based session & token stores
    ├── observability/   Structured conversation logging
    └── mcp/             MCP tool mapper
```

## Available tools

The agent exposes safe, typed wrappers over the ResponseGrid API, grouped by
area (see [`src/agent/tools.ts`](src/agent/tools.ts) for the full list):

- **Identity & emergencies** — `rg_get_api_identity`, `rg_list_emergencies`, `rg_get_emergency_by_slug`
- **Public search** — `rg_list_public_resources`, `rg_find_nearby_resources`, `rg_list_public_needs`, `rg_find_nearby_needs`
- **Managed resources & inventory** — `rg_list_my_managed_resources`, `rg_record_inventory_entry`, status changes
- **Needs** — `rg_create_need`, `rg_validate_need`, `rg_list_need_queue`
- **Supply catalog** — `rg_search_supplies` (multi-language standardization)
- **Geocoding** — `rg_geocode`
- **Auth & UX** — `rg_request_user_login` (phone-based), `rg_present_options` (tappable buttons)

## Security model

**The security boundary is the ResponseGrid API, not the LLM.** The API enforces
JWT + role-based authorization on every call; the bot can never do more than the
authenticated user is allowed to. Highlights:

- **Phone-based login** uses only the phone number *verified by the messaging
  platform* — a number typed into the chat is ignored, by design.
- **WhatsApp webhooks** verify the `X-Hub-Signature-256` HMAC before parsing.
- **Rate limiting** and input-size limits (text and audio) on both channels.
- **No secrets in logs or model context.** Session/token files are `chmod 600`.

Found a vulnerability? See [`SECURITY.md`](SECURITY.md) — please report privately.

## Deployment

Deploys automatically on every merge to `main` via GitHub Actions (build + test
on the runner, artifacts copied over SSH, `pm2 startOrReload` on the server).
See [section 10 of `README.es.md`](README.es.md) for the full Plesk/PM2 setup and
the GitHub secrets it expects.

## Contributing

Contributions are very welcome — this is a humanitarian project. Start with
[`CONTRIBUTING.md`](CONTRIBUTING.md) and the
[**good first issues**](https://github.com/GlobalEmergency/ResponseGrid-ChatBot/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).
By participating you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). Built by
[Global Emergency](https://responsegrid.app).
