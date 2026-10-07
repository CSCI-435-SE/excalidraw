import {
  bezierEquation,
  curveCatmullRomCubicApproxPoints,
} from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";

import type { ExcalidrawPathElement } from "./types";

/** bezier samples taken per segment when a path is curved */
const CURVE_SAMPLES_PER_SEGMENT = 16;

/**
 * The polyline a path actually travels along, in the path's local
 * coordinates: its raw `points` when straight, or a dense sampling of the
 * smooth curve through those points when `roundness` is set.
 *
 * The curve is a Catmull-Rom spline at tension 0.5, whose bezier control
 * points (p1 + (p2 - p0) / 6) are identical to roughjs's `curve()` at its
 * default tightness — which `generateLinearCollisionShape` uses for curved
 * paths — so rendering, playback, hit-testing and the linear editor's
 * midpoints all agree on the same geometry.
 *
 * Kept free of other element-package imports so bounds/linearElementEditor
 * can depend on it without creating an import cycle.
 */
export const getPathSamplePoints = (
  path: Pick<ExcalidrawPathElement, "points" | "roundness">,
): readonly LocalPoint[] => {
  if (!path.roundness || path.points.length <= 2) {
    return path.points;
  }

  const curves = curveCatmullRomCubicApproxPoints(path.points as LocalPoint[]);
  if (!curves) {
    return path.points;
  }

  const samples: LocalPoint[] = [path.points[0]];
  for (const c of curves) {
    for (let step = 1; step <= CURVE_SAMPLES_PER_SEGMENT; step++) {
      samples.push(bezierEquation(c, step / CURVE_SAMPLES_PER_SEGMENT));
    }
  }
  return samples;
};
