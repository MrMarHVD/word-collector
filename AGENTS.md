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
- Before implementing any major, multi-step change, first explain to the user the expected scope of the work: which files, components, modules, tests, or behaviors are likely to be affected.
- If the requested change is ambiguous, do not guess silently. Explain what is ambiguous, describe the plausible implementation options, and ask the user how they want it handled before proceeding.
- If the user’s proposal or question appears to rely on an incorrect assumption about the codebase’s current logic, architecture, state, or behavior, point that out clearly before making changes. Explain the mismatch and suggest a corrected interpretation or implementation path.
- When you have implemented a change, always describe to the user what you changed and in what way. Divide the codebase into conceptual components (like services, routers, repos) and outline what relevant change occurred in a given component on a conceptual level.


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
