import {
  CaptureUpdateAction,
  addLockedCollaborators,
  toggleLockedCollaborator,
  unlockVisibleCollaborators,
} from "@excalidraw/element";

import {
  eyeClosedIcon,
  eyeIcon,
  LockedIcon,
  UnlockedIcon,
} from "../components/icons";
import {
  getSelfCollaboratorId,
  getVisibilityBuckets,
} from "../scene/visibility";

import { register } from "./register";

/*
 * Local-only visibility of collaborators' drawings. These only change
 * `appState.hiddenCollaboratorIds` (never synced, never in history); hiding
 * your own drawings locks view mode (enforced in App.componentDidUpdate).
 *
 * Hiding a collaborator also locks them (#81), so they stay non-interactive
 * once shown again, until unlocked.
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
    let { lockedCollaboratorIds } = appState;
    if (!hiddenCollaboratorIds.delete(bucketId)) {
      hiddenCollaboratorIds.add(bucketId);
      lockedCollaboratorIds = addLockedCollaborators(
        lockedCollaboratorIds,
        [bucketId],
        getSelfCollaboratorId(appState),
      );
    }
    return {
      appState: { ...appState, hiddenCollaboratorIds, lockedCollaboratorIds },
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
    const hiddenCollaboratorIds = getVisibilityBuckets(elements, appState);
    return {
      appState: {
        ...appState,
        hiddenCollaboratorIds,
        lockedCollaboratorIds: addLockedCollaborators(
          appState.lockedCollaboratorIds,
          hiddenCollaboratorIds,
          getSelfCollaboratorId(appState),
        ),
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
});

/*
 * Local-only locking (#81): locked collaborators' drawings stay visible but
 * are non-interactive. These only change `appState.lockedCollaboratorIds`
 * (never synced, never in history). The rules live in `element/ownership.ts`.
 */

/** toggles one bucket's lock (ignored while hidden, and for yourself) */
export const actionToggleCollaboratorLock = register<string>({
  name: "toggleCollaboratorLock",
  label: "collaboratorLock.toggle",
  icon: LockedIcon,
  viewMode: true,
  trackEvent: { category: "collab" },
  perform(elements, appState, bucketId) {
    if (!bucketId) {
      return false;
    }
    return {
      appState: {
        ...appState,
        lockedCollaboratorIds: toggleLockedCollaborator(
          appState,
          bucketId,
          getSelfCollaboratorId(appState),
        ),
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
});

/** locks every listed bucket except yourself */
export const actionLockAllCollaborators = register({
  name: "lockAllCollaborators",
  label: "collaboratorLock.lockAll",
  icon: LockedIcon,
  viewMode: true,
  trackEvent: { category: "collab" },
  perform(elements, appState) {
    return {
      appState: {
        ...appState,
        lockedCollaboratorIds: addLockedCollaborators(
          appState.lockedCollaboratorIds,
          getVisibilityBuckets(elements, appState),
          getSelfCollaboratorId(appState),
        ),
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
});

/** unlocks every visible bucket; hidden ones stay locked */
export const actionUnlockAllCollaborators = register({
  name: "unlockAllCollaborators",
  label: "collaboratorLock.unlockAll",
  icon: UnlockedIcon,
  viewMode: true,
  trackEvent: { category: "collab" },
  perform(elements, appState) {
    return {
      appState: {
        ...appState,
        lockedCollaboratorIds: unlockVisibleCollaborators(
          appState,
          getSelfCollaboratorId(appState),
        ),
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
});
