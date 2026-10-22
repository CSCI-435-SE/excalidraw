import { CREATOR_ID_KEY } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

/**
 * Elements this client introduced to the room that don't carry its creator
 * stamp yet: newly drawn, pasted or duplicated (new id, possibly with a
 * copied foreign stamp), or restored by undo/redo without the stamp.
 *
 * Elements first received from other clients are never (re)stamped, so edits
 * never transfer ownership.
 *
 * @param remoteElementIds ids of elements that first reached this client from
 * the room (other clients or the room's stored scene)
 */
export const getElementsToStamp = <T extends ExcalidrawElement>(
  elements: readonly T[],
  remoteElementIds: ReadonlySet<string>,
  clientId: string,
): T[] =>
  elements.filter(
    (element) =>
      !element.isDeleted &&
      !remoteElementIds.has(element.id) &&
      element.customData?.[CREATOR_ID_KEY] !== clientId,
  );

export const getStampedCustomData = (
  element: ExcalidrawElement,
  clientId: string,
): NonNullable<ExcalidrawElement["customData"]> => ({
  ...element.customData,
  [CREATOR_ID_KEY]: clientId,
});
