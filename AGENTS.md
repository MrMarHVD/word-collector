# AGENTS.md

- Be concise, professional and deferent. Do not add filler. 
- `/Users/havardvd/git/Projects/personal/word_marker` is the main project directory, not a git worktree.
- While working in a git worktree, never read, modify, create, or delete any files outside that worktree folder. Confine all changes to the worktree.
- Never destroy, reset, delete, overwrite, or migrate existing user data unless the user explicitly asks for that exact action.
- When changing database schema or storage behavior, preserve existing data with backward-compatible migrations.
- When adding user-owned data, tables, relations, persisted files, or storage behavior, update account deletion so all data related to the deleted user is completely removed.
- Before running commands or code that may alter persisted data, inspect the current data shape and choose the least destructive path.
- Test changes with temporary data only, and remove only the temporary data you created.
- Commits are permitted.
- ALWAYS localize user-facing UI text, labels, placeholders, messages, confirmations, and status text. Update `frontend/public/locales.json` for every supported locale and use localization keys in the UI.
- ALWAYS proofread user-facing text for proper capitalization, punctuation, grammar, and natural product language before finishing.
- Do not hard-code user-facing UI strings outside the localization layer unless the text is data from the database or user input.
- Choose natural, concise UI names and labels. Prefer simple product language over literal translations or overly formal phrasing.
- When changing user-facing frontend behavior or UI, implement the corresponding mobile layout and interaction updates at the same time, preserving desktop behavior unless the user asks otherwise.
- Every UI change must be visually aligned and consistent with the surrounding interface design, and built in a neat, user-friendly fashion. Reuse the existing design tokens, spacing, component patterns, and control styles rather than introducing ad-hoc styling, so new elements look native to the surrounding pane.
- When working in a worktree and testing locally, terminate any existing processes on ports `5174` and `3001`, then use `5174` for the frontend (Vite dev server) and `3001` for the API. From the worktree root, start the API with `PORT=3001 CORS_ORIGIN=http://localhost:5174 API_URL=http://localhost:3001 npm run dev:api` and the frontend with `PORT=5174 API_PROXY_TARGET=http://localhost:3001 npm run dev:web`; Vite proxies `/api` to the API, so both share one origin. Keep those test servers running until they must be restarted or the ports need to be reused for another purpose.
- EVERY TIME you make a change to the code (frontend, backend, CSS, templates, anything), immediately restart BOTH dev servers (frontend on 5174 AND backend on 3001) so the change is actually being served. Do not restart only the one you think is affected — restart both, every time. Do not assume `--watch` or any other mechanism is picking it up. Kill both listeners and start fresh from the correct worktree directories. CSS needs no separate build step: Vite compiles Tailwind and the imported CSS on the fly.
- Do not update `README.md` unless the user explicitly asks for README changes.
- Keep logic modular and centralised in one place to whatever degree possible. Do not repeat code where unnecessary. When the same behavior is needed in more than one place (e.g. across views, services, or modules), extract it into a single shared function or module and import it, rather than copying it. Before adding logic, check whether an existing helper already covers it.
- Whenever you create a new function, class, method, component, hook, route handler, module, or script, write preliminary documentation for it in the same edit. Backend JavaScript gets a JSDoc block (file-level `@fileoverview` for new files; per-symbol `@param`, `@returns`, `@throws` where applicable, plus a one-line description of intent). Frontend TypeScript gets a file-level purpose comment for new files and a short purpose comment on each exported symbol; the TypeScript types replace JSDoc `@param`/`@returns`. Match the documentation style already established in the surrounding file. Keep it tight — describe role and contract, and the WHY only when non-obvious. Do not skip this step and circle back later; the documentation must land with the code.
- Before implementing any major, multi-step change, first explain to the user the expected scope of the work: which files, components, modules, tests, or behaviors are likely to be affected.
- If the requested change is ambiguous, do not guess silently. Explain what is ambiguous, describe the plausible implementation options, and ask the user how they want it handled before proceeding.
- If the user’s proposal or question appears to rely on an incorrect assumption about the codebase’s current logic, architecture, state, or behavior, point that out clearly before making changes. Explain the mismatch and suggest a corrected interpretation or implementation path.
- When you have implemented a change, always describe to the user what you changed and in what way. Divide the codebase into conceptual components (like services, routers, repos) and outline what relevant change occurred in a given component on a conceptual level.
- After implementing any change that affects the UI, always verify it end-to-end in a real browser before reporting it complete. The default, token-efficient path is the headless Playwright suite: run `npm run test:e2e` from the project root (it auto-starts/reuses the Vite dev server on 5173, proxying `/api`, and the API on 3000, seeds the test user, and reports a compact pass/fail summary). When a change touches a flow not yet covered, add or extend a spec under `tests/smoke/` so the suite exercises it. If the suite fails, iterate on the implementation and re-run until it passes; inspect the failure screenshot/trace under `test-results/` only when needed to diagnose.
- Use the Playwright MCP tools (or another browser-control tool) ONLY for interactive, exploratory verification of brand-new UI that the headless suite cannot yet assert — not for routine post-change checks, because MCP snapshots/screenshots consume large amounts of context. Prefer extending the headless suite over repeated MCP runs.


## Code Structure

- `backend/server.js` is the server bootstrap and dependency wiring.
- `backend/src/auth/` contains low-level password, JWT, cookie, and session helpers.
- `backend/src/db/` contains SQLite setup and schema migration code.
- `backend/src/http/` contains request, response, and static file helpers.g
- `backend/src/http/routes/` contains API route handlers.
- `backend/src/modules/` contains domain modules. Each module owns its service and repository files.
- `backend/src/modules/*/*.service.js` contains business logic.
- `backend/src/modules/*/*.repository.js` contains SQL queries and prepared statements.
- `backend/src/shared/` contains small cross-cutting utilities.
- `frontend/` is the React app (Vite, TypeScript, Tailwind v4, shadcn/ui on Radix, TanStack Query, Zustand, React Router). `frontend/src/CONTRACTS.md` documents its structure and contracts.
- `frontend/src/app/` contains the entry wiring, routes, route gating and providers.
- `frontend/src/features/<name>/` contains one folder per feature (pages, components, feature-local TanStack Query hooks and CSS).
- The main navigation's "Read" tab opens the Library (`features/library/`: work list, search, category sidebar, `data/` hooks). Opening a work goes to the Reader (`features/reader/`, `/reader/:materialId`), a distraction-free view with an "Aa" settings panel. `features/materials/` holds the import dialog and shared work helpers.
- `frontend/src/components/ui/` contains the shadcn kit; `frontend/src/components/app/` contains shared app components (shell, sidebar, confirm dialog, toasts).
- `frontend/src/lib/api/` contains the typed API client and query keys; `frontend/src/stores/` contains the Zustand stores for client state. Server data belongs in TanStack Query, not in stores.
- `frontend/public/locales.json` is the localisation catalogue (bundled at build time); `frontend/static/` is the Vite public dir (vendored Bergamot engine, logo, theme script); translation models are fetched into the gitignored `frontend/public/models/` by `npm run fetch:mt-models -w backend`.
- In production the backend serves the Vite build (`npm run build -w frontend`, output `frontend/dist/`) for all non-`/api` paths.

## Frontend conventions

- Write React function components and hooks in strict TypeScript. Import through the `@/` alias.
- Canonical components only (binding, SPEC-005). The catalogue is "Canonical components" in `frontend/src/CONTRACTS.md` and is rendered at `/styleguide`:
  - Always use an existing canonical component from `frontend/src/components/ui/` or `frontend/src/components/app/`.
  - Never create a new implementation of something a canonical component already covers: no hand-rolled buttons, panels, tabs, inputs, popups or tables, and no raw `<button>`, `<input>`, `<select>`, `<textarea>` or `<table>` in feature code (the only exception is a native `<select>` driven by a spec with `selectOption`: use `NativeSelect`). If a variant is missing, add it to the canonical component.
  - Add a new component only when no canonical component fits. Then justify it, design it consistently with the design tokens and the existing set (radii, type scale, `focus-ring`, states, glass for floating layers, no panel shadow), add it to the CONTRACTS.md catalogue and to `/styleguide`, and document it.
  - The old "legacy classes work unchanged" guidance no longer applies; do not use the deprecated legacy component classes.
- Fetch and mutate server data with TanStack Query hooks built on `@/lib/api`; keep only client state in Zustand stores.
- Localise all UI text with `useT()` from `@/lib/i18n`.
- Style with Tailwind utilities and the existing design tokens; feature-specific CSS lives in the feature folder and is imported from its page.
- Before finishing frontend changes, run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` with `-w frontend` (CI runs all four on pull requests).
