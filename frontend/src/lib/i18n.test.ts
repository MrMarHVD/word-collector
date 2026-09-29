import { afterEach, describe, expect, it } from "vitest";
import { messages, t, translate, type Messages } from "./i18n";
import { LOCALES, useLocaleStore } from "@/stores/locale";

const catalog: Messages = {
  ja: { greeting: "こんにちは {name}", onlyJa: "日本語のみ", empty: "日本語" },
  en: { greeting: "Hello {name}, {name}!", count: "{count} words", empty: "" },
  zh: {}
};

describe("translate", () => {
  it("interpolates every {name} occurrence", () => {
    expect(translate(catalog, "en", "greeting", { name: "Ann" })).toBe("Hello Ann, Ann!");
    expect(translate(catalog, "en", "count", { count: 3 })).toBe("3 words");
  });

  it("falls back to Japanese, then the fallback, then the key", () => {
    expect(translate(catalog, "en", "onlyJa")).toBe("日本語のみ");
    expect(translate(catalog, "zh", "missing", {}, "Fallback")).toBe("Fallback");
    expect(translate(catalog, "zh", "missing")).toBe("missing");
  });

  it("treats an empty message as missing", () => {
    expect(translate(catalog, "en", "empty")).toBe("日本語");
  });

  it("falls back to Japanese for an unknown locale", () => {
    expect(translate(catalog, "fr", "greeting", { name: "A" })).toBe("こんにちは A");
  });
});

describe("t", () => {
  afterEach(() => useLocaleStore.setState({ locale: "en" }));

  it("uses the active locale", () => {
    useLocaleStore.setState({ locale: "ja" });
    expect(t("common.cancel")).toBe("キャンセル");
    useLocaleStore.setState({ locale: "en" });
    expect(t("common.cancel")).toBe("Cancel");
  });
});

describe("locales.json", () => {
  it("has the generic common.* keys in every locale", () => {
    const required = ["common.confirm", "common.cancel", "common.delete", "common.save", "common.close", "common.saved", "common.error"];
    for (const locale of LOCALES) {
      for (const key of required) {
        expect(messages[locale]?.[key], `${locale} ${key}`).toBeTruthy();
      }
    }
  });

  it("defines the same keys in ja, en and zh", () => {
    const keys = (locale: string) => Object.keys(messages[locale] ?? {}).sort();
    expect(keys("en")).toEqual(keys("ja"));
    expect(keys("zh")).toEqual(keys("ja"));
  });
});
