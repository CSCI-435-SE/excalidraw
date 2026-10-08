import {
  COLOR_PALETTE,
  DEFAULT_ELEMENT_STROKE_COLOR_PALETTE,
  DEFAULT_GRID_COLOR,
  GRID_SCALE_STEP,
  MAX_GRID_SCALE,
  MIN_GRID_SCALE,
} from "@excalidraw/common";

import { CaptureUpdateAction } from "@excalidraw/element";

import type { ColorTuple } from "@excalidraw/common";

import { ColorPicker } from "../components/ColorPicker/ColorPicker";
import { RadioSelection } from "../components/RadioSelection";
import { Range } from "../components/Range";
import { BringToFrontIcon, SendToBackIcon } from "../components/icons";
import { t } from "../i18n";
import { getNormalizedGridOpacity, getNormalizedGridScale } from "../scene";

import { register } from "./register";

import type { RangeNotch } from "../components/Range";
import type { AppState } from "../types";

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

export const actionChangeGridLayer = register<AppState["gridLayer"]>({
  name: "changeGridLayer",
  label: "labels.gridLayer",
  trackEvent: false,
  perform: (elements, appState, value) => {
    return {
      appState: {
        ...appState,
        gridLayer: value === "above" ? "above" : "below",
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  PanelComponent: ({ appState, updateData }) => (
    <fieldset>
      <legend>{t("labels.gridLayer")}</legend>
      <div className="buttonList">
        <RadioSelection<AppState["gridLayer"]>
          type="button"
          options={[
            {
              value: "below",
              text: t("labels.gridLayerBelow"),
              icon: SendToBackIcon,
              testId: "grid-layer-below",
            },
            {
              value: "above",
              text: t("labels.gridLayerAbove"),
              icon: BringToFrontIcon,
              testId: "grid-layer-above",
            },
          ]}
          value={appState.gridLayer}
          onClick={(value) => updateData(value)}
        />
      </div>
    </fieldset>
  ),
});
