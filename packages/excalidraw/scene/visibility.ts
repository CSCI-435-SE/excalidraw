import { arrayToMap } from "@excalidraw/common";
import {
  UNKNOWN_CREATOR_ID,
  excludeElementsByHiddenCreators,
  getElementVisibilityBucket,
  getElementsInGroup,
  isElementByHiddenCreator,
} from "@excalidraw/element";

import type { ElementsMap, ExcalidrawElement } from "@excalidraw/element/types";

import type { AppState } from "../types";

export type LocalVisibilityState = Pick<
  AppState,
  "hiddenCollaboratorIds" | "collaboratorDirectory"
>;

/**
 * Whether the element is hidden on this client by the collaborator
 * visibility controls. Purely a local view filter — scene data is untouched.
 *
 * Creators missing from `collaboratorDirectory` (never seen by this client)
 * share the miscellaneous bucket with untagged elements.
 */
export const isElementHiddenLocally = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
  appState: LocalVisibilityState,
): boolean => isElementByHiddenCreator(element, elementsMap, appState);

/**
 * Returns only the elements visible on this client (e.g. for export).
 * Returns the input array as-is when nothing is hidden.
 *
 * @param elementsMap used to resolve bound text containers. Defaults to
 * a map of `elements`, so pass the full scene map when `elements` is a subset.
 */
export const getLocallyVisibleElements = <T extends ExcalidrawElement>(
  elements: readonly T[],
  appState: LocalVisibilityState,
  elementsMap?: ElementsMap,
): readonly T[] =>
  excludeElementsByHiddenCreators(elements, appState, elementsMap);

/**
 * Selection safety net: hidden elements must never stay selected, otherwise
 * actions (delete, ungroup, move…) would modify them for every collaborator.
 *
 * Returns the selection-related appState to apply, or `null` if the
 * selection contains no hidden elements.
 */
export const getSelectionWithoutHiddenElements = (
  appState: LocalVisibilityState &
    Pick<
      AppState,
      "selectedElementIds" | "selectedGroupIds" | "selectedLinearElement"
    >,
  elementsMap: ElementsMap,
): Pick<
  AppState,
  "selectedElementIds" | "selectedGroupIds" | "selectedLinearElement"
> | null => {
  if (!appState.hiddenCollaboratorIds.size) {
    return null;
  }

  const isHidden = (id: string) => {
    const element = elementsMap.get(id);
    return !!element && isElementHiddenLocally(element, elementsMap, appState);
  };

  const hiddenSelectedIds = Object.keys(appState.selectedElementIds).filter(
    isHidden,
  );
  // a group containing hidden members can't stay selected as a group, or
  // group actions (ungroup, group bbox…) would reach the hidden members
  const groupIdsWithHiddenMembers = Object.keys(
    appState.selectedGroupIds,
  ).filter((groupId) =>
    getElementsInGroup(elementsMap, groupId).some((el) => isHidden(el.id)),
  );
  const isLinearElementHidden =
    !!appState.selectedLinearElement &&
    isHidden(appState.selectedLinearElement.elementId);

  if (
    !hiddenSelectedIds.length &&
    !groupIdsWithHiddenMembers.length &&
    !isLinearElementHidden
  ) {
    return null;
  }

  const selectedElementIds = { ...appState.selectedElementIds };
  for (const id of hiddenSelectedIds) {
    delete selectedElementIds[id];
  }

  const selectedGroupIds = { ...appState.selectedGroupIds };
  for (const groupId of groupIdsWithHiddenMembers) {
    delete selectedGroupIds[groupId];
  }

  return {
    selectedElementIds,
    selectedGroupIds,
    selectedLinearElement: isLinearElementHidden
      ? null
      : appState.selectedLinearElement,
  };
};

/** this client's creator id (set by the host app on the current user's entry) */
export const getSelfCollaboratorId = ({
  collaborators,
}: Pick<AppState, "collaborators">): string | null => {
  for (const collaborator of collaborators.values()) {
    if (collaborator.isCurrentUser && collaborator.id) {
      return collaborator.id;
    }
  }
  return null;
};

/**
 * Whether the user hid their own drawings. Anything they'd draw would be
 * hidden immediately, so the editor is locked to view mode meanwhile.
 */
export const isOwnDrawingsHidden = (
  appState: Pick<AppState, "collaborators" | "hiddenCollaboratorIds">,
): boolean => {
  const selfId = getSelfCollaboratorId(appState);
  return !!selfId && appState.hiddenCollaboratorIds.has(selfId);
};

/**
 * Every visibility bucket currently known on this client: live
 * collaborators, previously seen ones, creators of the scene's elements and
 * the miscellaneous bucket. "Hide all" hides all of these.
 */
export const getVisibilityBuckets = (
  elements: readonly ExcalidrawElement[],
  appState: Pick<AppState, "collaborators" | "collaboratorDirectory">,
): Set<string> => {
  const buckets = new Set<string>([UNKNOWN_CREATOR_ID]);

  for (const collaborator of appState.collaborators.values()) {
    if (collaborator.id) {
      buckets.add(collaborator.id);
    }
  }
  for (const clientId of appState.collaboratorDirectory?.keys() ?? []) {
    buckets.add(clientId);
  }

  const elementsMap = arrayToMap(elements);
  for (const element of elements) {
    if (!element.isDeleted) {
      buckets.add(
        getElementVisibilityBucket(
          element,
          elementsMap,
          appState.collaboratorDirectory,
        ),
      );
    }
  }

  return buckets;
};

export type CollaboratorVisibilityRow = {
  /** visibility bucket id (client id, or UNKNOWN_CREATOR_ID) */
  id: string;
  username: string | null;
  isCurrentUser: boolean;
  isHidden: boolean;
  /** non-deleted elements in this bucket (bound text counts with its shape) */
  drawingsCount: number;
  avatarUrl?: string;
};

export type CollaboratorVisibilityRows = {
  inRoom: CollaboratorVisibilityRow[];
  previouslySeen: CollaboratorVisibilityRow[];
  miscellaneous: CollaboratorVisibilityRow;
};

/**
 * Rows for the collaborator visibility menu:
 * - in the room: live collaborators (you first)
 * - previously seen: directory entries no longer live (most recent first)
 * - miscellaneous: untagged elements + creators this client never saw
 */
export const getCollaboratorVisibilityRows = (
  elements: readonly ExcalidrawElement[],
  appState: Pick<
    AppState,
    "collaborators" | "collaboratorDirectory" | "hiddenCollaboratorIds"
  >,
): CollaboratorVisibilityRows => {
  const elementsMap = arrayToMap(elements);
  const counts = new Map<string, number>();
  for (const element of elements) {
    if (
      element.isDeleted ||
      // labels count as part of their shape
      (element.type === "text" && element.containerId)
    ) {
      continue;
    }
    const bucket = getElementVisibilityBucket(
      element,
      elementsMap,
      appState.collaboratorDirectory,
    );
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  const toRow = (
    id: string,
    username: string | null,
    extra?: Partial<CollaboratorVisibilityRow>,
  ): CollaboratorVisibilityRow => ({
    id,
    username,
    isCurrentUser: false,
    isHidden: appState.hiddenCollaboratorIds.has(id),
    drawingsCount: counts.get(id) ?? 0,
    ...extra,
  });

  const inRoom = new Map<string, CollaboratorVisibilityRow>();
  for (const collaborator of appState.collaborators.values()) {
    // several tabs can't share an id, but guard against duplicates anyway
    if (collaborator.id && !inRoom.has(collaborator.id)) {
      inRoom.set(
        collaborator.id,
        toRow(
          collaborator.id,
          collaborator.username ??
            appState.collaboratorDirectory?.get(collaborator.id)?.username ??
            null,
          {
            isCurrentUser: !!collaborator.isCurrentUser,
            avatarUrl: collaborator.avatarUrl,
          },
        ),
      );
    }
  }

  const previouslySeen = [...(appState.collaboratorDirectory ?? [])]
    .filter(([id]) => !inRoom.has(id))
    .sort(([, a], [, b]) => b.lastSeen - a.lastSeen)
    .map(([id, entry]) => toRow(id, entry.username));

  return {
    inRoom: [...inRoom.values()].sort(
      (a, b) =>
        Number(b.isCurrentUser) - Number(a.isCurrentUser) ||
        (a.username ?? "").localeCompare(b.username ?? ""),
    ),
    previouslySeen,
    miscellaneous: toRow(UNKNOWN_CREATOR_ID, null),
  };
};
