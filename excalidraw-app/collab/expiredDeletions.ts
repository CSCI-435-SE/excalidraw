import type { ExcalidrawElement } from "@excalidraw/element/types";

import { DELETED_ELEMENT_TIMEOUT } from "../app_constants";

/*
 * Deleted elements are only synced for `DELETED_ELEMENT_TIMEOUT` (see
 * `isSyncableElement`). After that, the room forgets the deletion, so a
 * client that kept a live copy all along (e.g. a tab offline for longer)
 * would bring the element back when it syncs again.
 *
 * The rule that catches it: a live element is synced within seconds of every
 * change, so a live element whose last change is older than the deletion
 * timeout is always part of the room's scene. If the room's scene doesn't
 * have it, it was deleted and that deletion has since expired.
 */

/**
 * Whether the element's last change is older than the deletion timeout.
 *
 * @param now "now" by the clock that stamped the element's `updated`
 */
export const isPastDeletionExpiry = (
  element: Pick<ExcalidrawElement, "updated">,
  now = Date.now(),
) =>
  typeof element.updated === "number" &&
  element.updated < now - DELETED_ELEMENT_TIMEOUT;

/**
 * Receiving side: ids of remote elements to ignore, i.e. live elements this
 * client doesn't have (its scene came from the room's) that hadn't changed
 * for longer than the deletion timeout when they were sent.
 *
 * Ages are measured against the sender's clock (`senderNow`, when it sent
 * them), the clock that stamped them: a client whose clock is far behind
 * still gets its new elements accepted. Without it (older clients), nothing
 * is ignored.
 *
 * Only for incremental updates. Not for the room scene a client starts from
 * (everything in it is new to the client) or the room's stored scene (it's
 * the reference for what the room has).
 */
export const getExpiredResurrections = (
  remoteElements: readonly ExcalidrawElement[],
  localElementsMap: ReadonlyMap<string, unknown>,
  senderNow: number | undefined,
): Set<string> => {
  const ids = new Set<string>();
  if (typeof senderNow !== "number" || !Number.isFinite(senderNow)) {
    return ids;
  }
  for (const element of remoteElements) {
    if (
      !element.isDeleted &&
      !localElementsMap.has(element.id) &&
      isPastDeletionExpiry(element, senderNow)
    ) {
      ids.add(element.id);
    }
  }
  return ids;
};

/**
 * Sending side: local live elements whose deletion expired, i.e. the room's
 * full scene doesn't have them, this client synced them with the room
 * before, and they haven't changed since before the deletion timeout.
 *
 * Elements this client never synced (e.g. drawn while offline) are kept: the
 * room can't have seen them.
 */
export const getLocalElementsWithExpiredDeletion = <
  T extends ExcalidrawElement,
>(
  localElements: readonly T[],
  roomElementIds: ReadonlySet<string>,
  isKnownToRoom: (elementId: string) => boolean,
  now = Date.now(),
): T[] =>
  localElements.filter(
    (element) =>
      !element.isDeleted &&
      !roomElementIds.has(element.id) &&
      isKnownToRoom(element.id) &&
      isPastDeletionExpiry(element, now),
  );
