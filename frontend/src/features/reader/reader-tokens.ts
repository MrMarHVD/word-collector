/**
 * Pure token layout for the reader page (ported from views/reader.js). A page
 * is laid out either as a flat run of tokens (legacy materials, PDF, TXT) or,
 * when structured EPUB tokens are present, as block elements (headings,
 * paragraphs, blockquotes, list items grouped into lists). Each block holds
 * token parts and the literal text between them. The same model drives the
 * React renderer and the HTML used to measure "fit to page".
 */

import type { ReaderToken, WordStatus } from "@/lib/api/types";

export type ReaderBlockTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "blockquote" | "li";

/** Literal text between tokens, or one token. */
export type ReaderPart = { kind: "text"; text: string } | { kind: "token"; token: ReaderToken };

export interface ReaderBlock {
  kind: "block";
  key: string;
  tag: ReaderBlockTag;
  className: string;
  parts: ReaderPart[];
}

export interface ReaderList {
  kind: "list";
  key: string;
  items: ReaderBlock[];
}

/** The laid-out page: a flat run of parts, or blocks with consecutive list items wrapped in lists. */
export type ReaderLayout = { kind: "flat"; parts: ReaderPart[] } | { kind: "blocks"; nodes: (ReaderBlock | ReaderList)[] };

const WORD_STATUSES: WordStatus[] = ["unknown", "learning", "known"];

/** Block styles: even rhythm in the reading font; headings are 600 at most and only slightly larger, as in iA Writer. */
const HEADING = "font-semibold leading-[1.35] text-main";

const BLOCK_WRAPPERS: Record<string, { tag: ReaderBlockTag; className: string }> = {
  "heading-1": { tag: "h1", className: `${HEADING} mt-[1.6em] mb-[0.6em] text-[1.5em]` },
  "heading-2": { tag: "h2", className: `${HEADING} mt-[1.4em] mb-[0.5em] text-[1.3em]` },
  "heading-3": { tag: "h3", className: `${HEADING} mt-[1.2em] mb-[0.45em] text-[1.15em]` },
  "heading-4": { tag: "h4", className: `${HEADING} mt-[1.1em] mb-[0.4em] text-[1.08em]` },
  "heading-5": { tag: "h5", className: `${HEADING} mt-[1em] mb-[0.35em]` },
  "heading-6": { tag: "h6", className: `${HEADING} mt-[1em] mb-[0.35em] text-label` },
  paragraph: { tag: "p", className: "my-[0.8em]" },
  blockquote: { tag: "blockquote", className: "my-[0.8em] border-l border-line-strong pl-[1em] text-label" },
  "list-item": { tag: "li", className: "my-[0.25em] list-item" }
};

/** The unordered list wrapped around consecutive list items. */
export const READER_LIST_CLASS = "my-[0.8em] list-disc pl-[1.5em]";

/**
 * Word button: the reader's one raw button (a word of running text, not a UI control, and
 * hundreds per page). `reader-token` is the hook the gestures and specs find words by; the
 * rest is the layout-affecting box, shared with the fit probe's markup.
 */
export const READER_TOKEN_CLASS = "reader-token cursor-pointer rounded-control-sm px-0.5 py-px box-decoration-clone";

/**
 * Highlight of one word: the selection tint wins over the status tint, and hovering previews the selection.
 * A status is a calm underline (solid amber for unknown, dotted blue for learning) over a faint tint, both
 * scaled from --readerHighlightOpacity (default 0.2), so words never read as a mosaic of tiles.
 */
export function readerTokenHighlightClass(status: string, selected: boolean, segmentSelected: boolean): string {
  if (segmentSelected) {
    return "is-segment-selected bg-[var(--reader-token-selected)] outline-1 outline-primary/40";
  }
  if (selected) {
    return "is-selected bg-[var(--reader-token-selected)]";
  }
  if (status === "unknown") {
    return "bg-[rgb(var(--reader-token-unknown-rgb)/calc(var(--readerHighlightOpacity,0.2)*0.4))] underline decoration-[rgb(var(--reader-token-unknown-rgb)/calc(var(--readerHighlightOpacity,0.2)*3))] decoration-2 underline-offset-[5px] hover:bg-[var(--reader-token-selected)]";
  }
  if (status === "learning") {
    return "bg-[rgb(var(--reader-token-learning-rgb)/calc(var(--readerHighlightOpacity,0.2)*0.4))] underline decoration-dotted decoration-[rgb(var(--reader-token-learning-rgb)/calc(var(--readerHighlightOpacity,0.2)*3))] decoration-2 underline-offset-[5px] hover:bg-[var(--reader-token-selected)]";
  }
  return "hover:bg-[var(--reader-token-selected)]";
}

/** A stored status, or "unknown" for anything unrecognised (shared/status.js). */
export function normalizeStatus(value: string | null | undefined): WordStatus {
  return WORD_STATUSES.includes(value as WordStatus) ? (value as WordStatus) : "unknown";
}

/** The status rendered as a token's data-status (the raw value, as in the legacy markup). */
export function tokenDataStatus(token: ReaderToken): string {
  return token.status || "unknown";
}

/** Whether a language is written without spaces between words, so the "show word spaces" option applies. */
export function isWordSpacingLanguage(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return lower === "japanese" || lower === "chinese" || name === "日本語" || name === "中文";
}

function hasGaps(token: ReaderToken): boolean {
  return token.leadingText !== null && token.leadingText !== undefined && token.trailingText !== null && token.trailingText !== undefined;
}

function pushText(parts: ReaderPart[], text: string) {
  if (text) {
    parts.push({ kind: "text", text });
  }
}

/**
 * Appends one token with its literal surrounding text. Falls back to the
 * separator when the leading/trailing fields are absent (legacy tokens). With
 * the CJK "show word spaces" option on, a single space is injected wherever no
 * other text sits between adjacent tokens.
 */
function pushTokenWithGaps(parts: ReaderPart[], token: ReaderToken, fallbackSeparator: string, isFirstInGroup: boolean, showSpacesForCjk: boolean) {
  if (!hasGaps(token)) {
    pushText(parts, isFirstInGroup ? "" : fallbackSeparator);
    parts.push({ kind: "token", token });
    return;
  }
  pushText(parts, isFirstInGroup ? (token.leadingText ?? "") : "");
  parts.push({ kind: "token", token });
  pushText(parts, showSpacesForCjk && !token.trailingText ? " " : (token.trailingText ?? ""));
}

/** Lays out a page of tokens for the material's language and the "show word spaces" preference. */
export function layoutReaderTokens(tokens: ReaderToken[], languageName: string | null | undefined, showWordSpaces: boolean): ReaderLayout {
  if (!tokens.length) {
    return { kind: "flat", parts: [] };
  }
  const cjk = isWordSpacingLanguage(languageName);
  const fallbackSeparator = cjk && !showWordSpaces ? "" : " ";
  const showSpacesForCjk = cjk && showWordSpaces;

  if (tokens[0].blockIndex === null || tokens[0].blockIndex === undefined) {
    const parts: ReaderPart[] = [];
    tokens.forEach((token, index) => pushTokenWithGaps(parts, token, cjk ? fallbackSeparator : "", index === 0, showSpacesForCjk));
    return { kind: "flat", parts };
  }

  const groups: { blockIndex: number | null; blockType: string | null; tokens: ReaderToken[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  for (const token of tokens) {
    if (!current || token.blockIndex !== current.blockIndex) {
      current = { blockIndex: token.blockIndex, blockType: token.blockType, tokens: [] };
      groups.push(current);
    }
    current.tokens.push(token);
  }

  const nodes: (ReaderBlock | ReaderList)[] = [];
  let list: ReaderList | null = null;
  for (const group of groups) {
    const wrapper = BLOCK_WRAPPERS[group.blockType ?? ""] ?? BLOCK_WRAPPERS.paragraph;
    const parts: ReaderPart[] = [];
    group.tokens.forEach((token, index) => pushTokenWithGaps(parts, token, fallbackSeparator, index === 0, showSpacesForCjk));
    const block: ReaderBlock = { kind: "block", key: `b${group.tokens[0].id}`, tag: wrapper.tag, className: wrapper.className, parts };
    if (group.blockType === "list-item") {
      if (!list) {
        list = { kind: "list", key: `l${group.tokens[0].id}`, items: [] };
        nodes.push(list);
      }
      list.items.push(block);
    } else {
      list = null;
      nodes.push(block);
    }
  }
  return { kind: "blocks", nodes };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function partsToHtml(parts: ReaderPart[]): string {
  return parts
    .map((part) =>
      part.kind === "text"
        ? escapeHtml(part.text)
        : `<button class="${READER_TOKEN_CLASS}" type="button" data-word-id="${part.token.wordId}" data-token-id="${part.token.id}" data-status="${escapeHtml(tokenDataStatus(part.token))}">${escapeHtml(part.token.surface)}</button>`
    )
    .join("");
}

function blockToHtml(block: ReaderBlock): string {
  return `<${block.tag} class="${block.className}">${partsToHtml(block.parts)}</${block.tag}>`;
}

/**
 * Serialises a layout to the same markup the React renderer produces. Used
 * only to measure how many tokens fit on the page, where building strings is
 * much cheaper than rendering components for every probe.
 */
export function readerLayoutToHtml(layout: ReaderLayout): string {
  if (layout.kind === "flat") {
    return partsToHtml(layout.parts);
  }
  return layout.nodes
    .map((node) => (node.kind === "list" ? `<ul class="${READER_LIST_CLASS}">${node.items.map(blockToHtml).join("")}</ul>` : blockToHtml(node)))
    .join("");
}
