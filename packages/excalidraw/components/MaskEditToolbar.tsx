import React from "react";

import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import { getElementAbsoluteCoords, isMaskEnabled } from "@excalidraw/element";

import type {
  ElementsMap,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import {
  actionAddToMask,
  actionMaskAll,
  actionMaskNone,
  actionRemoveMask,
  actionToggleMaskEnabled,
} from "../actions";
import { t } from "../i18n";

import { useExcalidrawActionManager, useExcalidrawAppState } from "./App";
import { MaskModeToggle } from "./MaskModeToggle";
import { Switch } from "./Switch";

import "./MaskEditToolbar.scss";

/** clears the mask's top-right resize handle */
const HANDLE_CLEARANCE = 24;

/**
 * Mask options, shown next to a mask shape after double-clicking it (see
 * actionMask.tsx). Positioned and hidden like MotionPathEditToolbar.
 */
export const MaskEditToolbar = ({
  mask,
  elementsMap,
}: {
  mask: NonDeletedExcalidrawElement;
  elementsMap: ElementsMap;
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
    appState.selectedElementsAreBeingDragged
  ) {
    return null;
  }

  const [, y1, x2] = getElementAbsoluteCoords(mask, elementsMap);
  const { x: viewportX, y: viewportY } = sceneCoordsToViewportCoords(
    { sceneX: x2, sceneY: y1 },
    appState,
  );

  return (
    <div
      className="mask-edit-toolbar"
      data-testid="mask-edit-toolbar"
      style={{
        top: `${viewportY - appState.offsetTop}px`,
        left: `${viewportX - appState.offsetLeft + HANDLE_CLEARANCE}px`,
      }}
    >
      <label className="mask-edit-toolbar__toggle">
        <span>{t("labels.mask.enabled")}</span>
        <Switch
          name="mask-enabled"
          checked={isMaskEnabled(mask)}
          onChange={() => actionManager.executeAction(actionToggleMaskEnabled)}
        />
      </label>
      <MaskModeToggle mask={mask} />
      <button
        type="button"
        className="mask-edit-toolbar__button"
        data-testid="mask-all"
        onClick={() => actionManager.executeAction(actionMaskAll)}
      >
        {t("labels.mask.all")}
      </button>
      <button
        type="button"
        className="mask-edit-toolbar__button"
        data-testid="mask-none"
        onClick={() => actionManager.executeAction(actionMaskNone)}
      >
        {t("labels.mask.none")}
      </button>
      <button
        type="button"
        className="mask-edit-toolbar__button"
        data-testid="mask-add"
        onClick={() => actionManager.executeAction(actionAddToMask)}
      >
        {t("labels.mask.add")}
      </button>
      <button
        type="button"
        className="mask-edit-toolbar__button"
        data-testid="mask-remove"
        onClick={() => actionManager.executeAction(actionRemoveMask)}
      >
        {t("labels.mask.remove")}
      </button>
    </div>
  );
};
