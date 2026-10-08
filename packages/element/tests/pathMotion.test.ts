import { pointFrom, type LocalPoint } from "@excalidraw/math";
import { arrayToMap } from "@excalidraw/common";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import { getPathAlignmentOffset } from "../src/path";
import {
  DEFAULT_PATH_MOTION,
  getPathMotionEasing,
  normalizePathMotion,
} from "../src/pathMotion";

import type { PathMotionEasing } from "../src/types";

describe("getPathMotionEasing", () => {
  const easings: PathMotionEasing[] = [
    "linear",
    "easeIn",
    "easeOut",
    "easeInOut",
  ];

  it.each(easings)("%s maps 0 → 0 and 1 → 1 monotonically", (name) => {
    const ease = getPathMotionEasing(name);
    expect(ease(0)).toBeCloseTo(0);
    expect(ease(1)).toBeCloseTo(1);

    let previous = ease(0);
    for (let t = 0.05; t <= 1; t += 0.05) {
      const value = ease(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("shapes the midpoint as expected", () => {
    expect(getPathMotionEasing("linear")(0.5)).toBeCloseTo(0.5);
    expect(getPathMotionEasing("easeIn")(0.5)).toBeLessThan(0.5);
    expect(getPathMotionEasing("easeOut")(0.5)).toBeGreaterThan(0.5);
    expect(getPathMotionEasing("easeInOut")(0.5)).toBeCloseTo(0.5);
  });
});

describe("normalizePathMotion", () => {
  it("fills in defaults for missing config (legacy paths)", () => {
    expect(normalizePathMotion(undefined)).toEqual(DEFAULT_PATH_MOTION);
    expect(normalizePathMotion({})).toEqual(DEFAULT_PATH_MOTION);
  });

  it("keeps valid values", () => {
    expect(
      normalizePathMotion({
        speed: 2,
        start: 0.25,
        end: 0.75,
        easing: "easeInOut",
      }),
    ).toEqual({ speed: 2, start: 0.25, end: 0.75, easing: "easeInOut" });
  });

  it("rejects non-positive / invalid speeds and unknown easings", () => {
    expect(normalizePathMotion({ speed: 0 }).speed).toEqual(1);
    expect(normalizePathMotion({ speed: -2 }).speed).toEqual(1);
    expect(normalizePathMotion({ speed: NaN }).speed).toEqual(1);
    expect(
      normalizePathMotion({ easing: "bounce" as PathMotionEasing }).easing,
    ).toEqual("linear");
  });

  it("clamps start/end into [0, 1] and never lets them cross", () => {
    expect(normalizePathMotion({ start: -1, end: 2 })).toMatchObject({
      start: 0,
      end: 1,
    });
    // end dragged below start → pushed just past it
    const crossed = normalizePathMotion({ start: 0.8, end: 0.5 });
    expect(crossed.start).toBeCloseTo(0.8);
    expect(crossed.end).toBeCloseTo(0.81);
    // start dragged all the way to the end → leaves room for the min span
    const atEnd = normalizePathMotion({ start: 1, end: 1 });
    expect(atEnd.start).toBeCloseTo(0.99);
    expect(atEnd.end).toBeCloseTo(1);
  });
});

describe("getPathAlignmentOffset honors motion.start", () => {
  const setup = (start: number) => {
    const rectangle = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const points: LocalPoint[] = [pointFrom(0, 0), pointFrom(200, 0)];
    const path = API.createElement({
      type: "path",
      x: 300,
      y: 300,
      width: 200,
      height: 0,
      points,
      targetElementId: rectangle.id,
      motion: { start },
    });
    return { rectangle, path, elementsMap: arrayToMap([rectangle, path]) };
  };

  it("aligns onto the path's first point by default", () => {
    const { rectangle, path, elementsMap } = setup(0);
    // rectangle center (50, 50) → (300, 300)
    expect(getPathAlignmentOffset(path, [rectangle], elementsMap)).toEqual({
      x: 250,
      y: 250,
    });
  });

  it("aligns onto the configured start fraction", () => {
    const { rectangle, path, elementsMap } = setup(0.5);
    // halfway along (300,300)→(500,300) is (400, 300)
    expect(getPathAlignmentOffset(path, [rectangle], elementsMap)).toEqual({
      x: 350,
      y: 250,
    });
  });
});
