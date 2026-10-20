# Supergloss (word_marker)

A language-learning reader. Import books and documents, read them in a distraction-free view, look up words, translate sentences on-device, and turn what you meet into vocabulary you can practise.

## Features

- **Library**: your works with categories and search; opening one starts the Reader.
- **Reader**: focus-only reading view with an "Aa" settings panel (display options) and a word-info popup. For Japanese or Chinese material read by an English native, drag-selecting text translates the segment to English; other combinations keep the radial quick menu.
- **Sentence translation**: Japanese and Chinese (Simplified) to English, run in the browser with Bergamot. Models are Mozilla Firefox Translations v2.1, self-hosted and cached after first use.
- **Vocab**: collections of words, with CSV import.
- **Practice**: flashcards.
- **Dashboard** and **Settings**.
- **Admin** and **superadmin** areas for managing the service.
- **Languages**: study languages are English, Japanese, Chinese, Spanish and French (Spanish and French need an English native language). The UI is available in Japanese (`ja`), English (`en`) and Chinese (`zh`).

## Tech stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind v4, shadcn/ui on Radix, TanStack Query, Zustand, Motion.
- **Backend**: Node (>= 25), plain `pg` against Postgres, `node-pg-migrate` migrations.
- **Design system**: canonical components in `frontend/src/components/ui/` and `components/app/`, rendered at `/styleguide`. ESLint and stylelint enforce them through `npm run lint`.

## Getting started

Prerequisites: Node >= 25 and a running Postgres.

```sh
cp .env.example .env      # set JWT_SECRET; DATABASE_URL defaults to postgres://localhost:5432/word_marker
npm install
npm run migrate:up -w backend
npm run fetch:mt-models -w backend
```

`fetch:mt-models` downloads the translation models into `frontend/public/models/` (gitignored, verified by size and SHA-256).

Dictionary data is loaded with the import scripts in `backend/package.json`, for example `npm run import:jmdict -w backend` (Japanese), `import:cedict` (Chinese), and `import:wikdict-*` / `import:doozan-es-en` for the other pairs.

Run in development, in two terminals:

```sh
npm run dev:api   # API on http://localhost:3000
npm run dev:web   # app on http://localhost:5173, proxying /api
```

Production-like (the backend serves the built frontend):

```sh
npm run build -w frontend
npm start
```

## Testing

Frontend checks, from the repo root:

```sh
npm run lint -w frontend
npm run typecheck -w frontend
npm test -w frontend          # Vitest
npm run build -w frontend
```

End-to-end (Playwright, headless; starts or reuses the dev servers and seeds a test user):

```sh
npm run test:e2e
```

Running the full e2e suite can hit login rate limiting (HTTP 429) and fail spuriously; running spec files individually passes, for example `npx playwright test tests/smoke/library.spec.ts`.

CI runs lint, typecheck, unit tests and build on pull requests and on pushes to `dev` and `main`.

## Deployment

Pushing to `dev` deploys over SSH (`.github/workflows/deploy-dev.yml`): update the checkout, install dependencies, fetch translation models, build the frontend into a fresh directory, run migrations, re-import JMdict only if its inputs changed, then atomically repoint `frontend/dist` to the new build and restart the process with pm2. The previous build is kept for one deploy so open tabs can still load their chunks.

## Project structure

```txt
backend/            API server: src/modules (service/repository per domain), src/http/routes, migrations, scripts
frontend/           React app: src/app, src/features/<name>, src/components, src/lib, src/stores
frontend/public/    locales.json (ja, en, zh) and fetched translation models
frontend/static/    Vite public dir (Bergamot engine, logo, theme script)
tests/              Playwright setup and smoke specs
.project_planning/  Specs (SPEC-001 to SPEC-005)
```

- `frontend/src/CONTRACTS.md`: frontend structure, contracts and the canonical component catalogue.
- `AGENTS.md`: conventions for contributors and coding agents.
- `.project_planning/specs/`: feature specs.
