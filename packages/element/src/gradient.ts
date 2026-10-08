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
  angle?: number;
  startPosition?: number;
  endPosition?: number;
}>;

export const getGradientColors = (
  backgroundColor: string,
): GradientColors | null => {
  const linearPrefix =
    /^linear-gradient\((-?(?:\d+(?:\.\d*)?|\.\d+))deg,\s*/.exec(
      backgroundColor,
    );
  const isRadial = backgroundColor.startsWith("radial-gradient(circle,");
  if ((!linearPrefix && !isRadial) || !backgroundColor.endsWith(")")) {
    return null;
  }

  const stops = backgroundColor.slice(
    linearPrefix?.[0].length ?? "radial-gradient(circle,".length,
    -1,
  );
  const stopParts: string[] = [];
  let parentheses = 0;
  let stopStart = 0;
  for (let index = 0; index < stops.length; index++) {
    if (stops[index] === "(") {
      parentheses++;
    } else if (stops[index] === ")") {
      parentheses--;
    } else if (stops[index] === "," && parentheses === 0) {
      stopParts.push(stops.slice(stopStart, index).trim());
      stopStart = index + 1;
    }
  }
  stopParts.push(stops.slice(stopStart).trim());
  if (stopParts.length !== 2) {
    return null;
  }

  const parseStop = (stop: string) => {
    const match = /^(.*?)(?:\s+((?:\d+(?:\.\d*)?|\.\d+))%)?$/.exec(stop);
    const color = match?.[1].trim();
    const position = match?.[2] ? Number(match[2]) : undefined;
    return color ? { color, position } : null;
  };
  const start = parseStop(stopParts[0]);
  const end = parseStop(stopParts[1]);
  if (!start || !end) {
    return null;
  }

  const angle = linearPrefix ? Number(linearPrefix[1]) : undefined;
  const startPosition = Math.min(100, Math.max(0, start.position ?? 0));
  const endPosition = Math.max(
    startPosition,
    Math.min(100, Math.max(0, end.position ?? 100)),
  );
  return {
    type: linearPrefix ? "linear" : "radial",
    startColor: start.color,
    endColor: end.color,
    ...(angle !== undefined && angle !== 90 ? { angle } : {}),
    ...(startPosition !== 0 ? { startPosition } : {}),
    ...(endPosition !== 100 ? { endPosition } : {}),
  };
};

export type GradientGeometry = GradientColors &
  Readonly<{
    // linear: runs between (x1, y1) and (x2, y2)
    x1: number;
    y1: number;
    x2: number;
    y2: number;
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

  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const angleDegrees = gradientColors.angle ?? 90;
  const normalizedAngle = ((angleDegrees % 360) + 360) % 360;
  if (normalizedAngle === 90) {
    return {
      ...gradientColors,
      x1,
      y1,
      x2,
      y2: y1,
      cx,
      cy,
      r: Math.hypot((x2 - x1) / 2, (y2 - y1) / 2),
    };
  }

  const angle = (normalizedAngle * Math.PI) / 180;
  const dx = Math.round(Math.sin(angle) * 1e10) / 1e10;
  const dy = -Math.round(Math.cos(angle) * 1e10) / 1e10;
  const halfLength = (Math.abs(dx) * (x2 - x1) + Math.abs(dy) * (y2 - y1)) / 2;

  return {
    ...gradientColors,
    x1: cx - dx * halfLength,
    y1: cy - dy * halfLength,
    x2: cx + dx * halfLength,
    y2: cy + dy * halfLength,
    cx,
    cy,
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
 * Mirrors a linear gradient horizontally. Default-angle gradients retain the
 * existing stop-swap representation; other angles reflect their direction.
 * Radial gradients and solid colors are symmetric, so they're returned as-is.
 */
export const flipGradientHorizontally = (backgroundColor: string) => {
  const gradientColors = getGradientColors(backgroundColor);
  if (gradientColors?.type !== "linear") {
    return backgroundColor;
  }

  const angle = gradientColors.angle ?? 90;
  const normalizedAngle = ((angle % 360) + 360) % 360;
  if (normalizedAngle === 90) {
    const startPosition = gradientColors.startPosition ?? 0;
    const endPosition = gradientColors.endPosition ?? 100;
    return createGradientBackground(
      "linear",
      gradientColors.endColor,
      gradientColors.startColor,
      90,
      100 - endPosition,
      100 - startPosition,
    );
  }
  return createGradientBackground(
    "linear",
    gradientColors.startColor,
    gradientColors.endColor,
    (360 - normalizedAngle) % 360,
    gradientColors.startPosition,
    gradientColors.endPosition,
  );
};

export const createGradientBackground = (
  type: GradientType,
  startColor: string,
  endColor: string,
  angle = 90,
  startPosition = 0,
  endPosition = 100,
) =>
  type === "linear"
    ? `linear-gradient(${angle}deg, ${startColor}${
        startPosition === 0 ? "" : ` ${startPosition}%`
      }, ${endColor}${endPosition === 100 ? "" : ` ${endPosition}%`})`
    : `radial-gradient(circle, ${startColor}${
        startPosition === 0 ? "" : ` ${startPosition}%`
      }, ${endColor}${endPosition === 100 ? "" : ` ${endPosition}%`})`;
