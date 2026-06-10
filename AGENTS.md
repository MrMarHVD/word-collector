# AGENTS.md

- Be concise, professional and deferent. Do not add filler. 
- Never destroy, reset, delete, overwrite, or migrate existing user data unless the user explicitly asks for that exact action.
- When changing database schema or storage behavior, preserve existing data with backward-compatible migrations.
- Before running commands or code that may alter persisted data, inspect the current data shape and choose the least destructive path.
- Test changes with temporary data only, and remove only the temporary data you created.
- ALWAYS localize user-facing UI text, labels, placeholders, messages, confirmations, and status text. Update `frontend/public/locales.json` for every supported locale and use localization keys in the UI.
- ALWAYS proofread user-facing text for proper capitalization, punctuation, grammar, and natural product language before finishing.
- Do not hard-code user-facing UI strings outside the localization layer unless the text is data from the database or user input.
- Choose natural, concise UI names and labels. Prefer simple product language over literal translations or overly formal phrasing.
- When changing user-facing frontend behavior or UI, implement the corresponding mobile layout and interaction updates at the same time, preserving desktop behavior unless the user asks otherwise.
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
