import { CaptureUpdateAction } from "@excalidraw/element";

import { gridIcon } from "../components/icons";

import { register } from "./register";

export const actionToggleGridSnapMode = register({
  name: "gridSnapMode",
  icon: gridIcon,
  keywords: ["snap"],
  label: "labels.toggleGridSnap",
  viewMode: false,
  trackEvent: {
    category: "canvas",
    predicate: (appState) => !appState.gridSnapEnabled,
  },
  perform(elements, appState) {
    return {
      appState: {
        ...appState,
        gridSnapEnabled: !this.checked!(appState),
        // grid and object snapping are mutually exclusive
        objectsSnapModeEnabled: false,
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  checked: (appState) => appState.gridSnapEnabled,
});
