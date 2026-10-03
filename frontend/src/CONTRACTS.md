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
- Tailwind scans `src/` only. The legacy classes and tokens work unchanged (`bg-panel`, `text-secondary`, `border-line`, `bg-brand`, `shadow-panel`, …).
- Feature CSS lives in `src/features/<name>/<name>.css`, imported from your page. Keep it **unlayered**, as in the legacy app, so it still beats utility classes. Global and shared CSS is in `src/styles/` (read-only for features).
- Mobile breakpoint: `max-width: 760px` (`useIsMobileLayout()` in `@/lib/hooks/use-media-query`). In Tailwind use the `mobile:` (≤760px) and `desktop:` (≥761px) variants, not `sm:`/`md:`.
- Button text: legacy `button { font: inherit }` (in `styles/base.css`) overrides `font-*`/`text-*` utilities on buttons, exactly as it does in the legacy app. Keep it that way for parity.

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

Installed: `alert-dialog badge button card checkbox dialog drawer dropdown-menu field input label popover radio-group scroll-area select separator sheet skeleton slider sonner switch table tabs textarea tooltip`.
The form helpers are `field.tsx` (`Field`, `FieldLabel`, `FieldDescription`,
`FieldError`, `FieldGroup`, …). No react-hook-form.

Theme: `styles/shadcn.css` maps the shadcn variables onto the `theme.css`
tokens (`--background`=`--surface-page`, `--card`/`--popover`=`--surface-panel`,
`--primary`=`--brand`, `--muted`=`--surface-muted`,
`--muted-foreground`=`--text-muted`, `--accent`=`--brand-hover-surface`,
`--destructive`=`--danger`, `--border`/`--input`=`--border-main`,
`--ring`=`--brand`, `--radius`=0.5rem), so everything follows
`html[data-theme]`. The Tailwind `dark:` variant targets `[data-theme="dark"]`.
shadcn's `secondary` colour is **not** mapped: `text-secondary` keeps its app
meaning (muted text), and the kit's secondary variants use `bg-muted`. The
button variants are aligned with the app (`default` = brand fill with
`hover:bg-brand-strong`; `outline` = `border-line bg-panel text-brand hover:bg-hover`).

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

| Component                                                    | Props / API                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppShell`                                                   | `{ children }`. Menu bar (`#brandHomeButton`, `nav.tabs .tab-button[data-tab]` with `is-active`, `#adminTabButton`, `#knownTotal`, study languages, `#localeSelect`, desktop `#settingsButton` + `#logoutButton`, mobile hamburger `#settingsButton` → `#accountDropdown` with tab items, `#adminTabMenuButton`, `#accountSettingsButton`, `#logoutButton`), `<VerifyBanner/>`, then the page. Guest mode is `.menu-bar.is-guest`. Used by `RootLayout` only. |
| `StudyLanguageSelect`                                        | `{ className? }`. Flag buttons (`#studyLanguageButtons .study-language-button[data-language-name]`) + the "+" menu (`#studyLanguageAddButton`, `#studyLanguageDropdown`). Self-contained over the store.                                                                                                                                                                                                                                                      |
| `LocaleSelect`                                               | no props (native `<select id="localeSelect">`, values en/zh/ja; specs use `selectOption`)                                                                                                                                                                                                                                                                                                                                                                     |
| `Flag`                                                       | `{ language: string }` inline SVG flag                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Sidebar`                                                    | `{ collapsed; onCollapsedChange(c); toggleLabel; toggleId?; headClassName?; className?; children; …aside props }`. `.app-sidebar` with the minimise button (`aria-expanded`).                                                                                                                                                                                                                                                                                 |
| `SidebarLayout`                                              | `{ collapsed; className?; …section props }`. `.app-sidebar-layout` + `is-sidebar-collapsed`.                                                                                                                                                                                                                                                                                                                                                                  |
| `SidebarOpenButton`                                          | `{ collapsed; onOpen(); label; className? (top offset); …button props }`. Fixed left-edge re-open button, hidden unless collapsed.                                                                                                                                                                                                                                                                                                                            |
| `CloseButton`                                                | `{ label; …button props (onClick, data-* hooks, className) }`. `.close-button` with a centred SVG ×.                                                                                                                                                                                                                                                                                                                                                          |
| `ConfirmDialog`                                              | `{ open; onOpenChange; onConfirm; title; description?; confirmLabel?; cancelLabel?; destructive? }` (controlled)                                                                                                                                                                                                                                                                                                                                              |
| `useConfirm()`                                               | `const confirm = useConfirm(); if (await confirm({ title, description?, confirmLabel?, cancelLabel?, destructive? })) …`. Replaces `window.confirm`.                                                                                                                                                                                                                                                                                                          |
| `toast` / `toastError` (`toast.ts`)                          | `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`, `toastError(error)` (text from `errorMessage`). Replaces `window.alert`. The `<Toaster/>` is already mounted.                                                                                                                                                                                                                                                                                    |
| `TranslationOverride`                                        | `{ entry: TranslationEntry; wordId; context: "vocab"\|"reader"; compact?; editing; onEdit(); onCancel(); onSave(value: string); onClear() }`. Controlled edit state; save/clear may return a Promise (buttons disable meanwhile). Send `onSave`'s raw value, or `null` for clear, to `api.words.setTranslationOverride`. Keeps the legacy classes and `data-translation-override-*` / `data-word-id` hooks.                                                   |
| `DisambiguationTable`                                        | `{ entry; className? }`. Candidate table (original translation highlighted) or nothing. Wrap it in `.disambiguation-panel` (reader) or a `.disambiguation-row` cell (vocab, `className="disambiguation-table"`).                                                                                                                                                                                                                                              |
| `DisambiguationToggle`                                       | `{ expanded; onToggle(); className?; …button props (e.g. data-word-disambiguate) }`                                                                                                                                                                                                                                                                                                                                                                           |
| helpers (from `Disambiguation.tsx` / `@/lib/disambiguation`) | `hasDisambiguation(entry)`, `disambiguationEntries(entry)`, `originalTranslationCandidate(entry)`, `hasTranslationOverride(entry)`; `TranslationEntry` accepts reader tokens and vocab words                                                                                                                                                                                                                                                                  |

### Settings primitives (`components/app/SettingRow.tsx`, `Segmented.tsx`)

Build every settings surface from these, not ad-hoc cards or raw controls.

- `SettingSection`: `{ title; className?; …section props; children }`. Small uppercase heading over one bordered container; children (rows) get a `Separator` between them.
- `SettingRow`: `{ label; description?; htmlFor?; labelId?; stacked?; className?; …div props; children }`. Kit `Field` (horizontal): label + one-line description left, control (`children`) right, min 44px. `htmlFor` is the control's id. `stacked` is for wide controls (Select, Slider): 224px wide on desktop, label above and the control full width on mobile. Other rows stay horizontal on mobile.
- `SettingSelect`: the kit `SelectTrigger` with the settings styling; use inside `Select` (`<Select><SettingSelect id=… aria-labelledby=…><SelectValue/></SettingSelect><SelectContent>…`).
- `Segmented<T>`: `{ value: T; onValueChange(v: T); options: { value: T; label; itemProps? }[]; "aria-label"; className? }`. Single-select kit `ToggleGroup`, never empty, full width with equal items; the selected item is exposed through Radix's `aria-checked` (no `aria-pressed`). `itemProps` carries per-item attributes such as `data-theme-option` / `data-display-mode`.

Shared CSS classes (in `styles/components.css`): `.visually-hidden`,
`.danger-button`, `.material-icon-button` (+ `.material-rename-button`,
`.material-delete-button`, `.material-action-icon`), the `.is-active`
segmented-button styles (`.tab-button`, `.display-mode-button`,
`.theme-button`, `.reader-sidebar-tab-button`,
`.auth-mode-button`, `.upload-target-button`, `.locale-button`).

## I7 Test hooks

Preserve every id, `data-*` attribute and ARIA label that `tests/auth.setup.ts`
and `tests/smoke/*.spec.ts` use in your area (`grep` them). Shell-owned hooks
(done): `#appShell` (not rendered while the auth screen is open, and only
rendered together with its page, so the welcome gate appears in the same
commit), `#authView`, `#welcomeLoginButton`, `#authEmail`, `#authPassword`,
`#authSubmit`, `[data-welcome-study-language]`, `#localeSelect` (a native select: keep any control the specs drive with `selectOption` native),
`.tab-button` / `nav.tabs [data-tab=…]` with `is-active`, and the admin tab's
`hidden` state. Test edits are allowed only for implementation internals
(module paths, direct module imports, internal globals). They must assert the same behaviour, and each one is listed in your report.

## I8 Cross-feature exports

A component rendered by another feature is exported from its owner's
`src/features/<name>/index.ts`. Consumers import only from that index. RX-002
ships typed stubs; the owner implements them behind the same names and props.
Every other feature's `index.ts` is `export {}`.

| Export                 | Owner → consumer                                   | Props                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Stub           |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `VerifyBanner`         | auth (RX-003) → AppShell                           | none. Reads `session.user.emailVerified` and `session.verifyNotice`; renders `#verifyBanner`, `#verifyResendButton`, `#verifyBannerStatus` (`api.auth.resendVerification`, outcome via `setVerifyNotice`).                                                                                                                                                                                                                                             | renders `null` |
| `MaterialList`         | materials (RX-006) → reader documents tab (RX-007) | `{ selectedMaterialId: number \| null; onOpenMaterial(material: MaterialListItem): void; onMaterialDeleted?(materialId: number): void }`. Renders `#materialImportOpen` (opens the import dialog itself), `#materialSearch`, `#materialList`, with rename, delete (useConfirm), import/translation progress and polling. Calls `onOpenMaterial` when the user picks a ready material and when a material it imported becomes ready (legacy auto-open). | renders `null` |
| `MaterialImportDialog` | materials (RX-006) → any                           | `{ open: boolean; onOpenChange(open: boolean): void; onImportStarted?(material: MaterialDetail): void }`. `#materialImportModal`.                                                                                                                                                                                                                                                                                                                      | renders `null` |

Division of state: the route (`/reader/:materialId`) owns the open material id; the reader owns its per-language
cache key `wordMarkerSelectedMaterialId:<userId>:<languageId>` (a legacy `…:<languageId>` entry moves to the first user who reads it), and loading the material
(`api.materials.reader`). Materials owns the list, search and import tracking.
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
  as MaterialList does today.
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
