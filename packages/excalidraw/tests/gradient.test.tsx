import React from "react";
import rough from "roughjs/bin/rough";
import { vi } from "vitest";

import {
  applyDarkModeFilter,
  arrayToMap,
  COLOR_PALETTE,
  KEYS,
  ROUNDNESS,
} from "@excalidraw/common";

import { pointFrom } from "@excalidraw/math";

import { exportToSvg as exportLibraryItemSvg } from "@excalidraw/utils/export";

import {
  createGradientBackground,
  getGradientColors,
  GRADIENT_FILL_PLACEHOLDER,
  getTransformHandles,
  renderElement,
} from "@excalidraw/element";

import type { LocalPoint, Radians } from "@excalidraw/math";

import type {
  ExcalidrawElement,
  ExcalidrawLineElement,
  NonDeletedExcalidrawElement,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";

import {
  actionDuplicateSelection,
  actionFlipHorizontal,
  actionFlipVertical,
} from "../actions";
import { createPasteEvent, serializeAsClipboardJSON } from "../clipboard";
import { exportToCanvas, exportToSvg } from "../scene/export";
import { getDefaultAppState } from "../appState";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import {
  act,
  fireEvent,
  GlobalTestState,
  render,
  screen,
  togglePopover,
  unmountComponent,
  waitFor,
} from "./test-utils";

import type {
  RenderableElementsMap,
  StaticCanvasRenderConfig,
} from "../scene/types";

const { h } = window;

const LINEAR = createGradientBackground("linear", "#000000", "#ffffff");
const LINEAR_REVERSED = createGradientBackground(
  "linear",
  "#ffffff",
  "#000000",
);
const RADIAL = createGradientBackground("radial", "#000000", "#ffffff");

// closed polygon drawn leftward, so its points sit at negative x
const LEFTWARD_LOOP = [
  pointFrom<LocalPoint>(0, 0),
  pointFrom<LocalPoint>(-100, 0),
  pointFrom<LocalPoint>(-100, 100),
  pointFrom<LocalPoint>(0, 0),
];
const RIGHTWARD_LOOP = [
  pointFrom<LocalPoint>(0, 0),
  pointFrom<LocalPoint>(100, 0),
  pointFrom<LocalPoint>(100, 100),
  pointFrom<LocalPoint>(0, 0),
];
const OPEN_LINE = [
  pointFrom<LocalPoint>(0, 0),
  pointFrom<LocalPoint>(100, 100),
];

beforeEach(async () => {
  unmountComponent();
  await render(<Excalidraw autoFocus={true} handleKeyboardGlobally={true} />);
  Object.assign(document, {
    elementFromPoint: () => GlobalTestState.canvas,
  });
});

afterEach(async () => {
  // https://github.com/floating-ui/floating-ui/issues/1908#issuecomment-1301553793
  await act(async () => {});
});

const drawOnCanvas = (
  element: ExcalidrawElement,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
) => {
  const elementsMap = arrayToMap([element]) as NonDeletedSceneElementsMap &
    RenderableElementsMap;
  const renderConfig: StaticCanvasRenderConfig = {
    canvasBackgroundColor: "#ffffff",
    imageCache: new Map(),
    renderGrid: false,
    isExporting: true,
    embedsValidationStatus: new Map(),
    elementsPendingErasure: new Set(),
    pendingFlowchartNodes: null,
    theme: "light",
  };

  renderElement(
    element as NonDeletedExcalidrawElement,
    elementsMap,
    elementsMap,
    rough.canvas(canvas),
    context,
    renderConfig,
    h.state,
  );
};

/**
 * Renders one element onto a fresh mock canvas (export mode, so no element
 * canvas cache) and returns the gradient calls it made, in element-local
 * coordinates.
 */
const renderGradientCalls = (element: ExcalidrawElement) => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  const linear = vi.spyOn(context, "createLinearGradient");
  const radial = vi.spyOn(context, "createRadialGradient");
  const colorStops: [number, string][] = [];
  const addColorStop = vi
    .spyOn(CanvasGradient.prototype, "addColorStop")
    .mockImplementation((offset, color) => {
      colorStops.push([offset, color]);
    });
  // createLinearGradient runs before the "is it closed" check, so count the
  // fills actually painted with a gradient to know whether one is visible
  let gradientFills = 0;
  vi.spyOn(context, "fill").mockImplementation(() => {
    if (context.fillStyle instanceof CanvasGradient) {
      gradientFills++;
    }
  });
  drawOnCanvas(element, canvas, context);
  addColorStop.mockRestore();

  return {
    linear: linear.mock.calls as number[][],
    radial: radial.mock.calls as number[][],
    colorStops,
    gradientFills,
  };
};

/**
 * Renders the element and returns the outline (path commands) of the first
 * fill it paints, i.e. its background.
 */
const firstFillOutline = (element: ExcalidrawElement) => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  const path: unknown[][] = [];
  const fills: unknown[][][] = [];
  vi.spyOn(context, "beginPath").mockImplementation(() => {
    path.length = 0;
  });
  for (const command of ["moveTo", "lineTo", "bezierCurveTo"] as const) {
    vi.spyOn(context, command).mockImplementation((...args: number[]) => {
      path.push([command, ...args]);
    });
  }
  vi.spyOn(context, "fill").mockImplementation(() => {
    fills.push([...path]);
  });

  drawOnCanvas(element, canvas, context);

  return fills[0];
};

const gradientOf = (element: ExcalidrawElement) =>
  getGradientColors(API.getElement(element).backgroundColor);

describe("gradient rendering geometry", () => {
  it("spans a rectangle's width and follows it when resized", async () => {
    const rect = API.createElement({
      type: "rectangle",
      width: 100,
      height: 50,
      backgroundColor: LINEAR,
    });
    API.setElements([rect]);
    expect(renderGradientCalls(rect).linear).toEqual([[0, 0, 100, 0]]);

    UI.resize(API.getElement(rect), "se", [100, 0]);
    const resized = API.getElement(rect);
    expect(resized.width).toBe(200);

    expect(renderGradientCalls(resized).linear).toEqual([[0, 0, 200, 0]]);
  });

  it("renders a linear gradient at its selected angle", async () => {
    const rectangle = API.createElement({
      type: "rectangle",
      width: 100,
      height: 60,
      backgroundColor: createGradientBackground(
        "linear",
        "#000000",
        "#ffffff",
        180,
      ),
    });
    expect(renderGradientCalls(rectangle).linear).toEqual([[50, 0, 50, 60]]);
  });

  it("renders linear gradients with the selected color-stop positions", async () => {
    const rectangle = API.createElement({
      type: "rectangle",
      width: 100,
      height: 60,
      backgroundColor: createGradientBackground(
        "linear",
        "#000000",
        "#ffffff",
        90,
        20,
        80,
      ),
    });
    const { colorStops } = renderGradientCalls(rectangle);

    expect(colorStops).toEqual([
      [0.2, "#000000"],
      [0.8, "#ffffff"],
    ]);
  });

  it("centers a radial gradient and follows the element when resized", async () => {
    const ellipse = API.createElement({
      type: "ellipse",
      width: 100,
      height: 60,
      backgroundColor: RADIAL,
    });
    API.setElements([ellipse]);
    expect(renderGradientCalls(ellipse).radial).toEqual([
      [50, 30, 0, 50, 30, Math.hypot(50, 30)],
    ]);

    UI.resize(API.getElement(ellipse), "se", [100, 40]);
    const resized = API.getElement(ellipse);
    const { width, height } = resized;
    expect(width).not.toBe(100);

    expect(renderGradientCalls(resized).radial.at(-1)).toEqual([
      width / 2,
      height / 2,
      0,
      width / 2,
      height / 2,
      Math.hypot(width / 2, height / 2),
    ]);
  });

  it("keeps the gradient in element space when rotated", async () => {
    const rect = API.createElement({
      type: "rectangle",
      width: 100,
      height: 50,
      backgroundColor: LINEAR,
    });
    API.setElements([rect]);

    UI.rotate(API.getElement(rect), [60, 36], { shift: true });
    const rotated = API.getElement(rect);
    expect(rotated.angle).not.toBe(0);
    expect(rotated.backgroundColor).toBe(LINEAR);

    expect(renderGradientCalls(rotated).linear).toEqual([[0, 0, 100, 0]]);
  });

  it.each(["line", "arrow"] as const)(
    "spans a closed %s across its points, including negative x",
    async (type) => {
      const loop = API.createElement({
        type,
        width: 100,
        height: 100,
        points: LEFTWARD_LOOP,
        backgroundColor: LINEAR,
      });
      const { linear, gradientFills } = renderGradientCalls(loop);
      expect(gradientFills).toBe(1);
      expect(linear).toEqual([[-100, 0, 0, 0]]);
    },
  );

  it("fills a closed freedraw shape with the gradient", async () => {
    const freedraw = API.createElement({
      type: "freedraw",
      width: 100,
      height: 100,
      points: [
        pointFrom<LocalPoint>(0, 0),
        pointFrom<LocalPoint>(100, 0),
        pointFrom<LocalPoint>(100, 100),
        pointFrom<LocalPoint>(0, 100),
        pointFrom<LocalPoint>(0, 0),
      ],
      backgroundColor: LINEAR,
    });
    const { linear, gradientFills } = renderGradientCalls(freedraw);
    expect(gradientFills).toBe(1);
    expect(linear).toEqual([[0, 0, 100, 0]]);
  });

  it("does not draw a gradient on an open line", async () => {
    const line = API.createElement({
      type: "line",
      points: OPEN_LINE,
      backgroundColor: LINEAR,
    });
    expect(renderGradientCalls(line).gradientFills).toBe(0);
  });

  it.each([
    [
      "rounded closed line",
      () =>
        API.createElement({
          type: "line",
          width: 100,
          height: 100,
          points: RIGHTWARD_LOOP,
          roundness: { type: ROUNDNESS.PROPORTIONAL_RADIUS },
        }),
    ],
    [
      "closed freedraw",
      () =>
        API.createElement({
          type: "freedraw",
          width: 100,
          height: 100,
          points: [
            pointFrom<LocalPoint>(0, 0),
            pointFrom<LocalPoint>(60, 10),
            pointFrom<LocalPoint>(100, 60),
            pointFrom<LocalPoint>(40, 100),
            pointFrom<LocalPoint>(0, 0),
          ],
        }),
    ],
    [
      "rounded rectangle",
      () =>
        API.createElement({
          type: "rectangle",
          roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
        }),
    ],
    ["ellipse", () => API.createElement({ type: "ellipse" })],
    ["diamond", () => API.createElement({ type: "diamond" })],
  ])("fills a %s along the same outline as a solid fill", (_, create) => {
    const element = create();
    const solid = firstFillOutline({
      ...element,
      backgroundColor: "#a5d8ff",
      fillStyle: "solid",
    });
    const gradient = firstFillOutline({
      ...element,
      backgroundColor: LINEAR,
    });

    expect(solid.length).toBeGreaterThan(0);
    expect(gradient).toEqual(solid);
  });

  it("keeps the gradient stored when a closed line is opened", async () => {
    const line = API.createElement({
      type: "line",
      width: 100,
      height: 100,
      points: RIGHTWARD_LOOP,
      backgroundColor: LINEAR,
    });
    API.setElements([line]);
    expect(renderGradientCalls(line).gradientFills).toBe(1);

    API.updateElement(API.getElement(line), { points: OPEN_LINE });
    const opened = API.getElement(line);
    expect(opened.backgroundColor).toBe(LINEAR);
    expect(renderGradientCalls(opened).gradientFills).toBe(0);
  });
});

describe("gradient SVG export", () => {
  const exportGradientDefs = async (
    elements: NonDeletedExcalidrawElement[],
    exportWithDarkMode = false,
  ) => {
    const svg = await exportToSvg(
      elements,
      {
        exportBackground: false,
        viewBackgroundColor: "#ffffff",
        exportWithDarkMode,
      },
      null,
      { skipInliningFonts: true },
    );
    return Array.from(
      svg.querySelectorAll("defs linearGradient, defs radialGradient"),
    );
  };

  const stopColors = (gradient: Element) =>
    Array.from(gradient.querySelectorAll("stop")).map((stop) => [
      stop.getAttribute("offset"),
      stop.getAttribute("stop-color"),
    ]);

  it("adds a linear gradient spanning the element", async () => {
    const rectangle = API.createElement({
      type: "rectangle",
      width: 200,
      height: 100,
      backgroundColor: LINEAR,
    });
    const [gradient] = await exportGradientDefs([rectangle]);

    expect(gradient.tagName).toBe("linearGradient");
    expect(gradient.id).toBe(`gradient-${rectangle.id}`);
    expect(gradient.getAttribute("gradientUnits")).toBe("userSpaceOnUse");
    expect(
      ["x1", "y1", "x2", "y2"].map((attr) => gradient.getAttribute(attr)),
    ).toEqual(["0", "0", "200", "0"]);
    expect(stopColors(gradient)).toEqual([
      ["0", "#000000"],
      ["1", "#ffffff"],
    ]);
  });

  it("exports the selected linear gradient angle to SVG", async () => {
    const rectangle = API.createElement({
      type: "rectangle",
      width: 200,
      height: 100,
      backgroundColor: createGradientBackground(
        "linear",
        "#000000",
        "#ffffff",
        180,
      ),
    });
    const [gradient] = await exportGradientDefs([rectangle]);

    expect(
      ["x1", "y1", "x2", "y2"].map((attr) => gradient.getAttribute(attr)),
    ).toEqual(["100", "0", "100", "100"]);
  });

  it("exports the selected color-stop positions to SVG", async () => {
    const rectangle = API.createElement({
      type: "rectangle",
      backgroundColor: createGradientBackground(
        "linear",
        "#000000",
        "#ffffff",
        90,
        20,
        80,
      ),
    });
    const [gradient] = await exportGradientDefs([rectangle]);

    expect(stopColors(gradient)).toEqual([
      ["0.2", "#000000"],
      ["0.8", "#ffffff"],
    ]);
  });

  it("adds a radial gradient centered on the element", async () => {
    const ellipse = API.createElement({
      type: "ellipse",
      width: 200,
      height: 100,
      backgroundColor: RADIAL,
    });
    const [gradient] = await exportGradientDefs([ellipse]);

    expect(gradient.tagName).toBe("radialGradient");
    expect(
      ["cx", "cy", "r"].map((attr) => Number(gradient.getAttribute(attr))),
    ).toEqual([100, 50, Math.hypot(100, 50)]);
  });

  it("uses the point bounds of a closed line", async () => {
    const line = API.createElement({
      type: "line",
      width: 100,
      height: 100,
      points: [
        pointFrom<LocalPoint>(0, 0),
        pointFrom<LocalPoint>(-50, 40),
        pointFrom<LocalPoint>(60, -20),
        pointFrom<LocalPoint>(0, 0),
      ],
      backgroundColor: LINEAR,
    });
    const [gradient] = await exportGradientDefs([line]);

    expect(
      ["x1", "y1", "x2"].map((attr) => gradient.getAttribute(attr)),
    ).toEqual(["-50", "-20", "60"]);
  });

  it("applies the dark mode filter to the stops", async () => {
    const rectangle = API.createElement({
      type: "rectangle",
      backgroundColor: LINEAR,
    });
    const [gradient] = await exportGradientDefs([rectangle], true);

    expect(stopColors(gradient)).toEqual([
      ["0", applyDarkModeFilter("#000000", true)],
      ["1", applyDarkModeFilter("#ffffff", true)],
    ]);
  });

  it("gives each gradient element its own definition", async () => {
    const elements = [
      API.createElement({ type: "rectangle", backgroundColor: LINEAR }),
      API.createElement({ type: "diamond", backgroundColor: RADIAL }),
    ];
    const gradients = await exportGradientDefs(elements);

    expect(gradients.map((gradient) => gradient.id)).toEqual(
      elements.map((element) => `gradient-${element.id}`),
    );
  });

  const exportSvg = (elements: NonDeletedExcalidrawElement[]) =>
    exportToSvg(
      elements,
      { exportBackground: false, viewBackgroundColor: "#ffffff" },
      null,
      { skipInliningFonts: true },
    );

  const gradientFilled = (svg: SVGSVGElement, element: ExcalidrawElement) =>
    svg.querySelectorAll(`[fill="url(#gradient-${element.id})"]`);

  const CLOSED_LOOP = [
    pointFrom<LocalPoint>(0, 0),
    pointFrom<LocalPoint>(100, 0),
    pointFrom<LocalPoint>(100, 100),
    pointFrom<LocalPoint>(0, 100),
    pointFrom<LocalPoint>(0, 0),
  ];

  it.each([
    ["rectangle", { type: "rectangle" }],
    ["diamond", { type: "diamond" }],
    ["ellipse", { type: "ellipse" }],
    ["embeddable", { type: "embeddable" }],
    ["closed line", { type: "line", points: CLOSED_LOOP }],
    ["closed freedraw", { type: "freedraw", points: CLOSED_LOOP }],
  ] as const)("fills a %s with its gradient", async (_, props) => {
    const element = API.createElement({
      ...props,
      width: 100,
      height: 100,
      backgroundColor: LINEAR,
    });
    const svg = await exportSvg([element]);

    expect(gradientFilled(svg, element)).toHaveLength(1);
    expect(
      svg.querySelectorAll(`[fill="${GRADIENT_FILL_PLACEHOLDER}"]`),
    ).toHaveLength(0);
  });

  it("fills a closed arrow but leaves its arrowhead alone", async () => {
    const arrow = API.createElement({
      type: "arrow",
      width: 100,
      height: 100,
      points: CLOSED_LOOP,
      endArrowhead: "triangle",
      strokeColor: "#ff0000",
      backgroundColor: LINEAR,
    });
    const svg = await exportSvg([arrow]);

    expect(gradientFilled(svg, arrow)).toHaveLength(1);
    expect(svg.querySelector('[fill="#ff0000"]')).not.toBeNull();
  });

  it("fills a linked element inside its anchor", async () => {
    // API.createElement doesn't pass `link` through
    const rectangle = {
      ...API.createElement({ type: "rectangle", backgroundColor: LINEAR }),
      link: "https://excalidraw.com",
    };
    const svg = await exportSvg([rectangle]);

    expect(svg.querySelectorAll("a")).toHaveLength(1);
    expect(
      svg
        .querySelector("a")!
        .querySelectorAll(`[fill="url(#gradient-${rectangle.id})"]`),
    ).toHaveLength(1);
  });

  it("keeps the element's opacity on the gradient fill", async () => {
    const rectangle = API.createElement({
      type: "rectangle",
      backgroundColor: LINEAR,
      opacity: 50,
    });
    const svg = await exportSvg([rectangle]);
    const [fill] = gradientFilled(svg, rectangle);

    expect(fill.closest("[fill-opacity]")?.getAttribute("fill-opacity")).toBe(
      "0.5",
    );
  });

  it("fills a gradient element clipped by its frame", async () => {
    const frame = API.createElement({ type: "frame", width: 100, height: 100 });
    const rectangle = API.createElement({
      type: "rectangle",
      x: 50,
      width: 100,
      height: 100,
      frameId: frame.id,
      backgroundColor: LINEAR,
    });
    const svg = await exportToSvg(
      [frame, rectangle],
      {
        exportBackground: false,
        viewBackgroundColor: "#ffffff",
        frameRendering: {
          enabled: true,
          clip: true,
          name: false,
          outline: false,
        },
      },
      null,
      { skipInliningFonts: true },
    );

    expect(
      svg.querySelectorAll(
        `[clip-path] [fill="url(#gradient-${rectangle.id})"]`,
      ),
    ).toHaveLength(1);
  });

  it("fills a gradient element when exporting its frame", async () => {
    const frame = API.createElement({ type: "frame", width: 100, height: 100 });
    const rectangle = API.createElement({
      type: "rectangle",
      width: 100,
      height: 100,
      frameId: frame.id,
      backgroundColor: RADIAL,
    });
    const svg = await exportToSvg(
      [frame, rectangle],
      {
        exportBackground: false,
        exportPadding: 0,
        viewBackgroundColor: "#ffffff",
      },
      null,
      { skipInliningFonts: true, exportingFrame: frame },
    );

    expect(svg.querySelector(`#gradient-${rectangle.id}`)).not.toBeNull();
    expect(gradientFilled(svg, rectangle)).toHaveLength(1);
  });

  it("adds nothing for an open line or a solid fill", async () => {
    const gradients = await exportGradientDefs([
      API.createElement({
        type: "line",
        points: OPEN_LINE,
        backgroundColor: LINEAR,
      }),
      API.createElement({ type: "rectangle", backgroundColor: "#ff0000" }),
    ]);

    expect(gradients).toEqual([]);
  });
});

describe("gradient PNG export and library thumbnails", () => {
  const exportPngGradientCalls = async (
    element: NonDeletedExcalidrawElement,
    exportWithDarkMode = false,
  ) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    const linear = vi.spyOn(context, "createLinearGradient");
    const colorStops: [number, string][] = [];
    const addColorStop = vi
      .spyOn(CanvasGradient.prototype, "addColorStop")
      .mockImplementation((offset, color) => {
        colorStops.push([offset, color]);
      });
    let gradientFills = 0;
    vi.spyOn(context, "fill").mockImplementation(() => {
      if (context.fillStyle instanceof CanvasGradient) {
        gradientFills++;
      }
    });

    await exportToCanvas(
      [element],
      {
        ...getDefaultAppState(),
        // layout fields, unused by export
        width: 0,
        height: 0,
        offsetTop: 0,
        offsetLeft: 0,
        exportScale: 1,
        exportWithDarkMode,
      },
      {},
      { exportBackground: false, viewBackgroundColor: "#ffffff" },
      (width, height) => {
        canvas.width = width;
        canvas.height = height;
        return { canvas, scale: 1 };
      },
    );
    addColorStop.mockRestore();

    return { linear: linear.mock.calls, colorStops, gradientFills };
  };

  it("paints the gradient in element space when exporting to PNG", async () => {
    const rectangle = API.createElement({
      type: "rectangle",
      x: 300,
      y: 200,
      width: 200,
      height: 100,
      angle: (Math.PI / 4) as Radians,
      backgroundColor: LINEAR,
    });
    const { linear, gradientFills } = await exportPngGradientCalls(rectangle);

    // the export canvas is translated/rotated to the element, so the
    // gradient itself stays in element-local coordinates
    expect(linear).toEqual([[0, 0, 200, 0]]);
    expect(gradientFills).toBe(1);
  });

  it("applies the dark mode filter to PNG export stops", async () => {
    const rectangle = API.createElement({
      type: "rectangle",
      backgroundColor: LINEAR,
    });
    const { colorStops } = await exportPngGradientCalls(rectangle, true);

    expect(colorStops).toEqual([
      [0, applyDarkModeFilter("#000000", true)],
      [1, applyDarkModeFilter("#ffffff", true)],
    ]);
  });

  it("keeps the gradient in library item thumbnails", async () => {
    const rectangle = API.createElement({
      type: "rectangle",
      backgroundColor: RADIAL,
    });
    // same call useLibraryItemSvg makes, which restores the elements first
    const svg = await exportLibraryItemSvg({
      elements: [rectangle],
      appState: {
        exportBackground: false,
        viewBackgroundColor: COLOR_PALETTE.white,
      },
      files: null,
      renderEmbeddables: false,
      skipInliningFonts: true,
    });

    expect(
      svg.querySelector(`radialGradient#gradient-${rectangle.id}`),
    ).not.toBeNull();
    expect(
      svg.querySelectorAll(`[fill="url(#gradient-${rectangle.id})"]`),
    ).toHaveLength(1);
  });
});

describe("gradient through duplication", () => {
  it("is kept when duplicating", async () => {
    const rect = API.createElement({
      type: "rectangle",
      backgroundColor: LINEAR,
    });
    API.setElements([rect]);
    API.setSelectedElements([rect]);

    API.executeAction(actionDuplicateSelection);

    expect(h.elements).toHaveLength(2);
    expect(h.elements.map((el) => el.backgroundColor)).toEqual([
      LINEAR,
      LINEAR,
    ]);
  });

  it("is kept when copy-pasting", async () => {
    const rect = API.createElement({
      type: "rectangle",
      backgroundColor: RADIAL,
    });
    const clipboardJSON = await serializeAsClipboardJSON({
      elements: [rect],
      files: null,
    });

    Keyboard.withModifierKeys({ ctrl: true }, () => {
      // keydown with an empty clipboard, then the paste event with the data
      Keyboard.keyPress(KEYS.V);
      document.dispatchEvent(
        createPasteEvent({ types: { "text/plain": clipboardJSON } }),
      );
    });

    await waitFor(() => {
      expect(h.elements).toHaveLength(1);
    });
    expect(h.elements[0].backgroundColor).toBe(RADIAL);
  });
});

describe("gradient through flipping", () => {
  it.each(["rectangle", "ellipse", "diamond", "triangle"] as const)(
    "mirrors a linear gradient when a %s is flipped horizontally",
    async (type) => {
      const element = API.createElement({ type, backgroundColor: LINEAR });
      API.setElements([element]);
      API.setSelectedElements([element]);

      API.executeAction(actionFlipHorizontal);

      expect(gradientOf(element)).toEqual({
        type: "linear",
        startColor: "#ffffff",
        endColor: "#000000",
      });
    },
  );

  it("mirrors a linear gradient when a closed line is flipped horizontally", async () => {
    const line = API.createElement({
      type: "line",
      width: 100,
      height: 100,
      points: RIGHTWARD_LOOP,
      backgroundColor: LINEAR,
    });
    API.setElements([line]);
    API.setSelectedElements([line]);

    API.executeAction(actionFlipHorizontal);

    expect(API.getElement(line).backgroundColor).toBe(LINEAR_REVERSED);
  });

  it("restores the original gradient after flipping horizontally twice", async () => {
    const rect = API.createElement({
      type: "rectangle",
      backgroundColor: LINEAR,
    });
    API.setElements([rect]);
    API.setSelectedElements([rect]);

    API.executeAction(actionFlipHorizontal);
    API.executeAction(actionFlipHorizontal);

    expect(API.getElement(rect).backgroundColor).toBe(LINEAR);
  });

  it("leaves a linear gradient unchanged on a vertical flip", async () => {
    const rect = API.createElement({
      type: "rectangle",
      backgroundColor: LINEAR,
    });
    API.setElements([rect]);
    API.setSelectedElements([rect]);

    API.executeAction(actionFlipVertical);

    expect(API.getElement(rect).backgroundColor).toBe(LINEAR);
  });

  it("leaves a radial gradient unchanged on a horizontal flip", async () => {
    const rect = API.createElement({
      type: "rectangle",
      backgroundColor: RADIAL,
    });
    API.setElements([rect]);
    API.setSelectedElements([rect]);

    API.executeAction(actionFlipHorizontal);

    expect(API.getElement(rect).backgroundColor).toBe(RADIAL);
  });

  it("mirrors every gradient in a multi-element flip", async () => {
    const rect = API.createElement({
      type: "rectangle",
      x: 0,
      backgroundColor: LINEAR,
    });
    const ellipse = API.createElement({
      type: "ellipse",
      x: 200,
      backgroundColor: LINEAR,
    });
    API.setElements([rect, ellipse]);
    API.setSelectedElements([rect, ellipse]);

    API.executeAction(actionFlipHorizontal);

    expect(API.getElement(rect).backgroundColor).toBe(LINEAR_REVERSED);
    expect(API.getElement(ellipse).backgroundColor).toBe(LINEAR_REVERSED);
  });
});

describe("gradient through flipping by dragging a handle", () => {
  /** drags one of the element's resize handles through several moves */
  const dragHandle = (
    element: ExcalidrawElement,
    handle: "e" | "s",
    moves: [deltaX: number, deltaY: number][],
  ) => {
    API.setSelectedElements([element as NonDeletedExcalidrawElement]);
    const [x, y, width, height] = getTransformHandles(
      API.getElement(element) as NonDeletedExcalidrawElement,
      h.state.zoom,
      arrayToMap(h.elements),
      "mouse",
      {},
    )[handle]!;
    const mouse = new Pointer("mouse");
    mouse.reset();
    mouse.down(x + width / 2, y + height / 2);
    moves.forEach(([deltaX, deltaY]) => mouse.move(deltaX, deltaY));
    mouse.up();
  };

  it("mirrors a linear gradient when dragged past the opposite edge", async () => {
    const rect = API.createElement({
      type: "rectangle",
      backgroundColor: LINEAR,
    });
    API.setElements([rect]);

    UI.resize(rect, "e", [-200, 0]);

    expect(API.getElement(rect).backgroundColor).toBe(LINEAR_REVERSED);
  });

  it("keeps the gradient when resized without crossing the opposite edge", async () => {
    const rect = API.createElement({
      type: "rectangle",
      backgroundColor: LINEAR,
    });
    API.setElements([rect]);

    UI.resize(rect, "e", [-50, 0]);

    expect(API.getElement(rect).width).toBe(50);
    expect(API.getElement(rect).backgroundColor).toBe(LINEAR);
  });

  it("restores the gradient when dragged back across in the same drag", async () => {
    const rect = API.createElement({
      type: "rectangle",
      backgroundColor: LINEAR,
    });
    API.setElements([rect]);

    dragHandle(rect, "e", [
      [-200, 0],
      [200, 0],
    ]);

    expect(API.getElement(rect).backgroundColor).toBe(LINEAR);
  });

  it("leaves a linear gradient unchanged when dragged past vertically", async () => {
    const rect = API.createElement({
      type: "rectangle",
      backgroundColor: LINEAR,
    });
    API.setElements([rect]);

    UI.resize(rect, "s", [0, -200]);

    expect(API.getElement(rect).backgroundColor).toBe(LINEAR);
  });

  it("mirrors a closed line when dragged past the opposite edge", async () => {
    const line = API.createElement({
      type: "line",
      width: 100,
      height: 100,
      points: RIGHTWARD_LOOP,
      backgroundColor: LINEAR,
    });
    API.setElements([line]);

    UI.resize(line, "se", [-200, 0]);
    expect(API.getElement(line).points).not.toEqual(RIGHTWARD_LOOP);

    expect(API.getElement(line).backgroundColor).toBe(LINEAR_REVERSED);
  });

  it("mirrors every gradient when a multi-selection is dragged past its edge", async () => {
    const rect = API.createElement({
      type: "rectangle",
      x: 0,
      backgroundColor: LINEAR,
    });
    const ellipse = API.createElement({
      type: "ellipse",
      x: 200,
      backgroundColor: LINEAR,
    });
    API.setElements([rect, ellipse]);

    UI.resize([rect, ellipse], "se", [-400, 0]);

    expect(API.getElement(rect).backgroundColor).toBe(LINEAR_REVERSED);
    expect(API.getElement(ellipse).backgroundColor).toBe(LINEAR_REVERSED);
  });
});

describe("gradient picker availability", () => {
  const gradientToggle = () => screen.queryByText("Use gradient");

  it("adjusts the color stops with the preview handles", async () => {
    const rect = API.createElement({
      type: "rectangle",
      backgroundColor: LINEAR,
    });
    API.setElements([rect]);
    API.setSelectedElements([rect]);
    togglePopover("Background");

    const leftHandle = screen.getByRole("slider", {
      name: "End color stop position",
    });
    const rightHandle = screen.getByRole("slider", {
      name: "Start color stop position",
    });
    expect(leftHandle).toHaveAttribute("aria-valuenow", "0");
    expect(rightHandle).toHaveAttribute("aria-valuenow", "100");

    fireEvent.keyDown(leftHandle, { key: "ArrowRight" });

    expect(leftHandle).toHaveAttribute("aria-valuenow", "1");
    expect(
      document.querySelector(".background-gradient-picker__preview"),
    ).toHaveStyle({
      backgroundImage: expect.stringContaining("#000000 1%"),
    });
  });

  it("drags the color-stop handles along the preview", async () => {
    const rect = API.createElement({
      type: "rectangle",
      backgroundColor: LINEAR,
    });
    API.setElements([rect]);
    API.setSelectedElements([rect]);
    togglePopover("Background");

    const preview = document.querySelector(
      ".background-gradient-picker__preview",
    )!;
    Object.defineProperty(preview, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        right: 100,
        top: 0,
        bottom: 24,
        width: 100,
        height: 24,
        x: 0,
        y: 0,
        toJSON: () => {},
      }),
    });
    const leftHandle = screen.getByRole("slider", {
      name: "End color stop position",
    });
    Object.defineProperties(leftHandle, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: vi.fn() },
    });

    fireEvent.pointerDown(leftHandle, {
      pointerId: 1,
      clientX: 0,
      buttons: 1,
    });
    fireEvent.pointerMove(leftHandle, {
      pointerId: 1,
      clientX: 25,
      buttons: 1,
    });
    fireEvent.pointerUp(leftHandle, { pointerId: 1 });

    expect(leftHandle).toHaveAttribute("aria-valuenow", "25");
    expect(preview).toHaveStyle({
      backgroundImage: expect.stringContaining("#000000 25%"),
    });
  });

  it("is offered for a rectangle", async () => {
    const rect = API.createElement({ type: "rectangle" });
    API.setElements([rect]);
    API.setSelectedElements([rect]);

    togglePopover("Background");

    expect(gradientToggle()).not.toBeNull();
  });

  it("is offered for a closed line", async () => {
    const line = API.createElement({
      type: "line",
      width: 100,
      height: 100,
      points: RIGHTWARD_LOOP,
    });
    API.setElements([line]);
    API.setSelectedElements([line]);

    togglePopover("Background");

    expect(gradientToggle()).not.toBeNull();
  });

  it("is not offered for an open line", async () => {
    const line = API.createElement({ type: "line", points: OPEN_LINE });
    API.setElements([line]);
    API.setSelectedElements([line]);

    togglePopover("Background");

    expect(gradientToggle()).toBeNull();
  });

  it("is offered for an open line that can become a polygon, and closes it", async () => {
    const line = API.createElement({
      type: "line",
      width: 100,
      height: 100,
      points: [
        pointFrom<LocalPoint>(0, 0),
        pointFrom<LocalPoint>(100, 0),
        pointFrom<LocalPoint>(100, 100),
      ],
    });
    API.setElements([line]);
    API.setSelectedElements([line]);

    togglePopover("Background");
    const toggle = gradientToggle();
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle!);

    const updated = API.getElement(line) as ExcalidrawLineElement;
    expect(gradientOf(updated)).not.toBeNull();
    expect(updated.polygon).toBe(true);
    expect(renderGradientCalls(updated).gradientFills).toBe(1);
  });

  it("is not offered for an open arrow", async () => {
    const arrow = API.createElement({ type: "arrow", points: OPEN_LINE });
    API.setElements([arrow]);
    API.setSelectedElements([arrow]);

    togglePopover("Background");

    expect(gradientToggle()).toBeNull();
  });

  it("applies only to supported elements in a mixed selection", async () => {
    const rect = API.createElement({
      type: "rectangle",
      backgroundColor: "#a5d8ff",
    });
    const line = API.createElement({
      type: "line",
      x: 200,
      points: OPEN_LINE,
      backgroundColor: "#a5d8ff",
    });
    API.setElements([rect, line]);
    API.setSelectedElements([rect, line]);

    togglePopover("Background");
    const toggle = gradientToggle();
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle!);

    expect(gradientOf(rect)).not.toBeNull();
    expect(API.getElement(line).backgroundColor).toBe("#a5d8ff");
  });
});
