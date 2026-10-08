import { useEffect } from "react";

import { EVENT, KEYS, isSelectionLikeTool } from "@excalidraw/common";
import { showSelectedShapeActions } from "@excalidraw/element";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { actionToggleGridMode, actionToggleGridSnapMode } from "../actions";
import { getShortcutFromShortcutName } from "../actions/shortcuts";
import { atom, useAtom } from "../editor-jotai";
import { t } from "../i18n";

import { useExcalidrawActionManager } from "./App";
import { Island } from "./Island";
import { Switch } from "./Switch";

import "./GridPanel.scss";

import type { AppClassProperties, UIAppState } from "../types";

/** whether the grid settings panel (opened from the extra-tools menu) is open */
export const isGridPanelOpenAtom = atom(false);

/**
 * Opens the grid panel like picking a tool: switches to the selection tool
 * and clears the selection so no other tool or properties panel stays active.
 */
export const openGridPanel = (app: AppClassProperties) => {
  app.setActiveTool({ type: app.state.preferredSelectionTool.type });
  app.setAppState({ selectedElementIds: {}, selectedGroupIds: {} });
  app.updateEditorAtom(isGridPanelOpenAtom, true);
};

/**
 * Left-side panel with the grid toggles, shown after picking "Grid" in the
 * extra-tools menu (like the properties panel shown for the frame tool).
 * Closes when the user switches to another tool, selects or edits elements
 * (anything that brings up the properties panel), or presses Escape.
 */
export const GridPanel = ({
  appState,
  elements,
}: {
  appState: UIAppState;
  elements: readonly NonDeletedExcalidrawElement[];
}) => {
  const [isOpen, setIsOpen] = useAtom(isGridPanelOpenAtom);
  const actionManager = useExcalidrawActionManager();

  // opening the panel switches to the selection tool and clears the
  // selection, so this only becomes true once the user moves on
  const shouldClose =
    !isSelectionLikeTool(appState.activeTool.type) ||
    showSelectedShapeActions(appState, elements);
  useEffect(() => {
    if (shouldClose) {
      setIsOpen(false);
    }
  }, [shouldClose, setIsOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEYS.ESCAPE) {
        setIsOpen(false);
      }
    };
    document.addEventListener(EVENT.KEYDOWN, onKeyDown);
    return () => document.removeEventListener(EVENT.KEYDOWN, onKeyDown);
  }, [isOpen, setIsOpen]);

  if (
    !isOpen ||
    shouldClose ||
    appState.viewModeEnabled ||
    !actionManager.isActionEnabled(actionToggleGridMode)
  ) {
    return null;
  }

  return (
    <Island className="GridPanel" padding={2} data-viewport-ui="side">
      <fieldset>
        <legend>{t("toolBar.grid")}</legend>
        <GridPanelToggle
          name="grid-panel-show-grid"
          label={t("labels.showGrid")}
          shortcut={getShortcutFromShortcutName("gridMode")}
          checked={appState.gridModeEnabled}
          onChange={() =>
            actionManager.executeAction(actionToggleGridMode, "ui")
          }
        />
        <GridPanelToggle
          name="grid-panel-snap-to-grid"
          label={t("labels.toggleGridSnap")}
          checked={appState.gridSnapEnabled}
          onChange={() =>
            actionManager.executeAction(actionToggleGridSnapMode, "ui")
          }
        />
      </fieldset>
    </Island>
  );
};

const GridPanelToggle = ({
  name,
  label,
  shortcut,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  shortcut?: string;
  checked: boolean;
  onChange: () => void;
}) => (
  <div className="GridPanel__toggle">
    <label htmlFor={name}>{label}</label>
    {shortcut && <span className="GridPanel__shortcut">{shortcut}</span>}
    <Switch name={name} title={label} checked={checked} onChange={onChange} />
  </div>
);
