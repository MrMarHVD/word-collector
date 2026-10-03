# SPEC-005 Design System Standardisation — Issue Dependency Graph

```mermaid
graph TD
  DS-001[DS-001: Tokens, fonts, glass material, style-guide skeleton]
  DS-002[DS-002: Canonical component set + full style guide + rules doc]
  DS-003[DS-003: Shell, navigation, auth/welcome]
  DS-004[DS-004: Dashboard]
  DS-005[DS-005: Vocab/collections]
  DS-006[DS-006: Library + categories]
  DS-007[DS-007: Reader — iA typography, glass controls/Aa, popups]
  DS-008[DS-008: Practice]
  DS-009[DS-009: Settings]
  DS-010[DS-010: Admin]
  DS-011[DS-011: Legacy CSS removal, lint enforcement, docs, full suite]
  DS-001 --> DS-002
  DS-002 --> DS-003
  DS-002 --> DS-004
  DS-002 --> DS-005
  DS-002 --> DS-006
  DS-002 --> DS-007
  DS-002 --> DS-008
  DS-002 --> DS-009
  DS-002 --> DS-010
  DS-003 --> DS-011
  DS-004 --> DS-011
  DS-005 --> DS-011
  DS-006 --> DS-011
  DS-007 --> DS-011
  DS-008 --> DS-011
  DS-009 --> DS-011
  DS-010 --> DS-011
```

## Legend

- **Slicing:** nodes are layer and area slices (not vertical), by user
  decision.
- **Arrows:** `A --> B` means B needs A merged first.
- **User approval gate:** after DS-002, the user reviews and approves the
  look on /styleguide before DS-003..010 start.
- **Contracts:** D1 (design tokens and fonts), D2 (canonical component
  catalogue) and D3 (migration rules) are copied verbatim into the issues
  that use them and documented in CONTRACTS.md.
- **Parallel work:** DS-003..010 run in parallel. Each owns only its area's
  folders (DS-003 owns the AppShell consumer markup and shell.css) and must
  not edit components/ui, components/app internals or styles/. The only
  shared files are listed hook-preserving spec edits per area and rare
  locale additions, which merge-therapist handles.
- **Sequencing:** SPEC-005 starts after SPEC-004 (Library and Reader) is
  merged.
