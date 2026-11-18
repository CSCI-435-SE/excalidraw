import throttle from "lodash.throttle";

import {
  arrayToMap,
  isDevEnv,
  isTestEnv,
  observeUpdatedTimestamp,
} from "@excalidraw/common";

import {
  mergeCoOwnership,
  orderByFractionalIndex,
  syncInvalidIndices,
  validateFractionalIndices,
} from "@excalidraw/element";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import type { MakeBrand, Mutable } from "@excalidraw/common/utility-types";

import {
  getInProgressEditKind,
  getProtectedEditKind,
  resolveRemoteChangeToInProgressEdit,
} from "./inProgressEdit";

import type { AppState } from "../types";

export type ReconciledExcalidrawElement = OrderedExcalidrawElement &
  MakeBrand<"ReconciledElement">;

export type RemoteExcalidrawElement = OrderedExcalidrawElement &
  MakeBrand<"RemoteExcalidrawElement">;

export const shouldDiscardRemoteElement = (
  localAppState: AppState,
  local: OrderedExcalidrawElement | undefined,
  remote: RemoteExcalidrawElement,
): boolean => {
  if (!local) {
    return false;
  }

  // local element is being edited (`reconcileElements` merges what it can
  // into it first, see inProgressEdit.ts)
  if (getProtectedEditKind(localAppState, local.id)) {
    return true;
  }

  // the latest change wins: `updated` comes from a hybrid logical clock
  // (see common/clock.ts), so a change made after seeing another one is never
  // older than it. Elements without a valid timestamp (old data) fall through
  // to the version rules, as do changes made in the same millisecond.
  if (
    isValidTimestamp(local.updated) &&
    isValidTimestamp(remote.updated) &&
    local.updated !== remote.updated
  ) {
    return local.updated > remote.updated;
  }

  return (
    // local element has more changes
    local.version > remote.version ||
    // resolve conflicting edits deterministically by taking the one with
    // the lowest versionNonce
    (local.version === remote.version &&
      local.versionNonce <= remote.versionNonce)
  );
};

const isValidTimestamp = (timestamp: unknown): timestamp is number =>
  typeof timestamp === "number" && Number.isFinite(timestamp);

/*
 * Co-owners (`customData.editorIds`) are merged rather than taken from the
 * winning copy, so concurrent co-owner stamps on different clients all
 * survive (see `mergeCoOwnership`). The merge doesn't bump the version: each
 * client merges every copy it receives, so all of them converge.
 */

/** local copy wins: merge the remote's co-owners into it (in place) */
const mergeLosingCoOwnership = (
  local: OrderedExcalidrawElement,
  remote: RemoteExcalidrawElement,
) => {
  const customData = mergeCoOwnership(local, remote);
  if (customData) {
    // in place: the local element may be referenced by in-progress edits
    (local as Mutable<OrderedExcalidrawElement>).customData = customData;
  }
};

/** remote copy wins: a copy of it with the local co-owners merged in */
const withMergedCoOwnership = (
  remote: RemoteExcalidrawElement,
  local: OrderedExcalidrawElement,
): RemoteExcalidrawElement => {
  const customData = mergeCoOwnership(remote, local);
  return customData ? { ...remote, customData } : remote;
};

const validateIndicesThrottled = throttle(
  (
    orderedElements: readonly OrderedExcalidrawElement[],
    localElements: readonly OrderedExcalidrawElement[],
    remoteElements: readonly RemoteExcalidrawElement[],
  ) => {
    if (isDevEnv() || isTestEnv() || window?.DEBUG_FRACTIONAL_INDICES) {
      // create new instances due to the mutation
      const elements = syncInvalidIndices(
        orderedElements.map((x) => ({ ...x })),
      );

      validateFractionalIndices(elements, {
        // throw in dev & test only, to remain functional on `DEBUG_FRACTIONAL_INDICES`
        shouldThrow: isTestEnv() || isDevEnv(),
        includeBoundTextValidation: true,
        reconciliationContext: {
          localElements,
          remoteElements,
        },
      });
    }
  },
  1000 * 60,
  { leading: true, trailing: false },
);

export const reconcileElements = (
  localElements: readonly OrderedExcalidrawElement[],
  remoteElements: readonly RemoteExcalidrawElement[],
  localAppState: AppState,
): ReconciledExcalidrawElement[] => {
  const localElementsMap = arrayToMap(localElements);
  const reconciledElements: OrderedExcalidrawElement[] = [];
  const added = new Set<string>();

  // process remote elements
  for (const remoteElement of remoteElements) {
    // hybrid logical clock: local changes from now on are newer than this
    observeUpdatedTimestamp(remoteElement.updated);

    if (!added.has(remoteElement.id)) {
      const localElement = localElementsMap.get(remoteElement.id);
      const editKind =
        localElement && getInProgressEditKind(localAppState, localElement.id);
      // being edited here: merge what the edit doesn't own, or accept a
      // delete (cancels the edit); otherwise the usual rules
      const discardRemoteElement =
        localElement && editKind
          ? resolveRemoteChangeToInProgressEdit(
              localElement,
              remoteElement,
              editKind,
              localElementsMap,
            ) === "keepLocal"
          : shouldDiscardRemoteElement(
              localAppState,
              localElement,
              remoteElement,
            );

      if (localElement && discardRemoteElement) {
        mergeLosingCoOwnership(localElement, remoteElement);
        reconciledElements.push(localElement);
        added.add(localElement.id);
      } else {
        reconciledElements.push(
          localElement
            ? withMergedCoOwnership(remoteElement, localElement)
            : remoteElement,
        );
        added.add(remoteElement.id);
      }
    }
  }

  // process remaining local elements
  for (const localElement of localElements) {
    if (!added.has(localElement.id)) {
      reconciledElements.push(localElement);
      added.add(localElement.id);
    }
  }

  const orderedElements = orderByFractionalIndex(reconciledElements);

  validateIndicesThrottled(orderedElements, localElements, remoteElements);

  // de-duplicate indices
  syncInvalidIndices(orderedElements);

  return orderedElements as ReconciledExcalidrawElement[];
};
