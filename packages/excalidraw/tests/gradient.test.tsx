import React from "react";
import rough from "roughjs/bin/rough";
import { vi } from "vitest";

import { arrayToMap, KEYS } from "@excalidraw/common";

import { pointFrom } from "@excalidraw/math";

import {
  createGradientBackground,
  getGradientColors,
  renderElement,
} from "@excalidraw/element";

import type { LocalPoint } from "@excalidraw/math";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";

import {
  actionDuplicateSelection,
  actionFlipHorizontal,
  actionFlipVertical,
} from "../actions";
import { createPasteEvent, serializeAsClipboardJSON } from "../clipboard";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, UI } from "./helpers/ui";
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
  // createLinearGradient runs before the "is it closed" check, so count the
  // fills actually painted with a gradient to know whether one is visible
  let gradientFills = 0;
  vi.spyOn(context, "fill").mockImplementation(() => {
    if (context.fillStyle instanceof CanvasGradient) {
      gradientFills++;
    }
  });
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

  return {
    linear: linear.mock.calls as number[][],
    radial: radial.mock.calls as number[][],
    gradientFills,
  };
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

describe("gradient picker availability", () => {
  const gradientToggle = () => screen.queryByText("Use gradient");

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
