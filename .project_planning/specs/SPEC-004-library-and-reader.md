# SPEC-004: Library and Reader

## Context

Today the reader (`frontend/src/features/reader/`) combines three things on
one screen:
- choosing a work, through the "documents" tab of the reader sidebar, which
  renders `MaterialList` from `features/materials`;
- reading, either in a normal mode with a smaller reading pane next to the
  sidebar, or in focus mode;
- reader settings, through the sidebar's "settings" tab, with some settings
  (font size, words per page) in a toolbar that focus mode hides.

The user finds this unintuitive. This spec splits the experience into two
distinct parts, consistently named throughout the UI and the codebase:
- the **Library**, where the user finds and organises works;
- the **Reader**, a distraction-free reading view equivalent to today's focus
  mode, with an "Aa" settings panel.

It also introduces user-defined **categories** for organising works, which
requires a database change. Works ("materials") currently have no category
and no cover image.

## Goals

- Two separate views, Library and Reader, named consistently in UI text,
  routes, code modules and documentation.
- A Library with live search, a scrollable list of works showing a picture,
  title, word count and progress, and an expandable category sidebar with
  drag-and-drop categorisation.
- A Reader that is only the focused reading view, with all reader settings
  in an overlay panel opened by an "Aa" button.
- Room in the Library for a future filter button and a future display-mode
  button (cards or list).

## Non-Goals

- Implementing the filter button or the display-mode switch. Only the room
  for them is in scope.
- Cover-image upload or extraction from EPUBs. See Open Questions.
- Nested categories, multiple categories per work, category colours or
  icons.
- Changes to the dashboard's documents panel, vocab or practice beyond what
  renaming or routing requires.
- Changes to word-info, sentence translation, the quick menu or reading
  gestures, apart from moving them into the new Reader.

## Functional Requirements

### Structure and navigation

- FR-1. The app has a **Library** view and a **Reader** view as separate
  destinations. The main navigation has exactly one tab for them, labelled
  **"Read"**, which opens the Library. The Reader is entered only by
  opening a work from the Library. There is no separate navigation tab for
  the Reader. A dashboard shortcut straight to the last-read work is
  planned separately (see `.project_planning/backlog.md`).
- FR-2. Each work in the Reader has its own URL. Reloading, using a deep
  link, and back/forward navigation all reopen that work.
- FR-3. Leaving the Reader (the exit button, Escape when nothing else is
  open, or browser back) returns to the Library, preserving its search,
  selected category and scroll position where possible.
- FR-4. Navigating to the Reader without a specific work reopens the
  last-read work for the current study language, or goes to the Library if
  there is none.
- FR-5. The names "Library" and "Reader" are used consistently in UI text
  (ja/en/zh), route paths, feature folders and module names, test hooks
  where new, and documentation. Obsolete names for the old combined reader
  and its tabs are removed.

### Library: list and search

- FR-6. A search bar at the top of the Library filters the visible works by
  title in real time as the user types, within the selected category.
- FR-7. The header area next to the search bar reserves space for a future
  filter button and a future display-mode button, without implementing
  them.
- FR-8. Works appear as a scrollable list. Each item shows:
  - a small picture on the left;
  - the title;
  - the word count;
  - a progress bar for reading progress.
- FR-9. Each item opens the work in the Reader. Existing work actions
  (import, rename, delete, and import or translation progress for works
  still processing) remain available in the Library.
- FR-10. The Library has an empty state for a library with no works, which
  offers import, and a no-results state for a search with no hits.

### Library: categories

- FR-11. An expandable/collapsible category list sits on the left of the
  Library, visually consistent with the current settings menu layout.
- FR-12. The list always contains **All** and **Uncategorised**, which can't
  be renamed or deleted.
  - All shows every work.
  - Uncategorised shows works with no user category.
- FR-13. The user can create new categories with a name. Duplicate names are
  not allowed.
- FR-14. Selecting a category shows only its works. The search applies
  within the selected category.
- FR-15. The user can move a work into a category by dragging the work
  from the list and dropping it on a category in the sidebar.
  - Dropping on Uncategorised removes the work's category.
  - Dropping on All does nothing.
  - The drop target is visibly indicated during the drag.
- FR-16. A work belongs to at most one user category at a time.
- FR-17. Categories and assignments persist across sessions and devices,
  stored server-side.
- FR-18. Works and categories are scoped to the user's study language, in
  the same way works are today.

### Reader

- FR-19. The Reader is the distraction-free reading view that is today's
  focus mode, with all existing reading features:
  - token rendering, pagination and fit-to-page;
  - word-info;
  - the quick menu;
  - segment selection and sentence translation;
  - page turns;
  - the progress line.

  The old non-focus reading layout with the sidebar is removed.
- FR-20. The Reader shows an **"Aa" settings button** in the top right, next
  to the exit button.
- FR-21. The "Aa" button opens a **settings panel overlaying the Reader**.
  - It takes no space when closed.
  - It doesn't resize or reflow the reading text when it opens.
  - The text stays visible, so changes are previewed live.
  - It closes on the "Aa" button, a close control, an outside click or tap,
    and Escape.
- FR-22. The settings panel contains every reader setting:
  - font size, words per page, text width;
  - highlight opacity, show word spaces;
  - auto-mark known on page turn, auto-mark learning on click.

  It uses the existing settings primitives (SettingSection, SettingRow and
  so on). Changes apply immediately, and fit-to-page re-fits when font size
  or width change.
- FR-23. Interacting with the settings panel never selects words or
  triggers reader gestures underneath it.

## Non-Functional Requirements

- NFR-1. Mobile parity (≤760px), shipped together with desktop.
  - The category list collapses into an expandable control.
  - The settings panel uses a mobile-appropriate overlay, such as a bottom
    sheet, that still previews live.
  - Drag-and-drop categorisation has a touch-friendly equivalent, for
    example long-press then drag, or a "Move to category" action.
- NFR-2. Accessibility:
  - Keyboard access for the category list, creating categories and the
    settings panel.
  - A keyboard-accessible alternative to drag-and-drop for categorising a
    work.
  - Focus moves into the settings panel on open and back to "Aa" on close.
  - Drop targets are announced to assistive technology.
- NFR-3. Motion follows the CONTRACTS.md Motion conventions, including
  reduced motion.
- NFR-4. Search stays responsive with large libraries: results update as
  the user types without noticeable lag.
- NFR-5. Localisation: every new string in ja, en and zh, proofread.
- NFR-6. Data safety:
  - The database change is a backward-compatible migration. Existing works
    become Uncategorised.
  - Account deletion removes the user's categories (AGENTS.md).
  - Deleting a category never deletes works; its works become
    Uncategorised.
- NFR-7. Security: category endpoints enforce ownership. Users can only see
  and modify their own categories and assign their own works.

## Data & Interfaces

- **New entity: category.**
  - Fields: owner (user), study language, name, display order, creation
    time.
  - Names are unique per user and language.
- **Work (material):** gains an optional reference to one category of the
  same user and language (a missing reference means Uncategorised), and a
  last-opened timestamp, set when the work is opened in the Reader.
- **API:**
  - list, create (and, per the Open Questions, rename and delete)
    categories for the current study language;
  - assign or unassign a work's category;
  - the works list exposes each work's category, word count and reading
    progress, and supports filtering by category (including uncategorised)
    and by title search.
- **UI surfaces:** the Library page, the category sidebar, the Reader top
  bar (title, Aa, exit) and the settings overlay.

## Affected Areas of the Codebase

- **Backend:**
  - `backend/migrations/` (new migration);
  - `backend/src/modules/materials/` (repository and service: category
    filter, progress fields), plus a categories module or an extension of
    materials;
  - `backend/src/http/routes/` (category and assignment routes);
  - account deletion.
- **Frontend:**
  - `frontend/src/app/` (routes, route paths, navigation);
  - a new `features/library/`;
  - `features/reader/` (remove the sidebar, tabs and non-focus layout; add
    the top bar and settings overlay);
  - `features/materials/` (list, import, rename, delete reused in the
    Library);
  - `components/app/` (settings primitives, Sidebar, animated-sidebar
    hook);
  - `lib/api/` (category endpoints);
  - `stores/reader-preferences.ts`;
  - `frontend/public/locales.json`.
- **Tests:** the `tests/smoke` specs that open works through the reader
  sidebar (`app`, `imports`, `reader-translation`), plus new specs.
- **Docs:** `frontend/src/CONTRACTS.md` and `AGENTS.md` (naming and
  structure).

## Constraints & Assumptions

- Assumption: there is no cover-image data for works today. The "small
  picture" is therefore a generated placeholder (see Open Questions) until
  a cover source is specified.
- Assumption: categories are per study language, like works. If they
  should be global per user, FR-18 changes.
- Constraint: the CSP forbids loading images or assets from third-party
  origins. Any picture must be generated client-side or served by the app.
- Constraint: Playwright hooks that remain meaningful (`#readerTitle`,
  `#readerText`, `#materialList`, `#materialImportOpen`, `#materialSearch`,
  the word-info and translation ids) are preserved. Hooks of removed UI are
  replaced, with the specs updated accordingly.
- Constraint: reader preference keys stored in browsers aren't deleted.
  Obsolete keys are simply no longer read.

## Acceptance Criteria

- [ ] The main navigation has a single "Read" tab that opens the Library.
      Opening a work goes to the Reader
      at a work-specific URL that survives reload and back/forward.
- [ ] Exiting the Reader returns to the Library with its search and
      category intact.
- [ ] The Library search filters works live while typing, within the
      selected category.
- [ ] Each work shows a small picture, its title, word count and a progress
      bar, in a scrollable list. Empty and no-results states appear when
      relevant.
- [ ] The category sidebar shows All and Uncategorised (both permanent) and
      user-created categories. It can be expanded and collapsed.
- [ ] A new category can be created. Dragging a work onto it moves the work
      there, and the work then appears under that category, not under
      Uncategorised. Dropping on Uncategorised removes the category.
- [ ] Categories and assignments persist after reload and on another device.
- [ ] Categorising works by touch and by keyboard.
- [ ] Existing works show as Uncategorised after the migration, and the
      migration can be rolled back.
- [ ] Deleting an account removes its categories. Another user can't see or
      modify them.
- [ ] The Reader shows only the reading view with an "Aa" button next to
      exit, and the old sidebar and normal mode are gone.
- [ ] "Aa" opens an overlay settings panel containing every reader setting.
      Changes apply live and the text re-fits. The panel closes via Aa,
      close, outside click or tap, and Escape, without selecting words
      underneath.
- [ ] Word-info, sentence translation, the quick menu, page turns and
      progress all still work in the Reader.
- [ ] Every new string exists in ja, en and zh, and the UI and code use
      "Library" and "Reader" consistently.
- [ ] Desktop and mobile layouts are both complete. The Playwright suite,
      updated and extended for the Library, categories and settings panel,
      passes.

## Resolved Decisions (2026-10-03)

These answers supersede the original open questions and the related
assumptions above.

- FR-24. **Work picture:** a placeholder showing the first letter of the
  work's title. No cover extraction.
- FR-25. **Category management:** users can create, rename, reorder and
  delete their categories.
  - All and Uncategorised can't be renamed, deleted or reordered.
  - Deleting a category moves its works to Uncategorised; works are never
    deleted.
  - Reordering is persisted.
- FR-26. **Category scope:** categories are per study language (FR-18
  confirmed).
- FR-27. **Dashboard "go to" link:**
  - Clicking a work's title in the dashboard's documents panel navigates to
    the Library with that work shown in place: the list scrolls it into
    view and highlights it with a visible outline or border selection
    effect.
  - A transition effect conveys "this is where it is in the Library",
    following the Motion conventions and reduced motion.
  - The work is not opened automatically; clicking it once more opens it
    in the Reader.
  - The Library selects the category and clears the search so the target
    work is visible.
- FR-28. **Category sidebar:**
  - Expanded on the user's first visit, then remembers the user's
    expanded/collapsed choice.
  - Narrow relative to the main Library list.
- FR-29. **Default sort order:** by last opened (most recent first). Works
  never opened come after them, ordered by date added (newest first). This
  requires recording when a work was last opened in the Reader. Future
  filtering and sorting options build on this (backlog).

## Open Questions

None.

## Out of Scope for This Spec

Implementation strategy, component choices beyond the stated constraints,
schema details, endpoint shapes, sequencing and task breakdown. These belong
to issueization.
