# Backlog

Ideas and planned work not yet specified. Move items into a SPEC when they're
picked up.

## Dashboard

- **"Continue reading" element on the dashboard.** A card or button that
  goes straight to the user's most recently read work in the Reader,
  skipping the Library. It depends on SPEC-004 (Library and Reader).
  Suggested source: the last-read work for the current study language,
  showing its title and progress.

## Reader

- **Reading-font picker.** Let users choose the Reader font in the Aa panel,
  built on the font registry from SPEC-005. Initial font: iA Writer Quattro
  plus Noto JP/SC.

## Library (follow-ups to SPEC-004)

- **Bug: go-to highlight is clipped.** When arriving from the dashboard
  (`/library?focus=<id>`), the outline around the focused work row isn't
  fully visible; it's cut off by the surrounding list container (likely an
  overflow or clipping container). Fix after SPEC-005, e.g. with an inset
  outline or ring, or padding on the scroll container.

- **Filter button** in the Library header. SPEC-004 only reserves the space.
- **Display-mode button** in the Library header (cards vs list). SPEC-004
  only reserves the space.
