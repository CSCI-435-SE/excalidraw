import React from "react";
import rough from "roughjs/bin/rough";
import { vi } from "vitest";

import {
  arrayToMap,
  cloneJSON,
  DARK_THEME_FILTER,
  MIME_TYPES,
  THEME,
} from "@excalidraw/common";

import { Excalidraw } from "@excalidraw/excalidraw";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { exportToSvg } from "@excalidraw/excalidraw/scene/export";

import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import {
  act,
  render,
  unmountComponent,
} from "@excalidraw/excalidraw/tests/test-utils";

import type {
  RenderableElementsMap,
  StaticCanvasRenderConfig,
} from "@excalidraw/excalidraw/scene/types";
import type {
  AppClassProperties,
  BinaryFileData,
  BinaryFiles,
  DataURL,
} from "@excalidraw/excalidraw/types";

import {
  applyImageFiltersToPixels,
  createImageFilter,
  getImageFilterCSS,
  normalizeImageAdjustments,
  normalizeImageFilters,
} from "../src/imageFilters";
import { mutateElement } from "../src/mutateElement";
import { newImageElement } from "../src/newElement";
import { renderElement } from "../src/renderElement";

import type {
  ExcalidrawImageElement,
  FileId,
  NonDeleted,
  NonDeletedSceneElementsMap,
} from "../src/types";

const { h } = window;

// toggles `isSafari` so the pixel-manipulation fallback can be exercised
const browser = vi.hoisted(() => ({ isSafari: false }));

vi.mock("@excalidraw/common", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@excalidraw/common")>();
  return {
    ...actual,
    get isSafari() {
      return browser.isSafari;
    },
  };
});

const FILE_ID = "image-filter-file" as FileId;
const DATA_URL = "data:image/png;base64,iVBORw0KGgo=" as DataURL;

const createImageCache = (
  mimeType: string = MIME_TYPES.png,
): AppClassProperties["imageCache"] => {
  const image = new Image();
  image.src = DATA_URL;
  Object.defineProperty(image, "naturalWidth", { value: 100 });
  Object.defineProperty(image, "naturalHeight", { value: 100 });
  return new Map([[FILE_ID, { image, mimeType } as any]]);
};

const GRAYSCALE = [createImageFilter("grayscale")];
const IMAGE_GRAYSCALE_FILTER = "grayscale(100%)";

const createImage = (
  filters: ExcalidrawImageElement["filters"] = [],
  adjustments: ExcalidrawImageElement["adjustments"] = null,
) =>
  API.createElement({
    type: "image",
    fileId: FILE_ID,
    width: 100,
    height: 100,
    filters,
    adjustments,
  });

/**
 * Renders the image and returns `context.filter` at the moment the original
 * image was drawn (on whichever canvas it was drawn to).
 */
const renderImageFilters = (
  element: NonDeleted<ExcalidrawImageElement>,
  imageCache: AppClassProperties["imageCache"],
  opts: {
    isExporting?: boolean;
    theme?: StaticCanvasRenderConfig["theme"];
  } = {},
) => {
  const image = imageCache.get(FILE_ID)!.image;
  const filters: string[] = [];
  const drawImage = vi
    .spyOn(CanvasRenderingContext2D.prototype, "drawImage")
    .mockImplementation(function (
      this: CanvasRenderingContext2D,
      source: CanvasImageSource,
    ) {
      if (source === image) {
        filters.push(this.filter);
      }
    });

  const canvas = document.createElement("canvas");
  const elementsMap = arrayToMap([element]) as NonDeletedSceneElementsMap &
    RenderableElementsMap;
  const theme = opts.theme ?? THEME.LIGHT;

  renderElement(
    element,
    elementsMap,
    elementsMap,
    rough.canvas(canvas),
    canvas.getContext("2d")!,
    {
      canvasBackgroundColor: "#ffffff",
      imageCache,
      renderGrid: false,
      isExporting: opts.isExporting ?? true,
      embedsValidationStatus: new Map(),
      elementsPendingErasure: new Set(),
      pendingFlowchartNodes: null,
      theme,
    },
    { ...h.state, theme },
  );

  drawImage.mockRestore();
  return filters;
};

beforeEach(async () => {
  unmountComponent();
  browser.isSafari = false;
  await render(<Excalidraw />);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => {});
});

describe("image filter", () => {
  it("defaults to no filter", () => {
    const image = newImageElement({ type: "image", x: 0, y: 0 });
    expect(image.filters).toEqual([]);
    expect(image.adjustments).toBe(null);
    expect(renderImageFilters(createImage(), createImageCache())).toEqual([
      "none",
    ]);
  });

  it("renders the image in grayscale when the filter is applied", () => {
    expect(
      renderImageFilters(createImage(GRAYSCALE), createImageCache()),
    ).toEqual([IMAGE_GRAYSCALE_FILTER]);
  });

  it("combines grayscale with the dark mode SVG inversion", () => {
    expect(
      renderImageFilters(
        createImage(GRAYSCALE),
        createImageCache(MIME_TYPES.svg),
        { theme: THEME.DARK },
      ),
    ).toEqual([`${IMAGE_GRAYSCALE_FILTER} ${DARK_THEME_FILTER}`]);
  });

  it("restores the original appearance when the filter is removed", () => {
    const image = createImage();
    const imageCache = createImageCache();
    const elementsMap = arrayToMap([image]);

    // element canvas cache path (non-export), mutating the element in place
    // (kept out of the app scene so the app's own render doesn't populate
    // the shared element canvas cache)
    expect(
      renderImageFilters(image, imageCache, { isExporting: false }),
    ).toEqual(["none"]);

    mutateElement(image, elementsMap, { filters: GRAYSCALE });
    expect(
      renderImageFilters(image, imageCache, { isExporting: false }),
    ).toEqual([IMAGE_GRAYSCALE_FILTER]);

    mutateElement(image, elementsMap, { filters: [] });
    expect(
      renderImageFilters(image, imageCache, { isExporting: false }),
    ).toEqual(["none"]);
  });

  it("does not modify the original image data", () => {
    const image = createImage();
    const imageCache = createImageCache();
    const files: BinaryFiles = {
      [FILE_ID]: {
        id: FILE_ID,
        dataURL: DATA_URL,
        mimeType: MIME_TYPES.png,
        created: 1,
      },
    };
    const filesBefore = cloneJSON(files);
    const cachedImage = imageCache.get(FILE_ID)!.image as HTMLImageElement;
    act(() => API.setElements([image]));

    act(() => h.app.scene.mutateElement(image, { filters: GRAYSCALE }));
    renderImageFilters(image, imageCache);
    act(() => h.app.scene.mutateElement(image, { filters: [] }));
    renderImageFilters(image, imageCache);

    expect(image.fileId).toBe(FILE_ID);
    expect(files).toEqual(filesBefore);
    expect(imageCache.get(FILE_ID)!.image).toBe(cachedImage);
    expect(cachedImage.src).toBe(DATA_URL);
  });

  it("restores filters, defaulting legacy images to no filter", () => {
    const { filters: _, adjustments: __, ...legacyImage } = createImage();
    const [restoredLegacy, restoredFiltered] = restoreElements(
      [legacyImage as ExcalidrawImageElement, createImage(GRAYSCALE)],
      null,
    ) as ExcalidrawImageElement[];

    expect(restoredLegacy.filters).toEqual([]);
    expect(restoredLegacy.adjustments).toBe(null);
    expect(restoredFiltered.filters).toEqual(GRAYSCALE);
  });

  it("migrates the legacy single `filter` field", () => {
    const { filters: _, ...image } = createImage();
    const [restored] = restoreElements(
      [{ ...image, filter: "grayscale" } as any],
      null,
    ) as ExcalidrawImageElement[];

    expect(restored.filters).toEqual(GRAYSCALE);
    expect("filter" in restored).toBe(false);
  });

  it("sanitizes invalid filters and adjustments on restore", () => {
    const [restored] = restoreElements(
      [
        {
          ...createImage(),
          filters: [
            { type: "colorShift", hue: 5, intensity: "x" },
            { type: "blur", intensity: 1 },
            { type: "grayscale", intensity: Number.NaN },
            { type: "grayscale", intensity: 0.2 },
          ],
          adjustments: { brightness: -1, contrast: null, saturation: 0.7 },
        } as any,
      ],
      null,
    ) as ExcalidrawImageElement[];

    // unknown/duplicate types dropped, canonical order, values clamped
    expect(restored.filters).toEqual([
      { type: "grayscale", intensity: 1 },
      { type: "colorShift", hue: 1, intensity: 1 },
    ]);
    expect(restored.adjustments).toEqual({
      brightness: 0,
      contrast: 0.5,
      saturation: 0.7,
    });
    expect(() =>
      renderImageFilters(restored as any, createImageCache()),
    ).not.toThrow();
  });

  describe("filter stack and adjustments", () => {
    const colorShift = (hue: number, intensity = 1) =>
      createImageFilter("colorShift", { hue, intensity });

    it("applies filters in canonical order, then adjustments", () => {
      const css = getImageFilterCSS({
        // given out of order on purpose
        filters: normalizeImageFilters([colorShift(0.25), GRAYSCALE[0]]),
        adjustments: { brightness: 0.75, contrast: 0.25, saturation: 0 },
      });

      // grayscale is the base, the color shift tints the gray image on top
      expect(css).toEqual([
        "grayscale(100%)",
        "sepia(100%)",
        "hue-rotate(52deg)",
        "saturate(300%)",
        "brightness(150%)",
        "contrast(50%)",
        "saturate(0%)",
      ]);
    });

    it("color shift on top of grayscale tints toward the target hue", () => {
      const data = new Uint8ClampedArray([255, 0, 0, 255]);
      applyImageFiltersToPixels(data, {
        // hue 1/3 -> 120deg (green)
        filters: [GRAYSCALE[0], colorShift(1 / 3)],
        adjustments: null,
      });
      const [r, g, b] = data;

      // no longer gray, green is the dominant channel
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    });

    it("color shift scales its tint with intensity over grayscale", () => {
      expect(
        getImageFilterCSS({
          filters: [GRAYSCALE[0], colorShift(0.5, 0)],
          adjustments: null,
        }),
      ).toEqual(["grayscale(100%)"]);
    });

    it("renders the combined filters on the canvas", () => {
      expect(
        renderImageFilters(
          createImage([colorShift(0.5, 0.5)], {
            brightness: 0.6,
            contrast: 0.5,
            saturation: 0.5,
          }),
          createImageCache(),
        ),
      ).toEqual(["hue-rotate(90deg) brightness(120%)"]);
    });

    it("scales the color shift rotation by its intensity", () => {
      expect(
        getImageFilterCSS({
          filters: [colorShift(0.5, 0.5)],
          adjustments: null,
        }),
      ).toEqual(["hue-rotate(90deg)"]);
    });

    it("skips neutral values so the original appearance is kept", () => {
      expect(
        getImageFilterCSS({
          filters: [
            createImageFilter("grayscale", { intensity: 0 }),
            colorShift(1),
            colorShift(0.5, 0),
          ],
          adjustments: { brightness: 0.5, contrast: 0.5, saturation: 0.5 },
        }),
      ).toEqual([]);
      expect(
        normalizeImageAdjustments({
          brightness: 0.5,
          contrast: 0.5,
          saturation: 0.5,
        }),
      ).toBe(null);
    });

    it("re-renders when an adjustment changes (cache invalidation)", () => {
      const image = createImage();
      const imageCache = createImageCache();
      const elementsMap = arrayToMap([image]);

      expect(
        renderImageFilters(image, imageCache, { isExporting: false }),
      ).toEqual(["none"]);

      mutateElement(image, elementsMap, {
        adjustments: { brightness: 1, contrast: 0.5, saturation: 0.5 },
      });
      expect(
        renderImageFilters(image, imageCache, { isExporting: false }),
      ).toEqual(["brightness(200%)"]);
    });

    it("matches CSS filter math in the pixel fallback", () => {
      const pixel = (
        rgb: [number, number, number],
        element: Parameters<typeof applyImageFiltersToPixels>[1],
      ) => {
        const data = new Uint8ClampedArray([...rgb, 255]);
        applyImageFiltersToPixels(data, element);
        return Array.from(data);
      };

      // hue-rotate(180deg) on pure red
      expect(
        pixel([255, 0, 0], { filters: [colorShift(0.5)], adjustments: null }),
      ).toEqual([0, 109, 109, 255]);
      // brightness(200%), clamped
      expect(
        pixel([100, 200, 0], {
          filters: [],
          adjustments: { brightness: 1, contrast: 0.5, saturation: 0.5 },
        }),
      ).toEqual([200, 255, 0, 255]);
      // contrast(0%) collapses to mid gray
      expect(
        pixel([0, 255, 30], {
          filters: [],
          adjustments: { brightness: 0.5, contrast: 0, saturation: 0.5 },
        }),
      ).toEqual([128, 128, 128, 255]);
      // no filters leaves pixels untouched
      expect(pixel([1, 2, 3], { filters: [], adjustments: null })).toEqual([
        1, 2, 3, 255,
      ]);
    });
  });

  describe("svg export", () => {
    const createFiles = (
      mimeType: BinaryFileData["mimeType"] = MIME_TYPES.png,
    ): BinaryFiles => ({
      [FILE_ID]: { id: FILE_ID, dataURL: DATA_URL, mimeType, created: 1 },
    });

    /** returns the exported svg and each image element's wrapping <g> */
    const exportImages = async (
      elements: NonDeleted<ExcalidrawImageElement>[],
      files: BinaryFiles,
      exportWithDarkMode = false,
    ) => {
      const svg = await exportToSvg(
        elements,
        {
          ...getDefaultAppState(),
          exportBackground: false,
          exportWithDarkMode,
        },
        files,
      );
      return {
        svg,
        groups: Array.from(svg.querySelectorAll("use")).map(
          (use) => use.parentElement!,
        ),
      };
    };

    it("exports the image in grayscale when the filter is applied", async () => {
      const { groups } = await exportImages(
        [createImage(GRAYSCALE)],
        createFiles(),
      );

      expect(groups[0].getAttribute("filter")).toBe(IMAGE_GRAYSCALE_FILTER);
    });

    it("exports the image without a filter when none is applied", async () => {
      const { groups } = await exportImages([createImage()], createFiles());

      expect(groups[0].hasAttribute("filter")).toBe(false);
    });

    it("combines grayscale with the dark mode SVG inversion", async () => {
      const { groups } = await exportImages(
        [createImage(GRAYSCALE)],
        createFiles(MIME_TYPES.svg),
        true,
      );

      expect(groups[0].getAttribute("filter")).toBe(
        `${IMAGE_GRAYSCALE_FILTER} ${DARK_THEME_FILTER}`,
      );
    });

    it("filters per element without altering the shared image data", async () => {
      const { svg, groups } = await exportImages(
        [createImage(GRAYSCALE), createImage()],
        createFiles(),
      );

      // both elements still reuse a single, unmodified <image>
      const images = svg.querySelectorAll("image");
      expect(images.length).toBe(1);
      expect(images[0].getAttribute("href")).toBe(DATA_URL);
      expect(images[0].hasAttribute("filter")).toBe(false);

      expect(groups.length).toBe(2);
      expect(groups[0].getAttribute("filter")).toBe(IMAGE_GRAYSCALE_FILTER);
      expect(groups[1].hasAttribute("filter")).toBe(false);
    });
  });

  describe("on Safari (no canvas filter support)", () => {
    const renderSafariPixel = (
      element: NonDeleted<ExcalidrawImageElement>,
      imageCache: AppClassProperties["imageCache"],
      theme: StaticCanvasRenderConfig["theme"] = THEME.LIGHT,
    ) => {
      browser.isSafari = true;
      vi.spyOn(
        CanvasRenderingContext2D.prototype,
        "getImageData",
      ).mockImplementation(
        () => new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1),
      );
      const putImageData = vi.spyOn(
        CanvasRenderingContext2D.prototype,
        "putImageData",
      );

      const filters = renderImageFilters(element, imageCache, { theme });

      return {
        filters,
        pixel: Array.from(putImageData.mock.calls[0][0].data),
      };
    };

    it("converts a copy of the image to grayscale", () => {
      const { filters, pixel } = renderSafariPixel(
        createImage(GRAYSCALE),
        createImageCache(),
      );

      // drawn unfiltered onto the temp canvas, then converted pixel by pixel
      expect(filters).toEqual(["none"]);
      // 0.2126 * 255 (red) ≈ 54
      expect(pixel).toEqual([54, 54, 54, 255]);
    });

    it("combines grayscale with the dark mode SVG inversion", () => {
      const { pixel } = renderSafariPixel(
        createImage(GRAYSCALE),
        createImageCache(MIME_TYPES.svg),
        THEME.DARK,
      );

      expect(pixel).toEqual([201, 201, 201, 255]);
    });
  });
});
