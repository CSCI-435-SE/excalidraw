import {
  PATH_MOTION_MIN_SPAN,
  easeIn,
  easeInOut,
  easeOut,
} from "@excalidraw/common";
import { clamp } from "@excalidraw/math";

import type { PathMotionConfig, PathMotionEasing } from "./types";

export const DEFAULT_PATH_MOTION: PathMotionConfig = {
  speed: 1,
  start: 0,
  end: 1,
  easing: "linear",
};

const PATH_MOTION_EASINGS: Record<PathMotionEasing, (t: number) => number> = {
  linear: (t) => t,
  easeIn,
  easeOut,
  easeInOut,
};

export const isPathMotionEasing = (value: unknown): value is PathMotionEasing =>
  typeof value === "string" && value in PATH_MOTION_EASINGS;

export const getPathMotionEasing = (easing: PathMotionEasing) =>
  PATH_MOTION_EASINGS[easing] ?? PATH_MOTION_EASINGS.linear;

/**
 * Fills in defaults for a (possibly partial, legacy or hand-edited) motion
 * config and clamps it into a playable range: speed > 0, start/end within
 * [0, 1] and at least `PATH_MOTION_MIN_SPAN` apart.
 */
export const normalizePathMotion = (
  motion?: Partial<PathMotionConfig> | null,
): PathMotionConfig => {
  const speed =
    typeof motion?.speed === "number" &&
    Number.isFinite(motion.speed) &&
    motion.speed > 0
      ? motion.speed
      : DEFAULT_PATH_MOTION.speed;

  const rawStart = Number.isFinite(motion?.start)
    ? motion!.start!
    : DEFAULT_PATH_MOTION.start;
  const rawEnd = Number.isFinite(motion?.end)
    ? motion!.end!
    : DEFAULT_PATH_MOTION.end;

  const start = clamp(rawStart, 0, 1 - PATH_MOTION_MIN_SPAN);
  const end = clamp(rawEnd, start + PATH_MOTION_MIN_SPAN, 1);

  return {
    speed,
    start,
    end,
    easing: isPathMotionEasing(motion?.easing)
      ? motion!.easing!
      : DEFAULT_PATH_MOTION.easing,
  };
};
