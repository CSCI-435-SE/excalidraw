import { pointDistance, pointFrom, pointRotateRads } from "@excalidraw/math";

import { arrayToMap } from "@excalidraw/common";

import type { GlobalPoint, LocalPoint } from "@excalidraw/math";

import { getCommonBounds, getElementAbsoluteCoords } from "./bounds";
import { getElementsInGroup } from "./groups";
import { getPathSamplePoints } from "./pathSamples";
import { getBoundTextElement } from "./textElement";
import { isPathElement } from "./typeChecks";

import type { Scene } from "./Scene";

import type {
  ElementsMap,
  ElementsMapOrArray,
  ExcalidrawElement,
  ExcalidrawPathElement,
  NonDeleted,
  NonDeletedExcalidrawElement,
} from "./types";

/**
 * Resolves a path's target to the concrete, currently-live element(s) it
 * should act on. `targetElementId` and `targetGroupId` are mutually
 * exclusive (enforced at creation time), so exactly one branch applies.
 * Returns an empty array once the target has been deleted/disbanded — the
 * path itself is left untouched (becomes inert) rather than being cleaned up.
 */
export const getPathTargetElements = (
  path: ExcalidrawPathElement,
  elements: ElementsMapOrArray,
): NonDeletedExcalidrawElement[] => {
  const elementsMap = arrayToMap(elements);

  if (path.targetElementId) {
    const element = elementsMap.get(path.targetElementId);
    return element && !element.isDeleted
      ? [element as NonDeletedExcalidrawElement]
      : [];
  }

  if (path.targetGroupId) {
    return getElementsInGroup(elementsMap, path.targetGroupId).filter(
      (element): element is NonDeletedExcalidrawElement => !element.isDeleted,
    );
  }

  return [];
};

/**
 * Reverse lookup: all path elements (among `elements`) that target the given
 * element, either directly or via a group it belongs to. If more than one
 * path targets the same element, callers that can only play one at a time
 * (press-and-hold playback) should use only the first entry.
 */
export const getPathsTargetingElement = (
  element: ExcalidrawElement,
  elements: ElementsMapOrArray,
): NonDeleted<ExcalidrawPathElement>[] => {
  const paths: NonDeleted<ExcalidrawPathElement>[] = [];
  for (const candidate of arrayToMap(elements).values()) {
    if (!isPathElement(candidate) || candidate.isDeleted) {
      continue;
    }
    if (
      candidate.targetElementId === element.id ||
      (candidate.targetGroupId !== null &&
        element.groupIds.includes(candidate.targetGroupId))
    ) {
      paths.push(candidate as NonDeleted<ExcalidrawPathElement>);
    }
  }
  return paths;
};

/**
 * The path's travel polyline (see `getPathSamplePoints`) in absolute scene
 * coordinates, with the path's rotation applied — i.e. exactly the line the
 * user sees on canvas, whether the path has been moved, resized, rotated or
 * curved.
 */
export const getPathGlobalSamplePoints = (
  path: ExcalidrawPathElement,
  elementsMap: ElementsMap,
): GlobalPoint[] => {
  const [, , , , cx, cy] = getElementAbsoluteCoords(path, elementsMap);
  const center = pointFrom<GlobalPoint>(cx, cy);
  return getPathSamplePoints(path).map(([x, y]) =>
    pointRotateRads(
      pointFrom<GlobalPoint>(path.x + x, path.y + y),
      center,
      path.angle,
    ),
  );
};

/**
 * The point (absolute scene coordinates) where the target rests and playback
 * begins: the configured `motion.start` fraction along the travel polyline.
 */
export const getPathMotionStartPoint = (
  path: ExcalidrawPathElement,
  globalPoints: readonly GlobalPoint[],
): { x: number; y: number } =>
  globalPoints.length === 0
    ? { x: path.x, y: path.y }
    : getPointAtProgress(globalPoints, path.motion?.start ?? 0);

/**
 * The translation that would snap `targets`' combined bounding-box center
 * onto the path's (rotated) motion start point in absolute scene coordinates
 * (see `getPathMotionStartPoint`). Used
 * both to snap a path's target to it the moment the path is confirmed or an
 * edit session is committed (so they sit together at rest, not just
 * mid-animation) and, identically, as the playback alignment at progress 0 —
 * the two must use the same formula so the resting position and the start
 * of the animation coincide exactly.
 */
export const getPathAlignmentOffset = (
  path: ExcalidrawPathElement,
  targets: readonly ExcalidrawElement[],
  elementsMap: ElementsMap,
): { x: number; y: number } => {
  if (targets.length === 0) {
    return { x: 0, y: 0 };
  }

  const [minX, minY, maxX, maxY] = getCommonBounds(targets, elementsMap);
  const referenceCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const start = getPathMotionStartPoint(
    path,
    getPathGlobalSamplePoints(path, elementsMap),
  );

  return {
    x: start.x - referenceCenter.x,
    y: start.y - referenceCenter.y,
  };
};

/**
 * Moves the path's live target(s) — and their bound text — so their combined
 * center sits on the path's start point. No-op when already aligned.
 */
export const snapPathTargetsToStart = (
  path: ExcalidrawPathElement,
  scene: Scene,
) => {
  const elementsMap = scene.getNonDeletedElementsMap();
  const targets = getPathTargetElements(path, elementsMap);
  const offset = getPathAlignmentOffset(path, targets, elementsMap);
  if (offset.x === 0 && offset.y === 0) {
    return;
  }
  for (const target of targets) {
    scene.mutateElement(target, {
      x: target.x + offset.x,
      y: target.y + offset.y,
    });
    const boundText = getBoundTextElement(target, elementsMap);
    if (boundText) {
      scene.mutateElement(boundText, {
        x: boundText.x + offset.x,
        y: boundText.y + offset.y,
      });
    }
  }
};

/** Total euclidean length of the polyline described by `points`. */
export const getPathLength = <P extends LocalPoint | GlobalPoint>(
  points: readonly P[],
): number => {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += pointDistance(points[i - 1], points[i]);
  }
  return length;
};

/**
 * Walks the polyline's segments by cumulative length to find the point at
 * progress `t` (0..1) along it, interpolating within the containing segment.
 * `t` is clamped to [0, 1]; a path with fewer than 2 points returns its only
 * point (or the origin if empty).
 */
export const getPointAtProgress = <P extends LocalPoint | GlobalPoint>(
  points: readonly P[],
  t: number,
): { x: number; y: number } => {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }
  if (points.length === 1) {
    return { x: points[0][0], y: points[0][1] };
  }

  const clampedT = Math.min(Math.max(t, 0), 1);
  const totalLength = getPathLength(points);

  if (totalLength === 0) {
    return { x: points[0][0], y: points[0][1] };
  }

  const targetLength = clampedT * totalLength;
  let traveled = 0;

  for (let i = 1; i < points.length; i++) {
    const segmentLength = pointDistance(points[i - 1], points[i]);
    if (traveled + segmentLength >= targetLength || i === points.length - 1) {
      const segmentT =
        segmentLength === 0 ? 0 : (targetLength - traveled) / segmentLength;
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return {
        x: x0 + (x1 - x0) * segmentT,
        y: y0 + (y1 - y0) * segmentT,
      };
    }
    traveled += segmentLength;
  }

  const last = points[points.length - 1];
  return { x: last[0], y: last[1] };
};
