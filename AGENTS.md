# AGENTS.md

- Be concise, professional and deferent. Do not add filler. 
- `/Users/havardvd/git/Projects/personal/word_marker` is the main project directory, not a git worktree.
- While working in a git worktree, never read, modify, create, or delete any files outside that worktree folder. Confine all changes to the worktree.
- Never destroy, reset, delete, overwrite, or migrate existing user data unless the user explicitly asks for that exact action.
- When changing database schema or storage behavior, preserve existing data with backward-compatible migrations.
- When adding user-owned data, tables, relations, persisted files, or storage behavior, update account deletion so all data related to the deleted user is completely removed.
- Before running commands or code that may alter persisted data, inspect the current data shape and choose the least destructive path.
- Test changes with temporary data only, and remove only the temporary data you created.
- Never create commits. Leave all commits to the user.
- ALWAYS localize user-facing UI text, labels, placeholders, messages, confirmations, and status text. Update `frontend/public/locales.json` for every supported locale and use localization keys in the UI.
- ALWAYS proofread user-facing text for proper capitalization, punctuation, grammar, and natural product language before finishing.
- Do not hard-code user-facing UI strings outside the localization layer unless the text is data from the database or user input.
- Choose natural, concise UI names and labels. Prefer simple product language over literal translations or overly formal phrasing.
- When changing user-facing frontend behavior or UI, implement the corresponding mobile layout and interaction updates at the same time, preserving desktop behavior unless the user asks otherwise.
- Every UI change must be visually aligned and consistent with the surrounding interface design, and built in a neat, user-friendly fashion. Reuse the existing design tokens, spacing, component patterns, and control styles rather than introducing ad-hoc styling, so new elements look native to the surrounding pane.
- When working in a worktree and testing locally, terminate any existing processes on ports `5174` and `3001`, then use `5174` for the frontend and `3001` for the API. Keep those test servers running until they must be restarted or the ports need to be reused for another purpose.
- EVERY TIME you make a change to the code (frontend, backend, CSS, templates, anything), immediately restart BOTH dev servers (frontend on 5174 AND backend on 3001) so the change is actually being served. Do not restart only the one you think is affected — restart both, every time. Do not assume `--watch` or any other mechanism is picking it up. Kill both listeners and start fresh from the correct worktree directories. CSS changes additionally require rebuilding Tailwind (`npm run build:css` from the worktree root, or run the watcher) before restarting.
- Do not update `README.md` unless the user explicitly asks for README changes.
- Keep logic modular and centralised in one place to whatever degree possible. Do not repeat code where unnecessary. When the same behavior is needed in more than one place (e.g. across views, services, or modules), extract it into a single shared function or module and import it, rather than copying it. Before adding logic, check whether an existing helper already covers it.
- Whenever you create a new function, class, method, route handler, module, or script, write preliminary documentation for it in the same edit. Backend and frontend JavaScript get a JSDoc block (file-level `@fileoverview` for new files; per-symbol `@param`, `@returns`, `@throws` where applicable, plus a one-line description of intent). Match the documentation style already established in the surrounding file. Keep it tight — describe role and contract, and the WHY only when non-obvious. Do not skip this step and circle back later; the documentation must land with the code.
- Before implementing any major, multi-step change, first explain to the user the expected scope of the work: which files, components, modules, tests, or behaviors are likely to be affected.
- If the requested change is ambiguous, do not guess silently. Explain what is ambiguous, describe the plausible implementation options, and ask the user how they want it handled before proceeding.
- If the user’s proposal or question appears to rely on an incorrect assumption about the codebase’s current logic, architecture, state, or behavior, point that out clearly before making changes. Explain the mismatch and suggest a corrected interpretation or implementation path.
- When you have implemented a change, always describe to the user what you changed and in what way. Divide the codebase into conceptual components (like services, routers, repos) and outline what relevant change occurred in a given component on a conceptual level.
- After implementing any change that affects the UI, always verify it end-to-end in a real browser before reporting it complete. The default, token-efficient path is the headless Playwright suite: run `npm run test:e2e` from the project root (it auto-starts/reuses the frontend on 5173 and API on 3000, seeds the test user, and reports a compact pass/fail summary). When a change touches a flow not yet covered, add or extend a spec under `tests/smoke/` so the suite exercises it. If the suite fails, iterate on the implementation and re-run until it passes; inspect the failure screenshot/trace under `test-results/` only when needed to diagnose.
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
- `frontend/public/js/` contains browser modules split by state, DOM, API, i18n, CSV parsing, shared helpers, and views.
