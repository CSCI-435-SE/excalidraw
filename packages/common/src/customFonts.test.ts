import {
  CUSTOM_FONT_FAMILY_ID_START,
  FONT_FAMILY,
  FONT_FAMILY_FALLBACKS,
  getFontFamilyString,
  getFontString,
  isCustomFontFamily,
} from "@excalidraw/common";

describe("custom font families (#140)", () => {
  describe("isCustomFontFamily()", () => {
    it("rejects every built-in and fallback font id", () => {
      for (const id of [
        ...Object.values(FONT_FAMILY),
        ...Object.values(FONT_FAMILY_FALLBACKS),
      ]) {
        expect(isCustomFontFamily(id)).toBe(false);
      }
    });

    it("accepts ids from the custom range start upwards", () => {
      expect(isCustomFontFamily(CUSTOM_FONT_FAMILY_ID_START)).toBe(true);
      expect(isCustomFontFamily(CUSTOM_FONT_FAMILY_ID_START + 12345)).toBe(
        true,
      );
    });

    it("rejects non-integer and non-finite values", () => {
      expect(isCustomFontFamily(CUSTOM_FONT_FAMILY_ID_START + 0.5)).toBe(false);
      expect(isCustomFontFamily(Infinity)).toBe(false);
      expect(isCustomFontFamily(NaN)).toBe(false);
    });
  });

  describe("getFontFamilyString()", () => {
    it("maps custom ids to their CSS family name followed by fallbacks", () => {
      expect(getFontFamilyString({ fontFamily: 2007 })).toBe(
        "ExcalidrawCustomFont-2007, sans-serif, Segoe UI Emoji",
      );
    });

    it("leaves built-in font strings unchanged", () => {
      expect(getFontFamilyString({ fontFamily: FONT_FAMILY.Nunito })).toBe(
        "Nunito, sans-serif, Segoe UI Emoji",
      );
    });

    it("includes the custom family in getFontString()", () => {
      expect(getFontString({ fontSize: 20, fontFamily: 2000 })).toBe(
        "20px ExcalidrawCustomFont-2000, sans-serif, Segoe UI Emoji",
      );
    });
  });
});
