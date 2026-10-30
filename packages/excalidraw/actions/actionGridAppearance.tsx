import {
  findLastIndex,
  COLOR_PALETTE,
  DEFAULT_ELEMENT_STROKE_COLOR_PALETTE,
  DEFAULT_GRID_COLOR,
  GRID_SCALE_STEP,
  MAX_GRID_SCALE,
  MIN_GRID_SCALE,
} from "@excalidraw/common";

import {
  CaptureUpdateAction,
  generateFractionalIndexBetween,
} from "@excalidraw/element";

import type { ColorTuple } from "@excalidraw/common";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { ColorPicker } from "../components/ColorPicker/ColorPicker";
import { Range } from "../components/Range";
import {
  BringForwardIcon,
  BringToFrontIcon,
  SendBackwardIcon,
  SendToBackIcon,
} from "../components/icons";
import { t } from "../i18n";
import { getNormalizedGridOpacity, getNormalizedGridScale } from "../scene";

import { register } from "./register";

import type { RangeNotch } from "../components/Range";
import type { AppState } from "../types";

type GridLayerAction =
  | "above"
  | "below"
  | "forward"
  | "backward"
  | "front"
  | "back";

const getOrderedElementIndices = (elements: readonly ExcalidrawElement[]) =>
  elements
    .filter((element) => !element.isDeleted && element.index !== null)
    .map((element) => element.index!)
    .sort();

const moveGridLayer = (
  elements: readonly ExcalidrawElement[],
  gridLayer: AppState["gridLayer"],
  action: GridLayerAction,
): AppState["gridLayer"] => {
  if (action === "above" || action === "below") {
    return action;
  }

  const indices = getOrderedElementIndices(elements);
  if (!indices.length) {
    return action === "front" || action === "forward" ? "above" : "below";
  }

  if (action === "front") {
    return generateFractionalIndexBetween(indices[indices.length - 1], null);
  }
  if (action === "back") {
    return generateFractionalIndexBetween(null, indices[0]);
  }

  if (action === "forward") {
    if (gridLayer === "above") {
      return gridLayer;
    }
    const nextIndex =
      gridLayer === "below"
        ? 0
        : indices.findIndex((index) => index > gridLayer);
    if (nextIndex === -1) {
      return gridLayer;
    }
    return generateFractionalIndexBetween(
      indices[nextIndex],
      indices[nextIndex + 1] ?? null,
    );
  }

  if (gridLayer === "below") {
    return gridLayer;
  }
  const previousIndex =
    gridLayer === "above"
      ? indices.length - 1
      : findLastIndex(indices, (index) => index < gridLayer);
  if (previousIndex === -1) {
    return gridLayer;
  }
  return generateFractionalIndexBetween(
    indices[previousIndex - 1] ?? null,
    indices[previousIndex],
  );
};

const GRID_COLOR_PICKS = [
  DEFAULT_GRID_COLOR,
  COLOR_PALETTE.gray[3],
  COLOR_PALETTE.red[1],
  COLOR_PALETTE.green[1],
  COLOR_PALETTE.blue[1],
] as ColorTuple;

/**
 * Grid and snapping sizes are multipliers of the base `gridSize`, so the
 * visible grid itself is the reference instead of exact pixel counts.
 */
const GRID_SCALE_PRESETS = [MIN_GRID_SCALE, 0.5, 1, 2, 4, MAX_GRID_SCALE];

const formatGridScale = (value: number) => `${value}×`;

/** shared slider (with presets) for the grid size and the snap distance */
const GridScaleRange = ({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  testId: string;
}) => (
  <div
    className="GridPanel__scale"
    onClick={(event) => {
      // Range wraps its preset buttons and slider in one <label>. Releasing a
      // slider drag outside the input fires the click on the label, which the
      // browser forwards to its first control (the first preset button),
      // resetting the value. Only clicks on the presets themselves count.
      if (!(event.target as HTMLElement).closest("button, input")) {
        event.preventDefault();
      }
    }}
  >
    <Range
      label={label}
      value={value}
      onChange={onChange}
      min={MIN_GRID_SCALE}
      max={MAX_GRID_SCALE}
      step={GRID_SCALE_STEP}
      minLabel={formatGridScale(MIN_GRID_SCALE)}
      formatValue={formatGridScale}
      alwaysShowValue
      testId={testId}
      notches={GRID_SCALE_PRESETS.map(
        (scale): RangeNotch => ({
          value: scale,
          icon: <span>{formatGridScale(scale)}</span>,
          label: formatGridScale(scale),
          testId: `${testId}-${scale}`,
        }),
      )}
    />
  </div>
);

export const actionChangeGridScale = register<AppState["gridScale"]>({
  name: "changeGridScale",
  label: "labels.gridScale",
  trackEvent: false,
  perform: (elements, appState, value) => {
    return {
      appState: {
        ...appState,
        gridScale: getNormalizedGridScale(value ?? appState.gridScale),
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  PanelComponent: ({ appState, updateData }) => (
    <GridScaleRange
      label={t("labels.gridScale")}
      value={appState.gridScale}
      onChange={updateData}
      testId="grid-scale"
    />
  ),
});

export const actionToggleGridSnapLink = register({
  name: "toggleGridSnapLink",
  label: "labels.linkGridSnapScale",
  trackEvent: false,
  perform(elements, appState) {
    const gridSnapLinked = !this.checked!(appState);
    return {
      appState: {
        ...appState,
        gridSnapLinked,
        // start from the current grid size so snapping doesn't jump
        gridSnapScale: gridSnapLinked
          ? appState.gridSnapScale
          : appState.gridScale,
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  checked: (appState) => appState.gridSnapLinked,
});

export const actionChangeGridSnapScale = register<AppState["gridSnapScale"]>({
  name: "changeGridSnapScale",
  label: "labels.gridSnapScale",
  trackEvent: false,
  perform: (elements, appState, value) => {
    return {
      appState: {
        ...appState,
        gridSnapScale: getNormalizedGridScale(value ?? appState.gridSnapScale),
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  PanelComponent: ({ appState, updateData }) => (
    <GridScaleRange
      label={t("labels.gridSnapScale")}
      value={appState.gridSnapScale}
      onChange={updateData}
      testId="grid-snap-scale"
    />
  ),
});

export const actionChangeGridColor = register<
  Partial<Pick<AppState, "gridColor" | "openPopup">>
>({
  name: "changeGridColor",
  label: "labels.gridColor",
  trackEvent: false,
  perform: (elements, appState, value) => {
    // the color picker also opens/closes its popup through here
    return {
      appState: {
        ...appState,
        ...(value?.gridColor !== undefined && { gridColor: value.gridColor }),
        ...(value?.openPopup !== undefined && { openPopup: value.openPopup }),
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  PanelComponent: ({ elements, appState, updateData }) => (
    <fieldset>
      <legend>{t("labels.gridColor")}</legend>
      <ColorPicker
        topPicks={GRID_COLOR_PICKS}
        palette={DEFAULT_ELEMENT_STROKE_COLOR_PALETTE}
        type="gridColor"
        label={t("labels.gridColor")}
        color={appState.gridColor}
        onChange={(gridColor) => updateData({ gridColor })}
        elements={elements}
        appState={appState}
        updateData={updateData}
      />
    </fieldset>
  ),
});

export const actionChangeGridOpacity = register<AppState["gridOpacity"]>({
  name: "changeGridOpacity",
  label: "labels.gridOpacity",
  trackEvent: false,
  perform: (elements, appState, value) => {
    const gridOpacity = getNormalizedGridOpacity(value ?? appState.gridOpacity);
    return {
      appState: {
        ...appState,
        gridOpacity,
        // a fully transparent grid is a hidden grid, and raising the opacity
        // from 0 shows it again (turning the grid on from 0 restores full
        // opacity instead, see actionToggleGridMode)
        gridModeEnabled:
          gridOpacity === 0
            ? false
            : appState.gridOpacity === 0
            ? true
            : appState.gridModeEnabled,
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  PanelComponent: ({ appState, updateData }) => (
    <Range
      label={t("labels.gridOpacity")}
      value={appState.gridOpacity}
      onChange={updateData}
      min={0}
      max={100}
      step={10}
      minLabel={null}
      testId="grid-opacity"
    />
  ),
});

export const actionChangeGridLayer = register<GridLayerAction>({
  name: "changeGridLayer",
  label: "labels.gridLayer",
  trackEvent: false,
  perform: (elements, appState, value) => {
    if (!value) {
      return {
        appState,
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }
    return {
      appState: {
        ...appState,
        gridLayer: moveGridLayer(elements, appState.gridLayer, value),
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  PanelComponent: ({ updateData }) => (
    <fieldset>
      <legend>{t("labels.gridLayer")}</legend>
      <div className="buttonList">
        <button
          type="button"
          className="zIndexButton"
          data-testid="grid-layer-forward"
          title={t("labels.bringForward")}
          aria-label={t("labels.bringForward")}
          onClick={() => updateData("forward")}
        >
          {BringForwardIcon}
        </button>
        <button
          type="button"
          className="zIndexButton"
          data-testid="grid-layer-backward"
          title={t("labels.sendBackward")}
          aria-label={t("labels.sendBackward")}
          onClick={() => updateData("backward")}
        >
          {SendBackwardIcon}
        </button>
        <button
          type="button"
          className="zIndexButton"
          data-testid="grid-layer-front"
          title={t("labels.bringToFront")}
          aria-label={t("labels.bringToFront")}
          onClick={() => updateData("front")}
        >
          {BringToFrontIcon}
        </button>
        <button
          type="button"
          className="zIndexButton"
          data-testid="grid-layer-back"
          title={t("labels.sendToBack")}
          aria-label={t("labels.sendToBack")}
          onClick={() => updateData("back")}
        >
          {SendToBackIcon}
        </button>
      </div>
    </fieldset>
  ),
});
