import { FONT_FAMILY } from "@excalidraw/common";

import type { ExcalidrawTextElement } from "@excalidraw/element/types";

import { getDefaultAppState } from "../appState";
import { Fonts } from "../fonts";
import { API } from "../tests/helpers/api";

import { loadFromBlob } from "./blob";
import { serializeAsJSON } from "./json";

import type { CustomFontData, DataURL } from "../types";

const fontA: CustomFontData = {
  id: 2007,
  name: "Font A",
  mimeType: "font/woff2",
  dataURL: "data:font/woff2;base64,d09GMgABAAAAAA==" as DataURL,
  licenseAcknowledged: true,
  created: 1,
};

const fontB: CustomFontData = {
  id: 2042,
  name: "Font B",
  mimeType: "font/woff",
  dataURL: "data:font/woff;base64,d09GRgABAAAAAA==" as DataURL,
  licenseAcknowledged: true,
  created: 2,
};

const text = (fontFamily: number, isDeleted = false) =>
  API.createElement({
    type: "text",
    text: "hello",
    fontFamily,
    isDeleted,
  }) as ExcalidrawTextElement;

const save = (
  elements: readonly ExcalidrawTextElement[],
  type: "local" | "database" = "local",
) => JSON.parse(serializeAsJSON(elements, getDefaultAppState(), {}, type));

const open = (json: object) =>
  loadFromBlob(
    new Blob([JSON.stringify(json)], { type: "application/json" }),
    null,
    null,
  );

describe("saving and opening scenes with custom fonts (#140)", () => {
  beforeAll(() => {
    // the jsdom `document.fonts` mock from setupTests.ts has no `delete`
    Object.assign(window.document.fonts, { delete: vi.fn() });
  });

  afterEach(() => {
    Fonts.unregisterCustomFont(fontA.id);
    Fonts.unregisterCustomFont(fontB.id);
  });

  describe("saving", () => {
    it("embeds the fonts used by the scene's text", () => {
      Fonts.registerCustomFont(fontA);

      expect(save([text(fontA.id)]).customFonts).toEqual([fontA]);
    });

    it("leaves out uploaded fonts that no text uses", () => {
      Fonts.registerCustomFont(fontA);
      Fonts.registerCustomFont(fontB);

      expect(save([text(fontA.id)]).customFonts).toEqual([fontA]);
    });

    it("leaves out fonts only used by deleted text", () => {
      Fonts.registerCustomFont(fontA);
      Fonts.registerCustomFont(fontB);

      expect(save([text(fontA.id), text(fontB.id, true)]).customFonts).toEqual([
        fontA,
      ]);
    });

    it("omits the field entirely when no custom font is used", () => {
      Fonts.registerCustomFont(fontA);

      expect(save([text(FONT_FAMILY.Excalifont)])).not.toHaveProperty(
        "customFonts",
      );
    });

    it("doesn't send fonts to the database (no collaboration sync)", () => {
      Fonts.registerCustomFont(fontA);

      expect(save([text(fontA.id)], "database")).not.toHaveProperty(
        "customFonts",
      );
    });
  });

  describe("opening", () => {
    it("restores the fonts and the text that uses them", async () => {
      Fonts.registerCustomFont(fontA);
      const saved = save([text(fontA.id)]);
      // as if opened in a fresh browser
      Fonts.unregisterCustomFont(fontA.id);

      const { elements } = await open(saved);

      expect(Fonts.getCustomFonts()).toEqual([fontA]);
      expect((elements[0] as ExcalidrawTextElement).fontFamily).toBe(fontA.id);
    });

    it("keeps the local font when the file embeds the same font under another name", async () => {
      Fonts.registerCustomFont(fontA);

      await open({
        type: "excalidraw",
        version: 2,
        elements: [text(fontA.id)],
        customFonts: [{ ...fontA, name: "Renamed elsewhere" }],
      });

      expect(Fonts.getCustomFonts()).toEqual([fontA]);
    });

    it("skips invalid embedded fonts and still opens the scene", async () => {
      const { elements } = await open({
        type: "excalidraw",
        version: 2,
        elements: [text(fontA.id)],
        customFonts: [{ ...fontB, mimeType: "font/ttf" }, fontA, "junk"],
      });

      expect(Fonts.getCustomFonts()).toEqual([fontA]);
      expect(elements).toHaveLength(1);
    });

    it("opens files saved before custom fonts existed", async () => {
      const { elements } = await open({
        type: "excalidraw",
        version: 2,
        elements: [text(FONT_FAMILY.Nunito)],
      });

      expect(Fonts.getCustomFonts()).toEqual([]);
      expect((elements[0] as ExcalidrawTextElement).fontFamily).toBe(
        FONT_FAMILY.Nunito,
      );
    });
  });
});
