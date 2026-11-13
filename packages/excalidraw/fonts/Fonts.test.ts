import { FONT_FAMILY } from "@excalidraw/common";

import { API } from "../tests/helpers/api";

import { Fonts } from "./Fonts";

import type { CustomFontData, DataURL } from "../types";

const DATA_URL = "data:font/woff2;base64,d09GMgABAAAAAA==";

const font = ({
  dataURL = DATA_URL,
  ...rest
}: Pick<CustomFontData, "id" | "name"> &
  Partial<Omit<CustomFontData, "dataURL">> & {
    dataURL?: string;
  }): CustomFontData => ({
  mimeType: "font/woff2",
  licenseAcknowledged: true,
  created: 0,
  ...rest,
  dataURL: dataURL as DataURL,
});

describe("Fonts custom font registry (#140)", () => {
  const deleteSpy = vi.fn();

  beforeAll(() => {
    // the jsdom `document.fonts` mock from setupTests.ts has no `delete`
    Object.assign(window.document.fonts, { delete: deleteSpy });
  });

  afterEach(() => {
    // the registry is static, so make sure no test leaks into another
    for (const id of [2000, 2007, 2042]) {
      Fonts.unregisterCustomFont(id);
    }
    Fonts.loadedFontsCache.clear();
    deleteSpy.mockClear();
  });

  describe("registerCustomFont()", () => {
    it("adds the font under its id, labelled with the user-facing name", () => {
      expect(
        Fonts.registerCustomFont(
          font({
            id: 2007,
            name: "My Font",
            dataURL: DATA_URL,
          }),
        ),
      ).toBe(true);

      const registered = Fonts.registered.get(2007);
      expect(registered?.metadata.custom).toEqual({ name: "My Font" });
      expect(registered?.fontFaces).toHaveLength(1);
      expect(registered?.fontFaces[0].fontFace.family).toBe(
        "ExcalidrawCustomFont-2007",
      );
      expect(registered?.fontFaces[0].urls).toEqual([DATA_URL]);
    });

    it("adds the font face to document.fonts once, so it renders without a scene reload", () => {
      const addSpy = vi.mocked(window.document.fonts.add);
      addSpy.mockClear();

      Fonts.registerCustomFont(
        font({ id: 2007, name: "A", dataURL: DATA_URL }),
      );
      Fonts.registerCustomFont(
        font({ id: 2007, name: "A", dataURL: DATA_URL }),
      );

      expect(addSpy).toHaveBeenCalledTimes(1);
      expect(addSpy).toHaveBeenCalledWith(
        Fonts.registered.get(2007)!.fontFaces[0].fontFace,
      );
    });

    it("uses Excalifont metrics for custom fonts", () => {
      Fonts.registerCustomFont(
        font({ id: 2007, name: "A", dataURL: DATA_URL }),
      );

      expect(Fonts.registered.get(2007)?.metadata.metrics).toEqual({
        unitsPerEm: 1000,
        ascender: 886,
        descender: -374,
        lineHeight: 1.25,
      });
    });

    it("is a no-op when the id is already registered", () => {
      Fonts.registerCustomFont(
        font({ id: 2007, name: "First", dataURL: DATA_URL }),
      );

      expect(
        Fonts.registerCustomFont(
          font({
            id: 2007,
            name: "Second",
            dataURL: "data:font/woff2;base64,AAAA",
          }),
        ),
      ).toBe(false);
      expect(Fonts.registered.get(2007)?.metadata.custom).toEqual({
        name: "First",
      });
    });

    it("accepts the first id of the custom range", () => {
      expect(
        Fonts.registerCustomFont(
          font({ id: 2000, name: "A", dataURL: DATA_URL }),
        ),
      ).toBe(true);
    });

    it("rejects ids outside the custom range without touching built-ins", () => {
      expect(() =>
        Fonts.registerCustomFont(
          font({
            id: FONT_FAMILY.Excalifont,
            name: "Hijack",
            dataURL: DATA_URL,
          }),
        ),
      ).toThrow();
      expect(() =>
        Fonts.registerCustomFont(
          font({ id: 1999, name: "A", dataURL: DATA_URL }),
        ),
      ).toThrow();

      expect(Fonts.registered.has(1999)).toBe(false);
      expect(
        Fonts.registered.get(FONT_FAMILY.Excalifont)?.metadata.custom,
      ).toBeUndefined();
    });
  });

  describe("unregisterCustomFont()", () => {
    it("removes the font from the registry and from document.fonts", () => {
      Fonts.registerCustomFont(
        font({ id: 2007, name: "A", dataURL: DATA_URL }),
      );
      const { fontFace } = Fonts.registered.get(2007)!.fontFaces[0];

      expect(Fonts.unregisterCustomFont(2007)).toBe(true);

      expect(Fonts.registered.has(2007)).toBe(false);
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(deleteSpy).toHaveBeenCalledWith(fontFace);
    });

    it("clears only that font's entries from the loaded fonts cache", () => {
      Fonts.registerCustomFont(
        font({ id: 2007, name: "A", dataURL: DATA_URL }),
      );
      Fonts.registerCustomFont(
        font({ id: 2042, name: "B", dataURL: DATA_URL }),
      );
      Fonts.loadedFontsCache.add(
        "ExcalidrawCustomFont-2007-normal-400-U+0-10FFFF",
      );
      Fonts.loadedFontsCache.add(
        "ExcalidrawCustomFont-2042-normal-400-U+0-10FFFF",
      );
      Fonts.loadedFontsCache.add("Excalifont-normal-400-U+0-10FFFF");

      Fonts.unregisterCustomFont(2007);

      expect(Fonts.loadedFontsCache).toEqual(
        new Set([
          "Excalifont-normal-400-U+0-10FFFF",
          "ExcalidrawCustomFont-2042-normal-400-U+0-10FFFF",
        ]),
      );
    });

    it("returns false for an id that isn't registered", () => {
      expect(Fonts.unregisterCustomFont(2007)).toBe(false);
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("refuses to unregister built-in fonts", () => {
      expect(Fonts.unregisterCustomFont(FONT_FAMILY.Excalifont)).toBe(false);
      expect(Fonts.registered.has(FONT_FAMILY.Excalifont)).toBe(true);
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("drops the font's saved data too", () => {
      Fonts.registerCustomFont(font({ id: 2007, name: "A" }));

      Fonts.unregisterCustomFont(2007);

      expect(Fonts.getCustomFonts()).toEqual([]);
    });
  });

  describe("getCustomFonts()", () => {
    it("returns the full data of every registered font, in upload order", () => {
      const a = font({ id: 2042, name: "A", created: 1 });
      const b = font({
        id: 2007,
        name: "B",
        mimeType: "font/woff",
        created: 2,
      });

      Fonts.registerCustomFont(a);
      Fonts.registerCustomFont(b);

      expect(Fonts.getCustomFonts()).toEqual([a, b]);
    });

    it("keeps the first upload's data when an id is registered twice", () => {
      const first = font({ id: 2007, name: "First" });
      Fonts.registerCustomFont(first);
      Fonts.registerCustomFont(font({ id: 2007, name: "Second" }));

      expect(Fonts.getCustomFonts()).toEqual([first]);
    });
  });

  describe("getCustomFontsUsedBy()", () => {
    const text = (fontFamily: number, isDeleted = false) =>
      API.createElement({ type: "text", text: "x", fontFamily, isDeleted });

    it("returns only the registered fonts used by non-deleted text", () => {
      const used = font({ id: 2007, name: "Used" });
      Fonts.registerCustomFont(used);
      Fonts.registerCustomFont(font({ id: 2042, name: "Only deleted text" }));
      Fonts.registerCustomFont(font({ id: 2000, name: "Unused" }));

      expect(
        Fonts.getCustomFontsUsedBy([
          text(2007),
          text(2007), // listed once even when used twice
          text(2042, true),
          text(FONT_FAMILY.Excalifont),
          API.createElement({ type: "rectangle" }),
        ]),
      ).toEqual([used]);
    });

    it("skips custom font ids that aren't registered", () => {
      expect(Fonts.getCustomFontsUsedBy([text(2007)])).toEqual([]);
    });
  });
});
