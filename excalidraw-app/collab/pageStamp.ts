import { PAGE_ID_KEY, getElementPageId } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

/**
 * Page tags (#167), like the creator stamp (see creatorStamp.ts): every
 * element in a room carries the id of the page it was created on. The tag is
 * set once and never changed, so editing or moving the element, or
 * reordering or deleting other pages, never moves it to another page.
 */

/** elements without a page tag yet (new, or from before the tag existed) */
export const getElementsToPageStamp = <T extends ExcalidrawElement>(
  elements: readonly T[],
): T[] => elements.filter((element) => getElementPageId(element) === null);

/**
 * This client's elements on `pageId` that need its page tag: untagged ones,
 * and ones carrying another page's tag that this client introduced, i.e.
 * pasted or duplicated copies (a new id, but the original's copied tag) and
 * pages brought into a new room with tags from an earlier room. Elements
 * that reached this client from the room are never retagged, so an
 * element's tag doesn't change once it is in the room.
 *
 * @param remoteElementIds ids of elements first received from the room
 */
export const getLocalElementsToPageStamp = <T extends ExcalidrawElement>(
  elements: readonly T[],
  pageId: string,
  remoteElementIds: ReadonlySet<string>,
): T[] =>
  elements.filter((element) => {
    const tag = getElementPageId(element);
    return (
      tag === null || (tag !== pageId && !remoteElementIds.has(element.id))
    );
  });

export const getPageStampedCustomData = (
  element: ExcalidrawElement,
  pageId: string,
): NonNullable<ExcalidrawElement["customData"]> => ({
  ...element.customData,
  [PAGE_ID_KEY]: pageId,
});
