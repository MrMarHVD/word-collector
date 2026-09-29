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
| Checks           | `npm run lint                                                                                                           | typecheck | test | build -w frontend` (CI runs all four on pull requests) |

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
- Build output: `frontend/dist/` (gitignored). In production the backend serves it (`PUBLIC_DIR`) with the same security headers, immutable caching for `/vendor/bergamot-0.4.9/` and `/models/`, asset 404s and SPA fallback; deploy runs `npm run build -w frontend` after `fetch:mt-models`.

## Layout and conventions

```
src/
  main.tsx               entry (theme sync, session bootstrap, router)
  app/                   routes.tsx, pages.ts, RouteGate.tsx, RootLayout.tsx, route-paths.ts, providers.tsx, bootstrap.ts
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
- Mobile breakpoint: `max-width: 760px` (`useIsMobileLayout()` in `@/lib/hooks/use-media-query`).
- Button text: legacy `button { font: inherit }` (in `styles/base.css`) overrides `font-*`/`text-*` utilities on buttons, exactly as it does in the legacy app. Keep it that way for parity.

## I1 Routes

`src/app/routes.tsx` (RX-002 only). Each page is the **default export** of
`src/features/<name>/<Name>Page.tsx`, lazily loaded via `src/app/pages.ts`.
Replace the page's contents, but keep the file path and the default export.

| Path          | Tab (`route-paths.ts`) | Page                                       | Gate                                                            |
| ------------- | ---------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| `/`           | –                      | `features/auth/WelcomePage.tsx`            | signed in with a language → redirect to the saved tab           |
| `/dashboard`  | `dashboard`            | `features/dashboard/DashboardPage.tsx`     | auth + language                                                 |
| `/vocab`      | `collections`          | `features/collections/CollectionsPage.tsx` | auth + language                                                 |
| `/reader`     | `reader`               | `features/reader/ReaderPage.tsx`           | auth + language                                                 |
| `/practice`   | `practice`             | `features/practice/PracticePage.tsx`       | auth + language                                                 |
| `/settings`   | `settings`             | `features/settings/SettingsPage.tsx`       | auth                                                            |
| `/admin`      | `admin`                | `features/admin/AdminPage.tsx`             | auth + `isAdminUser`                                            |
| anything else | –                      | as `/`                                     |                                                                 |
| (no path)     | –                      | `features/auth/AuthPage.tsx`               | rendered instead of the shell while `session.authScreen` is set |

`materials` has no page: it exports components only (I8).

Gating (`RouteGate`), as in legacy `router.js`:

- Signed out: `WelcomePage` renders in place and the URL is kept, so the deep link opens after login.
- A language-required tab without a study language: the welcome language gate, and the URL is replaced with `/`.
- A non-admin on `/admin`: replaced with `/dashboard`.
- On success the tab is saved as `wordMarkerActiveTab`. `/` and unknown paths go to the saved tab (default `dashboard`; a saved `admin` is not restored).
- Navigate with `useNavigate()` and `pathForTab(tab)` / `TAB_PATHS` from `@/app/route-paths`. Deep links, reload and back/forward are handled by React Router.

The shell renders your page inside `<main id="appShell">` below the fixed menu
bar, and toggles `body.is-reader-active` / `body.is-reader-focus` (the latter
from `readerPreferences.focusMode`) on `/reader`. Keep the legacy view ids on
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
continued text selection behind them. Other mobile bottom sheets (e.g. the mobile
sidebar): use `Drawer` (Vaul).

## I3 API client

`import { api, queryKeys, ApiError, … } from "@/lib/api"`. Every endpoint is a typed function; the types are in `src/lib/api/types.ts` (re-exported).

Behaviour (`client.ts`, ported from `api.js`):

- Same-origin `/api/*` with `credentials: "include"`. JSON bodies get `content-type: application/json`; `FormData` is sent as-is.
- POST/PATCH/DELETE send `x-csrf-token`, fetched lazily from `GET /api/auth/me`. The token is rotated from any response body with `csrfToken` (`getCsrfToken`/`setCsrfToken`/`csrfHeaders` are available).
- Non-2xx responses throw `ApiError { status, errorKey?, details?, payload }` whose `message` is already localised (`errorKey`+`details` → `error` → `errors.requestFailed`). Show `error.message`.
- HTTP 401 → `session.handleUnauthorized()` (user dropped, query cache cleared, welcome shown in place), except calls made with `handleUnauthorized: false` (login, register, verify-email, request/reset password).
- Low level: `request<T>(path, { method, body, query, headers, signal, handleUnauthorized })`. `query` skips `null`/`undefined`/`""`.

| Module            | Function → endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.auth`        | `me()` GET /api/auth/me · `login({email,password})` · `register({email,password,confirmPassword})` · `logout()` · `resendVerification()` · `verifyEmail(token)` · `requestPasswordReset(email)` · `resetPassword({token,password,confirmPassword})` · `googleStartUrl()` (navigate the window to it)                                                                                                                                                                                |
| `api.languages`   | `list()` GET /api/languages · `add(name)` POST /api/languages                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `api.dashboard`   | `get({languageId})` GET /api/dashboard · `documents({languageId,search,limit,offset})` GET /api/dashboard/documents                                                                                                                                                                                                                                                                                                                                                                 |
| `api.materials`   | `list({languageId,offset,search})` GET /api/materials · `upload({languageId,file})` POST multipart · `reader(id,{start,limit})` GET /api/materials/:id · `update(id,{title?,readerStart?})` PATCH · `remove(id)` DELETE                                                                                                                                                                                                                                                             |
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
- Bootstrap (`app/bootstrap.ts`, RX-002) consumes `?reset_token` (→ `openAuthScreen({panel:"reset", resetToken})`, no session load), `?verify_token` (→ `verifyNotice` when signed in, else a login screen with that `status`) and `?oauth_error` (→ a login screen with the localised error), then strips them from the URL.

**`useStudyLanguageStore`** (`@/stores/study-language`)

- `languages: Language[]` (enrolled), `studyLanguageOptions: string[]`, `nativeLanguage: string|null`, `selectedId: number|null`, `selectedName: string` (persisted as `wordMarkerStudyLanguageName`)
- `setCatalog(partial)`, `selectLanguage(name|null, { persist = true }): boolean`, `restoreSelection()`, `switchLanguage(name)`, `addLanguage(name): Promise<void>` (rejects with `ApiError`), `reset({ forget? })`
- `switchLanguage`/`addLanguage` do a **full reload onto `/dashboard`** (legacy behaviour), so features never need to reset state for those. A study-language change in another tab updates `selectedId` without a reload: key your queries and feature state on `selectedId`.
- Hook: `useAvailableStudyLanguages()`. Pure rules in `@/lib/study-language` (`availableStudyLanguages`, `studyLanguageMenuOptions`, `addableStudyLanguages`, `firstAvailableStudyLanguageAlphabetically`, `languageByName`, `studyLanguageLabelKey`, `unavailableStudyLanguageReasonKey`). Settings, after a native-language change: `setUser(merged)`, then select `firstAvailableStudyLanguageAlphabetically(...)` when the current one became unavailable.

**`useReaderPreferencesStore`** (`@/stores/reader-preferences`): same keys, parsing and defaults as `state.js`; writes use `String(value)`.

| Field                         | Key                                       | Default                                          |
| ----------------------------- | ----------------------------------------- | ------------------------------------------------ |
| `wordsPerPage: "fit"\|number` | wordMarkerReaderWordsPerPage              | 250                                              |
| `fontSize`                    | wordMarkerReaderFontSize                  | 22                                               |
| `sidebarCollapsed`            | wordMarkerReaderSidebarCollapsed          | false                                            |
| `sidebarWidth`                | wordMarkerReaderSidebarWidth              | 300                                              |
| `infoWidth`                   | wordMarkerReaderInfoWidth                 | 300                                              |
| `panelWidth` / `panelHeight`  | wordMarkerReaderPanelWidth / …PanelHeight | 0 (automatic; the reader computes the live size) |
| `focusMode`                   | wordMarkerReaderFocusMode                 | false                                            |
| `focusPanelWidth`             | wordMarkerReaderFocusPanelWidth           | 0                                                |
| `autoMarkKnownOnPageTurn`     | wordMarkerReaderAutoMarkKnownOnPageTurn   | false                                            |
| `autoMarkLearningOnClick`     | wordMarkerReaderAutoMarkLearningOnClick   | true (only `"false"` disables it)                |
| `showWordSpaces`              | wordMarkerReaderShowWordSpaces            | false                                            |
| `highlightOpacity`            | wordMarkerReaderHighlightOpacity          | 0.2                                              |

Actions: `setPreference(key, value)`, `setPreferences(partial)`. Also exported: `READER_PREFERENCE_KEYS`, `readReaderPreferences()`.

**`useThemeStore`** (`@/stores/theme`): `preference: "system"|"light"|"dark"` (`wordMarkerTheme`, invalid → system), `resolved: "light"|"dark"`, `setTheme(p)`. Writes `html[data-theme]` and `html[data-theme-preference]` and follows the OS setting while on "system". `static/theme-init.js` applies it before first paint.

**`useLocaleStore`** (`@/stores/locale`): `locale: "en"|"zh"|"ja"` (`wordMarkerLocale`, invalid → en), `setLocale(l)`. `<html lang>` and the title follow it.

**`useUiPreferencesStore`** (`@/stores/ui-preferences`): `wordDisplayMode: "page"|"infinite"` (`wordMarkerDisplayMode`, default infinite), `setWordDisplayMode(m)`. Shared by vocab and settings.

Feature-local persisted keys (`wordMarkerDashboardStatsTab`,
`wordMarkerCollectionsSidebarCollapsed`, `wordMarkerSelectedMaterialId:<languageId>`, …):
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
| `toast` / `toastError` (`toast.ts`)                          | `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`, `toastError(error)` (message or `errors.requestFailed`). Replaces `window.alert`. The `<Toaster/>` is already mounted.                                                                                                                                                                                                                                                                           |
| `TranslationOverride`                                        | `{ entry: TranslationEntry; wordId; context: "vocab"\|"reader"; compact?; editing; onEdit(); onCancel(); onSave(value: string); onClear() }`. Controlled edit state; save/clear may return a Promise (buttons disable meanwhile). Send `onSave`'s raw value, or `null` for clear, to `api.words.setTranslationOverride`. Keeps the legacy classes and `data-translation-override-*` / `data-word-id` hooks.                                                   |
| `DisambiguationTable`                                        | `{ entry; className? }`. Candidate table (original translation highlighted) or nothing. Wrap it in `.disambiguation-panel` (reader) or a `.disambiguation-row` cell (vocab, `className="disambiguation-table"`).                                                                                                                                                                                                                                              |
| `DisambiguationToggle`                                       | `{ expanded; onToggle(); className?; …button props (e.g. data-word-disambiguate) }`                                                                                                                                                                                                                                                                                                                                                                           |
| helpers (from `Disambiguation.tsx` / `@/lib/disambiguation`) | `hasDisambiguation(entry)`, `disambiguationEntries(entry)`, `originalTranslationCandidate(entry)`, `hasTranslationOverride(entry)`; `TranslationEntry` accepts reader tokens and vocab words                                                                                                                                                                                                                                                                  |

Shared CSS classes (in `styles/components.css`): `.visually-hidden`,
`.danger-button`, `.material-icon-button` (+ `.material-rename-button`,
`.material-delete-button`, `.material-action-icon`), the `.is-active`
segmented-button styles (`.tab-button`, `.display-mode-button`,
`.theme-button`, `.settings-menu-button`, `.reader-sidebar-tab-button`,
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

Division of state: the reader owns the selected material id, its per-language
cache key `wordMarkerSelectedMaterialId:<languageId>`, and loading the material
(`api.materials.reader`). Materials owns the list, search and import tracking.
The auth feature owns `WelcomePage`/`AuthPage` (built by RX-002 for the
first-run path; forgot/reset panels are minimal placeholders) and all auth
screens after RX-002.
