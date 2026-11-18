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

/** structurally satisfied by the editor's AppState */
export type CreatorLayering = CreatorVisibility &
  CreatorSelf & {
    /** layering on → elements are drawn in `collaboratorLayerOrder` */
    collaboratorLayeringEnabled?: boolean;
    /**
     * local layer order of visibility buckets, top row (drawn on top) first.
     * `null`/omitted → the default order.
     */
    collaboratorLayerOrder?: readonly string[] | null;
  };

/**
 * The layer order used when layering is first turned on, and on reset (#82):
 * you on top, then everyone in join order, the miscellaneous bucket last.
 *
 * Join order is the order of `collaboratorDirectory` (#116), which records
 * each collaborator the first time this client sees them (a `Map` keeps
 * insertion order). Live collaborators not recorded yet follow it.
 */
export const getDefaultCollaboratorLayerOrder = (
  state: CreatorVisibility & CreatorSelf,
): string[] => {
  const order = new Set<string>();
  const selfId = getSelfCreatorId(state);
  if (selfId) {
    order.add(selfId);
  }
  for (const id of state.collaboratorDirectory?.keys() ?? []) {
    order.add(id);
  }
  for (const collaborator of state.collaborators?.values() ?? []) {
    if (collaborator.id) {
      order.add(collaborator.id);
    }
  }
  order.add(UNKNOWN_CREATOR_ID);
  return [...order];
};

/**
 * The layer order shown in the dropdown and used for drawing (#82): the
 * stored order (or the default one), with anyone not in it yet added to the
 * bottom in join order. Ids are never dropped, so collaborators who are
 * hidden or left keep their place.
 */
export const getCollaboratorLayerOrder = (
  state: CreatorLayering,
): readonly string[] => {
  const defaultOrder = getDefaultCollaboratorLayerOrder(state);
  const stored = state.collaboratorLayerOrder;
  if (!stored) {
    return defaultOrder;
  }
  const known = new Set(stored);
  const newcomers = defaultOrder.filter((id) => !known.has(id));
  return newcomers.length ? [...stored, ...newcomers] : stored;
};

/**
 * Returns `order` with `id` moved to `toIndex` (clamped to the list), or
 * `order` itself when nothing changes (unknown id, or already there).
 */
export const moveCollaboratorLayer = (
  order: readonly string[],
  id: string,
  toIndex: number,
): readonly string[] => {
  const fromIndex = order.indexOf(id);
  const targetIndex = Math.min(Math.max(toIndex, 0), order.length - 1);
  if (fromIndex === -1 || fromIndex === targetIndex) {
    return order;
  }
  const next = order.filter((other) => other !== id);
  next.splice(targetIndex, 0, id);
  return next;
};

/**
 * The single layering rule (#82), used for rendering, hit-testing, binding
 * and export: while layering is on, elements of a higher collaborator in the
 * layer order are drawn after (above) every element of a lower one. The sort
 * is stable, so each collaborator keeps the shared drawing order. Bound text
 * follows its container's bucket. Buckets missing from the order go below
 * everyone.
 *
 * Never changes elements (their shared `index` stays as is). Returns the
 * input array as-is while layering is off.
 *
 * @param elementsMap used to resolve bound text containers. Defaults to a map
 * of `elements`, so pass the full scene map when `elements` is a subset.
 */
export const orderElementsByCollaboratorLayer = <T extends ExcalidrawElement>(
  elements: readonly T[],
  state: CreatorLayering,
  elementsMap?: ElementsMap,
): readonly T[] => {
  if (!state.collaboratorLayeringEnabled) {
    return elements;
  }
  const order = getCollaboratorLayerOrder(state);
  // higher rank = drawn later (on top); missing buckets rank lowest (-1)
  const rankByBucket = new Map(
    order.map((id, index) => [id, order.length - 1 - index]),
  );
  const map = elementsMap ?? arrayToMap(elements);
  return elements
    .map((element) => ({
      element,
      rank:
        rankByBucket.get(
          getElementVisibilityBucket(element, map, state.collaboratorDirectory),
        ) ?? -1,
    }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ element }) => element);
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
