import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";

import {
  canHaveGradient,
  createGradientBackground,
  flipGradientHorizontally,
  getGradientColors,
  getGradientGeometry,
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

  it("creates and parses a linear gradient with an adjustable angle", () => {
    const backgroundColor = createGradientBackground(
      "linear",
      "#000000",
      "#ffffff",
      135,
    );

    expect(getGradientColors(backgroundColor)).toEqual({
      type: "linear",
      startColor: "#000000",
      endColor: "#ffffff",
      angle: 135,
    });
  });

  it("creates and parses adjustable color-stop positions", () => {
    const backgroundColor = createGradientBackground(
      "linear",
      "#000000",
      "#ffffff",
      135,
      20,
      80,
    );

    expect(backgroundColor).toBe(
      "linear-gradient(135deg, #000000 20%, #ffffff 80%)",
    );
    expect(getGradientColors(backgroundColor)).toEqual({
      type: "linear",
      startColor: "#000000",
      endColor: "#ffffff",
      angle: 135,
      startPosition: 20,
      endPosition: 80,
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

  it("reflects the angle of a non-horizontal gradient when flipped", () => {
    expect(
      flipGradientHorizontally(
        createGradientBackground("linear", "#000000", "#ffffff", 45),
      ),
    ).toBe(createGradientBackground("linear", "#000000", "#ffffff", 315));
  });

  it("preserves color-stop positions when flipped horizontally", () => {
    expect(
      flipGradientHorizontally(
        createGradientBackground("linear", "#000000", "#ffffff", 90, 15, 60),
      ),
    ).toBe(
      createGradientBackground("linear", "#ffffff", "#000000", 90, 40, 85),
    );
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

describe("getGradientGeometry", () => {
  const LINEAR = createGradientBackground("linear", "#ff0000", "#0000ff");
  const RADIAL = createGradientBackground("radial", "#ff0000", "#0000ff");

  const shape = (
    type: string,
    backgroundColor: string,
    points?: [number, number][],
  ) =>
    ({
      ...element(type, points),
      backgroundColor,
      width: 200,
      height: 100,
    } as unknown as ExcalidrawElement);

  it("spans the element box for a linear gradient", () => {
    expect(getGradientGeometry(shape("rectangle", LINEAR))).toMatchObject({
      type: "linear",
      startColor: "#ff0000",
      endColor: "#0000ff",
      x1: 0,
      y1: 0,
      x2: 200,
    });
  });

  it("rotates the linear gradient across the element box", () => {
    const geometry = getGradientGeometry(
      shape(
        "rectangle",
        createGradientBackground("linear", "#ff0000", "#0000ff", 180),
      ),
    );

    expect(geometry).toMatchObject({
      x1: 100,
      y1: 0,
      x2: 100,
      y2: 100,
    });
  });

  it("centers a radial gradient and reaches the corners", () => {
    expect(getGradientGeometry(shape("ellipse", RADIAL))).toMatchObject({
      type: "radial",
      cx: 100,
      cy: 50,
      r: Math.hypot(100, 50),
    });
  });

  it("uses point bounds for closed lines, including negative points", () => {
    const points: [number, number][] = [
      [0, 0],
      [-50, 40],
      [60, -20],
      [0, 0],
    ];
    expect(getGradientGeometry(shape("line", LINEAR, points))).toMatchObject({
      x1: -50,
      y1: -20,
      x2: 60,
      cx: 5,
      cy: 10,
    });
  });

  it("returns null for open lines and solid colors", () => {
    expect(
      getGradientGeometry(shape("line", LINEAR, THREE_POINTS_OPEN)),
    ).toBeNull();
    expect(getGradientGeometry(shape("rectangle", "#ff0000"))).toBeNull();
  });
});
