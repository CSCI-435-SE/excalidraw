import {
  getBoundTextElement,
  getPathAlignmentOffset,
  getPathTargetElements,
  isPathElement,
  LinearElementEditor,
  newElementWith,
  normalizePathMotion,
  CaptureUpdateAction,
} from "@excalidraw/element";
import { arrayToMap, ROUNDNESS } from "@excalidraw/common";

import type {
  ExcalidrawElement,
  ExcalidrawPathElement,
  NonDeleted,
  PathMotionConfig,
} from "@excalidraw/element/types";

import { DEFAULT_CATEGORIES } from "../components/CommandPalette/CommandPalette";
import { PathIcon } from "../components/icons";

import { register } from "./register";

import type { ActionResult } from "./types";
import type { AppClassProperties, AppState } from "../types";

/** the path currently being re-edited, if it still exists */
const getEditedPath = (
  elements: readonly ExcalidrawElement[],
  appState: Readonly<Pick<AppState, "motionPathEditor">>,
): NonDeleted<ExcalidrawPathElement> | null => {
  if (!appState.motionPathEditor) {
    return null;
  }
  const element = elements.find(
    (el) => el.id === appState.motionPathEditor!.pathId,
  );
  return element && isPathElement(element) && !element.isDeleted
    ? (element as NonDeleted<ExcalidrawPathElement>)
    : null;
};

/**
 * Leaves edit mode. Only drops the linear editor if it still belongs to the
 * path — when the session ends because the user clicked onto another
 * line/arrow, that element's freshly-created editor must survive.
 */
const exitedAppState = (appState: Readonly<AppState>): AppState => ({
  ...appState,
  motionPathEditor: null,
  selectedLinearElement:
    appState.selectedLinearElement?.elementId ===
    appState.motionPathEditor?.pathId
      ? null
      : appState.selectedLinearElement,
});

/**
 * Commits a motion-path edit session: the path keeps its edited geometry and
 * its target(s) are snapped onto the (possibly moved) start point — the same
 * rule applied when a path is first confirmed (see actionFinalize.tsx).
 */
export const actionFinishMotionPathEdit = register({
  name: "finishMotionPathEdit",
  label: "labels.pathEditor.done",
  trackEvent: false,
  predicate: (elements, appState) => !!appState.motionPathEditor,
  perform: (elements, appState) => {
    const path = getEditedPath(elements, appState);
    if (!path) {
      return {
        appState: exitedAppState(appState),
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    return {
      elements: alignPathTargetsToStart(elements, path),
      appState: exitedAppState(appState),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});

/**
 * Returns `elements` with `path`'s target(s) — and their bound text — shifted
 * so their combined center sits on the path's motion start point.
 */
const alignPathTargetsToStart = (
  elements: readonly ExcalidrawElement[],
  path: ExcalidrawPathElement,
): readonly ExcalidrawElement[] => {
  const elementsMap = arrayToMap(elements);
  const targets = getPathTargetElements(path, elementsMap);
  const offset = getPathAlignmentOffset(path, targets, elementsMap);
  if (offset.x === 0 && offset.y === 0) {
    return elements;
  }

  const shiftedIds = new Set<string>();
  for (const target of targets) {
    shiftedIds.add(target.id);
    const boundText = getBoundTextElement(target, elementsMap);
    if (boundText) {
      shiftedIds.add(boundText.id);
    }
  }

  return elements.map((el) =>
    shiftedIds.has(el.id)
      ? newElementWith(el, {
          x: el.x + offset.x,
          y: el.y + offset.y,
        })
      : el,
  );
};

/**
 * Restores the path and its target(s) to exactly how they were when the edit
 * session started, and leaves edit mode. Shared with `actionDeleteSelected`
 * (Delete with no points selected rejects), since only one action may match
 * a given key.
 */
export const rejectMotionPathEdit = (
  elements: readonly ExcalidrawElement[],
  appState: Readonly<AppState>,
): ActionResult => {
  const { motionPathEditor } = appState;
  if (!motionPathEditor) {
    return false;
  }
  const { original, originalPositions } = motionPathEditor;

  return {
    elements: elements.map((el) => {
      if (el.id === original.id && isPathElement(el)) {
        return newElementWith(el, {
          x: original.x,
          y: original.y,
          width: original.width,
          height: original.height,
          angle: original.angle,
          points: original.points,
          roundness: original.roundness,
          motion: original.motion,
        });
      }
      const position = originalPositions[el.id];
      if (position && (el.x !== position.x || el.y !== position.y)) {
        return newElementWith(el, position);
      }
      return el;
    }),
    appState: exitedAppState(appState),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  };
};

export const actionRejectMotionPathEdit = register({
  name: "rejectMotionPathEdit",
  label: "labels.pathEditor.reject",
  trackEvent: false,
  predicate: (elements, appState) => !!appState.motionPathEditor,
  perform: (elements, appState) => rejectMotionPathEdit(elements, appState),
});

export const actionToggleMotionPathCurve = register({
  name: "toggleMotionPathCurve",
  label: (elements, appState) =>
    getEditedPath(elements, appState)?.roundness
      ? "labels.pathEditor.straight"
      : "labels.pathEditor.curved",
  trackEvent: false,
  predicate: (elements, appState) => !!getEditedPath(elements, appState),
  perform: (elements, appState) => {
    const path = getEditedPath(elements, appState);
    if (!path) {
      return false;
    }
    return {
      elements: elements.map((el) =>
        el.id === path.id
          ? newElementWith(el, {
              roundness: path.roundness
                ? null
                : { type: ROUNDNESS.PROPORTIONAL_RADIUS },
            })
          : el,
      ),
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});

/**
 * Updates the edited path's movement config (speed, easing, start/end).
 * `value` is merged over the current config and normalized, so start/end can
 * never cross. When the start moves, the target is re-snapped onto it so it
 * keeps resting where playback will begin.
 */
export const actionChangeMotionPathConfig = register<Partial<PathMotionConfig>>(
  {
    name: "changeMotionPathConfig",
    label: "labels.pathEditor.motion",
    trackEvent: false,
    predicate: (elements, appState) => !!getEditedPath(elements, appState),
    perform: (elements, appState, value) => {
      const path = getEditedPath(elements, appState);
      if (!path || !value) {
        return false;
      }
      const motion = normalizePathMotion({ ...path.motion, ...value });
      const updatedPath = newElementWith(path, { motion });
      const nextElements = elements.map((el) =>
        el.id === path.id ? updatedPath : el,
      );
      return {
        elements:
          motion.start !== path.motion.start
            ? alignPathTargetsToStart(nextElements, updatedPath)
            : nextElements,
        appState,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    },
  },
);

/**
 * Re-opens a confirmed motion path for editing: point editing via the
 * (already path-aware) LinearElementEditor, plus move/resize/rotate handles
 * kept visible for the path while editing (see hasBoundingBox). The path and
 * its target(s) are snapshotted so the whole session can be rejected.
 */
export const actionEditMotionPath = register({
  name: "editMotionPath",
  label: "labels.pathEditor.edit",
  icon: PathIcon,
  category: DEFAULT_CATEGORIES.elements,
  keywords: ["motion", "path", "animation"],
  trackEvent: { category: "element" },
  predicate: (elements, appState, _, app) => {
    const selectedElements = app.scene.getSelectedElements(appState);
    return (
      selectedElements.length === 1 &&
      isPathElement(selectedElements[0]) &&
      !selectedElements[0].locked &&
      appState.motionPathEditor?.pathId !== selectedElements[0].id
    );
  },
  perform: (elements, appState, _, app: AppClassProperties) => {
    const [path] = app.scene.getSelectedElements(appState);
    if (!path || !isPathElement(path)) {
      return false;
    }

    const elementsMap = app.scene.getNonDeletedElementsMap();
    const originalPositions: Record<string, { x: number; y: number }> = {};
    for (const target of getPathTargetElements(path, elementsMap)) {
      originalPositions[target.id] = { x: target.x, y: target.y };
      const boundText = getBoundTextElement(target, elementsMap);
      if (boundText) {
        originalPositions[boundText.id] = { x: boundText.x, y: boundText.y };
      }
    }

    return {
      appState: {
        ...appState,
        selectedLinearElement: new LinearElementEditor(
          path as NonDeleted<ExcalidrawPathElement>,
          elementsMap,
          true,
        ),
        motionPathEditor: {
          pathId: path.id,
          // a copy, not the live element: edits mutate the scene element
          // in place, which would otherwise rewrite the snapshot too
          // (`points` arrays are replaced on edit, never mutated, so a
          // shallow copy is enough)
          original: { ...path },
          originalPositions,
        },
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});
