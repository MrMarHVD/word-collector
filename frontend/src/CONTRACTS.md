# Frontend contracts (SPEC-003, I1–I8)

Source of truth for the interfaces the feature issues (RX-003 … RX-010) build
on. RX-002 owns everything outside `src/features/<name>/`. Never change a
contract unilaterally: if one blocks you, stop and report the gap.

## 0. Running the app

| What             | Command (from the repo root)                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| API              | `PORT=<api> CORS_ORIGIN=http://localhost:<web> API_URL=http://localhost:<api> npm run dev -w backend`                   |
| React app (Vite) | `PORT=<web> API_PROXY_TARGET=http://localhost:<api> npm run dev -w frontend` (root alias: `npm run dev:web`)            |
| Playwright       | `PW_FRONTEND_URL=http://localhost:<web> PW_API_URL=http://localhost:<api> npx playwright test [--project=setup] [file]` |
| Checks           | `npm run lint -w frontend`, likewise `typecheck`, `test` and `build` (CI runs all four on pull requests)                |

Vite env vars:

- `PORT`: dev/preview server port (default `5173`, `strictPort`, so it fails instead of moving).
- `API_PROXY_TARGET`: backend origin that `/api/*` is proxied to (default `http://localhost:3000`).

The app and API share one origin through the proxy: there is no `env.js`, and
`window.WORD_MARKER_API_BASE_URL` is undefined (specs fall back to `""`, i.e.
same origin). Playwright reuses running servers when `PW_FRONTEND_URL` and
`PW_API_URL` respond; otherwise `playwright.config.ts` starts the API and Vite
(proxying `/api` to `PW_API_URL`).

Static layout:

- `frontend/static/` is Vite's public dir: `/vendor/bergamot-0.4.9/*` (engine copy), `/logo.png`, `/theme-init.js` (no-flash theme script).
- Models stay in the gitignored `frontend/public/models/` (the `fetch:mt-models` target). The `translationModels` plugin in `vite.config.ts` serves `/models/*` (immutable cache) in dev/preview and copies them to `dist/models/` on build. Missing `/vendor/*` and `/models/*` files return a real 404.
- Build output: `frontend/dist/` (gitignored). In production the backend serves it (`PUBLIC_DIR`) with the same security headers, immutable caching for `/assets/`, `/vendor/bergamot-0.4.9/` and `/models/`, real 404s for missing `/assets/`, `/vendor/` and `/models/` files, and a `no-cache` SPA fallback; deploy runs `npm run build -w frontend` after `fetch:mt-models`.

## Layout and conventions

```
src/
  main.tsx               entry (theme sync, session bootstrap, router)
  app/                   routes.tsx, pages.ts, RouteGate.tsx, RouteError.tsx, RootLayout.tsx, route-paths.ts, providers.tsx, bootstrap.ts, stale-build.ts
  components/ui/         shadcn kit (I2)
  components/app/        shared app components (I6)
  lib/api/               typed API client (I3)
  lib/                   i18n.ts (I5), storage.ts, study-language.ts, disambiguation.ts, query-client.ts, utils.ts (cn), hooks/
  stores/                Zustand stores (I4)
  styles/                Tailwind v4 entry and global CSS
  features/<name>/       one folder per feature issue
```

- Import with the `@/` alias (`@/lib/api`, `@/stores/session`, …).
- TypeScript is strict. Document every new component, hook and function with a short purpose comment; the types replace JSDoc `@param`/`@returns`.
- Tailwind scans `src/` only. The token aliases (`bg-panel`, `text-secondary`, `border-line`, `bg-brand`, …) resolve to the design tokens below; there is no panel shadow utility (`shadow-panel` is gone and lint-banned). The old shared component classes (`.danger-button`, `.close-button`, `.tab-button`, `.local-tab`, …) are deleted: use the canonical components below.
- Feature CSS lives in `src/features/<name>/<name>.css`, imported from your page. Keep it **unlayered** so it still beats utility classes, and **layout only** (grid, flex, sizes, positioning): stylelint bans raw colours, radii, shadows and font weights there. Global and shared CSS is in `src/styles/` (read-only for features).
- Mobile breakpoint: `max-width: 760px` (`useIsMobileLayout()` in `@/lib/hooks/use-media-query`). In Tailwind use the `mobile:` (≤760px) and `desktop:` (≥761px) variants, not `sm:`/`md:`.
- Button text: legacy `button { font: inherit }` (in `styles/base.css`) overrides `font-*`/`text-*` utilities on buttons, exactly as it does in the legacy app. Keep it that way for parity.

## Design tokens (SPEC-005 D1)

Defined in `styles/theme.css` (values, light in `:root`, dark in `html[data-theme="dark"]`) and mapped into Tailwind there and in `styles/shadcn.css`. Colours are OKLCH; greys have chroma 0 (no tint). Review them at `/styleguide` (internal, not in the navigation; switch the theme in Settings for the other mode).

- **Surfaces**: `--surface-page`, `--surface-panel`, `--surface-subtle` (tonal step), `--surface-muted`, `--surface-reader` (warm paper / soft dark). In light mode the page is a faint cool grey (`oklch(0.96 0.005 230)`, hue tied to the accent, about 1.11:1 against white panels) so panels separate clearly; subtle/muted fills share that hue. Hierarchy is a hairline border or a tonal step, never both. Utilities: `bg-page`, `bg-panel`, `bg-subtle`, `bg-muted`, `bg-reader`.
- **Text**: `--text-main`, `--text-label`, `--text-muted` (`text-main`, `text-label`, `text-secondary`). All meet WCAG AA on every surface.
- **Border** (muted profile): `--border` (1px hairline for card edges, dividers, table and list rows, chips; `border-line`; light 0.93 / dark 0.27, about 1.2:1 on panel and page) and `--border-strong` (control edges only: input, checkbox, outline buttons, toggles; `border-line-strong`; light 0.80 / dark 0.40, about 1.7 to 2.1:1), `--glass-border` (floating edges, about 1.15:1 light / 1.3:1 dark). Lines are decorative, so WCAG 1.4.11 does not apply to them. Control boundaries sit below 3:1 on purpose: a control is identified by the combination of a `--surface-subtle` fill (`Input`, `Checkbox`), the strong border, its label/placeholder text and the strong `focus-ring`, never by the border alone. Do not use `border-line-strong` for decoration; use `border-line`.
- **Accent** (hue 220, low chroma): `--accent` (`text-brand`/`bg-primary`), `--accent-foreground` (text on the accent; `text-primary-foreground`), `--accent-subtle` (static tonal tint only, e.g. the accent `Badge`; never hover or selected; `bg-accent-subtle`), `--hover-overlay` (text colour at 6%, 9% in dark; `bg-hover`) and `--selected-overlay` (accent at 12%, 20% in dark; `bg-selected`), `--accent-strong`. Only for primary actions, links, focus and active states. The kit's `bg-accent` is mapped to `--hover-overlay` (its hover/focus surface). Usage rule: hover = `bg-hover` (text-colour overlay, a visible step darker on page, panel and glass); selected/active = `bg-selected` plus `text-brand` (accent overlay, clearly stronger than hover); never use `--accent-subtle` for either; the accent colour in the kit is `primary`.
- **Danger**: `--danger` (text, AA on glass; `text-destructive`/`text-danger`) and `--danger-fill` (destructive button fill under a white label; `bg-danger-fill`).
- **Glass text**: inside `.glass`, `--text-muted`/`text-secondary` re-point to `--glass-muted` (the label tone in light) so muted captions stay AA over any backdrop.
- **Word status** (learning is violet, hue 290, clear of the accent; the reader highlights are `color-mix`ed from these tokens): `--status-unknown`, `--status-learning`, `--status-known` (fills, `bg-status-*`) and `--status-*-text` (text-safe variants, `text-status-unknown-text`, `text-status-learning-text`, `text-status-known-text`). Plain `text-status-*` is the fill colour: use it only for non-text marks.
- **Radius** (exactly these four): `--radius-control-sm` 4px (`rounded-control-sm`, small controls such as the checkbox box and flag chips), `--radius-control` 8px (`rounded-control`), `--radius-container` 14px (`rounded-container`), `--radius-pill` (`rounded-pill`, badges only).
- **Type**: `text-title` 22/1.3, `text-heading` 17/1.4, `text-body` 15/1.55, `text-caption` 13/1.45 (px / line height; title and heading are 600, body and caption 400). Weights are 400, 500, 600 only (`font-normal`, `font-medium`, `font-semibold`).
- **Elevation**: `--shadow-float` (`shadow-float`) for floating layers only. There is no panel shadow.
- **Glass**: `--glass-bg`, `--glass-border`, `--glass-blur`, `--glass-solid` (fallback) and the `.glass` class (`styles/glass.css`). Chrome and floating layers only, never behind reading text. It turns solid under `prefers-reduced-transparency: reduce` and without `backdrop-filter`. Put only `--text-main`/`--text-label` text on glass: they keep AA over any backdrop; `--text-muted` does not.
- **Focus**: `--focus-ring` (soft accent halo colour) and the `focus-ring` utility (2px accent outline on `:focus-visible`).
- **Fonts**: `@/lib/fonts` is the reading-font registry (`{ id, label, latinFamily, cjkFamilies }`, one entry `ia-quattro`) and the single source of the stack: `useReadingFont()` (called in `AppProviders`) writes `--font-reading-default` and `--font-reading-zh` onto `<html>`, and `--font-reading` / `font-reading` resolves to them (`:lang(zh)` uses the Chinese-first one). `styles/theme.css` keeps one hard-coded fallback only for the first paint before JS runs; keep it equal to the registry default. A future font picker passes its id to `useReadingFont(id)`. iA Writer Quattro is self-hosted unmodified in `static/fonts/ia-writer-quattro/` (SIL OFL 1.1, Reserved Font Name "iA Writer"; keep `LICENSE.md`). Noto Sans JP/SC come from `@fontsource-variable` with unicode-range slices (`styles/fonts.css`); `:lang(zh)` prefers the SC face.

## Canonical components (SPEC-005 D2)

### Binding rules

1. **Always use an existing canonical component.** Every button, field, tab, card, row, badge, table, setting, text style and floating layer comes from the catalogue below (`components/ui` or `components/app`), reviewable at `/styleguide`.
2. **Never create a new implementation of something a canonical component already covers.** No hand-rolled or per-feature buttons, panels, tabs, inputs, popups or tables, and no raw `<button>`, `<input>`, `<select>`, `<textarea>` or `<table>` in feature code. The one documented exception is a native `<select>` that a Playwright spec drives with `selectOption` (use `NativeSelect`). A variant that is missing is added to the canonical component, not worked around in the feature.
3. **Add a new component only when no canonical component fits.** Then you must: justify it (state which components were considered and why none fits); design it consistently with D1/D2 (tokens, `rounded-control`/`rounded-container`/`rounded-pill`, type scale, `focus-ring`, hover/disabled states, glass for floating layers, no panel shadow); add it to this catalogue with its props; render every variant in `/styleguide`; and document it with a purpose comment.
4. The old "legacy classes work unchanged" guidance is gone: the legacy shared CSS is deleted (SPEC-005, DS-011) and ESLint and stylelint enforce these rules (see "Enforcement").

Always style with the D1 tokens (see Design tokens). Composition conventions: hierarchy is a hairline border or a tonal step, never a shadow; floating layers (Dialog, AlertDialog, Sheet, Popover, DropdownMenu, Select content, Toast) use the glass material plus `shadow-float` and put only `text-main`/`text-label` text on it; every interactive control shows the `focus-ring` outline on keyboard focus and `disabled:opacity-50`; on mobile (≤760px) inputs, selects, tabs, segmented controls and `md` icon buttons grow to 44px.

### Catalogue

Kit (`@/components/ui/<file>`):

| Component                                                                                                                                                                                                                   | Variants / sizes                                                                                                                                                                                                                                                                                              | Props (beyond the native element's)                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button` (`button`)                                                                                                                                                                                                         | `variant`: `primary` (default), `secondary` (hairline), `ghost`, `destructive`, `link`. `size`: `sm` 32px, `md` 36px (default), `lg` 44px, `xs`, and square `icon-xs`/`icon-sm`/`icon`/`icon-lg`. Backward-compatible aliases: variant `default` = `primary`, `outline` = `secondary`; size `default` = `md`. | `asChild?`. Also exports `buttonVariants`.                                                                                                                                                                                                                                      |
| `IconButton` (`icon-button`)                                                                                                                                                                                                | `variant`: `ghost` (default), `secondary`, `destructive` (danger-coloured ghost). `size`: `sm` 32px, `md` 36px (44px on mobile).                                                                                                                                                                              | `aria-label` (**required**, localised), `children` (the icon). Type is `button`.                                                                                                                                                                                                |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` (`card`)                                                                                                                    | One flat style: hairline border on `bg-panel`, `rounded-container`, no shadow.                                                                                                                                                                                                                                | `div` props. `CardAction` sits top right in the header; add `border-b`/`border-t` to the header/footer for a divider.                                                                                                                                                           |
| `Input`                                                                                                                                                                                                                     | 36px (44px mobile). `aria-invalid` shows the destructive border.                                                                                                                                                                                                                                              | `input` props.                                                                                                                                                                                                                                                                  |
| `Textarea`                                                                                                                                                                                                                  | Auto-growing, min 64px.                                                                                                                                                                                                                                                                                       | `textarea` props.                                                                                                                                                                                                                                                               |
| `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, … (`select`)                                                                                                                                                      | Trigger `size`: `default` 36px (44px mobile), `sm` 32px. Content is glass.                                                                                                                                                                                                                                    | Radix Select props. Trigger is `w-fit`; add `className="w-full"` for a full-width field.                                                                                                                                                                                        |
| `NativeSelect` (`native-select`)                                                                                                                                                                                            | Same look as `Input`, with a chevron. Only for spec-driven native selects.                                                                                                                                                                                                                                    | `select` props (`id`, `value`, `onChange`, `className` go to the `<select>`), `wrapperClassName?`.                                                                                                                                                                              |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` (`tabs`)                                                                                                                                                                   | Underline style for page navigation; horizontal (default) or `orientation="vertical"`. `TabsList variant` `underline` (default); `default`/`line` are accepted aliases.                                                                                                                                       | Radix Tabs props.                                                                                                                                                                                                                                                               |
| `Switch`                                                                                                                                                                                                                    | `size`: `default`, `sm`.                                                                                                                                                                                                                                                                                      | Radix Switch props (give it an `aria-label` or a `SettingRow` label).                                                                                                                                                                                                           |
| `Slider`                                                                                                                                                                                                                    | Single or range.                                                                                                                                                                                                                                                                                              | Radix Slider props; `aria-label`/`aria-labelledby` go to the thumbs.                                                                                                                                                                                                            |
| `Progress` (`progress`)                                                                                                                                                                                                     | Token-styled track and indicator, `role="progressbar"`. `size`: `md` (default, 8px), `sm` (6px, rows). `indeterminate` is a full pulsing bar for unknown progress.                                                                                                                                            | `value` (0 to 100), `indeterminate`, `aria-label`/`aria-labelledby`, `indicatorProps`.                                                                                                                                                                                          |
| `Checkbox`                                                                                                                                                                                                                  | –                                                                                                                                                                                                                                                                                                             | Radix Checkbox props.                                                                                                                                                                                                                                                           |
| `Badge` (`badge`)                                                                                                                                                                                                           | `variant`: `neutral` (default), `accent`, `destructive`, `outline`, and the word statuses `unknown`, `learning`, `known`. `default`/`secondary` are aliases of `neutral`. The only pill-shaped element.                                                                                                       | `asChild?`.                                                                                                                                                                                                                                                                     |
| `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `TableCaption`, `TableFooter` (`table`)                                                                                                          | Hairline row dividers, tonal row hover, normal-case caption-size headers. Wrap in a `Card` (`overflow-hidden py-0`) for a framed table.                                                                                                                                                                       | Native table element props, plus `container?: boolean` (default `true`: the table wraps itself in a horizontal scroll container). Pass `container={false}` when the caller owns the scroll container, e.g. for `position: sticky` headers, which a nested scroller would break. |
| `Text` (`text`)                                                                                                                                                                                                             | `variant`: `title` (h1), `heading` (h2), `body` (p, default), `caption` (span). `tone`: `main` (default), `label`, `muted` (not on glass). The classes `text-title`/`text-heading`/`text-body`/`text-caption` are the same styles for markup that is not a `Text`.                                            | `as?` (element), `tone?`.                                                                                                                                                                                                                                                       |
| `Dialog` (+ `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`), `AlertDialog` (+ parts), `Sheet` (`side`: `right` default, `left`, `top`, `bottom`), `Popover`, `DropdownMenu`, `Tooltip` | Glass + `shadow-float`. Menu items are `rounded-control`; `DropdownMenuItem variant="destructive"`. `AlertDialogAction` defaults to `primary`, `AlertDialogCancel` to `secondary`.                                                                                                                            | Radix props. `showCloseButton` on `DialogContent`/`SheetContent`. For confirmations prefer `useConfirm()`.                                                                                                                                                                      |
| `FloatingPanel` (`floating-panel`)                                                                                                                                                                                          | Non-modal anchored `aside` with glass and `shadow-float`, the look of `PopoverContent`; fades and scales in and out (Motion tokens). No focus trap or outside-click handling: the consumer owns dismissal and placement. Used by the reader desktop popups.                                                   | `open`, `position?: { left; top }` (viewport px, `fixed`), `transformOrigin?`, `onExitComplete?` (add `hidden` after it to drop the panel from layout); ref and DOM props pass through.                                                                                         |
| `Toaster` (`sonner`)                                                                                                                                                                                                        | Glass + `shadow-float`. Trigger toasts with `toast` from `@/components/app/toast`.                                                                                                                                                                                                                            | –                                                                                                                                                                                                                                                                               |

App (`@/components/app/<file>`):

| Component                                                      | Props                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ListRow` (`ListRow`)                                          | `{ leading?; title; meta?; trailing?; actions?; below?; selected?; className?; …div props }`. Hairline-divided row (last row has none), tonal hover, `selected` = selected overlay with accent text, min 44px. `title` and `meta` truncate; `leading` is an icon/flag/checkbox, `trailing` a value or `Badge`, `actions` icon buttons or a menu, `below` content under the row (e.g. an inline form) inside the same divided item. Put rows in a `Card` (`gap-0 overflow-hidden py-0`) or a plain list. |
| `Segmented<T>` (`Segmented`)                                   | `{ value; onValueChange(v); options: { value; label; itemProps? }[]; "aria-label"; size?: "sm" \| "md"; className? }`. Single-select value picking; see Settings primitives.                                                                                                                                                                                                                                                                                                                            |
| `SettingSection`, `SettingRow`, `SettingSelect` (`SettingRow`) | See Settings primitives.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `PageHeader` (`PageHeader`)                                    | `{ title; actions?; className?; …header props }`. The screen title as the page `h2` (the legacy level the specs assert) in the `Text` title style, `mb-4`, min 36px high, with optional actions (e.g. a `Segmented`) right. Every main screen (Dashboard, Vocab, Library, Settings, Admin) starts with it.                                                                                                                                                                                              |
| `CloseButton` (`CloseButton`)                                  | `{ label; …IconButton props }`: an `IconButton` (`sm`) with a × icon.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `ConfirmDialog` / `useConfirm()`                               | See I6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Test hooks, ids and `data-*` attributes pass through every component to the underlying element.

## I1 Routes

`src/app/routes.tsx` (RX-002 only). Each page is the **default export** of
`src/features/<name>/<Name>Page.tsx`, lazily loaded via `src/app/pages.ts`.
Replace the page's contents, but keep the file path and the default export.

| Path                  | Tab (`route-paths.ts`) | Page                                       | Gate                                                            |
| --------------------- | ---------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| `/`                   | –                      | `features/auth/WelcomePage.tsx`            | signed in with a language → redirect to the saved tab           |
| `/dashboard`          | `dashboard`            | `features/dashboard/DashboardPage.tsx`     | auth + language                                                 |
| `/vocab`              | `collections`          | `features/collections/CollectionsPage.tsx` | auth + language                                                 |
| `/library`            | `reader` (Read)        | `features/library/LibraryPage.tsx`         | auth + language                                                 |
| `/reader`             | `reader` (Read)        | `features/reader/ReaderRedirect.tsx`       | auth + language; redirects (C2)                                 |
| `/reader/:materialId` | `reader` (Read)        | `features/reader/ReaderPage.tsx`           | auth + language                                                 |
| `/practice`           | `practice`             | `features/practice/PracticePage.tsx`       | auth + language                                                 |
| `/settings`           | `settings`             | `features/settings/SettingsPage.tsx`       | auth                                                            |
| `/admin`              | `admin`                | `features/admin/AdminPage.tsx`             | auth + `isAdminUser`                                            |
| anything else         | –                      | as `/`                                     |                                                                 |
| (no path)             | –                      | `features/auth/AuthPage.tsx`               | rendered instead of the shell while `session.authScreen` is set |

`materials` has no page: it exports components only (I8). The Library and Reader routes, their address and the data hooks are specified in C1–C4 below; `readerPath(id)`, `libraryPath({category,q,focus})`, `parseLibraryAddress(params)` and `isReaderPath(pathname)` live in `@/app/route-paths`.

Gating (`RouteGate`), as in legacy `router.js`:

- Signed out: `WelcomePage` renders in place and the URL is kept, so the deep link opens after login.
- A language-required tab without a study language: the welcome language gate, and the URL is replaced with `/`.
- A non-admin on `/admin`: replaced with `/dashboard`.
- On success the tab is saved as `wordMarkerActiveTab`. `/` and unknown paths go to the saved tab (default `dashboard`; a saved `admin` is not restored).
- Navigate with `useNavigate()` and `pathForTab(tab)` / `TAB_PATHS` from `@/app/route-paths`. Deep links, reload and back/forward are handled by React Router.

The shell renders your page inside `<main id="appShell">` below the fixed menu
bar, and toggles `body.is-reader-active` / `body.is-reader-focus` (the Reader is
focus-only) on `/reader` and `/reader/*` (`isReaderPath`). Keep the legacy view ids on
your page root (`#dashboardView`, `#collectionsView`, `#readerView`,
`#practiceView`, `#settingsView`, `#adminView`).

## I2 UI kit

`src/components/ui/*` (shadcn "new-york" on Radix via the `radix-ui` package,
Vaul drawers, sonner). The kit is read-only for features. If a shadcn component
is missing, add it as a new file only (`npx shadcn@latest add <name>` from
`frontend/`; the CLI writes to `@/…`). Never edit existing files.

Installed: `alert-dialog badge button card checkbox dialog drawer dropdown-menu field floating-panel icon-button input label native-select popover progress radio-group scroll-area select separator sheet skeleton slider sonner switch table tabs text textarea toggle toggle-group tooltip`. `icon-button`, `native-select`, `progress`, `floating-panel` and `text` are SPEC-005 additions; the catalogue above lists every variant.
The form helpers are `field.tsx` (`Field`, `FieldLabel`, `FieldDescription`,
`FieldError`, `FieldGroup`, …). No react-hook-form.

Theme: `styles/shadcn.css` maps the shadcn variables onto the `theme.css` tokens (see Design tokens: `--primary` = `--accent`, the kit's `bg-accent` = `--hover-overlay`, `--input` = `--border-strong`, `--radius` = `--radius-control`), so everything follows `html[data-theme]`. The Tailwind `dark:` variant targets `[data-theme="dark"]`. shadcn's `secondary` colour is **not** mapped: `text-secondary` keeps its app meaning (muted text). `cn()` (`@/lib/utils`) is a tailwind-merge that knows `text-title|heading|body|caption`, `rounded-control|container|pill` and `shadow-float`, so a `className` override replaces the matching default.

Mobile bottom sheets: the reader's word-info and translation sheets use the kit
`Sheet` (`side="bottom"`, `modal={false}`; `features/reader/ReaderSheet.tsx`),
not the Vaul `Drawer`. Vaul can't be non-modal, and these sheets must allow
continued text selection behind them. No feature uses the Vaul `Drawer`; it stays
installed and available for modal bottom sheets.

## I3 API client

`import { api, queryKeys, ApiError, … } from "@/lib/api"`. Every endpoint is a typed function; the types are in `src/lib/api/types.ts` (re-exported).

Behaviour (`client.ts`, ported from `api.js`):

- Same-origin `/api/*` with `credentials: "include"`. JSON bodies get `content-type: application/json`; `FormData` is sent as-is.
- POST/PATCH/DELETE send `x-csrf-token`, fetched lazily from `GET /api/auth/me`. The token is rotated from any response body with `csrfToken` (`getCsrfToken`/`setCsrfToken`/`csrfHeaders` are available). A 403 `errors.csrfInvalid` (expired or stale token) refetches the token and retries the request once.
- Non-2xx responses throw `ApiError { status, errorKey?, details?, payload }` whose `message` is already localised (`errorKey`+`details` → `error` → `errors.requestFailed`). Show caught errors with `errorMessage(error, fallback?)`: the ApiError message, else `fallback` (default `errors.requestFailed`), never a raw browser message.
- HTTP 401 → `session.handleUnauthorized()` (user dropped, query cache cleared, welcome shown in place), except calls made with `handleUnauthorized: false` (login, register, verify-email, request/reset password).
- Low level: `request<T>(path, { method, body, query, headers, signal, handleUnauthorized })`. `query` skips `null`/`undefined`/`""`.

| Module            | Function → endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.auth`        | `me()` GET /api/auth/me · `login({email,password})` · `register({email,password,confirmPassword})` · `logout()` · `resendVerification()` · `verifyEmail(token)` · `requestPasswordReset(email)` · `resetPassword({token,password,confirmPassword})` · `googleStartUrl()` (navigate the window to it)                                                                                                                                                                                |
| `api.categories`  | `list(languageId)` GET /api/categories · `create({languageId,name})` POST · `rename(id,name)` PATCH · `reorder({languageId,ids})` PUT /api/categories/order · `remove(id)` DELETE                                                                                                                                                                                                                                                                                                   |
| `api.languages`   | `list()` GET /api/languages · `add(name)` POST /api/languages                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `api.dashboard`   | `get({languageId})` GET /api/dashboard · `documents({languageId,search,limit,offset})` GET /api/dashboard/documents                                                                                                                                                                                                                                                                                                                                                                 |
| `api.materials`   | `list({languageId,offset,search,category})` GET /api/materials · `upload({languageId,file})` POST multipart · `reader(id,{start,limit})` GET /api/materials/:id · `update(id,{title?,readerStart?,categoryId?})` PATCH · `markOpened(id)` POST /api/materials/:id/opened · `remove(id)` DELETE                                                                                                                                                                                      |
| `api.words`       | `listByLanguage(languageId,{search})` GET /api/languages/:id/words · `listByCollection(collectionId,{search})` GET /api/collections/:id/words · `setStatus(id,status)` PATCH /api/words/:id · `setStatuses(ids,status)` POST /api/words/status · `move(ids,collectionId)` POST /api/words/move · `remove(ids)` POST /api/words/delete · `click(id)` POST /api/words/:id/click · `setWantToPractice(id,bool)` POST /api/words/:id/want-to-practice · `setTranslationOverride(id,text | null)` PATCH /api/words/:id/translation-override               |
| `api.collections` | `updateLanguage(id,languageId)` PATCH /api/collections/:id · `remove(id)` DELETE                                                                                                                                                                                                                                                                                                                                                                                                    |
| `api.imports`     | `importWords({languageId,collectionId?                                                                                                                                                                                                                                                                                                                                                                                                                                              | collectionName?,words:[{word,translation}]})` POST /api/import |
| `api.practice`    | `session({languageId,mode?:"marked"})` GET /api/practice/session                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `api.settings`    | `update({nativeLanguage?,practiceWordsPerSession?,activeStudyLanguage?})` PATCH /api/settings · `changePassword({currentPassword,newPassword,confirmPassword})` · `deleteAccount(confirmation)`                                                                                                                                                                                                                                                                                     |
| `api.admin`       | `listUsers({sort,search,createdAfter,cursorValue,cursorId})` · `setUserLimits(id,{maxMaterials,maxUploadBytes})` · `wordLanguages()` · `listWords({languageId,native,search,cursor,limit})` · `setCanonicalTranslation(id,{native?,translation})` · `grantAdmin(email)` · `revokeAdmin(email)` · `auditLog(page)`                                                                                                                                                                   |

Notes: `PATCH /api/settings` returns the user **without** `isAdmin`/`isSuperadmin`,
so merge it: `setUser({ ...user, ...result.user })`. Integer flags such as
`wantToPractice` are numbers (0/1).

TanStack Query: write your own hooks in your feature folder with these
functions and the keys from `queryKeys` (`dashboard`, `languages`, `materials`,
`words`, `practice`, `admin`; each has an `all` prefix). Include the study
language id wherever the data depends on it. Shared definitions in
`@/lib/api/queries`:

- `dashboardSummaryQuery(languageId)`: GET /api/dashboard (`queryKeys.dashboard.summary`), shared by the shell's `#knownTotal`, the dashboard and vocab. Use it rather than a second fetcher on the same key.
- `refreshStudyData(queryClient)`: the counterpart of the legacy `loadDashboard()`. It invalidates `dashboard`, `words` and `materials`; call it after mutations that change vocabulary or documents. `materials.reader` keys sit under `materials.all`, so renames and deletions refresh the reader too.
- The client (`@/lib/query-client`) does not retry and does not refetch on focus.

## I4 Stores (`src/stores/`, Zustand)

Server data belongs in TanStack Query, not in stores. Outside React, use `useXStore.getState()`.

**`useSessionStore`** (`@/stores/session`)

- `status: "loading"|"ready"`, `user: User|null`, `authProviders`, `nativeLanguageOptions: string[]`
- `authScreen: { panel: "login"|"forgot"|"reset"; mode: "login"|"register"; status: string; resetToken: string|null } | null`: while it is set, `AuthPage` replaces the shell.
- `verifyNotice: string`: status text for the verification banner.
- `loadSession(): Promise<User|null>`: GET /api/auth/me. Fills this store and the study-language catalogue, restores the language selection, and closes the auth screen when signed in.
- `setUser(user)`, `markReady()`, `logout()` (POST logout → `clearSession`; on failure → `verifyNotice`), `clearSession({ forgetStudyLanguage? })` (account deletion passes `true`), `handleUnauthorized()`, `openAuthScreen(partial?)` (defaults: login panel, login mode, no status), `closeAuthScreen()`, `setVerifyNotice(text)`
- Helpers: `isAdminUser(user)`, `isSuperadminUser(user)`.
- `registerSessionReset(reset)`: feature state kept outside the query cache (module singletons, feature stores) registers a reset at module load; `clearSession` and `handleUnauthorized` run every registered reset, so nothing carries over to the next user.
- Bootstrap (`app/bootstrap.ts`, RX-002) consumes `?reset_token` (→ `openAuthScreen({panel:"reset", resetToken})`, no session load), `?verify_token` (→ `verifyNotice` when signed in, else a login screen with that `status`) and `?oauth_error` (→ a login screen with the localised error), then strips them from the URL.

**`useStudyLanguageStore`** (`@/stores/study-language`)

- `languages: Language[]` (enrolled), `studyLanguageOptions: string[]`, `nativeLanguage: string|null`, `selectedId: number|null`, `selectedName: string` (persisted as `wordMarkerStudyLanguageName`)
- `setCatalog(partial)`, `selectLanguage(name|null, { persist = true }): boolean`, `restoreSelection()`, `switchLanguage(name)`, `addLanguage(name): Promise<void>` (rejects with `ApiError`), `reset({ forget? })`
- `switchLanguage`/`addLanguage` do a **full reload onto `/dashboard`** (legacy behaviour), so features never need to reset state for those. A study-language change in another tab updates `selectedId` without a reload: key your queries and feature state on `selectedId`.
- Hook: `useAvailableStudyLanguages()`. Pure rules in `@/lib/study-language` (`availableStudyLanguages`, `studyLanguageMenuOptions`, `addableStudyLanguages`, `firstAvailableStudyLanguageAlphabetically`, `languageByName`, `studyLanguageLabelKey`, `unavailableStudyLanguageReasonKey`). Settings, after a native-language change: `setUser(merged)`, then select `firstAvailableStudyLanguageAlphabetically(...)` when the current one became unavailable.

**`useReaderPreferencesStore`** (`@/stores/reader-preferences`): same keys, parsing and defaults as `state.js`; writes use `String(value)`.

| Field                         | Key                                     | Default                           |
| ----------------------------- | --------------------------------------- | --------------------------------- |
| `wordsPerPage: "fit"\|number` | wordMarkerReaderWordsPerPage            | 250                               |
| `fontSize`                    | wordMarkerReaderFontSize                | 22                                |
| `focusPanelWidth`             | wordMarkerReaderFocusPanelWidth         | 0 (automatic: half the viewport)  |
| `autoMarkKnownOnPageTurn`     | wordMarkerReaderAutoMarkKnownOnPageTurn | false                             |
| `autoMarkLearningOnClick`     | wordMarkerReaderAutoMarkLearningOnClick | true (only `"false"` disables it) |
| `showWordSpaces`              | wordMarkerReaderShowWordSpaces          | false                             |
| `highlightOpacity`            | wordMarkerReaderHighlightOpacity        | 0.2                               |

The reader is never moved or resized by pointer: the text width is set only from the reader settings ("Text width"), which writes `focusPanelWidth` (mobile is always full width). The old sidebar, focus-mode, normal-mode width, info and panel-height keys are no longer read; their stored values are left in place.

Actions: `setPreference(key, value)`, `setPreferences(partial)`. Also exported: `READER_PREFERENCE_KEYS`, `readReaderPreferences()`.

**`useThemeStore`** (`@/stores/theme`): `preference: "system"|"light"|"dark"` (`wordMarkerTheme`, invalid → system), `resolved: "light"|"dark"`, `setTheme(p)`. Writes `html[data-theme]` and `html[data-theme-preference]` and follows the OS setting while on "system". `static/theme-init.js` applies it before first paint.

**`useLocaleStore`** (`@/stores/locale`): `locale: "en"|"zh"|"ja"` (`wordMarkerLocale`, invalid → en), `setLocale(l)`. `<html lang>` and the title follow it.

**`useUiPreferencesStore`** (`@/stores/ui-preferences`): `wordDisplayMode: "page"|"infinite"` (`wordMarkerDisplayMode`, default infinite), `setWordDisplayMode(m)`. Shared by vocab and settings.

Feature-local persisted keys (`wordMarkerDashboardStatsTab`,
`wordMarkerCollectionsSidebarCollapsed`, `wordMarkerSelectedMaterialId:<userId>:<languageId>`, …):
use `usePersistentState(key, parse, serialize?)` from
`@/lib/hooks/use-persistent-state`, or `readStorage`/`writeStorage`/`removeStorage`
from `@/lib/storage`, with the legacy key, parsing and default.

## I5 i18n (`@/lib/i18n`)

- `const t = useT(); t(key, values?, fallback?)`: `{name}` interpolation (every occurrence); a missing or empty key falls back to `ja`, then `fallback`, then the key. Components re-render on locale change.
- Outside React: `t(...)` (current locale). Also `useFormatCount()` / `formatCount(n)`, and `translate(catalog, locale, key, …)` (pure).
- Catalogue: `frontend/public/locales.json` (bundled at build time; keys unchanged).
- Generic keys added by RX-002: `common.confirm cancel delete remove save saved edit rename clear close open back search done ok yes no loading retry error`, and `shell.mainViews`.
- Rules: use existing keys or `common.*`. A genuinely new key goes under your feature's prefix and into all three locales. Never edit or remove existing keys. To keep merges clean, add your block next to the existing keys with the same prefix, not at the end of each locale.
- A unit test asserts that ja, en and zh have identical key sets.

## I6 Shared app components (`src/components/app/`, consume, don't fork)

| Component                                                    | Props / API                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AppShell`                                                   | `{ children }`. Menu bar (`#brandHomeButton`, `nav.tabs [role="tab"][data-tab]` with `is-active` (hook-only class), `#adminTabButton`, `#knownTotal`, study languages, `#localeSelect`, desktop `#settingsButton` + `#logoutButton`, mobile hamburger `#settingsButton` → `#accountDropdown` with tab items, `#adminTabMenuButton`, `#accountSettingsButton`, `#logoutButton`), `<VerifyBanner/>`, then the page. Guest mode is `.menu-bar.is-guest`. Used by `RootLayout` only.           |
| `StudyLanguageSelect`                                        | `{ className? }`. Flag `Segmented` (`#studyLanguageButtons [data-language-name]`, selected = `aria-checked`) + the "+" `IconButton` menu (`#studyLanguageAddButton`, `#studyLanguageDropdown`). Self-contained over the store.                                                                                                                                                                                                                                                             |
| `LocaleSelect`                                               | no props (`NativeSelect` with `id="localeSelect"`, values en/zh/ja; specs use `selectOption`)                                                                                                                                                                                                                                                                                                                                                                                              |
| `Flag`                                                       | `{ language: string }` inline SVG flag                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `Sidebar`                                                    | `{ collapsed; onCollapsedChange(c); toggleLabel; toggleId?; headClassName?; className?; children; …aside props }`. `.app-sidebar` with the minimise `IconButton` (`aria-expanded`).                                                                                                                                                                                                                                                                                                        |
| `SidebarLayout`                                              | `{ collapsed; className?; …section props }`. `.app-sidebar-layout` + `is-sidebar-collapsed`.                                                                                                                                                                                                                                                                                                                                                                                               |
| `SidebarOpenButton`                                          | `{ collapsed; onOpen(); label; className? (top offset); …button props }`. Fixed left-edge re-open `IconButton`, hidden unless collapsed.                                                                                                                                                                                                                                                                                                                                                   |
| `CloseButton`                                                | `{ label; …IconButton props (onClick, data-* hooks, className) }`. `IconButton` (`sm`) with a × icon, `data-slot="close-button"`.                                                                                                                                                                                                                                                                                                                                                          |
| `ConfirmDialog`                                              | `{ open; onOpenChange; onConfirm; title; description?; confirmLabel?; cancelLabel?; destructive? }` (controlled)                                                                                                                                                                                                                                                                                                                                                                           |
| `useConfirm()`                                               | `const confirm = useConfirm(); if (await confirm({ title, description?, confirmLabel?, cancelLabel?, destructive? })) …`. Replaces `window.confirm`.                                                                                                                                                                                                                                                                                                                                       |
| `toast` / `toastError` (`toast.ts`)                          | `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`, `toastError(error)` (text from `errorMessage`). Replaces `window.alert`. The `<Toaster/>` is already mounted.                                                                                                                                                                                                                                                                                                                 |
| `TranslationOverride`                                        | `{ entry: TranslationEntry; wordId; context: "vocab"\|"reader"; compact?; editing; onEdit(); onCancel(); onSave(value: string); onClear() }`. Controlled edit state; save/clear may return a Promise (buttons disable meanwhile). Send `onSave`'s raw value, or `null` for clear, to `api.words.setTranslationOverride`. Built on `Input`, `Button`, `IconButton` and `Text`. Keeps the `data-translation-override-*` (incl. `-text` on the displayed translation) / `data-word-id` hooks. |
| `DisambiguationTable`                                        | `{ entry; className?; stickyHeader? }`. Candidate table on the canonical `Table` (original translation row tinted, `data-original-translation`) or nothing. `stickyHeader` pins the header row and renders the `Table` without its scroll container (`container={false}`) so the caller's own vertically scrolling wrapper (the reader panel's `overflow-y-auto` box) keeps the sticky header working. The caller supplies the wrapper: the reader panel box or a vocab table row.         |
| `DisambiguationToggle`                                       | `{ expanded; onToggle(); className?; …button props (e.g. data-word-disambiguate) }`. `Button` (`secondary`, `sm`) with a chevron.                                                                                                                                                                                                                                                                                                                                                          |
| helpers (from `Disambiguation.tsx` / `@/lib/disambiguation`) | `hasDisambiguation(entry)`, `disambiguationEntries(entry)`, `originalTranslationCandidate(entry)`, `hasTranslationOverride(entry)`; `TranslationEntry` accepts reader tokens and vocab words                                                                                                                                                                                                                                                                                               |

### Settings primitives (`components/app/SettingRow.tsx`, `Segmented.tsx`)

Build every settings surface from these, not ad-hoc cards or raw controls.

- `SettingSection`: `{ title; variant?: "card" | "inset"; className?; …section props; children }`. Caption-style heading over one hairline container (`rounded-container`); children (rows) get a `Separator` between them. `variant="inset"` drops the border and fill: use it inside a floating panel or card (e.g. the reader Aa panel) so surfaces are never nested.
- `SettingRow`: `{ label; description?; htmlFor?; labelId?; stacked?; className?; …div props; children }`. Kit `Field` (horizontal): label + one-line description left, control (`children`) right, min 44px. `htmlFor` is the control's id. `stacked` is for wide controls (Select, Slider): 224px wide on desktop, label above and the control full width on mobile. Other rows stay horizontal on mobile.
- `SettingSelect`: the kit `SelectTrigger`, full width and 44px high; use inside `Select` (`<Select><SettingSelect id=… aria-labelledby=…><SelectValue/></SettingSelect><SelectContent>…`).
- `Segmented<T>`: `{ value: T; onValueChange(v: T); options: { value: T; label; itemProps? }[]; "aria-label"; size?: "sm" | "md"; className? }`. Single-select kit `ToggleGroup`, never empty, full width with equal items (`md` 36px, 44px on mobile; `sm` 32px); the selected item is exposed through Radix's `aria-checked` (no `aria-pressed`). `itemProps` carries per-item attributes such as `data-theme-option` / `data-display-mode`.

Shared CSS (`styles/components.css`) holds only the `Sidebar` shell (`.app-sidebar`, `.app-sidebar-head`, `.app-sidebar-layout`): there are no shared component classes. Use Tailwind `sr-only` for visually hidden text.

## I7 Test hooks

Preserve every id, `data-*` attribute and ARIA label that `tests/auth.setup.ts`
and `tests/smoke/*.spec.ts` use in your area (`grep` them). Shell-owned hooks
(done): `#appShell` (not rendered while the auth screen is open, and only
rendered together with its page, so the welcome gate appears in the same
commit), `#authView`, `#welcomeLoginButton`, `#authEmail`, `#authPassword`,
`#authSubmit`, `[data-welcome-study-language]`, `#localeSelect` (a native select: keep any control the specs drive with `selectOption` native),
`nav.tabs [role="tab"]` / `nav.tabs [data-tab=…]` with `is-active`, and the admin tab's
`hidden` state. Test edits are allowed only for implementation internals
(module paths, direct module imports, internal globals). They must assert the same behaviour, and each one is listed in your report.

## I8 Cross-feature exports

A component rendered by another feature is exported from its owner's
`src/features/<name>/index.ts`. Consumers import only from that index. RX-002
ships typed stubs; the owner implements them behind the same names and props.
Every other feature's `index.ts` is `export {}`.

| Export                 | Owner → consumer         | Props                                                                                                                                                                                                      | Stub           |
| ---------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `VerifyBanner`         | auth (RX-003) → AppShell | none. Reads `session.user.emailVerified` and `session.verifyNotice`; renders `#verifyBanner`, `#verifyResendButton`, `#verifyBannerStatus` (`api.auth.resendVerification`, outcome via `setVerifyNotice`). | renders `null` |
| `MaterialImportDialog` | materials (RX-006) → any | `{ open: boolean; onOpenChange(open: boolean): void; onImportStarted?(material: MaterialDetail): void }`. `#materialImportModal`.                                                                          | renders `null` |

Division of state: the route (`/reader/:materialId`) owns the open material id; the reader owns its per-language
cache key `wordMarkerSelectedMaterialId:<userId>:<languageId>` (a legacy `…:<languageId>` entry moves to the first user who reads it), and loading the material
(`api.materials.reader`). Materials owns the import dialog, row state helpers and the rename/delete hooks; the Library owns the list and search.
The auth feature owns `WelcomePage`/`AuthPage` (built by RX-002 for the
first-run path; forgot/reset panels are minimal placeholders) and all auth
screens after RX-002.

## Motion (`motion` package, `@/lib/motion`)

- `app/providers.tsx` wraps the app once in `<LazyMotion features={domAnimation} strict>` and `<MotionConfig reducedMotion="user">`. Animate with the `m` component from `motion/react`, never `motion` (`strict` throws on it). `domAnimation` has no `layout`/drag support: use enter/exit with `AnimatePresence`, not layout animation.
- Calm and short: fades and 4px shifts, `MOTION_DURATION` 150 ms (exits, small items) and 200 ms (entries), ease-out (`MOTION_EASE`), 30 ms stagger. Take tokens from `@/lib/motion`; `FadeIn` (`components/app`) is the shared mount fade. No bounce or flashy effects. The progress-ring fill (500 ms) is the one longer exception. The sidebar column slide (`useAnimatedSidebar`) is the other: `MOTION_DURATION.slide` 260 ms with the softer `MOTION_EASE_SLIDE`, the sidebar's opacity driven by the same tween (never a CSS transition on the sidebar's opacity or transform on desktop).
- Reduced motion: `MotionConfig` makes Motion skip transform and layout animation for OS `prefers-reduced-motion`; opacity still animates. Motion does not cover CSS-variable animation (progress ring: skipped via `useReducedMotion()`) or 3D flips (the flashcard switches to a face crossfade through `.is-crossfade`).
- Never animate dialogs, popovers, sheets or toasts: the kit's `tw-animate-css` classes and Sonner already do. The reader's desktop popups are plain `aside`s, so they animate with `m.aside`.
- Exits must stay inert and test-safe: an exiting element sets `pointerEvents: "none"` (`aria-hidden` for popups) and is gone within 150 ms. Where an exit would leave a second `[data-*]` hook in the DOM (flashcards) or collide with native handlers (`m.*` swallows `onDragStart`/`onDragEnd`, so the draggable vocab rows stay plain `tr`s), use enter-only or no motion.
- Never put a transform on a wrapper of `position: fixed` content (it becomes the containing block): the routed-page fade in `AppShell` is opacity-only (`<FadeIn rise={false}>`) for that reason.

## SPEC-004 contracts (Library and Reader, C1–C4)

```text
C1 API (LIB-001 produces; LIB-002 wraps it in the typed client). All
endpoints require auth plus CSRF on mutations, and enforce ownership (404
for another user's resources).
- GET /api/categories?languageId=N
    -> 200 { categories: [{ id, name, position, materialCount }],
            totalCount, uncategorisedCount }
       categories are ordered by position.
- POST /api/categories { languageId, name }
    -> 201 { category }; 409 errorKey "errors.categoryNameTaken" for a
       case-insensitive duplicate; 400 for an empty or too-long name
       (max 60 chars, trimmed).
- PATCH /api/categories/:id { name } -> 200 { category }; 409 or 400 as
  above.
- PUT /api/categories/order { languageId, ids: number[] }
    -> 200 { categories }; ids must be exactly the user's categories for
       that language.
- DELETE /api/categories/:id -> 200 { ok: true }; its works become
  uncategorised, and works are never deleted.
- PATCH /api/materials/:id accepts { categoryId: number | null } (in
  addition to the existing fields). The category must belong to the same
  user and language (400 otherwise); null means uncategorised.
- POST /api/materials/:id/opened -> 200 { lastOpenedAt }: records that the
  work was opened in the Reader.
- GET /api/materials?languageId=N&offset=&search=&category=all|uncategorised|<id>
    keeps the existing params and response shape ({ materials, pageSize })
    and adds category filtering. Each material item gains categoryId
    (number|null), lastOpenedAt (ISO|null), readTokens and totalTokens
    (reading progress, as the dashboard documents use), on top of the
    existing id, title, fileType, wordCount, readerStart, createdAt and
    import status fields. Default sort: lastOpenedAt DESC NULLS LAST, then
    createdAt DESC, then id DESC. search matches the title
    case-insensitively.

C2 Routes and Library address (LIB-002 produces; LIB-003/004/005/006 use).
- /library — the Library. Search params:
  - category = all | uncategorised | <categoryId> (default all);
  - q = search text;
  - focus = <materialId>: the dashboard "go to" target. The Library selects
    category=all, clears q, scrolls the work into view, outlines it with a
    transition, then removes focus from the address (replace) so a reload
    doesn't repeat it.
- /reader/:materialId — the Reader for that work.
- /reader — redirects to the last-opened work for the study language
  (lastOpenedAt from C1, falling back to the existing
  wordMarkerSelectedMaterialId:<userId>:<languageId> key), or to /library
  if there is none.
- The main navigation has ONE tab, labelled "Read" (new key nav.read in
  ja/en/zh), active on both /library and /reader/*, linking to /library.
  It replaces the old reader tab; keep `nav.tabs [data-tab="reader"]` as
  the tab's hook, so the existing specs still find it.
- Language-gated like the old reader route.

C3 Data hooks (LIB-002 produces in frontend/src/features/library/data/;
LIB-003/004 use).
- useLibraryMaterials({ category, search }): an infinite query over C1's
  list (pages of 50), polling while any work is importing or translating,
  as the Library did before.
- useCategories(): returns { categories, totalCount, uncategorisedCount }.
- useCategoryMutations(): returns { create(name), rename(id, name),
  reorder(ids), remove(id) }. Each invalidates categories and library
  materials.
- useAssignCategory(): returns assign(materialId, categoryId | null), with
  an optimistic update of the list and counts and rollback on error.
- Query keys go under queryKeys.library.* and queryKeys.categories.* in
  lib/api/query-keys.ts.

C4 Library and category-sidebar connection (LIB-002 creates the stubs;
LIB-003 owns LibraryPage, LIB-004 owns the sidebar).
- LibraryPage renders
  <CategorySidebar selected={category} onSelect={(c) => …} /> from
  frontend/src/features/library/categories/CategorySidebar.tsx, where
  category is "all" | "uncategorised" | number.
- Drag source (LIB-003): each work row is draggable and sets
  dataTransfer "application/x-word-marker-material" = String(materialId).
  Drop targets (LIB-004) read that type, call
  useAssignCategory().assign(id, categoryId | null) (Uncategorised = null;
  All isn't a drop target), and show a drop indicator.
- Keyboard and touch alternative (LIB-003): each row's ⋯ menu has
  "Move to category ▸", listing Uncategorised plus the user categories
  from useCategories() and calling assign.
- Ids: the sidebar root is #libraryCategories; each category item has
  data-category="all" | "uncategorised" | "<id>".
- Collapse (LIB-004): CategorySidebar takes optional `expanded` and
  `onExpandedChange(expanded)`. With `expanded` set it is controlled: collapsed,
  it renders nothing on desktop (the page shows the re-open button) and keeps
  its header toggle on mobile. Without it, it persists its own state.
  `useCategoriesExpanded()` (categories/CategorySidebar.tsx) returns
  [expanded, setExpanded] persisted under wordMarkerLibraryCategoriesExpanded
  (default expanded), for the page to own.
```

Implementation notes (LIB-002):

- Client: `api.categories.*`, `api.materials.list({languageId,offset,search,category})` (`category` is `"all" | "uncategorised" | number`, type `LibraryCategory`), `api.materials.update(id,{categoryId})` and `api.materials.markOpened(id)`. `request` accepts `method: "PUT"`.
- Keys: `queryKeys.library.{all,materialsAll,materials(languageId,category,search),lastOpened(languageId)}` and `queryKeys.categories.{all,list(languageId)}`. `refreshStudyData` also invalidates both domains.
- Hooks (`@/features/library/data`): `useLibraryMaterials({category,search})` returns the infinite query plus `materials`; `useCategories()` returns the query plus `{categories,totalCount,uncategorisedCount}`; `useCategoryMutations()` returns promise-returning `{create,rename,reorder,remove}`; `useAssignCategory()` returns `{assign}`.
- `useReaderMaterial(languageId, wordsPerPage, materialId, onLoadFailed?)` takes the work from the route; `select` is gone.

## Enforcement (SPEC-005, DS-011)

`npm run lint -w frontend` (run by CI) runs ESLint, stylelint and Prettier.

- **ESLint** (`eslint.config.js`, `no-restricted-syntax`):
  - `src/features/**` and `src/components/app/**`: raw `<button>`, `<input>`, `<select>`, `<textarea>` and `<table>`, in JSX and in HTML strings; member-expression motion elements (`<m.button>`, `<motion.input>`, ...) unless a parent element carries `asChild` (a canonical component wraps them).
  - `src/features/**`, `src/components/app/**` and `src/components/ui/**`: `shadow-panel`; arbitrary colour values (`text-[#...]`, `bg-[rgb(...)]`, any colour utility `-[...]` containing `#`, `rgb(`, `hsl(` or `oklch(`); Tailwind palette colours (`text-red-500`, `bg-white`, `bg-black`, `text-slate-*`; use the token utilities and `text-contrast`/`bg-contrast`); every `shadow-*` except `shadow-float` and `shadow-none`; off-scale text sizes (`text-xs` through `text-9xl`, `text-[...px/rem/pt]`; on the scale: `text-title`, `text-heading`, `text-body`, `text-caption`); font weights outside 400 to 600 (`font-thin`, `font-extralight`, `font-light`, `font-bold`, `font-extrabold`, `font-black`, `font-[...]`); radii off the scale (bare `rounded`, `rounded-xs` through `rounded-3xl`, `rounded-full`, and arbitrary `rounded-[...]` except `rounded-[inherit]`). On the scale: `rounded-control-sm`, `rounded-control`, `rounded-container`, `rounded-pill`, `rounded-none`.
  - `src/features/**` and `src/components/app/**`: in JSX `style={{}}`, the keys `color`, `background`, `backgroundColor`, `borderColor`, `borderRadius`, `fontWeight`, `fontSize` and `boxShadow`, unless the value is a CSS `var()`.
- **stylelint** (`stylelint.config.js`, `src/features/**/*.css`): hex, named and functional colours (`rgb`, `hsl`, `oklch`, `color()`, ...), `border-radius` (and the corner longhands), `box-shadow`, `filter: drop-shadow()`, `font-weight`, `font-size`, `backdrop-filter`. `styles/` is not linted; it defines the tokens and the glass.

## Documented exceptions (the lint allow-list)

These are the only places the canonical rules (no raw `<button>`, no off-scale type, no hard-coded colours) are deliberately not followed. The lint rules allow exactly these (nothing is blanket-disabled); anything else is a violation.

- **Google brand mark**: the inline SVG `GoogleMark` in `features/auth/AuthPage.tsx` (`data-brand-mark="google"`) uses Google's four brand colours (`#EA4335`, `#4285F4`, `#FBBC05`, `#34A853`) as hard-coded fills, per Google's sign-in branding rules. The only place with brand colours outside the tokens.
- **Reader word token**: `<button class="reader-token">` (`READER_TOKEN_CLASS` in `features/reader/reader-tokens.ts`) and the fit-probe HTML built by `readerLayoutToHtml`. A word of running text, not a UI control; hundreds per page, and the gestures and specs find words by `.reader-token`. The one raw `<button>` in feature code: `features/reader/ReaderTokens.tsx`, `reader-tokens.ts` and `reader-tokens.test.ts` are the only files exempt from the raw-element rule (an ESLint override for exactly those files).
- **Practice flashcard word**: the card's word is sized by `--practice-card-text-size` (up to 4.5rem, scaled down to fit), beyond the `text-title` type scale. The one `font-size` in feature CSS (`features/practice/practice.css`, a single-line `stylelint-disable-next-line`).
- **Small-control radius**: not an exception; `--radius-control-sm` (4px) is part of the radius scale.
