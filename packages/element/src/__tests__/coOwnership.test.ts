/**
 * Co-ownership: editing someone else's element makes you a co-owner, and the
 * element follows its least restricted owner's visibility / lock setting.
 */
import { arrayToMap } from "@excalidraw/common";

import { newElement, newTextElement } from "../newElement";
import { newElementWith } from "../mutateElement";
import {
  CREATOR_ID_KEY,
  EDITOR_IDS_KEY,
  EDITOR_SEQS_KEY,
  UNKNOWN_CREATOR_ID,
  getCoOwnedCustomData,
  mergeCoOwnership,
  getElementOwnerIds,
  getElementVisibilityBuckets,
  getElementsToCoOwn,
  isElementByHiddenCreator,
  isElementInteractive,
  isOwnershipEdit,
  reconcileEditorIdsAfterHistory,
} from "../ownership";

import type { ExcalidrawElement } from "../types";

const createRect = (
  creatorId?: string,
  editorIds?: unknown,
  editorSeqs?: Record<string, number>,
) =>
  newElement({
    type: "rectangle",
    x: 0,
    y: 0,
    customData: {
      ...(creatorId === undefined ? {} : { [CREATOR_ID_KEY]: creatorId }),
      ...(editorIds === undefined ? {} : { [EDITOR_IDS_KEY]: editorIds }),
      ...(editorSeqs === undefined ? {} : { [EDITOR_SEQS_KEY]: editorSeqs }),
    },
  });

/** co-owners and their counters, as written to `customData` */
const editors = (
  customData: ExcalidrawElement["customData"] | null | undefined,
) => ({
  ids: customData?.[EDITOR_IDS_KEY],
  seqs: customData?.[EDITOR_SEQS_KEY],
});

const state = (hidden: string[] = [], locked: string[] = []) => ({
  hiddenCollaboratorIds: new Set(hidden),
  lockedCollaboratorIds: new Set(locked),
  collaborators: new Map([
    ["alice-socket", { id: "alice", isCurrentUser: true }],
  ]),
});

describe("owners and buckets", () => {
  it("lists the creator first, then co-owners, without duplicates", () => {
    const rect = createRect("bob", ["carol", "bob", "carol", 42, ""]);
    expect(getElementOwnerIds(rect, arrayToMap([rect]))).toEqual([
      "bob",
      "carol",
    ]);
  });

  it("an untagged element edited by someone is owned by unknown + them", () => {
    const rect = createRect(undefined, ["carol"]);
    expect(getElementOwnerIds(rect, arrayToMap([rect]))).toEqual([
      UNKNOWN_CREATOR_ID,
      "carol",
    ]);
  });

  it("bound text follows its container's owners", () => {
    const container = createRect("bob", ["carol"]);
    const text = newTextElement({
      text: "label",
      x: 0,
      y: 0,
      containerId: container.id,
    });
    expect(getElementOwnerIds(text, arrayToMap([container, text]))).toEqual([
      "bob",
      "carol",
    ]);
  });

  it("owners this client never saw share the miscellaneous bucket", () => {
    const rect = createRect("bob", ["dave", "erin"]);
    const directory = new Map([["bob", {}]]);
    expect(
      getElementVisibilityBuckets(rect, arrayToMap([rect]), directory),
    ).toEqual(["bob", UNKNOWN_CREATOR_ID]);
  });
});

describe("least restricted owner rule", () => {
  // the example from the feature request: Alice has Bob locked but not
  // Carol, and Carol edited Bob's element
  const rect = createRect("bob", ["carol"]);
  const map = arrayToMap([rect]);

  it("Bob locked, Carol not → interactive for Alice", () => {
    expect(isElementInteractive(rect, map, state([], ["bob"]))).toBe(true);
  });

  it("Bob and Carol both locked → not interactive", () => {
    expect(isElementInteractive(rect, map, state([], ["bob", "carol"]))).toBe(
      false,
    );
  });

  it("Bob hidden, Carol visible → visible and interactive", () => {
    expect(isElementByHiddenCreator(rect, map, state(["bob"]))).toBe(false);
    expect(isElementInteractive(rect, map, state(["bob"], ["bob"]))).toBe(true);
  });

  it("Bob hidden, Carol locked → visible but not interactive", () => {
    expect(isElementByHiddenCreator(rect, map, state(["bob"]))).toBe(false);
    expect(
      isElementInteractive(rect, map, state(["bob"], ["bob", "carol"])),
    ).toBe(false);
  });

  it("Bob and Carol both hidden → hidden and not interactive", () => {
    expect(isElementByHiddenCreator(rect, map, state(["bob", "carol"]))).toBe(
      true,
    );
    expect(isElementInteractive(rect, map, state(["bob", "carol"]))).toBe(
      false,
    );
  });

  it("an element I co-own can't be locked for me", () => {
    const mine = createRect("bob", ["alice"]);
    expect(
      isElementInteractive(mine, arrayToMap([mine]), state([], ["bob"])),
    ).toBe(true);
  });

  it("without co-owners the creator alone decides (unchanged behaviour)", () => {
    const bobs = createRect("bob");
    expect(
      isElementInteractive(bobs, arrayToMap([bobs]), state([], ["bob"])),
    ).toBe(false);
    expect(
      isElementByHiddenCreator(bobs, arrayToMap([bobs]), state(["bob"])),
    ).toBe(true);
  });
});

describe("isOwnershipEdit", () => {
  const rect = createRect("bob");

  it("moving or restyling is an edit", () => {
    expect(isOwnershipEdit(rect, newElementWith(rect, { x: 5 }))).toBe(true);
    expect(
      isOwnershipEdit(rect, newElementWith(rect, { strokeColor: "#f00" })),
    ).toBe(true);
  });

  it("bookkeeping, z-order and binding references are not", () => {
    expect(
      isOwnershipEdit(
        rect,
        newElementWith(rect, {
          index: "a5" as any,
          boundElements: [{ id: "arrow", type: "arrow" }],
          customData: { foo: 1 },
        }),
      ),
    ).toBe(false);
  });

  it("deep-equal copies (like store snapshots) are not edits", () => {
    const line = newElement({ type: "rectangle", x: 0, y: 0 });
    const copy = { ...line, groupIds: [...line.groupIds] };
    expect(isOwnershipEdit(line, copy as ExcalidrawElement)).toBe(false);
  });
});

describe("getElementsToCoOwn", () => {
  const appState = (selected: string[]) => ({
    selectedElementIds: Object.fromEntries(
      selected.map((id) => [id, true as const]),
    ),
    collaborators: new Map([["me-socket", { id: "me", isCurrentUser: true }]]),
  });

  const edit = (element: ExcalidrawElement) =>
    newElementWith(element, { x: element.x + 10 });

  it("a selected, edited element someone else created gets me as co-owner", () => {
    const rect = createRect("bob");
    const result = getElementsToCoOwn(
      arrayToMap([rect]),
      arrayToMap([edit(rect)]),
      appState([rect.id]),
    );
    expect(result.map((el) => el.id)).toEqual([rect.id]);
  });

  it("an element changed as a side effect (not selected) doesn't", () => {
    const rect = createRect("bob");
    expect(
      getElementsToCoOwn(
        arrayToMap([rect]),
        arrayToMap([edit(rect)]),
        appState([]),
      ),
    ).toEqual([]);
  });

  it("elements I already own don't", () => {
    const mine = createRect("me");
    const coOwned = createRect("bob", ["me"]);
    expect(
      getElementsToCoOwn(
        arrayToMap([mine, coOwned]),
        arrayToMap([edit(mine), edit(coOwned)]),
        appState([mine.id, coOwned.id]),
      ),
    ).toEqual([]);
  });

  it("new, deleted, unstamped or merely re-indexed elements don't", () => {
    const fresh = createRect("bob");
    const deleted = createRect("bob");
    const untagged = createRect();
    const reindexed = createRect("bob");
    expect(
      getElementsToCoOwn(
        arrayToMap([deleted, untagged, reindexed]),
        arrayToMap([
          fresh,
          newElementWith(deleted as ExcalidrawElement, { isDeleted: true }),
          edit(untagged),
          newElementWith(reindexed, { index: "a9" as any }),
        ]),
        appState([fresh.id, deleted.id, untagged.id, reindexed.id]),
      ),
    ).toEqual([]);
  });

  it("editing a label co-owns its shape", () => {
    const container = createRect("bob");
    const text = newTextElement({
      text: "label",
      x: 0,
      y: 0,
      containerId: container.id,
    });
    const result = getElementsToCoOwn(
      arrayToMap([container, text]),
      arrayToMap([container, newElementWith(text, { text: "edited" })]),
      { ...appState([]), editingTextElement: text },
    );
    expect(result.map((el) => el.id)).toEqual([container.id]);
  });

  it("does nothing outside of a room (no self id)", () => {
    const rect = createRect("bob");
    expect(
      getElementsToCoOwn(arrayToMap([rect]), arrayToMap([edit(rect)]), {
        selectedElementIds: { [rect.id]: true },
      }),
    ).toEqual([]);
  });

  it("getCoOwnedCustomData adds me with a new counter and keeps other custom data", () => {
    const rect = newElementWith(createRect("bob", ["carol"]), {
      customData: {
        [CREATOR_ID_KEY]: "bob",
        [EDITOR_IDS_KEY]: ["carol"],
        [EDITOR_SEQS_KEY]: { carol: 1, me: 2 },
        x: 1,
      },
    });
    expect(getCoOwnedCustomData(rect, "me")).toEqual({
      [CREATOR_ID_KEY]: "bob",
      [EDITOR_IDS_KEY]: ["carol", "me"],
      // my old entry (removed at 2) is superseded by a newer one
      [EDITOR_SEQS_KEY]: { carol: 1, me: 3 },
      x: 1,
    });
  });
});

describe("mergeCoOwnership", () => {
  it("keeps concurrent co-owners from both copies", () => {
    const carolsCopy = createRect("bob", ["carol"], { carol: 1 });
    const davesCopy = createRect("bob", ["dave"], { dave: 1 });
    expect(editors(mergeCoOwnership(carolsCopy, davesCopy))).toEqual({
      ids: ["carol", "dave"],
      seqs: { carol: 1, dave: 1 },
    });
  });

  it("a newer removal beats an older copy that still lists the co-owner", () => {
    const removed = createRect("bob", [], { me: 2 });
    const stale = createRect("bob", ["me"], { me: 1 });
    expect(mergeCoOwnership(removed, stale)).toBeNull();
    expect(editors(mergeCoOwnership(stale, removed))).toEqual({
      ids: [],
      seqs: { me: 2 },
    });
  });

  it("a newer re-add beats an older removal", () => {
    const readded = createRect("bob", ["me"], { me: 3 });
    const removed = createRect("bob", [], { me: 2 });
    expect(editors(mergeCoOwnership(removed, readded))).toEqual({
      ids: ["me"],
      seqs: { me: 3 },
    });
  });

  it("is commutative: both orders give the same co-owners", () => {
    const a = createRect("bob", ["carol", "me"], { carol: 4, me: 1, dave: 2 });
    const b = createRect("bob", ["dave"], { carol: 5, me: 1, dave: 3 });
    const ab = mergeCoOwnership(a, b);
    const ba = mergeCoOwnership(b, a) ?? b.customData;
    expect(editors(ab)).toEqual(editors(ba));
    expect(editors(ab)).toEqual({
      ids: ["dave", "me"],
      seqs: { carol: 5, dave: 3, me: 1 },
    });
  });

  it("keeps the winner's other custom data", () => {
    const winner = newElementWith(createRect("bob"), {
      customData: { [CREATOR_ID_KEY]: "bob", note: "winner" },
    });
    const other = createRect("alice", ["carol"], { carol: 1 });
    expect(mergeCoOwnership(winner, other)).toEqual({
      [CREATOR_ID_KEY]: "bob",
      note: "winner",
      [EDITOR_IDS_KEY]: ["carol"],
      [EDITOR_SEQS_KEY]: { carol: 1 },
    });
  });

  it("returns null when the winner already has everything", () => {
    const winner = createRect("bob", ["carol"], { carol: 2 });
    const other = createRect("bob", ["carol"], { carol: 1 });
    expect(mergeCoOwnership(winner, other)).toBeNull();
  });

  it("old data without counters: being a co-owner wins the tie", () => {
    const withCarol = createRect("bob", ["carol"]);
    const withoutCarol = createRect("bob");
    expect(editors(mergeCoOwnership(withoutCarol, withCarol)).ids).toEqual([
      "carol",
    ]);
  });
});

describe("reconcileEditorIdsAfterHistory", () => {
  it("undo removes me (with a newer counter) but keeps co-owners added meanwhile", () => {
    const before = createRect("bob", ["carol", "me"], { carol: 1, me: 1 });
    const applied = createRect("bob");
    expect(
      editors(reconcileEditorIdsAfterHistory(before, applied, "me")),
    ).toEqual({ ids: ["carol"], seqs: { carol: 1, me: 2 } });
  });

  it("redo adds me back (with a newer counter) and keeps everyone else", () => {
    const before = createRect("bob", ["carol"], { carol: 1, me: 2 });
    const applied = createRect("bob", ["me"], { me: 1 });
    expect(
      editors(reconcileEditorIdsAfterHistory(before, applied, "me")),
    ).toEqual({ ids: ["carol", "me"], seqs: { carol: 1, me: 3 } });
  });

  it("history can't bring back someone else who had been removed", () => {
    const before = createRect("bob", [], { carol: 2 });
    const applied = createRect("bob", ["carol"], { carol: 1 });
    expect(
      editors(reconcileEditorIdsAfterHistory(before, applied, "me")),
    ).toEqual({ ids: [], seqs: { carol: 2 } });
  });

  it("keeps the applied element's other custom data", () => {
    const before = createRect("bob", ["me"], { me: 1 });
    const applied = newElementWith(createRect("bob"), {
      customData: { [CREATOR_ID_KEY]: "bob", note: "restored" },
    });
    expect(reconcileEditorIdsAfterHistory(before, applied, "me")).toEqual({
      [CREATOR_ID_KEY]: "bob",
      note: "restored",
      [EDITOR_IDS_KEY]: [],
      [EDITOR_SEQS_KEY]: { me: 2 },
    });
  });

  it("returns null when history already got it right", () => {
    const before = createRect("bob", ["carol"], { carol: 1 });
    const applied = createRect("bob", ["carol"], { carol: 1 });
    expect(reconcileEditorIdsAfterHistory(before, applied, "me")).toBeNull();
  });
});
