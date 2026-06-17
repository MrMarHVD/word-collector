# SPEC-001: Admin Page

## Context

Word Marker currently has no administrative surface and no role system — the only
distinction is authenticated user vs. guest, enforced via server-side sessions
(`backend/src/auth/session.js`). All authenticated users have equal access to
their own data.

Two operational needs have emerged during the beta (`beta-v0.3`):

1. **User management** — the operator needs to grant individual users higher
   material limits than the global beta defaults. Today those limits
   (`BETA_MAX_MATERIALS_PER_USER`, `BETA_MAX_MATERIAL_UPLOAD_BYTES`) live in
   `backend/src/config.js` and are enforced globally in
   `backend/src/modules/materials/materials.service.js` (lines ~162–177) and at
   the multipart parse boundary in
   `backend/src/http/routes/materials.routes.js` (line ~68). There is no
   per-user override.

2. **Global word curation** — after the global-vocabulary restructure
   (migration `1748000000007_global-languages-words.js`), `words` are shared
   across users per language and canonical translations live in the shared
   `word_translations` table, keyed `(word_id, native_language)`. Each user may
   privately shadow a canonical translation via `user_words.translation_override`.
   There is currently no way for an operator to correct a canonical translation.

This spec introduces an Admin Page with a three-tier privilege model
(superadmin > admin > user), per-user material-limit overrides, and global
canonical-translation editing, plus an audit trail for administrative
mutations.

## Goals

- Introduce an admin privilege model: regular admins and a single superadmin.
- Let admins view and search the user base and set per-user material-limit
  overrides.
- Let admins search global words by language and edit their canonical
  translations.
- Let the superadmin grant and revoke admin status.
- Record all administrative mutations in an audit trail.
- Enforce every privilege boundary on the server; client-side gating is
  cosmetic only.

## Non-Goals

- Editing word **part-of-speech (POS)** — specified as a future extension of the
  Words panel, deferred past v1 (see Open Questions / future scope).
- Editing **disambiguation candidates** (which dictionary-sourced senses are
  present for a word) — deferred past v1; these are computed at lookup time
  rather than stored per-word today.
- A full role/permissions (RBAC) system — only two boolean flags are introduced.
- Self-service editing of any limit by end users.
- Bulk operations (bulk translation import/export, bulk user edits).
- Reverting/undoing changes from the audit log (the log is read-only).

## Functional Requirements

### Privilege model

- **FR-1.** The system must distinguish three privilege levels: regular user,
  admin, and superadmin. A user may be a regular admin, a superadmin, or
  neither.
- **FR-2.** The superadmin flag must be settable only via the existing
  provisioning script (`backend/scripts/provision_admin.js`), never through any
  API or UI.
- **FR-3.** Only the superadmin may grant or revoke admin status for other
  users.
- **FR-4.** The superadmin must not be able to remove their own superadmin
  status through any API or UI.
- **FR-5.** Revocation of admin status must take effect on the target user's next
  request (privilege is re-evaluated per request); existing sessions need not be
  forcibly terminated.

### Access & navigation

- **FR-6.** An "Admin" tab must appear in the main navigation only for users who
  are admins or the superadmin. Non-admins must not see it.
- **FR-7.** The Admin tab must present subtabs: an **Admin** subtab visible to
  every admin, and a **Superadmin** subtab visible only to the superadmin.
- **FR-8.** The Admin subtab must provide a left-rail navigation with two
  panels: **Users** and **Words**.
- **FR-9.** Every administrative API endpoint must independently enforce the
  caller's privilege server-side and reject unauthorised callers (admin-level
  endpoints reject non-admins; superadmin-level endpoints reject non-superadmins),
  regardless of what the UI exposes.

### Users panel

- **FR-10.** Admins must be able to browse the full user base as an
  infinite-scrolling list, sorted alphabetically by email address by default.
- **FR-11.** The user list must support searching by email address.
- **FR-12.** The user list must support an optional filter by account-creation
  date.
- **FR-13.** The user list must support an optional sort by account-creation
  date (in addition to the default alphabetical sort).
- **FR-14.** Each user row must display, at minimum: email, admin status, and the
  user's effective material limits (the override value if set, otherwise the
  global default).
- **FR-15.** Admins must be able to set or clear a per-user override for the two
  material limits: maximum number of materials and maximum material upload size.
  A cleared override means the user falls back to the global default.
- **FR-16.** A regular admin must not be able to edit the limits of themselves or
  of any other admin. Only the superadmin may edit the limits of an admin (or of
  themselves). The UI must disable edit controls on admin rows for regular
  admins, and the server must reject such edits regardless of the UI state.
- **FR-17.** Per-user material-limit overrides must be enforced by the backend at
  upload time, both at the multipart parse boundary and in the materials service,
  so that a raised upload-size limit is honoured end-to-end and a raised material
  count is honoured before the limit check.

### Words panel

- **FR-18.** The Words panel must always be scoped to exactly one source language,
  chosen from a mutually-exclusive language selector.
- **FR-19.** Within the selected language, words must be presented as an
  infinite-scrolling list, sorted alphabetically by default, and searchable by
  the word/lemma.
- **FR-20.** The panel must provide a translation-language (native-language)
  selector that defaults to English and may be changed to another native
  language.
- **FR-21.** The Words panel must show **all** words in the selected source
  language regardless of whether they have a translation in the selected native
  language. For each word, the canonical translation in the selected native
  language must be shown if present, or an empty editable field if absent.
- **FR-22.** Admins must be able to edit the canonical translation of a word for
  the selected native language, including adding a translation where none
  currently exists.
- **FR-23.** Editing a canonical translation must not affect users who have a
  private `translation_override` for that word; it changes only the shared
  canonical value.

### Superadmin panel

- **FR-24.** The Superadmin subtab must let the superadmin grant admin status to a
  regular user and revoke admin status from an existing admin.
- **FR-25.** The Superadmin subtab must display the administrative audit log as a
  read-only, paginated view.

### Audit trail

- **FR-26.** Every administrative mutation must be recorded in an audit trail,
  including at least: per-user limit changes, canonical translation edits, and
  admin grant/revoke actions.
- **FR-27.** Each audit entry must capture at minimum: the acting user, the
  action performed, the target of the action, the before and after values, and a
  timestamp.

## Non-Functional Requirements

- **NFR-1. Security / authorisation.** Privilege checks are the server's
  responsibility on every admin endpoint. Client-side hiding/disabling of
  controls is a usability convenience and must never be relied upon as the
  security boundary.
- **NFR-2. Pagination performance.** Both the user list and the word list use
  infinite scroll and must use cursor/keyset-based pagination (stable ordering by
  a unique key) rather than offset pagination, to remain correct and performant
  as lists grow.
- **NFR-3. Query efficiency.** Aggregate data shown per row (e.g. effective
  limits, material counts) must be retrieved without per-row follow-up queries
  (no N+1).
- **NFR-4. Auditability.** Administrative mutations and their before/after state
  must be reconstructable from the audit trail after the fact.

## Data & Interfaces

### Data entities (shape and meaning, not implementation)

- **`users`** — gains two boolean attributes: an admin flag and a superadmin
  flag. Gains two nullable per-user override attributes: maximum materials and
  maximum material upload size. A null override means "use the global default".
- **`word_translations`** — existing shared table keyed `(word_id,
  native_language)`; canonical translations are edited here.
- **`user_words.translation_override`** — existing per-user private override;
  unaffected by canonical edits.
- **Audit trail** — a new lightweight record per administrative mutation
  capturing acting user, action, target, before value, after value, and
  timestamp.

### UI surfaces

- A new "Admin" navigation tab (conditional on privilege).
- Admin subtab with a left rail: Users panel and Words panel.
- Superadmin subtab: admin grant/revoke controls and a read-only audit log view.

### API surface (shape and meaning)

All endpoints are privilege-guarded server-side. Admin-level unless noted.

- List users — paginated (cursor), supports email search, optional
  creation-date filter, alphabetical (default) or creation-date sort.
- Set/clear a user's material-limit overrides — target must be a non-admin
  unless the caller is the superadmin.
- List words for a selected language — paginated (cursor), word search,
  selected native language for display.
- Upsert a word's canonical translation for a `(word, native language)` pair.
- Grant admin / revoke admin — **superadmin only**.
- Read the audit log — **superadmin only**, paginated.

## Affected Areas of the Codebase

Informational orientation only — not an implementation plan.

- **Backend, schema/migrations** — `backend/migrations/` (new columns on
  `users`; new audit trail table).
- **Backend, provisioning** — `backend/scripts/provision_admin.js` (sets the
  superadmin and admin flags).
- **Backend, auth** — `backend/src/auth/session.js` (surface admin/superadmin
  status on the authenticated user per request).
- **Backend, routing** — `backend/src/http/routes/api.js` (privilege guards and
  wiring of new admin routes); a new admin routes module alongside the existing
  `*.routes.js` files.
- **Backend, modules** — a new admin module under `backend/src/modules/`
  following the existing service/repository pattern (`*.service.js` +
  `*.repository.js`); touches `materials` (per-user limit resolution),
  `words`/`translations` (canonical edits), and `config.js` (global default
  limits).
- **Backend, materials enforcement** — `backend/src/modules/materials/
  materials.service.js` and `backend/src/http/routes/materials.routes.js`
  (resolve per-user override before the parse-time stream cap and the service
  count/size checks).
- **Frontend, routing** — `frontend/public/js/app/router.js` (new admin
  tab/path and tab activation).
- **Frontend, shell** — `frontend/public/index.html` (admin tab button and view
  container).
- **Frontend, feature** — a new `frontend/public/js/features/admin/` controller
  and view following the existing feature pattern, wired in
  `frontend/public/js/main.js`.
- **Frontend, state** — `frontend/public/js/state.js` (admin/superadmin flags on
  the current user; note the beta limit constants currently here).

## Constraints & Assumptions

- **C-1.** Exactly one superadmin exists, provisioned out-of-band via
  `provision_admin.js`. The model permits multiple regular admins.
- **C-2.** Admin and superadmin status are read from the user record per request,
  consistent with the existing per-request session authentication.
- **C-3.** Canonical translations are per native language; the operator curates
  one native-language translation cell at a time, with English as the default
  view.
- **A-1.** Assumes the existing per-request authentication can cheaply expose the
  privilege flags without additional round-trips.
- **A-2.** Assumes beta-scale user and word volumes, but the pagination approach
  (NFR-2) is chosen to remain valid as data grows.

## Acceptance Criteria

- [ ] A non-admin user sees no Admin tab and receives an authorisation error from
      every admin API endpoint.
- [ ] A regular admin sees the Admin tab with a single Admin subtab (no Superadmin
      subtab) containing Users and Words panels.
- [ ] The superadmin additionally sees a Superadmin subtab.
- [ ] The Users panel lists users with infinite scroll, alphabetical by email by
      default, supports email search, an optional creation-date filter, and an
      optional creation-date sort.
- [ ] An admin can set and clear a user's max-materials and max-upload-size
      overrides; cleared overrides revert the user to the global default.
- [ ] A regular admin cannot edit limits for themselves or another admin (UI
      disabled and API rejected); the superadmin can edit any user including
      admins and themselves.
- [ ] A raised per-user upload-size override allows a correspondingly larger
      upload end-to-end (not truncated at parse time), and a raised material count
      override allows more materials.
- [ ] The Words panel is scoped to one selectable source language, lists all words
      in that language with infinite scroll and word search, and shows the
      canonical translation for a selectable native language (default English),
      including empty editable cells for untranslated words.
- [ ] An admin can edit or add a canonical translation for a word in the selected
      native language, and the change is visible to users without a private
      override but not to users who have one.
- [ ] Only the superadmin can grant or revoke admin status; the superadmin cannot
      remove their own superadmin status.
- [ ] Revoking a user's admin status removes their admin access on their next
      request.
- [ ] Every limit change, translation edit, and admin grant/revoke produces an
      audit entry capturing actor, action, target, before, after, and timestamp.
- [ ] The superadmin can view the audit log as a read-only paginated list.

## Open Questions

- **OQ-1.** Future Words-panel scope: editing word POS and editing which
  disambiguation candidates are present are intended but deferred. When promoted
  from "future" to "planned", they need their own requirements (especially the
  disambiguation case, since candidates are dictionary-derived rather than stored
  per word today).
- **OQ-2.** Should the audit log be retained indefinitely, or pruned/rotated
  after some period?
- **OQ-3.** Is the audit log strictly superadmin-readable (as specified in
  FR-25), or should regular admins also be able to read it (or a filtered view of
  their own actions)?
- **OQ-4.** Should clearing vs. setting an override be visually distinct in the
  user row (e.g. showing "default (10)" vs. an explicit override value)?

## Out of Scope for This Spec

Implementation strategy, technology and library choices, migration sequencing,
endpoint naming/signatures, UI component breakdown, and task decomposition. These
belong to a subsequent planning/issueization step.
