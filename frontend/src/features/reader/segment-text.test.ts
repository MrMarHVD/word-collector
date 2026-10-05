import { describe, expect, it } from "vitest";
import { isSegmentTranslationEligible, segmentSourcePieces, segmentSourceText, segmentWords } from "./segment-text";
import { testToken } from "./test-token";

describe("isSegmentTranslationEligible", () => {
  it("applies only to Japanese or Chinese material read by English natives, case-insensitively", () => {
    expect(isSegmentTranslationEligible({ languageName: "Japanese" }, { nativeLanguage: "English" })).toBe(true);
    expect(isSegmentTranslationEligible({ languageName: "JAPANESE" }, { nativeLanguage: "english" })).toBe(true);
    expect(isSegmentTranslationEligible({ languageName: "Japanese" }, { nativeLanguage: "Chinese" })).toBe(false);
    expect(isSegmentTranslationEligible({ languageName: "Chinese" }, { nativeLanguage: "English" })).toBe(true);
    expect(isSegmentTranslationEligible({ languageName: "chinese" }, { nativeLanguage: "ENGLISH" })).toBe(true);
    expect(isSegmentTranslationEligible({ languageName: "Chinese" }, { nativeLanguage: "Japanese" })).toBe(false);
    expect(isSegmentTranslationEligible({ languageName: "English" }, { nativeLanguage: "English" })).toBe(false);
    expect(isSegmentTranslationEligible(null, null)).toBe(false);
  });
});

describe("segment source text", () => {
  it("rebuilds Chinese text exactly, without injected spaces", () => {
    const words = segmentWords([
      testToken("我", { leadingText: "“", trailingText: "" }),
      testToken("喜欢", { leadingText: "", trailingText: "" }),
      testToken("学习", { leadingText: "", trailingText: "，" }),
      testToken("中文", { leadingText: "", trailingText: "。\n" })
    ]);
    expect(segmentSourceText(words)).toBe("我喜欢学习，中文。");
  });

  it("rebuilds the exact text from token gaps, trimming only the end", () => {
    const words = segmentWords([
      testToken("私", { leadingText: "「", trailingText: "" }),
      testToken("は", { leadingText: "", trailingText: "、" }),
      testToken("学生", { leadingText: "", trailingText: "です。\n\n" })
    ]);
    expect(segmentSourceText(words)).toBe("私は、学生です。");
  });

  it("keeps a block's leading text for words after the first and treats missing gaps as empty", () => {
    const words = segmentWords([testToken("終わり", { leadingText: null, trailingText: null }), testToken("次", { leadingText: "\n", trailingText: "。 " })]);
    expect(words[0]).toMatchObject({ leadingText: "", trailingText: "" });
    expect(segmentSourceText(words)).toBe("終わり\n次。");
  });

  it("splits into pieces that concatenate to the source text", () => {
    const tokens = [testToken("A", { leadingText: "x", trailingText: " " }), testToken("B", { leadingText: "y", trailingText: " " })];
    const words = segmentWords(tokens);
    expect(segmentSourcePieces(words)).toEqual([
      { leading: "", surface: "A", trailing: " " },
      { leading: "y", surface: "B", trailing: "" }
    ]);
    expect(words.map((word) => word.tokenId)).toEqual(tokens.map((token) => String(token.id)));
  });
});
