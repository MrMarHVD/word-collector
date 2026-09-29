import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("splits on the first delimiter found, keeping the rest of the line as the translation", () => {
    expect(parseCsv("犬,dog\n猫;cat\n鳥\tbird\n本,book, volume")).toEqual([
      { word: "犬", translation: "dog" },
      { word: "猫", translation: "cat" },
      { word: "鳥", translation: "bird" },
      { word: "本", translation: "book, volume" }
    ]);
  });

  it("falls back to the first whitespace gap", () => {
    expect(parseCsv("水  cold water")).toEqual([{ word: "水", translation: "cold water" }]);
  });

  it("trims lines, handles CRLF and drops incomplete rows", () => {
    expect(parseCsv("  山 , mountain \r\n\r\n川,\n,river\nlonely")).toEqual([{ word: "山", translation: "mountain" }]);
  });
});
