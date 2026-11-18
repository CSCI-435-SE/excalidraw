import { ShapeCache, mutateElement } from "@excalidraw/element";

import type {
  ElementsMap,
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";

import type { AppState } from "../types";

/*
 * Incoming (remote) changes to elements this client is in the middle of
 * editing. An edit owns some of an element's properties (e.g. a resize owns
 * its geometry) and recomputes them on every pointer move / keystroke, and
 * the edited elements' timestamps keep advancing while it does, so without
 * special handling remote changes made meanwhile would be lost. Instead:
 *
 * - properties the edit doesn't own are merged into the local element
 *   (someone recolors the shape you're dragging → both changes survive)
 * - a remote delete is accepted: a drag carries on without the element;
 *   other edits are cancelled. The editor re-issues the delete (see
 *   `App.handleRemoteDeletesOfInProgressEdit`).
 *
 * Only remote changes made after the edit started (or after the last remote
 * change merged into that element) are taken, so stale copies (e.g. a peer's
 * periodic full-scene broadcast) can't revert the editor's earlier changes.
 */

export type InProgressEditKind =
  /** typing in a text element or label */
  | "text"
  /** resizing / rotating a single element */
  | "resize"
  /** drawing a new element */
  | "new"
  /** dragging the selection */
  | "drag"
  /** resizing / rotating several elements at once */
  | "transform";

type ProtectedEditState = Pick<
  AppState,
  "editingTextElement" | "resizingElement" | "newElement"
>;

/**
 * Edits whose local copy always wins over the usual "latest change wins"
 * rule (they hold references to the element, or rebuild it from local
 * state). Dragging and multi-element transforms aren't protected that way:
 * they only get the merge below, when registered.
 */
export const getProtectedEditKind = (
  appState: ProtectedEditState,
  elementId: string,
): "text" | "resize" | "new" | null => {
  if (appState.editingTextElement?.id === elementId) {
    return "text";
  }
  if (appState.resizingElement?.id === elementId) {
    return "resize";
  }
  if (appState.newElement?.id === elementId) {
    return "new";
  }
  return null;
};

/** the kind of in-progress edit `elementId` is part of on this client */
export const getInProgressEditKind = (
  appState: ProtectedEditState,
  elementId: string,
): InProgressEditKind | null =>
  getProtectedEditKind(appState, elementId) ??
  (inProgressEdit?.bases.has(elementId) ? inProgressEdit.kind : null);

// -----------------------------------------------------------------------------
// the in-progress edit's baselines (one edit per client at a time)
// -----------------------------------------------------------------------------

type InProgressEdit = {
  kind: InProgressEditKind;
  /**
   * per edited element, `updated` of the newest state its non-edited
   * properties are known to reflect: the element's timestamp when the edit
   * started, then that of each remote change merged into it
   */
  bases: Map<string, number>;
  /** elements whose remote delete was accepted (the editor must react) */
  deletedRemotely: Set<string>;
};

let inProgressEdit: InProgressEdit | null = null;

/**
 * Called by the editor when an edit starts.
 *
 * @param elements the edited elements as they were when the edit started
 */
export const beginInProgressEdit = (
  kind: InProgressEditKind,
  elements: Iterable<Pick<ExcalidrawElement, "id" | "updated">>,
) => {
  const bases = new Map<string, number>();
  for (const element of elements) {
    bases.set(element.id, element.updated);
  }
  inProgressEdit = { kind, bases, deletedRemotely: new Set() };
};

/** called by the editor when its edit ends (or is cancelled) */
export const endInProgressEdit = () => {
  inProgressEdit = null;
};

export const getInProgressEdit = (): Readonly<InProgressEdit> | null =>
  inProgressEdit;

/**
 * Returns the edited elements whose remote delete was accepted since the
 * last call (and forgets them).
 */
export const takeRemotelyDeletedEditElements = (): string[] => {
  if (!inProgressEdit?.deletedRemotely.size) {
    return [];
  }
  const ids = [...inProgressEdit.deletedRemotely];
  inProgressEdit.deletedRemotely.clear();
  for (const id of ids) {
    inProgressEdit.bases.delete(id);
  }
  return ids;
};

// -----------------------------------------------------------------------------
// resolving a remote change to the element being edited
// -----------------------------------------------------------------------------

/**
 * geometry: recomputed on every move by resizing, rotating, drawing and
 * dragging (including arrows rerouted because a shape they're bound to moved)
 */
const GEOMETRY_PROPS = [
  "x",
  "y",
  "width",
  "height",
  "angle",
  "points",
  "pressures",
  "scale",
  "crop",
  "lastCommittedPoint",
  "startBinding",
  "endBinding",
  "fixedSegments",
  "startIsSpecial",
  "endIsSpecial",
  // text resizes scale the font and re-wrap the text
  "fontSize",
  "lineHeight",
  "text",
  "autoResize",
];

/** properties each kind of edit owns (remote values for them are dropped) */
const EDIT_OWNED_PROPS: Record<InProgressEditKind, ReadonlySet<string>> = {
  resize: new Set(GEOMETRY_PROPS),
  new: new Set(GEOMETRY_PROPS),
  transform: new Set(GEOMETRY_PROPS),
  // dropping into / out of a frame changes the frame membership
  drag: new Set([...GEOMETRY_PROPS, "frameId"]),
  // typing changes the text and, through it, the dimensions / position
  text: new Set([
    ...GEOMETRY_PROPS,
    "originalText",
    "textHyperlinks",
    "verticalAlign",
    "textAlign",
  ]),
};

/** never taken from a remote copy while editing */
const NEVER_MERGED_PROPS: ReadonlySet<string> = new Set([
  "id",
  "type",
  "version",
  "versionNonce",
  "updated",
  "seed",
  // deletion is handled separately (it cancels the edit)
  "isDeleted",
  // co-owners are merged by `mergeCoOwnership`, the rest is host data
  "customData",
]);

const isSameValue = (a: unknown, b: unknown) =>
  a === b ||
  (typeof a === "object" &&
    typeof b === "object" &&
    a !== null &&
    b !== null &&
    JSON.stringify(a) === JSON.stringify(b));

const isValidTimestamp = (timestamp: unknown): timestamp is number =>
  typeof timestamp === "number" && Number.isFinite(timestamp);

/**
 * The remote properties to merge into `local` (those the edit doesn't own
 * and that differ).
 */
export const getMergeableRemoteChanges = (
  local: ExcalidrawElement,
  remote: ExcalidrawElement,
  kind: InProgressEditKind,
): Partial<ExcalidrawElement> => {
  const owned = EDIT_OWNED_PROPS[kind];
  const updates: Record<string, unknown> = {};
  for (const key of Object.keys(remote)) {
    if (
      !NEVER_MERGED_PROPS.has(key) &&
      !owned.has(key) &&
      !isSameValue(
        local[key as keyof ExcalidrawElement],
        remote[key as keyof ExcalidrawElement],
      )
    ) {
      updates[key] = remote[key as keyof ExcalidrawElement];
    }
  }
  return updates as Partial<ExcalidrawElement>;
};

/**
 * Resolves a remote copy of an element this client is editing:
 *
 * - `"acceptRemote"`: it's a delete made after the edit started. The caller
 *   takes the remote (deleted) copy, and the editor reacts (see
 *   `takeRemotelyDeletedEditElements`).
 * - `"keepLocal"`: the edit keeps the local copy. Remote changes made after
 *   the edit started, to properties the edit doesn't own, have been merged
 *   into it (in place, bumping its version so they're re-broadcast).
 *
 * Without a registered baseline for the edit (a host that doesn't call
 * `beginInProgressEdit`), the local copy is kept as is.
 */
export const resolveRemoteChangeToInProgressEdit = (
  local: OrderedExcalidrawElement,
  remote: OrderedExcalidrawElement,
  kind: InProgressEditKind,
  elementsMap: ElementsMap,
): "acceptRemote" | "keepLocal" => {
  const edit = inProgressEdit;
  const baseUpdated = edit?.bases.get(local.id);
  if (
    !edit ||
    baseUpdated === undefined ||
    !isValidTimestamp(remote.updated) ||
    remote.updated <= baseUpdated
  ) {
    return "keepLocal";
  }

  if (remote.isDeleted && !local.isDeleted) {
    edit.deletedRemotely.add(local.id);
    return "acceptRemote";
  }

  const updates = getMergeableRemoteChanges(local, remote, kind);
  if (Object.keys(updates).length) {
    mutateElement(
      local,
      elementsMap,
      updates as Parameters<typeof mutateElement>[2],
    );
    // the cached shape is keyed by element object and wouldn't notice
    // style changes made in place
    ShapeCache.delete(local);
  }
  edit.bases.set(local.id, remote.updated);
  return "keepLocal";
};
