# Contributing / Contribuir

Thanks for helping improve **ResponseGrid ChatBot** — a humanitarian
coordination bot. English first, [español más abajo](#contribuir-en-español).

---

## Contributing (English)

### Where to start

- Browse the [**good first issues**](https://github.com/GlobalEmergency/ResponseGrid-ChatBot/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
  and [**help wanted**](https://github.com/GlobalEmergency/ResponseGrid-ChatBot/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).
- Comment on an issue to claim it before you start, so we don't duplicate work.
- No matching issue? Open one describing the change before writing code.

### Dev setup

```bash
# Node 24+ (see .nvmrc — `nvm use` picks it up)
npm install
cp .env.example .env                       # set OPENAI_API_KEY, API_BASE_URL
cp accounts.example.json accounts.json     # add at least one account
npm test          # run the suite — should pass before you change anything
npm run dev       # watch mode
```

You don't need real WhatsApp/Meta credentials to work on most of the codebase:
the tests run fully offline, and Telegram only needs a free [@BotFather](https://t.me/BotFather)
token. Never commit `.env` or `accounts.json` — they're git-ignored.

### Coding standards

- **TypeScript strict**, ESM (`NodeNext`). Keep `npm run typecheck` green.
- **Architecture:** hexagonal / DDD. Respect the layers — `domain` has no
  dependencies on `infrastructure`; channels talk to the app through the
  `MessagingChannel` port. New channel? Add an adapter, don't leak channel
  details into `application`/`agent`.
- **Principles:** Clean Code, SOLID, small focused files.
- **Tests are required** for behavior changes. We use `node:test` via `tsx`
  (no framework) — put `*.test.ts` next to the code it covers and run
  `npm test`. Every PR must keep the suite green.
- **Never log or hardcode secrets** (tokens, API keys, phone numbers).

### Pull request flow

1. Fork (or branch, if you have access) off `main`.
2. Make focused commits; keep the diff small and reviewable.
3. Ensure `npm run typecheck` and `npm test` pass.
4. Open a PR against `main`, fill in the template, and link the issue
   (`Closes #123`).
5. CI (typecheck + build + test on Node 24) must be green to merge.

Merges to `main` deploy automatically to production, so keep `main` releasable.

---

## Contribuir (en español)

### Por dónde empezar

- Mira las [**good first issues**](https://github.com/GlobalEmergency/ResponseGrid-ChatBot/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
  y las [**help wanted**](https://github.com/GlobalEmergency/ResponseGrid-ChatBot/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).
- Comenta la issue para reclamarla antes de empezar y no duplicar trabajo.
- ¿No hay issue que encaje? Abre una describiendo el cambio antes de picar código.

### Entorno de desarrollo

```bash
# Node 24+ (ver .nvmrc — `nvm use` lo coge)
npm install
cp .env.example .env                       # pon OPENAI_API_KEY, API_BASE_URL
cp accounts.example.json accounts.json     # añade al menos una cuenta
npm test          # ejecuta la suite — debe pasar antes de tocar nada
npm run dev       # modo watch
```

No necesitas credenciales reales de WhatsApp/Meta para trabajar en casi todo:
los tests corren offline y Telegram solo pide un token gratis de
[@BotFather](https://t.me/BotFather). Nunca subas `.env` ni `accounts.json`
(están en `.gitignore`).

### Estándares de código

- **TypeScript strict**, ESM (`NodeNext`). Mantén `npm run typecheck` en verde.
- **Arquitectura:** hexagonal / DDD. Respeta las capas — `domain` no depende de
  `infrastructure`; los canales hablan con la app por el puerto
  `MessagingChannel`. ¿Canal nuevo? Añade un adaptador, no filtres detalles del
  canal a `application`/`agent`.
- **Principios:** Clean Code, SOLID, ficheros pequeños y enfocados.
- **Tests obligatorios** para cambios de comportamiento. Usamos `node:test` con
  `tsx` (sin framework): pon los `*.test.ts` junto al código y corre `npm test`.
- **Nunca loguees ni hardcodees secretos** (tokens, API keys, teléfonos).

### Flujo de Pull Request

1. Fork (o rama, si tienes acceso) desde `main`.
2. Commits enfocados; diff pequeño y revisable.
3. Asegúrate de que `npm run typecheck` y `npm test` pasan.
4. Abre el PR contra `main`, rellena la plantilla y enlaza la issue
   (`Closes #123`).
5. La CI (typecheck + build + test en Node 24) debe estar verde para mergear.

Los merges a `main` despliegan a producción automáticamente: mantén `main`
siempre desplegable.
