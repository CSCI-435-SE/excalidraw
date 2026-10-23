import { CODES, KEYS } from "@excalidraw/common";

import { CaptureUpdateAction } from "@excalidraw/element";

import { eyeIcon } from "../components/icons";
import { isOwnDrawingsHidden } from "../scene/visibility";

import { register } from "./register";

export const actionToggleViewMode = register({
  name: "viewMode",
  label: "labels.viewMode",
  icon: eyeIcon,
  viewMode: true,
  trackEvent: {
    category: "canvas",
    predicate: (appState) => !appState.viewModeEnabled,
  },
  perform(elements, appState) {
    // locked while the user's own drawings are hidden (they'd be invisible).
    // Checked here, not only in `predicate`, because keyboard shortcuts
    // don't consult predicates
    if (isOwnDrawingsHidden(appState)) {
      return false;
    }
    return {
      appState: {
        ...appState,
        viewModeEnabled: !this.checked!(appState),
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  checked: (appState) => appState.viewModeEnabled,
  predicate: (elements, appState, appProps) => {
    return (
      typeof appProps.viewModeEnabled === "undefined" &&
      !isOwnDrawingsHidden(appState)
    );
  },
  keyTest: (event) =>
    !event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.R,
});
