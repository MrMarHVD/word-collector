# SPEC-002: Reader Sentence Translation (Japanese → English)

## Context

The reader currently offers only word-level lookups: tapping a token opens the
word-info popup (`renderReaderWordInfo` in `frontend/public/js/views/reader.js`),
backed by dictionary sources (JMdict, CEDICT, WikDict). There is no machine
translation of longer segments.

Pressing and holding a token opens the radial quick menu
(`readerConvenienceMenu`, `startReaderConveniencePress` in
`frontend/public/js/features/reader/reader.controller.js`), from which the user
slides to a quick action.

This spec introduces sentence/segment translation: the user drag-selects a run
of words and receives a real-time machine translation in a popup. The feature is
scoped to Japanese materials read by users whose native language is English.
All other language combinations keep the existing quick-menu behaviour
unchanged.

A technology evaluation was carried out before this spec. On the four sample
paragraphs, Mozilla's Bergamot engine (the one behind Firefox Translations)
clearly outperformed Argos: no garbled tokens and no dropped clauses. Mozilla's
published benchmark scores put Bergamot close to Microsoft and Google on ja→en.

Bergamot runs entirely in the user's browser. That makes translation free,
unlimited and private, and needs no vendor account. Translations are throwaway
and are not stored.

## Goals

- Let a Japanese-studying, English-native user translate any selected segment
  of a Japanese text into English without leaving the reader.
- Show the translation immediately after selection ends, without hiding the
  selected text.
- Work on desktop and mobile in all current mainstream browsers.
- Leave other language combinations' reader behaviour exactly as it is today.
- Shape the translation popup so that word-to-word correspondence can be added
  later without redesigning it.

## Non-Goals

- Translation for any language pair other than Japanese → English.
- Word-to-word alignment highlighting between original and translation. This is
  a future extension; the UI must only leave room for it (see FR-16).
- Persisting translations, translation history, or any database changes.
- Server-side or third-party translation services.
- Changes to the word-info popup's content or to dictionary lookups.
- Changes to the quick menu for non-Japanese→English combinations.

## Functional Requirements

### Eligibility

- FR-1. Sentence translation must be active only when the open material's
  language is Japanese and the signed-in user's native language is English.
- FR-2. For every other combination of material language and native language,
  the reader must behave exactly as it does today, including the radial quick
  menu.
- FR-3. When sentence translation is active, the radial quick menu must not
  appear. Drag-selection replaces its press-and-hold gesture.

### Selection

- FR-4. On desktop, the user must be able to press on a word and drag across
  the text to select a contiguous run of words, as when highlighting text.
- FR-5. On touch devices, the user must be able to start a selection with a
  press-and-hold on a word and then drag to extend it. Ordinary taps, scrolling
  and page-turn swipes must keep working when no selection is in progress.
- FR-6. The words in the current selection must be visibly highlighted while
  dragging.
- FR-7. Selection may span across punctuation and across block boundaries
  (paragraphs, headings, list items) within the visible page.
- FR-8. A drag-selection must not also open the word-info popup, turn the page
  or mark a word. A single tap on a word without dragging must still open the
  word-info popup as today.

### Translation

- FR-9. When the user releases the pointer after selecting, the selected
  segment must be translated automatically, with no further action required.
- FR-10. The text sent for translation must be the exact original source text
  of the selected words, including their internal punctuation. It must not be
  affected by reader display settings such as "show word spaces".
- FR-11. Translation must happen on the user's device. The selected text must
  not be sent to any server.

### Translation popup

- FR-12. When a selection is released, a translation popup must open showing
  the original selected text at the top and the English translation below it.
- FR-13. The popup must not cover the selected text.
  - Desktop: it is positioned beside the selection.
  - Mobile: it is a bottom sheet, and the selection is kept visible above it.
- FR-14. The popup must show distinct states:
  - loading the translation model for the first time, with progress where
    available;
  - translating;
  - translation shown;
  - error, with a human-readable message.
- FR-15. The popup must have a close (×) control. Closing it must dismiss the
  popup and clear the selection highlight. Pressing Escape must also close it
  on desktop.
- FR-16. The original text in the popup must be presented word by word, with
  each word individually addressable, so that a later extension can link each
  original word to the corresponding translated word(s).
- FR-17. The translation popup and the word-info popup must not be open at the
  same time. Opening either closes the other.
- FR-18. Starting a new selection while the popup is open must replace its
  content with the new selection's translation.

## Non-Functional Requirements

- NFR-1. Compatibility: must work in current Chrome, Edge, Firefox and Safari
  on desktop, and in Safari (iOS 16.4+) and Chrome on mobile.
- NFR-2. Performance:
  - Once the model is loaded, a typical sentence should be translated in under
    one second on mid-range mobile hardware and noticeably faster on desktop.
  - The model must not be downloaded until the user first makes a selection.
  - The model must not be downloaded again on subsequent visits, unless it has
    been evicted from the browser's cache.
- NFR-3. Download size: the one-time model download (about 55 MB) must be
  cached by the browser so it is paid only once.
- NFR-4. Privacy: selected text never leaves the device (see FR-11).
- NFR-5. Security: the production security policy may be relaxed only as far
  as needed to run the translation engine. No third-party script origins may
  be added.
- NFR-6. Localisation: every new user-facing string must exist in the `ja`,
  `en` and `zh` locales in `frontend/public/locales.json`, as AGENTS.md
  requires.
- NFR-7. Accessibility: the popup must be dismissible by keyboard and its
  close control must have an accessible label.
- NFR-8. Mobile parity: the mobile layout and behaviour must ship together
  with desktop, as AGENTS.md requires.

## Data & Interfaces

- **No database changes.** No new tables, columns or migrations.
- **No new API endpoints.**
- **Translation result, as seen by the UI:**
  - the original source text;
  - the original presented as a sequence of words;
  - the translated text;
  - a word-correspondence field, empty in this spec and reserved for the
    future alignment extension.
- **Static assets:** the translation engine and the Japanese→English model
  files must be served by the application's own origin in development and
  production. The model files are not committed to the repository.
- **UI surfaces:**
  - a new translation popup in the reader;
  - a selection highlight state on reader tokens.

## Affected Areas of the Codebase

- `frontend/public/js/features/reader/reader.controller.js`: pointer, touch and
  click handling, the quick-menu gesture, page-turn swipe and click suppression.
- `frontend/public/js/views/reader.js`: token rendering and popup rendering and
  positioning (the word-info popup is the reference pattern).
- `frontend/public/css/reader.css` and `frontend/public/css/responsive.css`:
  selection and popup styling, and the mobile bottom-sheet variant.
- `frontend/public/index.html`: popup container.
- `frontend/public/locales.json`: new strings.
- `backend/src/http/static.js` and `frontend/server.js`: serving the engine and
  model assets (content types, caching, large files).
- `backend/src/http/security.js`: security policy for running the engine.
- `.gitignore` and deployment (`.github/workflows/deploy-dev.yml`): keeping
  model files out of git while making them available on the server.
- `tests/`: Playwright coverage for the new flow.

## Constraints & Assumptions

- **Decided:**
  - The translation engine is Mozilla Bergamot with Mozilla's Japanese→English
    model, running client-side.
  - The chosen model version is fixed rather than tracking updates.
- **Assumption:** reader tokens (`state.readerTokens`) carry enough data
  (surface plus leading and trailing gap text) to reconstruct the original
  source text of a selection. Legacy materials without gap data may produce
  slightly altered source text; that is acceptable.
- **Assumption:** there are no sentence boundaries in reader data
  (`sentence_index` is always 0), so the selection is exactly what the user
  dragged over, with no snapping to sentences.
- **Assumption:** browser support for the engine has only been verified in
  Chromium. Safari, Firefox and real mobile devices must be confirmed during
  implementation. If a mainstream browser cannot run the engine, NFR-1 must be
  revisited.
- **Constraint:** Mozilla's model CDN does not allow the files to be fetched
  directly by a browser from another site. The files must be served by this
  application.
- **Constraint:** deploy does not sync untracked files. Model files must be
  placed on the server by a separate, repeatable step.

## Acceptance Criteria

- [ ] With a Japanese material and an English-native user, dragging across
      several words highlights them. On release, a popup shows the original
      text on top and an English translation below.
- [ ] The popup does not cover the selected text on desktop or mobile.
- [ ] The × button, and Escape on desktop, close the popup and clear the
      highlight.
- [ ] A single tap on a word still opens the word-info popup. A drag never
      does.
- [ ] On mobile, normal scrolling and page-turn swipes still work.
      Press-and-hold then drag selects text.
- [ ] With any other material language or native language, the radial quick
      menu works exactly as before and no drag-selection translation occurs.
- [ ] The first translation shows a model-loading state. After a page reload,
      the model is not downloaded again.
- [ ] No request containing the selected text is sent to any server.
- [ ] Works in production under the app's security policy, not only in
      development.
- [ ] All new strings appear correctly in the Japanese, English and Chinese UI.
- [ ] Automated end-to-end tests cover the selection-to-translation flow at
      desktop and mobile viewport sizes.

## Open Questions

Resolved at issueization (2026-09-29), with these defaults accepted:
1. No alternative location for the quick actions.
2. A selection must span at least 2 words.
3. Selection is limited to the visible page.
4. Unsupported browsers see an error in the popup.

1. **Quick-menu actions in Japanese→English:** removing the quick menu for
   this combination also removes its quick actions there. Must those actions
   stay reachable another way, for example from the word-info popup, or is
   losing them acceptable?
2. **Minimum selection:** should dragging within or across a single word
   trigger translation, or must a selection include at least two words?
3. **Selection limit:** should there be a maximum selection length, for
   example one visible page, or a character cap to keep translation fast on
   mobile?
4. **Unavailable engine:** what should happen on a browser or device that
   cannot run the translation engine? Options include an error in the popup,
   falling back to the quick menu, or hiding the feature.

## Out of Scope for This Spec

Implementation strategy, file and module layout, how the engine is vendored,
the model distribution mechanism, gesture algorithms and task breakdown. These
belong to the implementation planning / issueization step.
