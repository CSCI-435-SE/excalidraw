import clsx from "clsx";
import { useState } from "react";

import { KEYS } from "@excalidraw/common";

import { actionToggleGridMode } from "../actions";
import { useTunnels } from "../context/tunnels";
import { useAtomValue } from "../editor-jotai";
import { t } from "../i18n";

import {
  useEditorInterface,
  useExcalidrawActionManager,
  useStylesPanelMode,
} from "./App";
import { isGridPanelOpenAtom, openGridPanel } from "./GridPanel";
import { HintViewer } from "./HintViewer";
import { Island } from "./Island";
import { LockButton } from "./LockButton";
import { PenModeButton } from "./PenModeButton";
import Stack from "./Stack";
import DropdownMenu from "./dropdownMenu/DropdownMenu";
import {
  EmbedIcon,
  extraToolsIcon,
  frameToolIcon,
  gridIcon,
  LassoIcon,
  laserPointerToolIcon,
  MagicIcon,
  mermaidLogoIcon,
  PathIcon,
} from "./icons";
import {
  ArrowToolButton,
  DiamondToolButton,
  TriangleToolButton,
  EllipseToolButton,
  EraserToolButton,
  FreedrawToolButton,
  HandToolButton,
  ImageToolButton,
  LassoToolButton,
  LineToolButton,
  RectangleToolButton,
  SelectionToolButton,
  SelectionToolPopover,
  TextToolButton,
} from "./Tools";

import type {
  AppClassProperties,
  AppProps,
  AppState,
  UIAppState,
} from "../types";

const ExtraToolsDropdown = ({
  app,
  activeTool,
  setAppState,
}: {
  app: AppClassProperties;
  activeTool: UIAppState["activeTool"];
  setAppState: React.Component<any, AppState>["setState"];
}) => {
  const [isExtraToolsMenuOpen, setIsExtraToolsMenuOpen] = useState(false);
  const isFullStylesPanel = useStylesPanelMode() === "full";
  const { TTDDialogTriggerTunnel } = useTunnels();
  const actionManager = useExcalidrawActionManager();
  const isGridPanelOpen = useAtomValue(isGridPanelOpenAtom);

  // hidden when the host app controls the grid via the `gridModeEnabled` prop
  const showGridItem = actionManager.isActionEnabled(actionToggleGridMode);
  const frameToolSelected = activeTool.type === "frame";
  const laserToolSelected = activeTool.type === "laser";
  const lassoToolSelected =
    isFullStylesPanel &&
    activeTool.type === "lasso" &&
    app.state.preferredSelectionTool.type !== "lasso";
  const embeddableToolSelected = activeTool.type === "embeddable";
  const pathToolSelected = activeTool.type === "path";

  return (
    <DropdownMenu open={isExtraToolsMenuOpen}>
      <DropdownMenu.Trigger
        className={clsx("App-toolbar__extra-tools-trigger", {
          "App-toolbar__extra-tools-trigger--selected":
            isGridPanelOpen ||
            frameToolSelected ||
            embeddableToolSelected ||
            pathToolSelected ||
            lassoToolSelected ||
            // in collab we're already highlighting the laser button
            // outside toolbar, so let's not highlight extra-tools button
            // on top of it
            (laserToolSelected && !app.props.isCollaborating),
        })}
        onToggle={() => {
          setIsExtraToolsMenuOpen(!isExtraToolsMenuOpen);
          setAppState({ openMenu: null, openPopup: null });
        }}
        title={t("toolBar.extraTools")}
      >
        {isGridPanelOpen
          ? gridIcon
          : frameToolSelected
          ? frameToolIcon
          : embeddableToolSelected
          ? EmbedIcon
          : pathToolSelected
          ? PathIcon
          : laserToolSelected && !app.props.isCollaborating
          ? laserPointerToolIcon
          : lassoToolSelected
          ? LassoIcon
          : extraToolsIcon}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        onClickOutside={() => setIsExtraToolsMenuOpen(false)}
        onSelect={() => setIsExtraToolsMenuOpen(false)}
        className="App-toolbar__extra-tools-dropdown"
      >
        {showGridItem && (
          <DropdownMenu.Item
            onSelect={() => openGridPanel(app)}
            icon={gridIcon}
            shortcut={KEYS.G.toLocaleUpperCase()}
            data-testid="toolbar-grid"
            selected={isGridPanelOpen}
          >
            {t("toolBar.grid")}
          </DropdownMenu.Item>
        )}
        <DropdownMenu.Item
          onSelect={() => app.setActiveTool({ type: "frame" })}
          icon={frameToolIcon}
          shortcut={KEYS.F.toLocaleUpperCase()}
          data-testid="toolbar-frame"
          selected={frameToolSelected}
        >
          {t("toolBar.frame")}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={() => app.setActiveTool({ type: "embeddable" })}
          icon={EmbedIcon}
          data-testid="toolbar-embeddable"
          selected={embeddableToolSelected}
        >
          {t("toolBar.embeddable")}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={() => app.setActiveTool({ type: "path" })}
          icon={PathIcon}
          shortcut={KEYS.M.toLocaleUpperCase()}
          data-testid="toolbar-path"
          selected={pathToolSelected}
        >
          {t("toolBar.path")}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={() => app.setActiveTool({ type: "laser" })}
          icon={laserPointerToolIcon}
          data-testid="toolbar-laser"
          selected={laserToolSelected}
          shortcut={KEYS.K.toLocaleUpperCase()}
        >
          {t("toolBar.laser")}
        </DropdownMenu.Item>
        {isFullStylesPanel && (
          <DropdownMenu.Item
            onSelect={() => app.setActiveTool({ type: "lasso" })}
            icon={LassoIcon}
            data-testid="toolbar-lasso"
            selected={lassoToolSelected}
          >
            {t("toolBar.lasso")}
          </DropdownMenu.Item>
        )}
        <div style={{ margin: "6px 0", fontSize: 14, fontWeight: 600 }}>
          Generate
        </div>
        {app.props.aiEnabled !== false && <TTDDialogTriggerTunnel.Out />}
        <DropdownMenu.Item
          onSelect={() => app.setOpenDialog({ name: "ttd", tab: "mermaid" })}
          icon={mermaidLogoIcon}
          data-testid="toolbar-embeddable"
        >
          {t("toolBar.mermaidToExcalidraw")}
        </DropdownMenu.Item>
        {app.props.aiEnabled !== false && app.plugins.diagramToCode && (
          <DropdownMenu.Item
            onSelect={() => app.onMagicframeToolSelect()}
            icon={MagicIcon}
            data-testid="toolbar-magicframe"
            badge={<DropdownMenu.Item.Badge>AI</DropdownMenu.Item.Badge>}
          >
            {t("toolBar.magicframe")}
          </DropdownMenu.Item>
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

/** the main (desktop/tablet) toolbar island */
export const Toolbar = ({
  app,
  appState,
  setAppState,
  UIOptions,
  onPenModeToggle,
  onLockToggle,
  heading,
}: {
  app: AppClassProperties;
  appState: UIAppState;
  setAppState: React.Component<any, AppState>["setState"];
  UIOptions: AppProps["UIOptions"];
  onPenModeToggle: AppClassProperties["togglePenMode"];
  onLockToggle: () => void;
  heading: React.ReactNode;
}) => {
  const editorInterface = useEditorInterface();
  const isCompactStylesPanel = useStylesPanelMode() === "compact";

  const activeTool = appState.activeTool;
  const toolProps = { app, activeTool };

  return (
    <Island
      padding={1}
      className={clsx("App-toolbar", {
        "zen-mode": appState.zenModeEnabled,
        "App-toolbar--compact": isCompactStylesPanel,
      })}
      data-viewport-ui="top"
    >
      <HintViewer
        appState={appState}
        isMobile={editorInterface.formFactor === "phone"}
        editorInterface={editorInterface}
        app={app}
      />
      {heading}
      <Stack.Row gap={isCompactStylesPanel ? 0.5 : 1}>
        {/* in compact UI the pen mode button is rendered as a separate
            floating button below the compact actions menu */}
        {!isCompactStylesPanel && (
          <PenModeButton
            checked={appState.penMode}
            onChange={() => onPenModeToggle(null)}
            title={t("toolBar.penMode")}
            penDetected={appState.penDetected}
          />
        )}
        <LockButton
          checked={appState.activeTool.locked}
          onChange={onLockToggle}
          title={t("toolBar.lock")}
        />

        <div className="App-toolbar__divider" />

        <HandToolButton {...toolProps} hideKeyBinding />
        {isCompactStylesPanel ? (
          <SelectionToolPopover {...toolProps} setAppState={setAppState} />
        ) : appState.preferredSelectionTool.type === "lasso" ? (
          <LassoToolButton {...toolProps} />
        ) : (
          <SelectionToolButton {...toolProps} />
        )}
        <RectangleToolButton {...toolProps} />
        <DiamondToolButton {...toolProps} />
        <TriangleToolButton {...toolProps} />
        <EllipseToolButton {...toolProps} />
        <ArrowToolButton {...toolProps} />
        <LineToolButton {...toolProps} />
        <FreedrawToolButton {...toolProps} />
        <TextToolButton {...toolProps} />
        {UIOptions.tools?.image !== false && <ImageToolButton {...toolProps} />}
        <EraserToolButton {...toolProps} />

        <div className="App-toolbar__divider" />

        <ExtraToolsDropdown
          app={app}
          activeTool={activeTool}
          setAppState={setAppState}
        />
      </Stack.Row>
    </Island>
  );
};
