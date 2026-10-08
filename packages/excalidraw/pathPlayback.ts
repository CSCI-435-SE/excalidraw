import { PATH_PLAYBACK_BASE_SPEED_PX_PER_SEC } from "@excalidraw/common";
import {
  getBoundTextElement,
  getPathAlignmentOffset,
  getPathGlobalSamplePoints,
  getPathLength,
  getPathMotionEasing,
  getPathMotionStartPoint,
  getPathTargetElements,
  getPointAtProgress,
  isPathElement,
  normalizePathMotion,
} from "@excalidraw/element";

import type {
  ExcalidrawPathElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { AnimationController } from "./renderer/animation";

import type App from "./components/App";

/**
 * How long playback of `path` takes, in ms. Speed-based rather than a fixed
 * duration, so longer paths (or longer start→end sections) take longer, and
 * a higher `motion.speed` multiplier shortens it proportionally.
 */
export const getPathPlaybackDuration = (
  path: ExcalidrawPathElement,
  pathLength: number,
): number => {
  const { speed, start, end } = normalizePathMotion(path.motion);
  return Math.max(
    ((pathLength * (end - start)) /
      (PATH_PLAYBACK_BASE_SPEED_PX_PER_SEC * speed)) *
      1000,
    1,
  );
};

type PlaybackState = {
  elapsed: number;
  totalDuration: number;
  originalPositions: Map<string, { x: number; y: number }>;
};

/**
 * Drives path playback ("press and hold to preview" and the edit toolbar's
 * Test animation), honoring the path's `motion` config: speed multiplier,
 * easing, and the start..end section of the path to travel.
 * Reuses the shared `AnimationController` (a single RAF loop multiplexing
 * every concurrently-keyed animation) rather than running its own loop, so
 * multiple paths can play back at once with no extra scheduling code.
 *
 * The target's combined bounding-box center is locked onto the path: at the
 * start of playback it's aligned exactly onto the path's first point (in
 * absolute scene coordinates), and from there it's displaced by however much
 * the path's shape moves at progress `t` — so the target visibly rides the
 * drawn dashed line rather than merely replaying its shape from wherever the
 * target happens to currently sit.
 *
 * Per-frame mutations are explicitly scheduled as `CaptureUpdateAction.NEVER`
 * on every tick (not left to the default `EVENTUALLY`), since an animation
 * can run for seconds, during which an unrelated user action could schedule
 * an `IMMEDIATELY` capture that would otherwise sweep a mid-flight frame into
 * an unrelated undo entry.
 */
export class PathPlaybackController {
  constructor(private app: App) {}

  isPlaying(path: ExcalidrawPathElement): boolean {
    return AnimationController.running(playbackKey(path.id));
  }

  start(path: ExcalidrawPathElement, targets: NonDeletedExcalidrawElement[]) {
    const key = playbackKey(path.id);

    if (AnimationController.running(key) || targets.length === 0) {
      return;
    }

    const elementsMap = this.app.scene.getNonDeletedElementsMap();
    const globalPoints = getPathGlobalSamplePoints(path, elementsMap);
    const totalDuration = getPathPlaybackDuration(
      path,
      getPathLength(globalPoints),
    );
    const motion = normalizePathMotion(path.motion);
    const ease = getPathMotionEasing(motion.easing);
    const startPoint = getPathMotionStartPoint(path, globalPoints);

    const originalPositions = new Map<string, { x: number; y: number }>();
    for (const target of targets) {
      originalPositions.set(target.id, { x: target.x, y: target.y });
      const boundText = getBoundTextElement(target, elementsMap);
      if (boundText) {
        originalPositions.set(boundText.id, {
          x: boundText.x,
          y: boundText.y,
        });
      }
    }

    // one-time alignment so the target's combined bounding-box center lands
    // exactly on the path's first point (in absolute scene coordinates) at
    // t=0, then stays glued to the path's shape as it progresses. In the
    // common case this is already ~(0,0), since the target was snapped onto
    // the path the moment it was confirmed (see actionFinalize.tsx) — this
    // is a safety net for whenever that's no longer true (e.g. the path or
    // target was repositioned since), so playback still starts glued to the
    // line rather than replaying the path's shape from wherever the target
    // happens to currently sit.
    const alignmentOffset = getPathAlignmentOffset(path, targets, elementsMap);

    AnimationController.start<PlaybackState>(key, ({ deltaTime, state }) => {
      const next: PlaybackState = state
        ? { ...state, elapsed: state.elapsed + deltaTime }
        : { elapsed: 0, totalDuration, originalPositions };

      const t = Math.min(next.elapsed / next.totalDuration, 1);

      // read the path's geometry live every frame, not once up front: the
      // path (and its target with it) can be dragged mid-playback, and the
      // target must keep riding the path where it is *now*
      const livePath = this.app.scene.getNonDeletedElement(path.id);
      const liveGlobalPoints =
        livePath && isPathElement(livePath)
          ? getPathGlobalSamplePoints(
              livePath,
              this.app.scene.getNonDeletedElementsMap(),
            )
          : globalPoints;
      const liveStartPoint =
        livePath && isPathElement(livePath)
          ? getPathMotionStartPoint(livePath, liveGlobalPoints)
          : startPoint;

      // eased time → position within the configured start..end section
      const progress = motion.start + ease(t) * (motion.end - motion.start);
      const { x: dx, y: dy } = getPointAtProgress(liveGlobalPoints, progress);
      const totalDeltaX = dx - startPoint.x + alignmentOffset.x;
      const totalDeltaY = dy - startPoint.y + alignmentOffset.y;
      // how far the path's start has moved since playback began
      const pathShiftX = liveStartPoint.x - startPoint.x;
      const pathShiftY = liveStartPoint.y - startPoint.y;

      const liveOriginalPositions = new Map(
        [...next.originalPositions].filter(([id]) =>
          this.app.scene.getNonDeletedElement(id),
        ),
      );

      if (liveOriginalPositions.size === 0) {
        return null;
      }

      for (const [id, orig] of liveOriginalPositions) {
        const element = this.app.scene.getNonDeletedElement(id);
        if (!element) {
          continue;
        }
        this.app.scene.mutateElement(
          element,
          {
            x: orig.x + totalDeltaX,
            y: orig.y + totalDeltaY,
          },
          { informMutation: true, isDragging: true },
        );
      }
      this.app.scheduleNeverCapture();

      if (t >= 1) {
        // back to rest — shifted along with the path if it was moved
        // mid-playback, so the two stay together instead of desyncing
        for (const [id, orig] of liveOriginalPositions) {
          const element = this.app.scene.getNonDeletedElement(id);
          if (element) {
            this.app.scene.mutateElement(
              element,
              { x: orig.x + pathShiftX, y: orig.y + pathShiftY },
              { informMutation: true, isDragging: false },
            );
          }
        }
        this.app.scheduleNeverCapture();
        return null;
      }

      return next;
    });
  }

  /** plays `path` against its currently-live target(s), if any */
  startForPath(path: ExcalidrawPathElement) {
    this.start(
      path,
      getPathTargetElements(path, this.app.scene.getNonDeletedElementsMap()),
    );
  }

  cancel(path: ExcalidrawPathElement) {
    AnimationController.cancel(playbackKey(path.id));
  }
}

const playbackKey = (pathId: string) => `path-playback-${pathId}`;
