import React from "react";

import {
  PATH_MOTION_SPEED_PRESETS,
  sceneCoordsToViewportCoords,
} from "@excalidraw/common";
import { getElementAbsoluteCoords } from "@excalidraw/element";

import type {
  ElementsMap,
  ExcalidrawPathElement,
  NonDeleted,
  PathMotionConfig,
  PathMotionEasing,
} from "@excalidraw/element/types";

import {
  actionChangeMotionPathConfig,
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
  isPlaying,
  canReset,
  onPlay,
  onPause,
  onReset,
}: {
  path: NonDeleted<ExcalidrawPathElement>;
  elementsMap: ElementsMap;
  isPlaying: boolean;
  canReset: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
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
      <div className="motion-path-edit-toolbar__row">
        <button
          type="button"
          className="motion-path-edit-toolbar__button motion-path-edit-toolbar__button--primary"
          data-testid={isPlaying ? "motion-path-pause" : "motion-path-play"}
          onClick={isPlaying ? onPause : onPlay}
        >
          {isPlaying
            ? t("labels.pathEditor.pause")
            : t("labels.pathEditor.play")}
        </button>
        <button
          type="button"
          className="motion-path-edit-toolbar__button"
          data-testid="motion-path-reset"
          disabled={!canReset}
          onClick={onReset}
        >
          {t("labels.pathEditor.reset")}
        </button>
        <button
          type="button"
          className="motion-path-edit-toolbar__button"
          data-testid="motion-path-curve"
          aria-pressed={!!path.roundness}
          onClick={() =>
            actionManager.executeAction(actionToggleMotionPathCurve)
          }
        >
          {path.roundness
            ? t("labels.pathEditor.straight")
            : t("labels.pathEditor.curved")}
        </button>
        <button
          type="button"
          className="motion-path-edit-toolbar__button"
          data-testid="motion-path-reject"
          onClick={() =>
            actionManager.executeAction(actionRejectMotionPathEdit)
          }
        >
          {t("labels.pathEditor.reject")}
        </button>
        <button
          type="button"
          className="motion-path-edit-toolbar__button"
          data-testid="motion-path-done"
          onClick={() =>
            actionManager.executeAction(actionFinishMotionPathEdit)
          }
        >
          {t("labels.pathEditor.done")}
        </button>
      </div>
      <MotionSettings
        motion={path.motion}
        onChange={(value) =>
          actionManager.executeAction(actionChangeMotionPathConfig, "ui", value)
        }
      />
    </div>
  );
};

const SPEED_PRESETS = Object.entries(PATH_MOTION_SPEED_PRESETS) as [
  keyof typeof PATH_MOTION_SPEED_PRESETS,
  number,
][];

const EASINGS: PathMotionEasing[] = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
];

/** keys a focused slider/select handles itself; kept off the canvas shortcuts */
const CONTROL_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

const MotionSettings = ({
  motion,
  onChange,
}: {
  motion: PathMotionConfig;
  onChange: (value: Partial<PathMotionConfig>) => void;
}) => {
  const percent = (fraction: number) => Math.round(fraction * 100);

  return (
    <div
      className="motion-path-edit-toolbar__settings"
      data-testid="motion-path-settings"
      onKeyDown={(event) => {
        if (CONTROL_KEYS.has(event.key)) {
          event.stopPropagation();
        }
      }}
    >
      <span className="motion-path-edit-toolbar__label">
        {t("labels.pathEditor.speed")}
      </span>
      <div className="motion-path-edit-toolbar__group">
        {SPEED_PRESETS.map(([preset, speed]) => (
          <button
            key={preset}
            type="button"
            className="motion-path-edit-toolbar__button"
            data-testid={`motion-path-speed-${preset}`}
            aria-pressed={motion.speed === speed}
            onClick={() => onChange({ speed })}
          >
            {t(`labels.pathEditor.${preset}`)}
          </button>
        ))}
      </div>

      <label
        className="motion-path-edit-toolbar__label"
        htmlFor="motion-path-easing"
      >
        {t("labels.pathEditor.easing")}
      </label>
      <select
        id="motion-path-easing"
        className="motion-path-edit-toolbar__select"
        data-testid="motion-path-easing"
        value={motion.easing}
        onChange={(event) =>
          onChange({ easing: event.target.value as PathMotionEasing })
        }
      >
        {EASINGS.map((easing) => (
          <option key={easing} value={easing}>
            {t(`labels.pathEditor.${easing}`)}
          </option>
        ))}
      </select>

      {(["start", "end"] as const).map((key) => (
        <React.Fragment key={key}>
          <label
            className="motion-path-edit-toolbar__label"
            htmlFor={`motion-path-${key}`}
          >
            {t(`labels.pathEditor.${key}`)}
          </label>
          <div className="motion-path-edit-toolbar__range">
            <input
              id={`motion-path-${key}`}
              type="range"
              min={0}
              max={100}
              step={1}
              data-testid={`motion-path-${key}`}
              value={percent(motion[key])}
              onChange={(event) =>
                onChange({ [key]: Number(event.target.value) / 100 })
              }
            />
            <span className="motion-path-edit-toolbar__value">
              {percent(motion[key])}%
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};
