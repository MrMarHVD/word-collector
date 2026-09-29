/**
 * ESLint flat config for the React frontend: typescript-eslint recommended
 * rules plus the React Hooks rules. The legacy app (public/, server.js) and
 * the vendored engine are not linted.
 */

import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "public", "static", "server.js"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser
    }
  },
  {
    files: ["vite.config.ts"],
    languageOptions: { globals: globals.node }
  }
);
