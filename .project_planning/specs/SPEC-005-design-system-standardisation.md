# SPEC-005: Design System Standardisation and Visual Refresh

## Context

The React frontend (SPEC-003) ported the legacy CSS largely unchanged. A UI
review on 2026-10-03 found two problems.

**It looks blocky and "cake-like".**
- Most containers stack a border, a fill and a heavy shadow
  (`--shadow-panel: 0 18px 45px`, about 20 hand-written panel strings).
- Bordered boxes are nested inside bordered boxes.
- Pills sit inside pills, with brand-colour rings.
- Buttons have a solid saturated teal fill.
- Font weights go up to 800/900, there are about a dozen radius values and
  there's no type scale.

**It isn't standardised.** The shadcn/Radix kit is installed but mostly
bypassed:
- 5+ button styles (about 55 raw `<button>` against about 26 kit `Button`);
- 6+ hand-rolled panel styles (kit `Card` unused);
- 9+ tab or segmented implementations;
- 4 input styles;
- 7+ popup and sheet skins;
- raw tables (kit `Table` unused).

The root cause is that CONTRACTS.md let legacy classes "work unchanged",
nothing enforces the kit, and AGENTS.md only asks to "reuse existing
patterns".

The user approved this design direction:
- **Base:** "neutral minimal". Content sits on calm, flat, even surfaces.
- **Glass:** Apple "Liquid Glass"-style translucency, used sparingly and only
  for chrome and floating controls (navigation bar, Reader buttons and the Aa
  panel, popovers, menus, dialogs, toasts).
- **Reader:** in the style of iA Writer (clean, even, typographic, almost no
  chrome).
- **Palette:** almost monochrome with a very subtle light-blue / blue-teal
  accent, not overused.

## Goals

- One canonical set of UI components, each with one canonical design, used
  everywhere. All duplicate implementations are removed.
- A modern, clean appearance: neutral minimal content surfaces, sparing
  glass for chrome and overlays, and an iA Writer-like Reader.
- Strict, enforced rules so future work reuses the canonical components and
  only adds new ones when nothing fits, consistently with the set.

## Non-Goals

- Changes to features, flows, navigation structure or information
  architecture.
- A user-facing font picker; only the groundwork for it is in scope (see
  `.project_planning/backlog.md`).
- Theme customisation by users beyond the existing light, dark and system
  modes.
- Changes to the backend.

## Functional Requirements

### Visual language (design tokens)

- FR-1. **Palette.** Neutral greys with no green tint, and a single subtle
  light-blue / blue-teal accent. Colour is reserved for:
  - primary actions;
  - links;
  - focus indication;
  - active or selected states.

  Word-status highlight colours remain distinguishable. Light and dark
  themes are both defined.
- FR-2. **Surfaces.** Content screens use flat, even surfaces.
  - Hierarchy comes from either a hairline border or a subtle tonal step,
    never both stacked.
  - Content panels have no shadow.
  - No bordered box is nested inside another bordered box; nested grouping
    uses dividers or spacing.
- FR-3. **Glass (sparing).** A single translucent "glass" material for
  chrome and floating layers only: the top navigation bar, the Reader's
  floating buttons and Aa panel, popovers, dropdown menus, dialogs, sheets
  and toasts.
  - Never behind reading text or long-form content.
  - It stays legible (WCAG AA) over any underlying content.
  - It has a solid fallback when translucency is unsupported or the user
    has reduced transparency.
- FR-4. **Shape.** A small fixed radius scale (e.g. controls, containers,
  pill only for badges), with no other radii.
- FR-5. **Typography.** A fixed type scale and a small set of text styles
  (e.g. title, heading, body, caption), with weights limited to regular,
  medium and semibold. Ad-hoc sizes and 800/900 weights are removed.
- FR-6. **Elevation.** At most one shadow, used only for floating layers.
  The heavy panel shadow is removed.
- FR-7. **Focus.** One consistent, clearly visible focus indicator using the
  accent.

### Reader typography (iA Writer-like)

- FR-8. The Reader uses:
  - iA Writer Quattro for Latin text (SIL OFL 1.1, self-hosted);
  - Noto Sans JP / SC for Japanese and Chinese, weight-matched and
    self-hosted;
  - a warm "paper" surface in light mode and a matching soft dark surface;
  - generous line height and a comfortable line length;
  - almost no chrome.
- FR-9. Fonts are defined through an extensible font registry, so more
  reading fonts can be added and made user-selectable later without
  restructuring. This spec ships one entry.

### Canonical component set

- FR-10. Exactly one canonical component exists for each of the following,
  each with one documented design and a small set of variants:
  - Button (primary, secondary, ghost, destructive; a fixed size scale);
  - IconButton;
  - Card/Panel (one flat style);
  - Input, Textarea, Select;
  - Tabs (page navigation);
  - Segmented control (value picking);
  - Switch, Slider, Checkbox;
  - ListRow (hairline-divided rows with a tonal hover);
  - Badge/Chip (neutral plus word-status variants);
  - Dialog, Sheet, Popover, DropdownMenu (one floating material);
  - Toast;
  - Table;
  - the settings primitives (SettingSection, SettingRow);
  - the text styles.
- FR-11. Every screen uses only the canonical components. All duplicate
  implementations are migrated and deleted:
  - legacy button, panel, tab, input, popup and table classes;
  - per-feature copies of shared rules;
  - raw `<button>`, `<input>`, `<select>`, `<textarea>`, `<table>` in
    feature code, unless a documented exception applies (for example, test
    hooks that need a native `<select>`).
- FR-12. A style-guide page (development or internal use) renders every
  canonical component and variant once, in light and dark, for review and
  visual checks.

### Rules and enforcement

- FR-13. AGENTS.md and CONTRACTS.md state binding rules:
  - Always use an existing canonical component.
  - Never create a new implementation of something a canonical component
    already covers.
  - A new component may be added only when no canonical component fits the
    need. The agent must then:
    - justify it;
    - design it consistently with the existing set (tokens, radii, type,
      states, materials);
    - add it to the canonical set and the style guide;
    - document it.
  - The outdated "legacy classes work unchanged" guidance is removed.
- FR-14. Automated checks enforce the rules in CI and locally:
  - lint rules ban raw interactive and form elements in feature code
    (outside documented exceptions);
  - they ban banned utilities and values (heavy shadows, 800/900 weights,
    off-scale radii);
  - they ban styling outside the token system (style-lint rules for feature
    CSS).

## Non-Functional Requirements

- NFR-1. Behaviour parity: no functional or behavioural change. All
  Playwright specs pass, and test hooks (ids, data-*, ARIA) are preserved.
  Spec edits are allowed only where markup necessarily changes, asserting
  the same behaviour, and each is listed.
- NFR-2. Accessibility: WCAG AA contrast for all text and controls in both
  themes, including over glass. Focus is always visible. Glass and motion
  respect reduced transparency and reduced motion.
- NFR-3. Mobile parity (≤760px) for every change.
- NFR-4. Localisation: no hard-coded strings; any new strings are added in
  ja, en and zh.
- NFR-5. Security and CSP: fonts and all assets are self-hosted. No
  third-party origins.
- NFR-6. Performance: fonts load without layout shift where feasible
  (font-display strategy, subsetting or unicode-range for CJK). Glass blur
  doesn't noticeably degrade scrolling or animation.

## Data & Interfaces

- No API or database changes.
- **Design tokens:** colour, surface, border, radius, type, elevation, glass
  material and focus tokens, in light and dark.
- **The canonical component set and style guide.**
- **The font registry:** reading-font entries with Latin and CJK faces.

## Affected Areas of the Codebase

- `frontend/src/styles/**`: tokens (theme.css, shadcn.css), base, and
  removal of legacy component CSS.
- `frontend/src/components/ui/**` and `components/app/**`: canonical
  components and variants.
- Every `frontend/src/features/**`: migration to canonical components and
  removal of feature CSS duplicates.
- The Reader's typography and surfaces, and the font assets.
- `frontend/eslint.config.*` and a style-lint config: enforcement.
- AGENTS.md and `frontend/src/CONTRACTS.md`: binding rules.
- `tests/smoke/**`: hook-preserving edits only, if any.

## Constraints & Assumptions

- **Sequencing:** implementation starts after SPEC-004 (Library and Reader)
  is merged, so it standardises the final Library and Reader screens rather
  than conflicting with in-flight work.
- **Decided by the user:**
  - neutral minimal base;
  - glass only for chrome and floating layers;
  - an iA Writer-like Reader using iA Writer Quattro plus Noto JP/SC;
  - an almost monochrome palette with a subtle light-blue / blue-teal
    accent;
  - fonts extensible and selectable later.
- **Assumption:** iA Writer Quattro is used unmodified under its Reserved
  Font Name ("iA Writer"), as OFL requires.
- **Constraint:** some controls must stay native `<select>` for test hooks
  (CONTRACTS.md). These are documented exceptions.

## Acceptance Criteria

- [ ] There are no content-panel shadows, nested bordered boxes, 800/900
      weights or off-scale radii anywhere (verified by the lint rules and
      the style guide).
- [ ] The palette is neutral with one subtle blue-teal accent, used only for
      primary actions, links, focus and active states, in light and dark.
- [ ] Glass appears only on the navigation bar, Reader controls and Aa
      panel, popovers, menus, dialogs, sheets and toasts. It is legible
      everywhere and has a solid fallback with reduced transparency.
- [ ] The Reader uses iA Writer Quattro and Noto JP/SC on a paper or soft
      dark surface, with no chrome beyond its controls, and fonts are
      registered through the extensible registry.
- [ ] Every screen uses only canonical components. All listed duplicates
      and legacy classes are deleted. Raw form and interactive elements in
      features are gone except documented exceptions.
- [ ] The style guide renders every canonical component and variant in
      light and dark.
- [ ] Lint and style-lint enforce the rules in CI, and a deliberate
      violation fails the check.
- [ ] AGENTS.md and CONTRACTS.md contain the binding "canonical components
      only; new ones only when nothing fits, designed consistently" rules.
- [ ] Every Playwright spec passes; behaviour, hooks, mobile layouts, ja/en/zh
      and accessibility (AA) hold.

## Open Questions

None blocking. Exact token values (accent hue and lightness, radius scale,
type scale, glass blur and opacity) are design choices for implementation,
reviewed through the style guide. The user approves them before the screen
migrations.

## Out of Scope for This Spec

Implementation strategy, exact token values, component internals,
sequencing of screen migrations and the task breakdown. These belong to
issueization.
