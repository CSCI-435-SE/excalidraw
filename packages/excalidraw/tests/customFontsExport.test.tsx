import fs from "fs";
import path from "path";

import { render as renderComponent } from "@testing-library/react";

import { FONT_FAMILY } from "@excalidraw/common";

import type {
  ExcalidrawTextElement,
  NonDeleted,
} from "@excalidraw/element/types";

import { CustomFontsLicenseNotice } from "../components/CustomFontsLicenseNotice";
import { Fonts } from "../fonts";
import { Excalidraw } from "../index";
import * as exportUtils from "../scene/export";

import { API } from "./helpers/api";
import { render, screen, unmountComponent, waitFor } from "./test-utils";

import type { CustomFontData, DataURL } from "../types";

unmountComponent();

const { h } = window;

// a real WOFF2 file (one of the bundled Excalifont subsets) stands in for an
// uploaded font, so export runs the real fetch → subset → inline path
const WOFF2_BYTES = fs.readFileSync(
  path.resolve(
    __dirname,
    "../fonts/Excalifont/Excalifont-Regular-be310b9bcd4f1a43f571c46df7809174.woff2",
  ),
);

const font = (id: number, name: string): CustomFontData => ({
  id,
  name,
  mimeType: "font/woff2",
  dataURL: `data:font/woff2;base64,${WOFF2_BYTES.toString(
    "base64",
  )}` as DataURL,
  licenseAcknowledged: true,
  created: 0,
});

const fontA = font(2007, "Font A");
const fontB = font(2042, "Font B");

const text = (fontFamily: number, isDeleted = false) =>
  API.createElement({
    type: "text",
    text: "hello",
    fontFamily,
    isDeleted,
  }) as NonDeleted<ExcalidrawTextElement>;

describe("exporting drawings with custom fonts (#140)", () => {
  beforeAll(() => {
    // the jsdom `document.fonts` mock from setupTests.ts has no `delete`
    Object.assign(window.document.fonts, { delete: vi.fn() });
  });

  afterEach(() => {
    Fonts.unregisterCustomFont(fontA.id);
    Fonts.unregisterCustomFont(fontB.id);
  });

  describe("SVG export", () => {
    const exportSvg = (elements: NonDeleted<ExcalidrawTextElement>[]) =>
      exportUtils.exportToSvg(
        elements,
        { exportBackground: false, viewBackgroundColor: "#fff" },
        null,
      );

    it("embeds the custom font as an inline @font-face", async () => {
      Fonts.registerCustomFont(fontA);

      const svg = await exportSvg([text(fontA.id)]);
      const css = svg.querySelector("style")?.textContent ?? "";

      expect(css).toContain(
        "@font-face { font-family: ExcalidrawCustomFont-2007; src: url(data:",
      );
    }, 30_000);

    it("renders the text with the custom font family", async () => {
      Fonts.registerCustomFont(fontA);

      const svg = await exportSvg([text(fontA.id)]);

      expect(svg.querySelector("text")?.getAttribute("font-family")).toBe(
        "ExcalidrawCustomFont-2007, sans-serif, Segoe UI Emoji",
      );
    }, 30_000);

    it("doesn't embed custom fonts the exported text doesn't use", async () => {
      Fonts.registerCustomFont(fontA);

      const svg = await exportSvg([text(FONT_FAMILY.Nunito)]);

      expect(svg.outerHTML).not.toContain("ExcalidrawCustomFont");
    }, 30_000);
  });

  describe("license notice", () => {
    it("isn't shown when no custom font is used", () => {
      Fonts.registerCustomFont(fontA);

      const { container } = renderComponent(
        <CustomFontsLicenseNotice elements={[text(FONT_FAMILY.Excalifont)]} />,
      );

      expect(container.innerHTML).toBe("");
    });

    it("names the custom fonts the exported text uses", () => {
      Fonts.registerCustomFont(fontA);
      Fonts.registerCustomFont(fontB);

      renderComponent(
        <CustomFontsLicenseNotice
          elements={[text(fontA.id), text(fontB.id)]}
        />,
      );

      expect(screen.getByRole("note").textContent).toBe(
        "This drawing uses custom fonts (Font A, Font B). They're embedded in what you export, so only share it if their licenses allow it.",
      );
    });

    it("ignores fonts only used by deleted text", () => {
      Fonts.registerCustomFont(fontA);
      Fonts.registerCustomFont(fontB);

      renderComponent(
        <CustomFontsLicenseNotice
          elements={[text(fontA.id), text(fontB.id, true)]}
        />,
      );

      expect(screen.getByRole("note").textContent).toContain("(Font A)");
    });

    it.each(["imageExport", "jsonExport"] as const)(
      "is shown in the %s dialog",
      async (dialog) => {
        await render(<Excalidraw />);
        Fonts.registerCustomFont(fontA);
        API.setElements([text(fontA.id)]);

        API.setAppState({ openDialog: { name: dialog } });

        await waitFor(() => {
          expect(screen.getByRole("note").textContent).toContain("(Font A)");
        });
        expect(h.state.openDialog?.name).toBe(dialog);
      },
    );
  });
});
