import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import { getElementAbsoluteCoords } from "@excalidraw/element";

import type {
  ElementsMap,
  ExcalidrawPathElement,
  NonDeleted,
} from "@excalidraw/element/types";

import {
  actionFinishMotionPathEdit,
  actionRejectMotionPathEdit,
  actionToggleMotionPathCurve,
} from "../actions";
import { t } from "../i18n";

import { useExcalidrawActionManager, useExcalidrawAppState } from "./App";

import "./MotionPathEditToolbar.scss";

/** clears the path's top-right resize handle */
const HANDLE_CLEARANCE = 24;

/**
 * Small floating toolbar shown next to a motion path while it is being
 * re-edited (see actionMotionPathEditor.tsx). Positioned like
 * ElementCanvasButtons, and hidden under the same conditions plus while the
 * path is being dragged, so it never sits under the pointer mid-gesture.
 */
export const MotionPathEditToolbar = ({
  path,
  elementsMap,
  onTestAnimation,
}: {
  path: NonDeleted<ExcalidrawPathElement>;
  elementsMap: ElementsMap;
  onTestAnimation: () => void;
}) => {
  const appState = useExcalidrawAppState();
  const actionManager = useExcalidrawActionManager();

  if (
    appState.contextMenu ||
    appState.newElement ||
    appState.resizingElement ||
    appState.isRotating ||
    appState.openMenu ||
    appState.viewModeEnabled ||
    appState.selectedElementsAreBeingDragged ||
    appState.selectedLinearElement?.isDragging
  ) {
    return null;
  }

  const [, y1, x2] = getElementAbsoluteCoords(path, elementsMap);
  const { x: viewportX, y: viewportY } = sceneCoordsToViewportCoords(
    { sceneX: x2, sceneY: y1 },
    appState,
  );

  return (
    <div
      className="motion-path-edit-toolbar"
      data-testid="motion-path-edit-toolbar"
      style={{
        top: `${viewportY - appState.offsetTop}px`,
        left: `${viewportX - appState.offsetLeft + HANDLE_CLEARANCE}px`,
      }}
    >
      <button
        type="button"
        className="motion-path-edit-toolbar__button motion-path-edit-toolbar__button--primary"
        data-testid="motion-path-test"
        onClick={onTestAnimation}
      >
        {t("labels.pathEditor.testAnimation")}
      </button>
      <button
        type="button"
        className="motion-path-edit-toolbar__button"
        data-testid="motion-path-curve"
        aria-pressed={!!path.roundness}
        onClick={() => actionManager.executeAction(actionToggleMotionPathCurve)}
      >
        {path.roundness
          ? t("labels.pathEditor.straight")
          : t("labels.pathEditor.curved")}
      </button>
      <button
        type="button"
        className="motion-path-edit-toolbar__button"
        data-testid="motion-path-reject"
        onClick={() => actionManager.executeAction(actionRejectMotionPathEdit)}
      >
        {t("labels.pathEditor.reject")}
      </button>
      <button
        type="button"
        className="motion-path-edit-toolbar__button"
        data-testid="motion-path-done"
        onClick={() => actionManager.executeAction(actionFinishMotionPathEdit)}
      >
        {t("labels.pathEditor.done")}
      </button>
    </div>
  );
};
