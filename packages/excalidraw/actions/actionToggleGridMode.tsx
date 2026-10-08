import { CODES, DEFAULT_GRID_OPACITY, KEYS } from "@excalidraw/common";

import { CaptureUpdateAction } from "@excalidraw/element";

import { gridIcon } from "../components/icons";

import { register } from "./register";

export const actionToggleGridMode = register({
  name: "gridMode",
  icon: gridIcon,
  keywords: ["grid"],
  label: "labels.toggleGrid",
  viewMode: true,
  trackEvent: {
    category: "canvas",
    predicate: (appState) => appState.gridModeEnabled,
  },
  perform(elements, appState) {
    const gridModeEnabled = !this.checked!(appState);
    return {
      appState: {
        ...appState,
        gridModeEnabled,
        // opacity 0 hid the grid, so showing it again starts fully visible.
        // Hiding it keeps the opacity to restore it as it was.
        gridOpacity:
          gridModeEnabled && appState.gridOpacity === 0
            ? DEFAULT_GRID_OPACITY
            : appState.gridOpacity,
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  checked: (appState) => appState.gridModeEnabled,
  predicate: (element, appState, props) => {
    return props.gridModeEnabled === undefined;
  },
  keyTest: (event) => event[KEYS.CTRL_OR_CMD] && event.code === CODES.QUOTE,
});
