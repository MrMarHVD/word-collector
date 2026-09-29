import { describe, expect, it } from "vitest";
import { testToken as token } from "./test-token";
import { isWordSpacingLanguage, layoutReaderTokens, normalizeStatus, readerLayoutToHtml, tokenDataStatus } from "./reader-tokens";

function text(layout: ReturnType<typeof layoutReaderTokens>): string {
  return readerLayoutToHtml(layout).replace(/<button[^>]*>([^<]*)<\/button>/g, "[$1]");
}

describe("normalizeStatus / tokenDataStatus", () => {
  it("maps unknown values to unknown", () => {
    expect(normalizeStatus("learning")).toBe("learning");
    expect(normalizeStatus("bogus")).toBe("unknown");
    expect(normalizeStatus(null)).toBe("unknown");
  });

  it("renders the raw status, defaulting to unknown", () => {
    expect(tokenDataStatus(token("a", { status: "known" }))).toBe("known");
    expect(tokenDataStatus(token("a", { status: "" as never }))).toBe("unknown");
  });
});

describe("isWordSpacingLanguage", () => {
  it("covers Japanese and Chinese in English and native names", () => {
    expect(["Japanese", "chinese", "日本語", "中文"].map(isWordSpacingLanguage)).toEqual([true, true, true, true]);
    expect(isWordSpacingLanguage("Spanish")).toBe(false);
    expect(isWordSpacingLanguage(null)).toBe(false);
  });
});

describe("layoutReaderTokens", () => {
  it("renders nothing for an empty page", () => {
    expect(readerLayoutToHtml(layoutReaderTokens([], "Japanese", false))).toBe("");
  });

  it("keeps the literal gaps around tokens, with the leading text only on the first token", () => {
    const tokens = [token("Hola", { leadingText: "¡", trailingText: " " }), token("mundo", { leadingText: "ignored", trailingText: "!" })];
    expect(text(layoutReaderTokens(tokens, "Spanish", false))).toBe("¡[Hola] [mundo]!");
  });

  it("joins legacy tokens without gaps: no separator for spaced languages, a space for CJK with word spaces on", () => {
    const tokens = () => [token("a"), token("b")];
    expect(text(layoutReaderTokens(tokens(), "Spanish", false))).toBe("[a][b]");
    expect(text(layoutReaderTokens(tokens(), "Japanese", false))).toBe("[a][b]");
    expect(text(layoutReaderTokens(tokens(), "Japanese", true))).toBe("[a] [b]");
  });

  it("injects a space between CJK tokens with no text between them when word spaces are shown", () => {
    const tokens = () => [token("私", { leadingText: "", trailingText: "" }), token("は", { leadingText: "", trailingText: "。" })];
    expect(text(layoutReaderTokens(tokens(), "Japanese", false))).toBe("[私][は]。");
    expect(text(layoutReaderTokens(tokens(), "Japanese", true))).toBe("[私] [は]。");
  });

  it("wraps structured tokens in blocks and consecutive list items in one list", () => {
    const gap = { leadingText: "", trailingText: "" };
    const tokens = [
      token("Title", { ...gap, blockIndex: 0, blockType: "heading-1" }),
      token("One", { ...gap, blockIndex: 1, blockType: "list-item" }),
      token("Two", { ...gap, blockIndex: 2, blockType: "list-item" }),
      token("Body", { ...gap, blockIndex: 3, blockType: "unknown-type" })
    ];
    expect(text(layoutReaderTokens(tokens, "Spanish", false))).toBe(
      '<h1 class="reader-block reader-heading reader-heading-1">[Title]</h1>' +
        '<ul class="reader-list"><li class="reader-block reader-list-item">[One]</li><li class="reader-block reader-list-item">[Two]</li></ul>' +
        '<p class="reader-block reader-paragraph">[Body]</p>'
    );
  });

  it("serialises tokens with the legacy button markup, escaped", () => {
    const tokenValue = token("<b>", { status: "learning", leadingText: "", trailingText: "&" });
    expect(readerLayoutToHtml(layoutReaderTokens([tokenValue], "Spanish", false))).toBe(
      `<button class="reader-token" type="button" data-word-id="${tokenValue.wordId}" data-token-id="${tokenValue.id}" data-status="learning">&lt;b&gt;</button>&amp;`
    );
  });
});
