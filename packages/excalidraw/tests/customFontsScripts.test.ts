import fs from "fs";
import path from "path";

import type {
  ExcalidrawTextElement,
  NonDeleted,
} from "@excalidraw/element/types";

import { getDefaultAppState } from "../appState";
import { loadFromBlob } from "../data/blob";
import { serializeAsJSON } from "../data/json";
import { Fonts } from "../fonts";
import * as exportUtils from "../scene/export";

import { API } from "./helpers/api";

import type { CustomFontData, DataURL } from "../types";

// a real WOFF2 file stands in for an uploaded font (see customFontsExport)
const WOFF2_BYTES = fs.readFileSync(
  path.resolve(
    __dirname,
    "../fonts/Excalifont/Excalifont-Regular-be310b9bcd4f1a43f571c46df7809174.woff2",
  ),
);

const font: CustomFontData = {
  id: 2007,
  name: "Font A",
  mimeType: "font/woff2",
  dataURL: `data:font/woff2;base64,${WOFF2_BYTES.toString(
    "base64",
  )}` as DataURL,
  licenseAcknowledged: true,
  created: 0,
};

// Cyrillic, Greek, Arabic, Hebrew, Devanagari, CJK, Hangul and an emoji
const MULTI_SCRIPT = "Привет Γειά مرحبا שלום नमस्ते 你好 こんにちは 안녕 👋";

const text = (value: string) =>
  API.createElement({
    type: "text",
    text: value,
    fontFamily: font.id,
  }) as NonDeleted<ExcalidrawTextElement>;

const exportSvg = (elements: NonDeleted<ExcalidrawTextElement>[]) =>
  exportUtils.exportToSvg(
    elements,
    { exportBackground: false, viewBackgroundColor: "#fff" },
    null,
  );

describe("custom fonts with other writing systems (#140, criterion E)", () => {
  beforeAll(() => {
    // the jsdom `document.fonts` mock from setupTests.ts has no `delete`
    Object.assign(window.document.fonts, { delete: vi.fn() });
  });

  beforeEach(() => {
    Fonts.registerCustomFont(font);
    // the jsdom FontFace mock hard-codes a Latin-1 unicode range, whereas
    // browsers default to the whole of Unicode for a FontFace without one
    Object.assign(Fonts.registered.get(font.id)!.fontFaces[0].fontFace, {
      unicodeRange: "U+0-10FFFF",
    });
  });

  afterEach(() => {
    Fonts.unregisterCustomFont(font.id);
  });

  it("keeps text in many scripts intact in SVG export", async () => {
    const svg = await exportSvg([text(MULTI_SCRIPT)]);

    expect(svg.querySelector("text")?.textContent).toBe(MULTI_SCRIPT);
  }, 30_000);

  it("embeds the custom font for text written entirely in another script", async () => {
    const svg = await exportSvg([text("Привет мир")]);

    expect(svg.querySelector("style")?.textContent).toContain(
      "@font-face { font-family: ExcalidrawCustomFont-2007; src: url(data:",
    );
  }, 30_000);

  it("falls back to system fonts for characters the custom font lacks", async () => {
    const svg = await exportSvg([text("你好 👋")]);

    // the custom font first, then a generic font and an emoji font, so
    // missing glyphs render instead of showing as empty boxes
    expect(svg.querySelector("text")?.getAttribute("font-family")).toBe(
      "ExcalidrawCustomFont-2007, sans-serif, Segoe UI Emoji",
    );
  }, 30_000);

  it("keeps the text and its font when the drawing is saved and reopened", async () => {
    const json = serializeAsJSON(
      [text(MULTI_SCRIPT)],
      getDefaultAppState(),
      {},
      "local",
    );
    Fonts.unregisterCustomFont(font.id);

    const { elements } = await loadFromBlob(
      new Blob([json], { type: "application/json" }),
      null,
      null,
    );
    const restored = elements[0] as ExcalidrawTextElement;

    expect(restored.originalText).toBe(MULTI_SCRIPT);
    expect(restored.fontFamily).toBe(font.id);
    expect(Fonts.getCustomFonts()).toEqual([font]);
  });
});
