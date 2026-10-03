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

/** Colour-bearing utility prefixes (text-*, bg-*, ring-*, ...). */
const COLOUR_PREFIX = "text|bg|border(?:-[trblxyse])?|ring|ring-offset|outline|fill|stroke|divide|from|via|to|decoration|accent|caret|placeholder|shadow";
const TAILWIND_PALETTE =
  "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}|white|black";
/** Token boundary lookahead: end of the class token (alpha suffix `/50` allowed). */
const END = "(?=$|[\\s\"'`/!])";

/** Banned utility classes: palette and arbitrary colours, shadows, off-scale type, weights outside 400-600 and radii off the radius scale. */
const bannedUtilities = [
  ...stringMatching(classToken("shadow-panel"), "shadow-panel is gone: panels carry no shadow (floating layers use shadow-float)."),
  ...stringMatching(
    classToken(`(?:${COLOUR_PREFIX})-\\[[^\\]]*(?:#|rgb\\(|hsl\\(|oklch\\()[^\\]]*\\]`),
    "Arbitrary colour values are banned: use a design-token colour utility (text-main, bg-panel, border-line, ...)."
  ),
  ...stringMatching(
    classToken(`(?:${COLOUR_PREFIX})-(?:${TAILWIND_PALETTE})${END}`),
    "Tailwind palette colours are banned: use a design-token colour utility (text-main, bg-panel, border-line, ...)."
  ),
  ...stringMatching(classToken(`shadow-(?!(?:float|none)${END})[^\\s"'\`]+`), "Only shadow-float (floating layers) and shadow-none are allowed."),
  ...stringMatching(
    classToken("text-(?:xs|sm|base|lg|xl|[2-9]xl)|text-\\[[0-9.]+(?:px|rem|pt)\\]"),
    "Off-scale text size: use text-title, text-heading, text-body or text-caption."
  ),
  ...stringMatching(
    classToken("font-(?:thin|extralight|light|bold|extrabold|black)|font-\\[[^\\]]*\\]"),
    "Font weights are 400-600 only: use font-normal, font-medium or font-semibold."
  ),
  ...stringMatching(
    classToken("rounded(?:-(?:[trblse]|tl|tr|bl|br|ss|se|es|ee))?(?:-(?:xs|sm|md|lg|xl|2xl|3xl|full))?|rounded(?:-[a-z]{1,2})?-\\[(?!inherit\\])[^\\]]*\\]"),
    "Off-scale radius: use rounded-control-sm, rounded-control, rounded-container or rounded-pill."
  )
];

/** Style props that must come from tokens: allowed in JSX style={{}} only when the value is a CSS var(). */
const STYLE_KEYS = "color|background|backgroundColor|borderColor|borderRadius|fontWeight|fontSize|boxShadow";
const styleProps = [
  {
    selector: `JSXAttribute[name.name="style"] ObjectExpression > Property[key.name=/^(${STYLE_KEYS})$/]:not([value.value=/^var\\(/]):not([value.quasis.0.value.raw=/^var\\(/])`,
    message: "Inline colour, radius, weight, size and shadow styles are banned unless the value is a CSS var(); use tokens and utilities."
  }
];

/** Member-expression motion elements (m.button, motion.input, ...) bypass the raw-element check, unless a canonical component wraps them via asChild. */
const motionElements = [
  {
    selector: `JSXElement:not(JSXElement:has(JSXOpeningElement > JSXAttribute[name.name="asChild"]) > JSXElement) > JSXOpeningElement[name.type="JSXMemberExpression"][name.property.name=/^(${RAW_ELEMENTS})$/]`,
    message: rawElementMessage
  }
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
    rules: { "no-restricted-syntax": ["error", ...rawJsxElements, ...motionElements, ...bannedUtilities, ...styleProps] }
  },
  {
    // Allow-list: the reader word token is a raw <button> (a word of running text, not a UI control).
    files: ["src/features/reader/ReaderTokens.tsx", "src/features/reader/reader-tokens.ts", "src/features/reader/reader-tokens.test.ts"],
    rules: { "no-restricted-syntax": ["error", ...motionElements, ...bannedUtilities, ...styleProps] }
  },
  {
    files: ["src/components/app/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...rawJsxElements, ...motionElements, ...bannedUtilities, ...styleProps] }
  },
  {
    // The kit implements the canonical elements, so raw elements are allowed; colours, shadows, type and radii are not.
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...bannedUtilities] }
  },
  {
    files: ["vite.config.ts"],
    languageOptions: { globals: globals.node }
  }
);
