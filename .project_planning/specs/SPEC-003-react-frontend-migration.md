# SPEC-003: React Frontend Migration

## Context

The frontend (`frontend/public/`) is plain ES modules with no bundler and no
framework: about 44 modules, roughly 9.3k lines of JS, 3k lines of
hand-written CSS in `css/`, and a 581-line `index.html`. Tailwind v4 is the
only build step. State lives in a single global object (`js/state.js`).
Rendering is done with `innerHTML` templates, and a controller/view split
sits under `js/features/` and `js/views/`.

Every recurring UI pattern is hand-rolled: popups, dropdowns, modals, bottom
sheets and tabs. There is no toast system, and three raw
`confirm()`/`alert()` calls remain. Only five components are shared
(`js/views/components/`).

Serving and deployment:
- In development, `frontend/server.js` serves the app and injects
  `/env.js`.
- In production, the backend serves `frontend/public` (`PUBLIC_DIR`) behind
  the security headers in `backend/src/http/security.js`.
- Deploy (`.github/workflows/deploy-dev.yml`) runs on the Contabo VPS.

Routing uses real paths via `pushState` (`js/app/router.js`): `/dashboard`,
`/vocab`, `/reader`, `/practice`, `/settings` and `/admin`.

The app is growing: admin and superadmin pages (SPEC-001) and sentence
translation (SPEC-002) were added recently. Continuing to hand-build UI on
this architecture is getting harder to maintain. This spec migrates the
frontend to React with shadcn/ui components, keeping behaviour the same.
UX redesign is deliberately left to a later spec.

## Goals

- Replace the entire frontend with a React + TypeScript application that has
  full behavioural parity with the current app.
- Replace hand-rolled UI patterns with standard, accessible components.
- Keep the app's visual identity (its colour tokens and light/dark themes)
  while making the UI cleaner and more consistent.
- Make the codebase easier to maintain, with typed code, standard state
  management, linting and unit tests for pure logic.
- Switch over in a single release, with no half-migrated state in
  production.

## Non-Goals

- UX redesign: no changes to navigation structure, layouts, flows or
  information architecture. A follow-up spec may address this.
- Adopting shadcn's default visual design in place of the app's own theme
  tokens.
- New features, or removing existing features.
- Backend changes beyond static serving, security headers and deploy steps
  that the new build requires.
- Running Playwright in CI.
- Incremental coexistence of old and new frontends in production.

## Functional Requirements

### Parity

- FR-1. Every screen, flow and feature of the current frontend must exist in
  the new frontend and behave the same. This covers:
  - auth (login, signup, verification, password reset, OAuth errors);
  - dashboard;
  - vocab and collections;
  - reader, including word-info, the radial quick menu for non-eligible
    readers, sentence translation for eligible readers, pagination, focus
    mode and reader preferences;
  - practice;
  - materials and imports (including EPUB/PDF/TXT upload);
  - settings, including account deletion;
  - admin, users, words and superadmin.
- FR-2. All current URL paths must keep working with the same meaning,
  including deep links, reloads and back/forward navigation.
- FR-3. User preferences stored in the browser (reader preferences under the
  existing `wordMarkerReader*` localStorage keys, theme and locale) must
  carry over, so users keep their settings after the switchover.
- FR-4. Behaviour on an unauthorised session (redirect to login) and on
  study-language-gated tabs must be preserved.

### UI components

- FR-5. Hand-rolled modals, dialogs, popups, popovers, dropdowns, selects,
  tabs, sidebars and bottom sheets must be replaced by the standard
  component equivalents, keeping their current behaviour and placement.
- FR-6. The raw `confirm()`/`alert()` calls must be replaced by in-app
  confirmation dialogs and toast notifications.
- FR-7. On mobile, the surfaces that are bottom sheets today (the word-info
  popup, the translation popup and the mobile sidebar) must remain bottom
  sheets.
- FR-8. The reader's custom token rendering and gestures must be preserved,
  covering:
  - word tap to word-info;
  - press-and-hold radial quick menu (non-eligible readers);
  - drag and hold-then-drag segment selection (eligible readers);
  - swipe, wheel and arrow-key page turns;
  - "show word spaces".

### Sentence translation (SPEC-002)

- FR-9. The client-side Bergamot translation must keep working, with no
  change to its behaviour or contracts. That covers:
  - the versioned engine path `/vendor/bergamot-0.4.9/`;
  - the model files under `/models/ja-en-2.1/`;
  - the Cache API persistence;
  - the selection event semantics;
  - the popup states and positioning rules.

### Localisation and theming

- FR-10. All UI text must continue to come from `locales.json` (ja, en, zh)
  using the existing keys. Any new strings, such as toast and confirm text,
  must be added in all three locales.
- FR-11. Light and dark themes must continue to work through
  `html[data-theme]`, with the existing theme tokens driving the component
  colours.

## Non-Functional Requirements

- NFR-1. Testing:
  - The existing Playwright smoke suite is the acceptance bar. The new
    frontend keeps the element IDs, `data-*` attributes and ARIA labels
    those tests rely on.
  - Tests may be edited only where they depend on implementation internals,
    such as module file paths or direct module imports. Such edits must
    assert the same behaviour, and every edit is listed in the pull request.
- NFR-2. New coverage: before the migration, add Playwright tests written
  against the current app for flows that have none, namely practice,
  collections, imports and settings. The new frontend must then pass them.
- NFR-3. Code quality:
  - TypeScript in strict mode, passing `tsc --noEmit`.
  - ESLint (TypeScript and React Hooks rules) and Prettier, both clean.
  - Vitest unit tests for pure logic: token source-text reconstruction, the
    i18n helper, the API client and reader pagination/fit calculations.
- NFR-4. CI: a pull-request workflow runs lint, typecheck, Vitest and the
  production build.
- NFR-5. Mobile parity: every screen keeps its current mobile layout and
  touch behaviour, as AGENTS.md requires.
- NFR-6. Accessibility:
  - Dialogs, menus, tabs and sheets have correct focus management, keyboard
    operation and ARIA semantics.
  - Accessibility may improve but must not regress.
- NFR-7. Security:
  - The production CSP keeps its current strictness, with no new
    third-party origins. The only permitted addition is anything the build
    genuinely requires.
  - Security headers, the immutable caching for the engine and model paths,
    and the real 404s for missing assets are all preserved.
- NFR-8. Performance: initial load and reader page turns must not be
  noticeably slower than today.

## Data & Interfaces

- **No API or database changes.** The frontend uses the existing `/api/*`
  endpoints unchanged.
- **Local-storage keys:** existing keys are read and written unchanged
  (FR-3).
- **Build output:** the backend serves a production build directory instead
  of `frontend/public`. The Bergamot engine and model files remain
  available at their current URLs.
- **Dev serving:** the dev frontend and the API are reachable from one
  origin, so the runtime `/env.js` injection is no longer needed.

## Affected Areas of the Codebase

- `frontend/` in its entirety. The current `frontend/public` code is removed
  at switchover. `frontend/server.js` is retired.
- `frontend/public/locales.json`: kept and relocated as needed; the keys are
  unchanged.
- `backend/src/config.js` (`PUBLIC_DIR` default), `backend/src/http/static.js`
  and `backend/src/http/security.js`: serving the build output under the
  same header, cache and 404 rules.
- `.github/workflows/deploy-dev.yml`: build step. A new CI workflow is added.
- `playwright.config.ts` and `tests/smoke/*`: dev server command, minimal
  internal-coupling edits, and the new coverage specs.
- `AGENTS.md`: frontend conventions updated for React/TypeScript. For the
  frontend, TypeScript types replace JSDoc `@param`/`@returns`, and a short
  purpose comment on components and hooks remains. Worktree dev-server
  instructions are updated for the new dev server.
- `.gitignore`: build output.

## Constraints & Assumptions

- **Decided:**
  - React with TypeScript.
  - shadcn/ui on Radix primitives, with Vaul drawers for mobile bottom
    sheets.
  - Vite as the build tool and dev server, proxying `/api` to the backend.
  - React Router with the existing paths.
  - TanStack Query for server data, and Zustand for UI and preference state.
  - Theme via the existing `theme.css` tokens mapped onto shadcn's colour
    variables.
  - i18n via `locales.json` with a small typed hook; no i18n library.
  - Big-bang switchover on a branch. The current frontend stays untouched
    until the new one passes the full acceptance bar.
  - Implementation by parallel subagent teams wherever possible.
- **Assumption:** the Playwright selectors (IDs, `data-*`, ARIA) can be
  reproduced in React without distorting component design. Any selector
  that cannot be kept is treated as a test-internals edit under NFR-1.
- **Assumption:** the known pre-existing login rate-limit (429) failures in
  the admin/superadmin specs are not caused by this migration. They must be
  resolved or explicitly shown to predate the migration before switchover
  is declared green.
- **Constraint:** Playwright needs a database and the model files, so it
  runs locally, not in CI.

## Acceptance Criteria

- [ ] Every current screen and flow works in the React app with the same
      behaviour on desktop and mobile.
- [ ] The full Playwright suite passes against the new frontend. That
      includes the existing specs, with only listed internal-coupling edits,
      and the new practice, collections, imports and settings specs, which
      were written and passing against the old app first.
- [ ] All current URLs, deep links and reloads resolve to the same screens.
- [ ] A user's saved reader preferences, theme and locale are intact after
      switchover.
- [ ] No raw `confirm()`/`alert()` remains; confirmations and notices use
      in-app components.
- [ ] Modals, menus, tabs and sheets are keyboard-operable and
      focus-managed.
- [ ] Sentence translation works as in SPEC-002, including model caching
      across reloads.
- [ ] Every UI string comes from `locales.json`, in ja, en and zh.
- [ ] Light and dark themes render correctly using the existing tokens.
- [ ] Lint, typecheck, Vitest and the build pass in the CI workflow.
- [ ] The production deploy serves the new build with unchanged security
      headers, caching and 404 behaviour.
- [ ] The old `frontend/public` application code and `frontend/server.js`
      are removed.

## Open Questions

None. The pre-existing login rate-limit failures in the test suite are
tracked separately from this spec (decided 2026-09-29), and are excluded
from the acceptance bar as long as they are shown to be the known 429s.

## Out of Scope for This Spec

Implementation strategy, folder structure inside `frontend/src`, the
component inventory, the order of work and the task breakdown. These belong
to the issueization step.
