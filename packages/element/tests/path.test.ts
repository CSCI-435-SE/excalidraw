import { pointFrom, type LocalPoint } from "@excalidraw/math";
import { arrayToMap } from "@excalidraw/common";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import type { EditorInterface } from "@excalidraw/common";
import type { AppState, Zoom } from "@excalidraw/excalidraw/types";

import { getElementAbsoluteCoords } from "../src/bounds";
import { resizeTest } from "../src/resizeTest";
import { getTransformHandles } from "../src/transformHandles";
import {
  getPathAlignmentOffset,
  getPathLength,
  getPathTargetElements,
  getPathsTargetingElement,
  getPointAtProgress,
} from "../src/path";

const zoom1x = { value: 1 } as Zoom;

const desktopEditorInterface = {
  formFactor: "desktop",
  desktopUIMode: "full",
  userAgent: { isMobileDevice: false, platform: "other" },
  isTouchScreen: false,
  canFitSidebar: true,
  isLandscape: true,
} as EditorInterface;

describe("path geometry helpers", () => {
  it("getPathLength sums segment distances", () => {
    const points: LocalPoint[] = [
      pointFrom(0, 0),
      pointFrom(30, 40), // 50
      pointFrom(30, 10), // 30
    ];
    expect(getPathLength(points)).toEqual(80);
  });

  it("getPointAtProgress interpolates along the ordered segments", () => {
    const points: LocalPoint[] = [pointFrom(0, 0), pointFrom(100, 0)];
    expect(getPointAtProgress(points, 0)).toEqual({ x: 0, y: 0 });
    expect(getPointAtProgress(points, 0.5)).toEqual({ x: 50, y: 0 });
    expect(getPointAtProgress(points, 1)).toEqual({ x: 100, y: 0 });
  });
});

describe("getElementAbsoluteCoords for path elements", () => {
  it("accounts for points extending left/above the first point (not clipped to x,y + width,height)", () => {
    // a point further left and above the first point — this previously fell
    // through to the generic x,y+width,height bounds calc (which assumes
    // element.x/y is always the top-left corner), hiding that portion of
    // the path
    const points: LocalPoint[] = [
      pointFrom(0, 0),
      pointFrom(-50, -40),
      pointFrom(20, 10),
    ];
    const element = API.createElement({
      type: "path",
      x: 200,
      y: 200,
      points,
    });
    const elementsMap = arrayToMap([element]);

    const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);

    // the leftmost/topmost point is at local (-50,-40), so absolute bounds
    // must extend to (200-50, 200-40), not stop at element.x/y
    expect(x1).toEqual(150);
    expect(y1).toEqual(160);
    expect(x2).toEqual(220);
    expect(y2).toEqual(210);
  });
});

describe("getPathAlignmentOffset", () => {
  it("snaps the target's bounding-box center onto the path's first point", () => {
    // rectangle centered at (50, 50) (x:0,y:0,w:100,h:100)
    const rectangle = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    // path starting at absolute (300, 400)
    const path = API.createElement({
      type: "path",
      x: 300,
      y: 400,
      points: [pointFrom(0, 0), pointFrom(50, 50)],
      targetElementId: rectangle.id,
    });
    const elementsMap = arrayToMap([rectangle, path]);

    const offset = getPathAlignmentOffset(path, [rectangle], elementsMap);

    expect(offset).toEqual({ x: 250, y: 350 });
  });

  it("is a no-op once the target is already centered on the path's start", () => {
    const rectangle = API.createElement({
      type: "rectangle",
      // centered at (300, 400), matching the path's start below
      x: 250,
      y: 350,
      width: 100,
      height: 100,
    });
    const path = API.createElement({
      type: "path",
      x: 300,
      y: 400,
      points: [pointFrom(0, 0), pointFrom(50, 50)],
      targetElementId: rectangle.id,
    });
    const elementsMap = arrayToMap([rectangle, path]);

    const offset = getPathAlignmentOffset(path, [rectangle], elementsMap);

    expect(offset).toEqual({ x: 0, y: 0 });
  });
});

describe("path elements show no transform handles at all", () => {
  it("omits resize and rotation handles alike (can only be moved, not resized/rotated)", () => {
    const path = API.createElement({
      type: "path",
      x: 0,
      y: 0,
      points: [pointFrom(0, 0), pointFrom(50, 50)],
    });
    const elementsMap = arrayToMap([path]);

    const handles = getTransformHandles(path, zoom1x, elementsMap);

    expect(handles).toEqual({});
  });

  it("also refuses to resize from a click directly on the bounding-box edge", () => {
    // resizeTest has its own independent "grab the box edge directly" path
    // (canResizeFromSides) that hit-tests edge line segments regardless of
    // whether a discrete handle was drawn there — this must be refused for
    // path too, or the box edge remains draggable-to-resize despite having
    // no visible handles
    const path = API.createElement({
      type: "path",
      x: 0,
      y: 0,
      width: 100,
      height: 0,
      points: [pointFrom(0, 0), pointFrom(100, 0)],
    });
    const elementsMap = arrayToMap([path]);
    const appState = {
      selectedElementIds: { [path.id]: true },
    } as AppState;

    // click right on the path's own line (its "edge"), at its midpoint
    const handleType = resizeTest(
      path,
      elementsMap,
      appState,
      50,
      0,
      zoom1x,
      "mouse",
      desktopEditorInterface,
    );

    expect(handleType).toBe(false);
  });
});

describe("getPathTargetElements / getPathsTargetingElement", () => {
  it("resolves a single-element target and its reverse lookup", () => {
    const rectangle = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 50,
      height: 50,
    });
    const path = API.createElement({
      type: "path",
      x: 100,
      y: 100,
      points: [pointFrom(0, 0), pointFrom(50, 50)],
      targetElementId: rectangle.id,
    });
    const elements = [rectangle, path];

    expect(getPathTargetElements(path, elements)).toEqual([rectangle]);
    expect(getPathsTargetingElement(rectangle, elements)).toEqual([path]);
  });

  it("returns an empty array once the target is deleted", () => {
    const rectangle = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      isDeleted: true,
    });
    const path = API.createElement({
      type: "path",
      x: 100,
      y: 100,
      points: [pointFrom(0, 0), pointFrom(50, 50)],
      targetElementId: rectangle.id,
    });

    expect(getPathTargetElements(path, [rectangle, path])).toEqual([]);
  });
});
