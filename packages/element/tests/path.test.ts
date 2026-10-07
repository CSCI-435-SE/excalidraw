import { pointFrom, type LocalPoint, type Radians } from "@excalidraw/math";
import { arrayToMap, ROUNDNESS } from "@excalidraw/common";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import type { EditorInterface } from "@excalidraw/common";
import type { AppState, Zoom } from "@excalidraw/excalidraw/types";

import { getElementAbsoluteCoords } from "../src/bounds";
import { rescalePointsInElement } from "../src/resizeElements";
import { resizeTest } from "../src/resizeTest";
import { getTransformHandles } from "../src/transformHandles";
import { getPathSamplePoints } from "../src/pathSamples";
import {
  getPathAlignmentOffset,
  getPathGlobalSamplePoints,
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

describe("path transform handles", () => {
  it("offers resize and rotation handles, like a line", () => {
    const path = API.createElement({
      type: "path",
      x: 0,
      y: 0,
      points: [pointFrom(0, 0), pointFrom(50, 50)],
    });
    const elementsMap = arrayToMap([path]);

    const handles = getTransformHandles(path, zoom1x, elementsMap);

    expect(handles.rotation).toBeDefined();
    expect(handles.nw).toBeDefined();
    expect(handles.se).toBeDefined();
    // a 2-point path omits side handles, same as a 2-point line
    expect(handles.n).toBeUndefined();
    expect(handles.e).toBeUndefined();
  });

  it("does not resize a 2-point path from a click on its bounding-box edge", () => {
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

  it("rescales its points when resized", () => {
    const path = API.createElement({
      type: "path",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      points: [pointFrom(0, 0), pointFrom(100, 50), pointFrom(50, 0)],
    });

    const { points } = rescalePointsInElement(path, 200, 100, true) as {
      points: LocalPoint[];
    };

    expect(points).toEqual([
      pointFrom(0, 0),
      pointFrom(200, 100),
      pointFrom(100, 0),
    ]);
  });
});

describe("curved and rotated paths", () => {
  it("getPathSamplePoints returns raw points when straight", () => {
    const path = API.createElement({
      type: "path",
      x: 0,
      y: 0,
      points: [pointFrom(0, 0), pointFrom(100, 0), pointFrom(100, 100)],
    });

    expect(getPathSamplePoints(path)).toEqual(path.points);
  });

  it("getPathSamplePoints samples a smooth curve through every point when rounded", () => {
    const points: LocalPoint[] = [
      pointFrom(0, 0),
      pointFrom(100, 0),
      pointFrom(100, 100),
    ];
    const path = API.createElement({
      type: "path",
      x: 0,
      y: 0,
      points,
      roundness: { type: ROUNDNESS.PROPORTIONAL_RADIUS },
    });

    const samples = getPathSamplePoints(path);

    expect(samples.length).toBeGreaterThan(points.length);
    // passes through every waypoint, starting and ending on the raw points
    for (const [x, y] of points) {
      expect(
        samples.some(
          ([sx, sy]) => Math.abs(sx - x) < 1e-6 && Math.abs(sy - y) < 1e-6,
        ),
      ).toBe(true);
    }
    expect(samples[0]).toEqual(points[0]);
    expect(samples[samples.length - 1]).toEqual(points[2]);
    // rounds the corner instead of going through (100,0) at a sharp angle:
    // some sample lies strictly inside the corner's triangle
    expect(samples.some(([x, y]) => x > 100 || (x < 100 && y > 0))).toBe(true);
  });

  it("getPathGlobalSamplePoints applies the path's rotation", () => {
    // horizontal path from (0,0) to (100,0) at x:100,y:100 → center (150,100)
    const path = API.createElement({
      type: "path",
      x: 100,
      y: 100,
      width: 100,
      height: 0,
      angle: Math.PI as Radians,
      points: [pointFrom(0, 0), pointFrom(100, 0)],
    });
    const elementsMap = arrayToMap([path]);

    const [start, end] = getPathGlobalSamplePoints(path, elementsMap);

    // rotated 180° around its center: start and end swap sides
    expect(start[0]).toBeCloseTo(200);
    expect(start[1]).toBeCloseTo(100);
    expect(end[0]).toBeCloseTo(100);
    expect(end[1]).toBeCloseTo(100);
  });

  it("getPathAlignmentOffset snaps to the rotated start point", () => {
    // rectangle centered at (50, 50)
    const rectangle = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const path = API.createElement({
      type: "path",
      x: 100,
      y: 100,
      width: 100,
      height: 0,
      angle: Math.PI as Radians,
      points: [pointFrom(0, 0), pointFrom(100, 0)],
      targetElementId: rectangle.id,
    });
    const elementsMap = arrayToMap([rectangle, path]);

    const offset = getPathAlignmentOffset(path, [rectangle], elementsMap);

    // rotated start is (200, 100)
    expect(offset.x).toBeCloseTo(150);
    expect(offset.y).toBeCloseTo(50);
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
