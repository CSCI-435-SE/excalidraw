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

import type { GlobalPoint } from "@excalidraw/math";
import type {
  ExcalidrawPathElement,
  NonDeletedExcalidrawElement,
  PathMotionConfig,
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

type PlaybackSession = {
  elapsed: number;
  totalDuration: number;
  originalPositions: Map<string, { x: number; y: number }>;
  initialGlobalPoints: GlobalPoint[];
  startPoint: { x: number; y: number };
  alignmentOffset: { x: number; y: number };
  motion: PathMotionConfig;
  ease: (t: number) => number;
  /**
   * "preview" is the press-and-hold-to-preview gesture and the old
   * fire-and-forget "Test animation" affordance: it plays once and snaps
   * straight back to rest the instant it completes, and the session is
   * dropped — nothing is left for a Pause/Reset to act on.
   *
   * "controlled" backs the edit toolbar's Play/Pause/Reset trio: finishing
   * leaves the target resting at the path's *end* (like a real transport
   * control, not a preview), and the session survives completion — with
   * `elapsed` rewound to 0 — so a later Play replays from the start and
   * Reset can still restore the pre-playback position.
   */
  mode: "preview" | "controlled";
  onComplete?: () => void;
};

/**
 * Drives path playback — the press-and-hold preview, the old one-shot "Test
 * animation", and the edit toolbar's Play/Pause/Reset transport — honoring
 * the path's `motion` config: speed multiplier, easing, and the start..end
 * section of the path to travel.
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
 * Per-session state (`elapsed`, the pre-playback snapshot, etc.) lives on the
 * controller itself — in `sessions`, keyed by path id — rather than inside
 * `AnimationController`'s own per-key state, since that state is dropped the
 * moment an animation is cancelled. Keeping it here is what lets Pause
 * suspend mid-flight and a later Play resume from exactly that point, and
 * lets Reset restore the pre-playback snapshot even after Pause has
 * cancelled the underlying animation.
 *
 * Per-frame mutations are explicitly scheduled as `CaptureUpdateAction.NEVER`
 * on every tick (not left to the default `EVENTUALLY`), since an animation
 * can run for seconds, during which an unrelated user action could schedule
 * an `IMMEDIATELY` capture that would otherwise sweep a mid-flight frame into
 * an unrelated undo entry.
 */
export class PathPlaybackController {
  private sessions = new Map<string, PlaybackSession>();

  constructor(private app: App) {}

  isPlaying(path: ExcalidrawPathElement): boolean {
    return AnimationController.running(playbackKey(path.id));
  }

  /** whether a controlled (toolbar) session exists to Pause/Reset */
  hasControlledSession(path: ExcalidrawPathElement): boolean {
    return this.sessions.get(path.id)?.mode === "controlled";
  }

  private createSession(
    path: ExcalidrawPathElement,
    targets: NonDeletedExcalidrawElement[],
    mode: PlaybackSession["mode"],
    onComplete?: () => void,
  ): PlaybackSession | null {
    if (targets.length === 0) {
      return null;
    }

    const elementsMap = this.app.scene.getNonDeletedElementsMap();
    const initialGlobalPoints = getPathGlobalSamplePoints(path, elementsMap);
    const totalDuration = getPathPlaybackDuration(
      path,
      getPathLength(initialGlobalPoints),
    );
    const motion = normalizePathMotion(path.motion);
    const ease = getPathMotionEasing(motion.easing);
    const startPoint = getPathMotionStartPoint(path, initialGlobalPoints);

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

    return {
      elapsed: 0,
      totalDuration,
      originalPositions,
      initialGlobalPoints,
      startPoint,
      alignmentOffset,
      motion,
      ease,
      mode,
      onComplete,
    };
  }

  /** (re)starts the shared RAF-driven tick for `path`'s current session */
  private run(path: ExcalidrawPathElement, session: PlaybackSession) {
    const key = playbackKey(path.id);

    AnimationController.start<PlaybackSession>(key, ({ deltaTime }) => {
      session.elapsed += deltaTime;
      const t = Math.min(session.elapsed / session.totalDuration, 1);

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
          : session.initialGlobalPoints;
      const liveStartPoint =
        livePath && isPathElement(livePath)
          ? getPathMotionStartPoint(livePath, liveGlobalPoints)
          : session.startPoint;

      // eased time → position within the configured start..end section
      const progress =
        session.motion.start +
        session.ease(t) * (session.motion.end - session.motion.start);
      const { x: dx, y: dy } = getPointAtProgress(liveGlobalPoints, progress);
      const totalDeltaX = dx - session.startPoint.x + session.alignmentOffset.x;
      const totalDeltaY = dy - session.startPoint.y + session.alignmentOffset.y;
      // how far the path's start has moved since playback began
      const pathShiftX = liveStartPoint.x - session.startPoint.x;
      const pathShiftY = liveStartPoint.y - session.startPoint.y;

      const liveOriginalPositions = new Map(
        [...session.originalPositions].filter(([id]) =>
          this.app.scene.getNonDeletedElement(id),
        ),
      );

      if (liveOriginalPositions.size === 0) {
        this.sessions.delete(path.id);
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
          { informMutation: true, isDragging: t < 1 },
        );
      }
      this.app.scheduleNeverCapture();

      if (t >= 1) {
        if (session.mode === "preview") {
          // snap back to rest — shifted along with the path if it was moved
          // mid-playback, so the two stay together instead of desyncing —
          // and the session is dropped: a preview leaves nothing to Pause
          // or Reset
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
          this.sessions.delete(path.id);
        } else {
          // controlled playback finished: stay resting at the path's end,
          // and rewind so the next Play replays from the start instead of
          // immediately re-finishing; the session (and its pre-playback
          // snapshot) is kept so Reset remains available
          session.elapsed = 0;
        }

        session.onComplete?.();
        return null;
      }

      return session;
    });
  }

  /** press-and-hold preview: plays once, then snaps straight back to rest */
  preview(path: ExcalidrawPathElement, targets: NonDeletedExcalidrawElement[]) {
    const key = playbackKey(path.id);
    if (AnimationController.running(key)) {
      return;
    }
    const session = this.createSession(path, targets, "preview");
    if (!session) {
      return;
    }
    this.sessions.set(path.id, session);
    this.run(path, session);
  }

  /**
   * Re-reads `path.motion` into an already-existing session before Play
   * resumes it, so a speed/easing/start/end tweak made while paused (or
   * after a run finished) takes effect on the very next Play instead of
   * only once the session is torn down (Reset, or leaving and re-entering
   * the editor). `elapsed` is rescaled to preserve the progress fraction
   * already reached, so the tweak can change the remaining duration without
   * causing a discontinuous jump in position.
   */
  private refreshSessionMotion(
    path: ExcalidrawPathElement,
    session: PlaybackSession,
  ): PlaybackSession {
    const t = Math.min(session.elapsed / session.totalDuration, 1);

    session.motion = normalizePathMotion(path.motion);
    session.ease = getPathMotionEasing(session.motion.easing);
    session.totalDuration = getPathPlaybackDuration(
      path,
      getPathLength(session.initialGlobalPoints),
    );
    session.elapsed = t * session.totalDuration;

    return session;
  }

  /**
   * Edit toolbar Play: starts fresh, or resumes a session a previous Pause
   * left mid-flight (or replays one a previous completion rewound to 0) —
   * refreshing its motion config first so Play always obeys whatever the
   * toolbar's sliders currently say, not just what they said when the
   * session was first created.
   */
  play(
    path: ExcalidrawPathElement,
    targets: NonDeletedExcalidrawElement[],
    onComplete?: () => void,
  ) {
    const key = playbackKey(path.id);
    if (AnimationController.running(key)) {
      return;
    }

    const existing = this.sessions.get(path.id);
    const session: PlaybackSession | null =
      existing && existing.mode === "controlled"
        ? this.refreshSessionMotion(path, existing)
        : this.createSession(path, targets, "controlled", onComplete);
    if (!session) {
      return;
    }
    session.onComplete = onComplete;
    this.sessions.set(path.id, session);

    this.run(path, session);
  }

  /** plays `path` against its currently-live target(s), if any */
  startForPath(path: ExcalidrawPathElement, onComplete?: () => void) {
    this.play(
      path,
      getPathTargetElements(path, this.app.scene.getNonDeletedElementsMap()),
      onComplete,
    );
  }

  /**
   * Suspends playback exactly where it is — the target is left wherever the
   * last frame put it — while keeping the session so Play can resume from
   * that same point and Reset can still restore the original position.
   */
  pause(path: ExcalidrawPathElement) {
    AnimationController.cancel(playbackKey(path.id));
  }

  /**
   * Stops playback (if running) and restores the target(s) — and their
   * bound text — to exactly where they were before playback began, then
   * drops the session.
   */
  reset(path: ExcalidrawPathElement) {
    AnimationController.cancel(playbackKey(path.id));

    const session = this.sessions.get(path.id);
    if (!session) {
      return;
    }

    for (const [id, orig] of session.originalPositions) {
      const element = this.app.scene.getNonDeletedElement(id);
      if (element) {
        this.app.scene.mutateElement(
          element,
          { x: orig.x, y: orig.y },
          { informMutation: true, isDragging: false },
        );
      }
    }
    this.app.scheduleNeverCapture();
    this.sessions.delete(path.id);
  }

  /** hard stop, used for cleanup (e.g. leaving the motion path editor) */
  cancel(path: ExcalidrawPathElement) {
    AnimationController.cancel(playbackKey(path.id));
    this.sessions.delete(path.id);
  }
}

const playbackKey = (pathId: string) => `path-playback-${pathId}`;
