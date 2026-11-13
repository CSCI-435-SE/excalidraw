import { arrayToMap } from "@excalidraw/common";

import { isBoundToContainer } from "./typeChecks";

import type { ElementsMap, ExcalidrawElement } from "./types";

/** `customData` key holding the id of the client that created the element */
export const CREATOR_ID_KEY = "creatorId";

/**
 * `customData` key holding the ids of the clients that edited an element they
 * didn't create (co-owners). The element follows the least restrictive
 * visibility/lock setting among its creator and co-owners.
 */
export const EDITOR_IDS_KEY = "editorIds";

/**
 * `customData` key holding, per client that ever co-owned the element, a
 * counter bumped each time that client is added or removed. It turns the
 * co-owner list into a mergeable set: every client only ever changes its own
 * entry, so when copies disagree the higher counter is the newer state. Ids
 * listed here but not in `editorIds` were removed (kept so a stale copy can't
 * bring them back).
 */
export const EDITOR_SEQS_KEY = "editorSeqs";

/** bucket for elements without (valid) creator metadata, e.g. legacy rooms */
export const UNKNOWN_CREATOR_ID = "__unknown__";

const getStampedCreatorId = (element: ExcalidrawElement): string | null => {
  const creatorId = element.customData?.[CREATOR_ID_KEY];
  return typeof creatorId === "string" && creatorId ? creatorId : null;
};

/** the element's current co-owners: valid, de-duplicated ids */
export const getStampedEditorIds = (element: ExcalidrawElement): string[] => {
  const editorIds = element.customData?.[EDITOR_IDS_KEY];
  if (!Array.isArray(editorIds)) {
    return [];
  }
  return [
    ...new Set(
      editorIds.filter(
        (id: unknown): id is string => typeof id === "string" && !!id,
      ),
    ),
  ];
};

/** the element holding `element`'s ownership (bound text → its container) */
const getOwnershipHolder = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
): ExcalidrawElement =>
  isBoundToContainer(element)
    ? elementsMap.get(element.containerId) ?? element
    : element;

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
): string =>
  getStampedCreatorId(getOwnershipHolder(element, elementsMap)) ??
  UNKNOWN_CREATOR_ID;

/**
 * Every owner of the element: its creator (or `UNKNOWN_CREATOR_ID` if not
 * known) followed by its co-owners. Bound text follows its container.
 */
export const getElementOwnerIds = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
): string[] => {
  const holder = getOwnershipHolder(element, elementsMap);
  return [
    ...new Set([
      getStampedCreatorId(holder) ?? UNKNOWN_CREATOR_ID,
      ...getStampedEditorIds(holder),
    ]),
  ];
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

/** an owner's bucket: `UNKNOWN_CREATOR_ID` if this client never saw them */
const toVisibilityBucket = (
  ownerId: string,
  collaboratorDirectory: CreatorVisibility["collaboratorDirectory"],
): string =>
  collaboratorDirectory &&
  ownerId !== UNKNOWN_CREATOR_ID &&
  !collaboratorDirectory.has(ownerId)
    ? UNKNOWN_CREATOR_ID
    : ownerId;

/**
 * The visibility bucket of the element's creator: the creator, or
 * `UNKNOWN_CREATOR_ID` for untagged elements and creators this client has
 * never seen. Ignores co-owners; see `getElementVisibilityBuckets`.
 */
export const getElementVisibilityBucket = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
  collaboratorDirectory: CreatorVisibility["collaboratorDirectory"],
): string =>
  toVisibilityBucket(
    getElementCreatorId(element, elementsMap),
    collaboratorDirectory,
  );

/**
 * Every visibility bucket the element belongs to: its creator's and each
 * co-owner's (de-duplicated, so several unknown owners share one bucket).
 */
export const getElementVisibilityBuckets = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
  collaboratorDirectory: CreatorVisibility["collaboratorDirectory"],
): string[] => [
  ...new Set(
    getElementOwnerIds(element, elementsMap).map((ownerId) =>
      toVisibilityBucket(ownerId, collaboratorDirectory),
    ),
  ),
];

/**
 * Whether the element is hidden: only when EVERY one of its visibility
 * buckets is hidden (it follows its least restricted owner).
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
  return getElementVisibilityBuckets(
    element,
    elementsMap,
    collaboratorDirectory,
  ).every((bucketId) => hiddenCollaboratorIds.has(bucketId));
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
 * rotate, delete, erase, text-edit): when ANY of its visibility buckets is
 * interactive per `isCollaboratorInteractive`, i.e. it follows its least
 * restricted owner. Elements whose buckets are all hidden never are.
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
  getElementVisibilityBuckets(
    element,
    elementsMap,
    state.collaboratorDirectory,
  ).some((bucketId) => isCollaboratorInteractive(bucketId, state, selfId));

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

// -----------------------------------------------------------------------------
// co-ownership: editing someone else's element makes you a co-owner
// -----------------------------------------------------------------------------

/**
 * Element properties whose change doesn't count as editing the element:
 * bookkeeping, z-order, and references updated as a side effect of editing
 * other elements (e.g. binding an arrow updates the shape's `boundElements`).
 */
const NON_EDIT_PROPS: ReadonlySet<string> = new Set([
  "version",
  "versionNonce",
  "updated",
  "seed",
  "index",
  "boundElements",
  "customData",
]);

const isSameValue = (a: unknown, b: unknown) =>
  a === b ||
  (typeof a === "object" &&
    typeof b === "object" &&
    a !== null &&
    b !== null &&
    JSON.stringify(a) === JSON.stringify(b));

/** whether going from `prev` to `next` edits the element (see NON_EDIT_PROPS) */
export const isOwnershipEdit = (
  prev: ExcalidrawElement,
  next: ExcalidrawElement,
): boolean => {
  for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (
      !NON_EDIT_PROPS.has(key) &&
      !isSameValue(
        prev[key as keyof ExcalidrawElement],
        next[key as keyof ExcalidrawElement],
      )
    ) {
      return true;
    }
  }
  return false;
};

/** structurally satisfied by the editor's AppState */
export type CoOwnershipEditState = CreatorSelf & {
  selectedElementIds: Readonly<Record<string, true>>;
  editingTextElement?: Readonly<{ id: string }> | null;
  selectedLinearElement?: Readonly<{ elementId: string }> | null;
};

/**
 * Whether the user acted on the element directly: it (or the shape a label
 * belongs to) is selected, being text-edited, or having its points edited.
 * Elements changed as a side effect (an arrow rerouted because the shape it's
 * bound to moved, a dragged frame's children…) don't count.
 */
const isDirectlyEdited = (
  element: ExcalidrawElement,
  holder: ExcalidrawElement,
  state: CoOwnershipEditState,
): boolean =>
  !!state.selectedElementIds[element.id] ||
  !!state.selectedElementIds[holder.id] ||
  state.editingTextElement?.id === element.id ||
  state.selectedLinearElement?.elementId === element.id;

/** whether `clientId` is the element's creator or one of its co-owners */
export const isElementOwnedBy = (
  element: ExcalidrawElement,
  clientId: string,
): boolean =>
  getStampedCreatorId(element) === clientId ||
  getStampedEditorIds(element).includes(clientId);

/**
 * Elements this client edited without owning them, so it becomes a co-owner.
 * Compares the scene against the last committed snapshot, so it's meant to
 * run right before a change is captured into history (the stamp then lands in
 * the same undo entry as the edit, and undoing that edit removes it).
 *
 * Returns the elements holding the ownership (bound text → its container),
 * de-duplicated. Only elements that already existed and carry a creator stamp
 * qualify: new elements get the creator stamp, not a co-owner stamp.
 */
export const getElementsToCoOwn = (
  prevElements: ElementsMap,
  nextElements: ElementsMap,
  state: CoOwnershipEditState,
  selfId: string | null = getSelfCreatorId(state),
): ExcalidrawElement[] => {
  if (!selfId) {
    return [];
  }

  const toCoOwn = new Map<string, ExcalidrawElement>();
  for (const next of nextElements.values()) {
    const prev = prevElements.get(next.id);
    if (!prev || prev.version >= next.version || next.isDeleted) {
      continue;
    }
    const holder = getOwnershipHolder(next, nextElements);
    if (
      holder.isDeleted ||
      toCoOwn.has(holder.id) ||
      !getStampedCreatorId(holder) ||
      isElementOwnedBy(holder, selfId) ||
      !isDirectlyEdited(next, holder, state) ||
      !isOwnershipEdit(prev, next)
    ) {
      continue;
    }
    toCoOwn.set(holder.id, holder);
  }
  return [...toCoOwn.values()];
};

// -----------------------------------------------------------------------------
// the co-owner set: one entry per client, changed only by that client
// -----------------------------------------------------------------------------

type CustomData = NonNullable<ExcalidrawElement["customData"]>;

/** one client's co-ownership: `seq` increases with every add / remove */
type EditorEntry = Readonly<{ seq: number; present: boolean }>;

const isValidSeq = (seq: unknown): seq is number =>
  typeof seq === "number" && Number.isFinite(seq) && seq >= 0;

/**
 * Reads the co-owner entries. Co-owners without a counter (data from before
 * counters existed) get 0, the oldest possible state.
 */
const readEditorEntries = (
  element: ExcalidrawElement,
): Map<string, EditorEntry> => {
  const raw = element.customData?.[EDITOR_SEQS_KEY];
  const seqs: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const seqOf = (id: string) => (isValidSeq(seqs[id]) ? seqs[id] : 0);

  const entries = new Map<string, EditorEntry>();
  for (const id of getStampedEditorIds(element)) {
    entries.set(id, { seq: seqOf(id), present: true });
  }
  for (const id of Object.keys(seqs)) {
    if (id && !entries.has(id) && isValidSeq(seqs[id])) {
      entries.set(id, { seq: seqs[id] as number, present: false });
    }
  }
  return entries;
};

/** `customData` with the co-owner keys replaced by `entries` (sorted ids) */
const writeEditorEntries = (
  customData: ExcalidrawElement["customData"],
  entries: ReadonlyMap<string, EditorEntry>,
): CustomData => {
  const {
    [EDITOR_IDS_KEY]: _editorIds,
    [EDITOR_SEQS_KEY]: _editorSeqs,
    ...rest
  } = customData ?? {};
  if (!entries.size) {
    return rest;
  }
  const ids = [...entries.keys()].sort();
  return {
    ...rest,
    [EDITOR_IDS_KEY]: ids.filter((id) => entries.get(id)!.present),
    [EDITOR_SEQS_KEY]: Object.fromEntries(
      ids.map((id) => [id, entries.get(id)!.seq]),
    ),
  };
};

const isSameEntries = (
  a: ReadonlyMap<string, EditorEntry>,
  b: ReadonlyMap<string, EditorEntry>,
) =>
  a.size === b.size &&
  [...a].every(([id, entry]) => {
    const other = b.get(id);
    return other?.seq === entry.seq && other.present === entry.present;
  });

/** the element's `customData` with `clientId` added as a co-owner */
export const getCoOwnedCustomData = (
  element: ExcalidrawElement,
  clientId: string,
): CustomData => {
  const entries = readEditorEntries(element);
  entries.set(clientId, {
    seq: (entries.get(clientId)?.seq ?? 0) + 1,
    present: true,
  });
  return writeEditorEntries(element.customData, entries);
};

/**
 * Merges the co-owners of two copies of the same element, e.g. when
 * collaboration picks one copy over another. Per client, the entry with the
 * higher counter wins (it's newer, since only that client changes it); on a
 * tie (only possible with old data), being a co-owner wins.
 *
 * Commutative, associative and idempotent, so every client converges to the
 * same co-owners whatever order copies arrive in.
 *
 * Returns `winner`'s `customData` with the merged co-owners, or `null` if
 * the merge wouldn't change `winner`'s.
 */
export const mergeCoOwnership = (
  winner: ExcalidrawElement,
  other: ExcalidrawElement,
): CustomData | null => {
  const winnerEntries = readEditorEntries(winner);
  const merged = new Map(winnerEntries);
  for (const [id, entry] of readEditorEntries(other)) {
    const current = merged.get(id);
    if (
      !current ||
      entry.seq > current.seq ||
      (entry.seq === current.seq && entry.present && !current.present)
    ) {
      merged.set(id, entry);
    }
  }
  return isSameEntries(merged, winnerEntries)
    ? null
    : writeEditorEntries(winner.customData, merged);
};

/**
 * Undo/redo restores an element's whole `customData`, which would also undo
 * co-ownership that other clients gained in the meantime. Only this client's
 * own co-ownership follows history (with a new, higher counter, so the
 * change wins against older copies); everyone else's stays as it was right
 * before the undo/redo.
 *
 * Returns the `customData` to use instead of `applied`'s, or `null` if
 * `applied`'s is already right.
 */
export const reconcileEditorIdsAfterHistory = (
  beforeHistory: ExcalidrawElement,
  applied: ExcalidrawElement,
  selfId: string | null,
): CustomData | null => {
  const beforeEntries = readEditorEntries(beforeHistory);
  const appliedEntries = readEditorEntries(applied);
  const next = new Map(beforeEntries);

  if (selfId) {
    const before = beforeEntries.get(selfId);
    const after = appliedEntries.get(selfId);
    const isPresent = !!after?.present;
    if (!!before?.present !== isPresent) {
      next.set(selfId, {
        seq: Math.max(before?.seq ?? 0, after?.seq ?? 0) + 1,
        present: isPresent,
      });
    }
  }

  return isSameEntries(next, appliedEntries)
    ? null
    : writeEditorEntries(applied.customData, next);
};
