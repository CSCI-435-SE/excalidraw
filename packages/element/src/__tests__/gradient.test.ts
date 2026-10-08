import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";

import {
  canHaveGradient,
  createGradientBackground,
  flipGradientHorizontally,
  getGradientColors,
} from "../gradient";

import type { ExcalidrawElement } from "../types";

// canHaveGradient only reads `type` and `points`
const element = (type: string, points?: [number, number][]) =>
  ({
    type,
    points: points?.map(([x, y]) => pointFrom<LocalPoint>(x, y)),
  } as unknown as ExcalidrawElement);

const CLOSED = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 0],
] as [number, number][];
const TWO_POINTS = [
  [0, 0],
  [100, 100],
] as [number, number][];
const THREE_POINTS_OPEN = [
  [0, 0],
  [100, 0],
  [100, 100],
] as [number, number][];

describe("gradient background", () => {
  it("creates and parses a linear two-color gradient", () => {
    const backgroundColor = createGradientBackground(
      "linear",
      "#000000",
      "#ffffff",
    );

    expect(getGradientColors(backgroundColor)).toEqual({
      type: "linear",
      startColor: "#000000",
      endColor: "#ffffff",
    });
  });

  it("creates and parses a radial two-color gradient", () => {
    const backgroundColor = createGradientBackground(
      "radial",
      "#000000",
      "#ffffff",
    );

    expect(getGradientColors(backgroundColor)).toEqual({
      type: "radial",
      startColor: "#000000",
      endColor: "#ffffff",
    });
  });

  it("parses CSS colors that contain commas", () => {
    const backgroundColor = createGradientBackground(
      "linear",
      "rgb(0, 0, 0)",
      "rgba(255, 255, 255, 0.5)",
    );

    expect(getGradientColors(backgroundColor)).toEqual({
      type: "linear",
      startColor: "rgb(0, 0, 0)",
      endColor: "rgba(255, 255, 255, 0.5)",
    });
  });

  it("returns null for non-gradient background colors", () => {
    expect(getGradientColors("#000000")).toBeNull();
  });

  it("swaps the stops of a linear gradient when flipped horizontally", () => {
    expect(
      flipGradientHorizontally(
        createGradientBackground("linear", "rgb(0, 0, 0)", "#ffffff"),
      ),
    ).toBe(createGradientBackground("linear", "#ffffff", "rgb(0, 0, 0)"));
  });

  it("leaves radial gradients and solid colors unchanged when flipped horizontally", () => {
    const radial = createGradientBackground("radial", "#000000", "#ffffff");
    expect(flipGradientHorizontally(radial)).toBe(radial);
    expect(flipGradientHorizontally("#a5d8ff")).toBe("#a5d8ff");
    expect(flipGradientHorizontally("transparent")).toBe("transparent");
  });
});

describe("canHaveGradient", () => {
  it.each(["rectangle", "ellipse", "diamond", "triangle", "embeddable"])(
    "allows %s",
    (type) => {
      expect(canHaveGradient(element(type))).toBe(true);
    },
  );

  it.each(["text", "image", "frame", "path"])("rejects %s", (type) => {
    expect(canHaveGradient(element(type, []))).toBe(false);
  });

  it.each(["line", "arrow", "freedraw"])("allows a closed %s", (type) => {
    expect(canHaveGradient(element(type, CLOSED))).toBe(true);
  });

  it.each(["line", "arrow", "freedraw"])("rejects a 2-point %s", (type) => {
    expect(canHaveGradient(element(type, TWO_POINTS))).toBe(false);
  });

  it("allows an open line that can become a polygon", () => {
    expect(canHaveGradient(element("line", THREE_POINTS_OPEN))).toBe(true);
  });

  it.each(["arrow", "freedraw"])(
    "rejects an open %s even with 3+ points",
    (type) => {
      expect(canHaveGradient(element(type, THREE_POINTS_OPEN))).toBe(false);
    },
  );
});
