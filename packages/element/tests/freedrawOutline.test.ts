import { THEME } from "@excalidraw/common";
import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";

import { newFreeDrawElement } from "../src/newElement";
import { getFreedrawOutlinePoints, ShapeCache } from "../src/shape";

import type { ExcalidrawFreeDrawElement } from "../src/types";

type Point = [number, number];

const STROKE_WIDTH = 2;

// longest straight edge the outline polygon may contain. Densely sampled
// strokes stay well under this (~8px variable, ~4px constant at
// strokeWidth 2); anything longer renders as a visible flat facet
const MAX_OUTLINE_EDGE = 12;

// the stroke right after a pointer jump must keep at least this fraction of
// its regular half-width (simulated pressure must not collapse it)
const MIN_WIDTH_RATIO_AFTER_JUMP = 0.75;

const createFreedraw = (
  points: Point[],
  variability: "variable" | "constant",
) =>
  newFreeDrawElement({
    type: "freedraw",
    x: 0,
    y: 0,
    strokeWidth: STROKE_WIDTH,
    simulatePressure: true,
    points: points.map(([x, y]) => pointFrom<LocalPoint>(x, y)),
    strokeOptions: { variability, streamline: 0.5 },
  });

// gently wavy horizontal run, sampled every `step` px like pointermove events
const wavyRun = (fromX: number, toX: number, step = 3): Point[] => {
  const points: Point[] = [];
  for (let x = fromX; x <= toX; x += step) {
    points.push([x, Math.sin(x / 15) * 5]);
  }
  return points;
};

const SMOOTH_STROKE = wavyRun(0, 300);

// pointer jumps 120px between two consecutive samples (dropped frames, pen
// leaving hover range, ...) and then carries on in the same direction
const STRAIGHT_JUMP_STROKE = [...wavyRun(0, 120), ...wavyRun(240, 300)];

// pointer jumps and the stroke continues in a different direction
const TURNING_JUMP_STROKE: Point[] = [...wavyRun(0, 120)];
for (let i = 0; i <= 40; i++) {
  TURNING_JUMP_STROKE.push([200 + i * 2, 80 + i * 3]);
}

const getMaxOutlineEdge = (element: ExcalidrawFreeDrawElement) => {
  const outline = getFreedrawOutlinePoints(element);
  let maxEdge = 0;
  for (let i = 0; i < outline.length; i++) {
    const [ax, ay] = outline[i];
    const [bx, by] = outline[(i + 1) % outline.length];
    maxEdge = Math.max(maxEdge, Math.hypot(bx - ax, by - ay));
  }
  return maxEdge;
};

const distanceToSegment = (
  [px, py]: Point,
  [ax, ay]: Point,
  [bx, by]: Point,
) => {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq
    ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq))
    : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};

const isInsidePolygon = ([px, py]: Point, polygon: Point[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[j];
    const aAbove = ay > py;
    const bAbove = by > py;
    if (aAbove !== bAbove && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) {
      inside = !inside;
    }
  }
  return inside;
};

/**
 * Half-width of the rendered stroke at each drawn point within [fromX, toX]:
 * distance from the point to the nearest outline edge, or 0 if the outline
 * doesn't even cover the point.
 */
const getHalfWidths = (
  element: ExcalidrawFreeDrawElement,
  fromX: number,
  toX: number,
) => {
  const outline = getFreedrawOutlinePoints(element);
  return element.points
    .filter(([x]) => x >= fromX && x <= toX)
    .map(([x, y]): number => {
      const point: Point = [x, y];
      if (!isInsidePolygon(point, outline)) {
        return 0;
      }
      let min = Infinity;
      for (let i = 0; i < outline.length; i++) {
        min = Math.min(
          min,
          distanceToSegment(
            point,
            outline[i],
            outline[(i + 1) % outline.length],
          ),
        );
      }
      return min;
    });
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

describe("freedraw outline with pointer position jumps", () => {
  describe.each(["variable", "constant"] as const)(
    "%s width stroke",
    (variability) => {
      it("has no long straight outline edges for a densely sampled stroke", () => {
        expect(
          getMaxOutlineEdge(createFreedraw(SMOOTH_STROKE, variability)),
        ).toBeLessThanOrEqual(MAX_OUTLINE_EDGE);
      });

      it.each([
        ["straight", STRAIGHT_JUMP_STROKE],
        ["turning", TURNING_JUMP_STROKE],
      ])(
        "has no long straight outline edges across a %s pointer jump",
        (_, points) => {
          expect(
            getMaxOutlineEdge(createFreedraw(points, variability)),
          ).toBeLessThanOrEqual(MAX_OUTLINE_EDGE);
        },
      );
    },
  );

  describe("variable width stroke with simulated pressure", () => {
    const expectWidthHeldAfterX240 = (points: Point[]) => {
      const element = createFreedraw(points, "variable");
      const regularHalfWidth = median(getHalfWidths(element, 30, 110));
      const halfWidthsAfterJump = getHalfWidths(element, 240, 270);

      expect(halfWidthsAfterJump.length).toBeGreaterThan(0);
      expect(Math.min(...halfWidthsAfterJump)).toBeGreaterThanOrEqual(
        regularHalfWidth * MIN_WIDTH_RATIO_AFTER_JUMP,
      );
    };

    it("keeps a constant width along a densely sampled stroke", () => {
      expectWidthHeldAfterX240(SMOOTH_STROKE);
    });

    it("doesn't pinch the stroke right after a pointer jump", () => {
      expectWidthHeldAfterX240(STRAIGHT_JUMP_STROKE);
    });
  });
});

describe("freedraw svg path", () => {
  const getFreedrawSvgPath = (element: ExcalidrawFreeDrawElement) =>
    ShapeCache.generateElementShape(element, {
      isExporting: false,
      canvasBackgroundColor: "#ffffff",
      embedsValidationStatus: new Map(),
      theme: THEME.LIGHT,
    }).find((shape) => typeof shape === "string") as string;

  // pressing down and nudging the pointer straight down/right puts outline
  // points within float error of the element's local axes (e.g. 3.4e-16)
  describe.each(["variable", "constant"] as const)(
    "%s width stroke",
    (variability) => {
      it.each([
        [
          "down",
          [
            [0, 0],
            [0, 1],
          ] as Point[],
        ],
        [
          "further down",
          [
            [0, 0],
            [0, 1],
            [0, 2],
            [0, 3],
          ] as Point[],
        ],
        [
          "right",
          [
            [0, 0],
            [1, 0],
            [2, 0],
            [3, 0],
          ] as Point[],
        ],
      ])(
        "stays within the outline when nudging the pointer %s",
        (_, points) => {
          const element = createFreedraw(points, variability);
          const outline = getFreedrawOutlinePoints(element);
          const xs = outline.map(([x]) => x);
          const ys = outline.map(([, y]) => y);
          // path coords are rounded to 2 decimals
          const tolerance = 0.01;

          const coords = getFreedrawSvgPath(element)
            .match(/-?[\d.]+,-?[\d.]+/g)!
            .map((pair) => pair.split(",").map(Number));

          expect(coords.length).toBeGreaterThan(0);
          for (const [x, y] of coords) {
            expect(x).toBeGreaterThanOrEqual(Math.min(...xs) - tolerance);
            expect(x).toBeLessThanOrEqual(Math.max(...xs) + tolerance);
            expect(y).toBeGreaterThanOrEqual(Math.min(...ys) - tolerance);
            expect(y).toBeLessThanOrEqual(Math.max(...ys) + tolerance);
          }
        },
      );
    },
  );
});
