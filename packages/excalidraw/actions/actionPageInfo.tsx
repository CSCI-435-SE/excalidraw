import { KEYS } from "@excalidraw/common";

import { CaptureUpdateAction } from "@excalidraw/element";

import { register } from "./register";

/** Opens the page info menu for the active page (Alt+Shift+I). */
export const actionOpenPageInfo = register({
  name: "openPageInfo",
  label: "labels.pageInfo",
  keywords: ["page", "rename", "description"],
  viewMode: false,
  trackEvent: { category: "canvas" },
  perform(elements, appState, _, app) {
    return {
      appState: {
        ...appState,
        openDialog: { name: "pageInfo", pageId: app.getActivePageId() },
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  // physical key code so Option+Shift+I on macOS (which produces "ˆ") works
  keyTest: (event) =>
    event.altKey &&
    event.shiftKey &&
    !event[KEYS.CTRL_OR_CMD] &&
    event.code === "KeyI",
});
