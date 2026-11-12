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

/** structurally satisfied by the editor's AppState */
export type CreatorInteractivity = CreatorVisibility & {
  /**
   * creator ids locked on this client (visible but non-interactive).
   * `UNKNOWN_CREATOR_ID` locks the miscellaneous bucket.
   */
  lockedCollaboratorIds?: ReadonlySet<string>;
};

/**
 * The interactivity rule (#81): whether this client may interact with a
 * visibility bucket's elements.
 *
 * - hidden → never interactive (no interactivity without visibility)
 * - your own bucket → can't be locked
 * - otherwise → interactive unless locked
 */
export const isCollaboratorInteractive = (
  bucketId: string,
  { hiddenCollaboratorIds, lockedCollaboratorIds }: CreatorInteractivity,
  selfId: string | null,
): boolean => {
  if (hiddenCollaboratorIds?.has(bucketId)) {
    return false;
  }
  if (bucketId === selfId) {
    return true;
  }
  return !lockedCollaboratorIds?.has(bucketId);
};

/** returns the lock list with `ids` added, never including yourself */
export const addLockedCollaborators = (
  lockedCollaboratorIds: ReadonlySet<string> | undefined,
  ids: Iterable<string>,
  selfId: string | null,
): Set<string> => {
  const next = new Set(lockedCollaboratorIds);
  for (const id of ids) {
    if (id !== selfId) {
      next.add(id);
    }
  }
  return next;
};

/**
 * Returns the lock list with `bucketId` toggled. Ignored for hidden buckets
 * (their lock can't change while hidden) and for yourself.
 */
export const toggleLockedCollaborator = (
  state: CreatorInteractivity,
  bucketId: string,
  selfId: string | null,
): Set<string> => {
  const next = new Set(state.lockedCollaboratorIds);
  if (bucketId === selfId || state.hiddenCollaboratorIds?.has(bucketId)) {
    return next;
  }
  if (!next.delete(bucketId)) {
    next.add(bucketId);
  }
  return next;
};

/**
 * Returns the lock list after "unlock all": every visible bucket is
 * unlocked, hidden ones stay locked (so they're still locked once shown).
 */
export const unlockVisibleCollaborators = (
  { hiddenCollaboratorIds }: CreatorInteractivity,
  selfId: string | null,
): Set<string> =>
  addLockedCollaborators(undefined, hiddenCollaboratorIds ?? [], selfId);

/** structurally satisfied by the editor's AppState */
export type CreatorSelf = {
  collaborators?: ReadonlyMap<
    unknown,
    Readonly<{ id?: string; isCurrentUser?: boolean }>
  >;
};

/** this client's creator id (the current user's collaborator entry), if any */
export const getSelfCreatorId = ({
  collaborators,
}: CreatorSelf): string | null => {
  for (const collaborator of collaborators?.values() ?? []) {
    if (collaborator.isCurrentUser && collaborator.id) {
      return collaborator.id;
    }
  }
  return null;
};

/**
 * Whether this client may interact with the element (select, move, resize,
 * rotate, delete, erase, text-edit). Applies `isCollaboratorInteractive` to
 * the element's visibility bucket, so hidden elements are never interactive.
 *
 * @param selfId defaults to the current user's id from `state.collaborators`;
 * pass it when checking many elements.
 */
export const isElementInteractive = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
  state: CreatorInteractivity & CreatorSelf,
  selfId: string | null = getSelfCreatorId(state),
): boolean =>
  isCollaboratorInteractive(
    getElementVisibilityBucket(
      element,
      elementsMap,
      state.collaboratorDirectory,
    ),
    state,
    selfId,
  );

/**
 * Filters out elements this client may not interact with (hidden or locked
 * collaborators'). Returns the input array as-is when nobody is hidden or
 * locked.
 *
 * @param elementsMap used to resolve bound text containers. Defaults to a map
 * of `elements`, so pass the full scene map when `elements` is a subset.
 */
export const excludeNonInteractiveElements = <T extends ExcalidrawElement>(
  elements: readonly T[],
  state: CreatorInteractivity & CreatorSelf,
  elementsMap?: ElementsMap,
): readonly T[] => {
  if (
    !state.hiddenCollaboratorIds?.size &&
    !state.lockedCollaboratorIds?.size
  ) {
    return elements;
  }
  const map = elementsMap ?? arrayToMap(elements);
  const selfId = getSelfCreatorId(state);
  return elements.filter((element) =>
    isElementInteractive(element, map, state, selfId),
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
