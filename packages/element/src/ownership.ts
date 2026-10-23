import { arrayToMap } from "@excalidraw/common";

import { isBoundToContainer } from "./typeChecks";

import type { ElementsMap, ExcalidrawElement } from "./types";

/** `customData` key holding the id of the client that created the element */
export const CREATOR_ID_KEY = "creatorId";

/** bucket for elements without (valid) creator metadata, e.g. legacy rooms */
export const UNKNOWN_CREATOR_ID = "__unknown__";

const getStampedCreatorId = (element: ExcalidrawElement): string | null => {
  const creatorId = element.customData?.[CREATOR_ID_KEY];
  return typeof creatorId === "string" && creatorId ? creatorId : null;
};

/**
 * Returns the id of the client that created the element, or
 * `UNKNOWN_CREATOR_ID` if it isn't known.
 *
 * Bound text follows its container so labels never show/hide separately
 * from the shape they belong to.
 */
export const getElementCreatorId = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
): string => {
  const owner = isBoundToContainer(element)
    ? elementsMap.get(element.containerId) ?? element
    : element;

  return getStampedCreatorId(owner) ?? UNKNOWN_CREATOR_ID;
};

/** structurally satisfied by the editor's AppState */
export type CreatorVisibility = {
  /**
   * creator ids hidden on this client. `UNKNOWN_CREATOR_ID` hides the
   * miscellaneous bucket.
   */
  hiddenCollaboratorIds?: ReadonlySet<string>;
  /**
   * creators this client can name (seen at some point). Stamped creators
   * missing from it are treated as unknown (miscellaneous). `null`/omitted
   * (e.g. outside of a room) → every stamped creator is its own bucket.
   */
  collaboratorDirectory?: ReadonlyMap<string, unknown> | null;
};

/**
 * The visibility bucket an element belongs to: its creator, or
 * `UNKNOWN_CREATOR_ID` for untagged elements and creators this client has
 * never seen.
 */
export const getElementVisibilityBucket = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
  collaboratorDirectory: CreatorVisibility["collaboratorDirectory"],
): string => {
  const creatorId = getElementCreatorId(element, elementsMap);
  if (
    collaboratorDirectory &&
    creatorId !== UNKNOWN_CREATOR_ID &&
    !collaboratorDirectory.has(creatorId)
  ) {
    return UNKNOWN_CREATOR_ID;
  }
  return creatorId;
};

/**
 * Whether the element's visibility bucket is hidden.
 *
 * Element-level counterpart of the editor's `isElementHiddenLocally`, so
 * element logic (selection, binding) can exclude hidden collaborators'
 * elements without depending on the editor package.
 */
export const isElementByHiddenCreator = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
  { hiddenCollaboratorIds, collaboratorDirectory }: CreatorVisibility,
): boolean => {
  if (!hiddenCollaboratorIds?.size) {
    return false;
  }
  return hiddenCollaboratorIds.has(
    getElementVisibilityBucket(element, elementsMap, collaboratorDirectory),
  );
};

/**
 * Filters out elements whose visibility bucket is hidden. Returns the input
 * array as-is when nothing is hidden.
 *
 * @param elementsMap used to resolve bound text containers. Defaults to a map
 * of `elements`, so pass the full scene map when `elements` is a subset.
 */
export const excludeElementsByHiddenCreators = <T extends ExcalidrawElement>(
  elements: readonly T[],
  visibility: CreatorVisibility,
  elementsMap?: ElementsMap,
): readonly T[] => {
  if (!visibility.hiddenCollaboratorIds?.size) {
    return elements;
  }
  const map = elementsMap ?? arrayToMap(elements);
  return elements.filter(
    (element) => !isElementByHiddenCreator(element, map, visibility),
  );
};
