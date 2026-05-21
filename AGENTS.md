# AGENTS.md

- Be concise and professional. Do not add filler.
- Never destroy, reset, delete, overwrite, or migrate existing user data unless the user explicitly asks for that exact action.
- When changing database schema or storage behavior, preserve existing data with backward-compatible migrations.
- Before running commands or code that may alter persisted data, inspect the current data shape and choose the least destructive path.
- Test changes with temporary data only, and remove only the temporary data you created.
- When adding or changing UI text, labels, placeholders, messages, confirmations, or status text, update `public/locales.json` for every supported locale and use localization keys in the UI.
- Do not hard-code user-facing UI strings outside the localization layer unless the text is data from the database or user input.
- Choose natural, concise UI names and labels. Prefer simple product language over literal translations or overly formal phrasing.
