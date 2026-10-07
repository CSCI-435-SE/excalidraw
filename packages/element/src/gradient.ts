import { getBoundsFromPoints } from "./bounds";
import { hasBackground } from "./comparisons";
import { canBecomePolygon } from "./typeChecks";
import { isPathALoop } from "./utils";

import type { ExcalidrawElement } from "./types";

export type GradientType = "linear" | "radial";

/**
 * Solid fill used when generating rough shapes for gradient backgrounds, so
 * roughjs builds its normal fill geometry. The canvas renderer swaps it for
 * the actual CanvasGradient at draw time. Invisible, but not the literal
 * "transparent", which roughjs' path() treats as "no fill".
 */
export const GRADIENT_FILL_PLACEHOLDER = "rgba(0, 0, 0, 0)";

export type GradientColors = Readonly<{
  type: GradientType;
  startColor: string;
  endColor: string;
}>;

export const getGradientColors = (
  backgroundColor: string,
): GradientColors | null => {
  const isLinear = backgroundColor.startsWith("linear-gradient(90deg,");
  const isRadial = backgroundColor.startsWith("radial-gradient(circle,");
  if ((!isLinear && !isRadial) || !backgroundColor.endsWith(")")) {
    return null;
  }

  const prefix = isLinear
    ? "linear-gradient(90deg,"
    : "radial-gradient(circle,";
  const stops = backgroundColor.slice(prefix.length, -1);
  let parentheses = 0;
  for (let index = 0; index < stops.length; index++) {
    if (stops[index] === "(") {
      parentheses++;
    } else if (stops[index] === ")") {
      parentheses--;
    } else if (stops[index] === "," && parentheses === 0) {
      const startColor = stops.slice(0, index).trim();
      const endColor = stops.slice(index + 1).trim();
      return startColor && endColor
        ? { type: isLinear ? "linear" : "radial", startColor, endColor }
        : null;
    }
  }
  return null;
};

export type GradientGeometry = GradientColors &
  Readonly<{
    // linear: runs horizontally from x1 to x2 at y1
    x1: number;
    y1: number;
    x2: number;
    // radial: centered at (cx, cy), reaching the box corners at r
    cx: number;
    cy: number;
    r: number;
  }>;

/**
 * Where the element's gradient sits, in element-local coordinates, shared by
 * the canvas and SVG renderers. Null when the element has no gradient or
 * can't be filled (e.g. an open line).
 */
export const getGradientGeometry = (
  element: ExcalidrawElement,
): GradientGeometry | null => {
  const gradientColors = getGradientColors(element.backgroundColor);
  if (!gradientColors) {
    return null;
  }

  // box the gradient spans
  let [x1, y1, x2, y2] = [0, 0, element.width, element.height];
  if (
    element.type === "line" ||
    element.type === "arrow" ||
    element.type === "freedraw"
  ) {
    if (!element.points.length || !isPathALoop(element.points)) {
      return null;
    }
    // points can extend left of / above the element origin
    [x1, y1, x2, y2] = getBoundsFromPoints(element.points);
  }

  return {
    ...gradientColors,
    x1,
    y1,
    x2,
    cx: (x1 + x2) / 2,
    cy: (y1 + y2) / 2,
    r: Math.hypot((x2 - x1) / 2, (y2 - y1) / 2),
  };
};

/**
 * Whether a gradient background can ever be visible on the element.
 * Lines, arrows and freedraw only fill when closed; open lines with 3+
 * points still qualify because applying a background closes them into a
 * polygon (see actionChangeBackgroundColor).
 */
export const canHaveGradient = (element: ExcalidrawElement) => {
  if (!hasBackground(element.type)) {
    return false;
  }
  switch (element.type) {
    case "line":
      return isPathALoop(element.points) || canBecomePolygon(element.points);
    case "arrow":
    case "freedraw":
      return isPathALoop(element.points);
    default:
      return true;
  }
};

/**
 * Mirrors a linear gradient for a horizontal flip by swapping its stops.
 * Radial gradients and solid colors are symmetric, so they're returned as-is.
 */
export const flipGradientHorizontally = (backgroundColor: string) => {
  const gradientColors = getGradientColors(backgroundColor);
  return gradientColors?.type === "linear"
    ? createGradientBackground(
        "linear",
        gradientColors.endColor,
        gradientColors.startColor,
      )
    : backgroundColor;
};

export const createGradientBackground = (
  type: GradientType,
  startColor: string,
  endColor: string,
) =>
  type === "linear"
    ? `linear-gradient(90deg, ${startColor}, ${endColor})`
    : `radial-gradient(circle, ${startColor}, ${endColor})`;
