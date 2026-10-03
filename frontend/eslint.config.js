/**
 * ESLint flat config for the React frontend: typescript-eslint recommended
 * rules plus the React Hooks rules, and the SPEC-005 design-system rules
 * (canonical components only, banned utilities; see src/CONTRACTS.md
 * "Documented exceptions"). public/ (locales and models) and the vendored
 * engine are not linted.
 */

import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Matches a class-string token (start, whitespace, `:` variant separator or `!`) up to the next separator. */
const classToken = (pattern) => `(?:^|[\\s:!])(?:${pattern})(?=$|[\\s"'\`])`;

/** Applies a regex to string literals and template-literal chunks (class strings). */
const stringMatching = (pattern, message) => [
  { selector: `Literal[value=/${pattern}/]`, message },
  { selector: `TemplateElement[value.raw=/${pattern}/]`, message }
];

/** Raw interactive/table elements are banned in features: use the canonical components. */
const RAW_ELEMENTS = "button|input|select|textarea|table";
const rawElementMessage =
  "Use the canonical component (Button, IconButton, Input, Textarea, Select, NativeSelect, Table) instead of a raw element; see CONTRACTS.md.";
const rawJsxElements = [
  { selector: `JSXOpeningElement[name.name=/^(${RAW_ELEMENTS})$/]`, message: rawElementMessage },
  // HTML built as a string (innerHTML, template literals) bypasses the JSX check.
  ...stringMatching(`<(${RAW_ELEMENTS})[\\s>]`, rawElementMessage)
];

/** Banned utility classes: panel shadows, weights outside 400-600 and radii off the radius scale. */
const bannedUtilities = [
  ...stringMatching(classToken("shadow-panel"), "shadow-panel is gone: panels carry no shadow (floating layers use shadow-float)."),
  ...stringMatching(
    classToken("font-(?:thin|extralight|light|bold|extrabold|black)|font-\\[[^\\]]*\\]"),
    "Font weights are 400-600 only: use font-normal, font-medium or font-semibold."
  ),
  ...stringMatching(
    classToken("rounded(?:-(?:[trblse]|tl|tr|bl|br|ss|se|es|ee))?(?:-(?:xs|sm|md|lg|xl|2xl|3xl|full))?|rounded(?:-[a-z]{1,2})?-\\[(?!inherit\\])[^\\]]*\\]"),
    "Off-scale radius: use rounded-control-sm, rounded-control, rounded-container or rounded-pill."
  )
];

export default tseslint.config(
  { ignores: ["dist", "public", "static"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser
    }
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...rawJsxElements, ...bannedUtilities] }
  },
  {
    // Allow-list: the reader word token is a raw <button> (a word of running text, not a UI control).
    files: ["src/features/reader/ReaderTokens.tsx", "src/features/reader/reader-tokens.ts", "src/features/reader/reader-tokens.test.ts"],
    rules: { "no-restricted-syntax": ["error", ...bannedUtilities] }
  },
  {
    files: ["src/components/app/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...bannedUtilities] }
  },
  {
    files: ["vite.config.ts"],
    languageOptions: { globals: globals.node }
  }
);
