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

const BLOCK_WRAPPERS: Record<string, { tag: ReaderBlockTag; className: string }> = {
  "heading-1": { tag: "h1", className: "reader-block reader-heading reader-heading-1" },
  "heading-2": { tag: "h2", className: "reader-block reader-heading reader-heading-2" },
  "heading-3": { tag: "h3", className: "reader-block reader-heading reader-heading-3" },
  "heading-4": { tag: "h4", className: "reader-block reader-heading reader-heading-4" },
  "heading-5": { tag: "h5", className: "reader-block reader-heading reader-heading-5" },
  "heading-6": { tag: "h6", className: "reader-block reader-heading reader-heading-6" },
  paragraph: { tag: "p", className: "reader-block reader-paragraph" },
  blockquote: { tag: "blockquote", className: "reader-block reader-blockquote" },
  "list-item": { tag: "li", className: "reader-block reader-list-item" }
};

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
        : `<button class="reader-token" type="button" data-word-id="${part.token.wordId}" data-token-id="${part.token.id}" data-status="${escapeHtml(tokenDataStatus(part.token))}">${escapeHtml(part.token.surface)}</button>`
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
    .map((node) => (node.kind === "list" ? `<ul class="reader-list">${node.items.map(blockToHtml).join("")}</ul>` : blockToHtml(node)))
    .join("");
}
