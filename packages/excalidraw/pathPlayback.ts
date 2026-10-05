import {
  getBoundTextElement,
  getPathAlignmentOffset,
  getPathLength,
  getPointAtProgress,
} from "@excalidraw/element";

import type {
  ExcalidrawPathElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { AnimationController } from "./renderer/animation";

import type App from "./components/App";

/** constant speed, not fixed duration — longer paths naturally take longer */
const PATH_PLAYBACK_SPEED_PX_PER_SEC = 300;

type PlaybackState = {
  elapsed: number;
  totalDuration: number;
  originalPositions: Map<string, { x: number; y: number }>;
};

/**
 * Drives the basic, fixed-speed "press and hold to preview" path animation.
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

    const length = getPathLength(path.points);
    const totalDuration = Math.max(
      (length / PATH_PLAYBACK_SPEED_PX_PER_SEC) * 1000,
      1,
    );

    const elementsMap = this.app.scene.getNonDeletedElementsMap();
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
      const { x: dx, y: dy } = getPointAtProgress(path.points, t);
      const [startDx, startDy] = path.points[0] ?? [0, 0];
      const totalDeltaX = dx - startDx + alignmentOffset.x;
      const totalDeltaY = dy - startDy + alignmentOffset.y;

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
        for (const [id, orig] of liveOriginalPositions) {
          const element = this.app.scene.getNonDeletedElement(id);
          if (element) {
            this.app.scene.mutateElement(element, orig, {
              informMutation: true,
              isDragging: false,
            });
          }
        }
        this.app.scheduleNeverCapture();
        return null;
      }

      return next;
    });
  }

  cancel(path: ExcalidrawPathElement) {
    AnimationController.cancel(playbackKey(path.id));
  }
}

const playbackKey = (pathId: string) => `path-playback-${pathId}`;
