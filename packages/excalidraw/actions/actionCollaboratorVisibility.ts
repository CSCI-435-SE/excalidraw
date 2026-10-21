import { CaptureUpdateAction } from "@excalidraw/element";

import { eyeClosedIcon, eyeIcon } from "../components/icons";
import { getVisibilityBuckets } from "../scene/visibility";

import { register } from "./register";

/*
 * Local-only visibility of collaborators' drawings. These only change
 * `appState.hiddenCollaboratorIds` (never synced, never in history); hiding
 * your own drawings locks view mode (enforced in App.componentDidUpdate).
 */

/** toggles one visibility bucket (a creator id, or UNKNOWN_CREATOR_ID) */
export const actionToggleCollaboratorVisibility = register<string>({
  name: "toggleCollaboratorVisibility",
  label: "collaboratorVisibility.toggle",
  icon: eyeIcon,
  // must work in view mode: it's how you get out of the self-hide lock
  viewMode: true,
  trackEvent: { category: "collab" },
  perform(elements, appState, bucketId) {
    if (!bucketId) {
      return false;
    }
    const hiddenCollaboratorIds = new Set(appState.hiddenCollaboratorIds);
    if (!hiddenCollaboratorIds.delete(bucketId)) {
      hiddenCollaboratorIds.add(bucketId);
    }
    return {
      appState: { ...appState, hiddenCollaboratorIds },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
});

export const actionShowAllCollaborators = register({
  name: "showAllCollaborators",
  label: "collaboratorVisibility.showAll",
  icon: eyeIcon,
  viewMode: true,
  trackEvent: { category: "collab" },
  perform(elements, appState) {
    return {
      appState: { ...appState, hiddenCollaboratorIds: new Set() },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
  predicate: (elements, appState) => appState.hiddenCollaboratorIds.size > 0,
});

/** hides everyone, including yourself (which locks view mode) */
export const actionHideAllCollaborators = register({
  name: "hideAllCollaborators",
  label: "collaboratorVisibility.hideAll",
  icon: eyeClosedIcon,
  viewMode: true,
  trackEvent: { category: "collab" },
  perform(elements, appState) {
    return {
      appState: {
        ...appState,
        hiddenCollaboratorIds: getVisibilityBuckets(elements, appState),
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
});
