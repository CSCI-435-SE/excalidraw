/**
 * Issue #82 — unit tests for the pure layering logic in `ownership.ts`.
 * Expected values come from the acceptance criteria in #82 and the decisions
 * approved on it (Phase 1):
 *
 * - A: rows (incl. my own and the miscellaneous bucket) can be moved up/down
 *   one place or dragged to any position; the ends can't move further
 * - B: switch off → shared order untouched; on → a higher row's elements are
 *   drawn above every element of a lower row, shared order kept within a row;
 *   the order survives switching off and on
 * - D: a bound label is drawn directly with its container
 * - E: elements are never changed (index/version)
 * - G: hidden/locked collaborators keep their place
 * - H: a collaborator appearing for the first time goes to the bottom
 *   (replaced by #83 Criteria D: directly above miscellaneous, and #83 E:
 *   never applied to me, who stays on top)
 * - default order (decision on #82): me on top, then join order (#116's
 *   collaborator directory, in the order it was filled), miscellaneous last
 *
 * Arrays of elements are in drawing order: first = drawn first (bottom),
 * last = drawn last (top). Layer orders are top row first.
 */
import { arrayToMap } from "@excalidraw/common";

import { newElement, newTextElement } from "../newElement";
import {
  CREATOR_ID_KEY,
  EDITOR_IDS_KEY,
  UNKNOWN_CREATOR_ID,
  getCollaboratorLayerOrder,
  getDefaultCollaboratorLayerOrder,
  moveCollaboratorLayer,
  orderElementsByCollaboratorLayer,
} from "../ownership";

import type { ExcalidrawElement } from "../types";

// readable ids (the constructors' option types don't accept `id`)
const createRect = (id: string, creatorId?: string) => ({
  ...newElement({
    type: "rectangle",
    x: 0,
    y: 0,
    customData:
      creatorId === undefined ? undefined : { [CREATOR_ID_KEY]: creatorId },
  }),
  id,
});

const createLabel = (id: string, containerId: string, creatorId: string) => ({
  ...newTextElement({
    text: "label",
    containerId,
    x: 0,
    y: 0,
    customData: { [CREATOR_ID_KEY]: creatorId },
  }),
  id,
});

/** created by `creatorId`, co-owned (#84) by `editorIds` */
const createCoOwnedRect = (
  id: string,
  creatorId: string,
  editorIds: string[],
) => ({
  ...newElement({
    type: "rectangle",
    x: 0,
    y: 0,
    customData: {
      [CREATOR_ID_KEY]: creatorId,
      [EDITOR_IDS_KEY]: editorIds,
    },
  }),
  id,
});

const ids = (elements: readonly ExcalidrawElement[]) =>
  elements.map((element) => element.id);

/** directory as #116 fills it: insertion order = order first seen */
const directory = (...clientIds: string[]) =>
  new Map(clientIds.map((id) => [id, { username: id, lastSeen: 0 }]));

/** `collaborators` as the editor stores them; the first entry is me */
const room = (...clientIds: string[]) =>
  new Map(
    clientIds.map((id, i) => [`${id}-socket`, { id, isCurrentUser: i === 0 }]),
  );

/**
 * me, alice and bob in the room; alice joined before bob. Like #116's Collab,
 * the directory records me too (when the room starts), otherwise my
 * elements would fall into the miscellaneous bucket.
 */
const baseState = {
  collaborators: room("me", "alice", "bob"),
  collaboratorDirectory: directory("me", "alice", "bob"),
};

const layered = (
  collaboratorLayerOrder: readonly string[] | null,
  extra: Record<string, unknown> = {},
) => ({
  ...baseState,
  collaboratorLayeringEnabled: true,
  collaboratorLayerOrder,
  ...extra,
});

describe("orderElementsByCollaboratorLayer (the single ordering function)", () => {
  // shared order: alice's shape at the bottom, then mine, then bob's on top
  const aliceRect = createRect("alice-rect", "alice");
  const myRect = createRect("my-rect", "me");
  const bobRect = createRect("bob-rect", "bob");
  const shared = [aliceRect, myRect, bobRect];

  it("AC-B: with the switch off, the original array is returned unchanged", () => {
    const result = orderElementsByCollaboratorLayer(shared, {
      ...baseState,
      collaboratorLayeringEnabled: false,
      collaboratorLayerOrder: ["alice", "me", "bob", UNKNOWN_CREATOR_ID],
    });
    expect(result).toBe(shared);
  });

  it("AC-B: (control) the same setup with the switch on does change the order", () => {
    const result = orderElementsByCollaboratorLayer(
      shared,
      layered(["alice", "me", "bob", UNKNOWN_CREATOR_ID]),
    );
    expect(ids(result)).not.toEqual(ids(shared));
  });

  it("AC-B: with no layering state at all, the original array is returned", () => {
    expect(orderElementsByCollaboratorLayer(shared, baseState)).toBe(shared);
  });

  it("AC-B: a higher collaborator is drawn above a lower one", () => {
    // alice top, bob bottom → bob drawn first, alice last
    const result = orderElementsByCollaboratorLayer(
      shared,
      layered(["alice", "me", "bob", UNKNOWN_CREATOR_ID]),
    );
    expect(ids(result)).toEqual(["bob-rect", "my-rect", "alice-rect"]);
  });

  it("AC-B: every element of a higher collaborator is above every element of a lower one, even when interleaved", () => {
    const a1 = createRect("a1", "alice");
    const b1 = createRect("b1", "bob");
    const a2 = createRect("a2", "alice");
    const b2 = createRect("b2", "bob");
    const result = orderElementsByCollaboratorLayer(
      [a1, b1, a2, b2],
      layered(["alice", "bob", "me", UNKNOWN_CREATOR_ID]),
    );
    expect(ids(result)).toEqual(["b1", "b2", "a1", "a2"]);
  });

  it("AC-B: within one collaborator, elements keep the shared drawing order", () => {
    const a1 = createRect("a1", "alice");
    const a2 = createRect("a2", "alice");
    const a3 = createRect("a3", "alice");
    const b1 = createRect("b1", "bob");
    const result = orderElementsByCollaboratorLayer(
      [a3, b1, a1, a2],
      layered(["alice", "bob", "me", UNKNOWN_CREATOR_ID]),
    );
    expect(ids(result)).toEqual(["b1", "a3", "a1", "a2"]);
  });

  it("AC-B: the stored order is used again after switching off and on", () => {
    const order = ["alice", "me", "bob", UNKNOWN_CREATOR_ID];
    expect(
      orderElementsByCollaboratorLayer(shared, {
        ...layered(order),
        collaboratorLayeringEnabled: false,
      }),
    ).toBe(shared);
    expect(
      ids(orderElementsByCollaboratorLayer(shared, layered(order))),
    ).toEqual(["bob-rect", "my-rect", "alice-rect"]);
  });

  it("AC-D: a bound label is drawn directly with its container, even when the label has another creator", () => {
    // alice's shape carries a label stamped by bob; bob is on top
    const container = createRect("container", "alice");
    const label = createLabel("label", "container", "bob");
    const bobShape = createRect("bob-shape", "bob");
    const elements = [container, bobShape, label];
    const result = orderElementsByCollaboratorLayer(
      elements,
      layered(["bob", "alice", "me", UNKNOWN_CREATOR_ID]),
      arrayToMap(elements),
    );
    expect(ids(result)).toEqual(["container", "label", "bob-shape"]);
  });

  it("AC-A: the miscellaneous bucket can be ordered (untagged and never-seen creators)", () => {
    const untagged = createRect("untagged");
    const stranger = createRect("stranger-rect", "stranger");
    const result = orderElementsByCollaboratorLayer(
      [untagged, stranger, aliceRect],
      layered([UNKNOWN_CREATOR_ID, "alice", "me", "bob"]),
    );
    expect(ids(result)).toEqual(["alice-rect", "untagged", "stranger-rect"]);
  });

  it("AC-A: my own row can be ordered (moved below a collaborator)", () => {
    const result = orderElementsByCollaboratorLayer(
      [myRect, aliceRect],
      layered(["alice", "me", "bob", UNKNOWN_CREATOR_ID]),
    );
    expect(ids(result)).toEqual(["my-rect", "alice-rect"]);
  });

  it("AC-G: hiding or locking a collaborator doesn't change their place", () => {
    const order = ["alice", "me", "bob", UNKNOWN_CREATOR_ID];
    const expected = ["bob-rect", "my-rect", "alice-rect"];
    expect(
      ids(
        orderElementsByCollaboratorLayer(
          shared,
          layered(order, { hiddenCollaboratorIds: new Set(["alice"]) }),
        ),
      ),
    ).toEqual(expected);
    expect(
      ids(
        orderElementsByCollaboratorLayer(
          shared,
          layered(order, { lockedCollaboratorIds: new Set(["alice"]) }),
        ),
      ),
    ).toEqual(expected);
  });

  it("AC-H: elements of a creator missing from the order are drawn below everyone", () => {
    // outside a room there's no directory: every stamped creator is a bucket
    const carolRect = createRect("carol-rect", "carol");
    const result = orderElementsByCollaboratorLayer([aliceRect, carolRect], {
      collaborators: room("me", "alice"),
      collaboratorDirectory: null,
      collaboratorLayeringEnabled: true,
      collaboratorLayerOrder: ["alice", "me", UNKNOWN_CREATOR_ID],
    });
    expect(ids(result)).toEqual(["carol-rect", "alice-rect"]);
  });

  it("AC-H: elements of a creator missing from the order are drawn below even the bottom row", () => {
    // miscellaneous is the bottom row; carol isn't in the order at all
    const untagged = createRect("untagged");
    const carolRect = createRect("carol-rect", "carol");
    const result = orderElementsByCollaboratorLayer([untagged, carolRect], {
      collaborators: room("me", "alice"),
      collaboratorDirectory: null,
      collaboratorLayeringEnabled: true,
      collaboratorLayerOrder: ["alice", "me", UNKNOWN_CREATOR_ID],
    });
    expect(ids(result)).toEqual(["carol-rect", "untagged"]);
  });

  it("AC-E: changes no element and doesn't mutate the input array", () => {
    const before = shared.map((el) => ({
      id: el.id,
      index: el.index,
      version: el.version,
      versionNonce: el.versionNonce,
    }));
    const input = [...shared];
    orderElementsByCollaboratorLayer(
      input,
      layered(["alice", "me", "bob", UNKNOWN_CREATOR_ID]),
    );
    expect(ids(input)).toEqual(ids(shared));
    expect(
      input.map((el) => ({
        id: el.id,
        index: el.index,
        version: el.version,
        versionNonce: el.versionNonce,
      })),
    ).toEqual(before);
  });
});

/**
 * #84 co-ownership: an element edited by several collaborators has several
 * owners. Decision on #82 (option C): it's drawn in the layer of its highest
 * VISIBLE owner, like #84 makes it follow its least restricted owner.
 */
describe("orderElementsByCollaboratorLayer — co-owned elements (#84, highest visible owner)", () => {
  const ALICE_TOP = ["alice", "me", "bob", UNKNOWN_CREATOR_ID];
  const myRect = createRect("my-rect", "me");

  it("(control) without co-owners, an element is drawn in its creator's layer", () => {
    const bobOnly = createRect("bob-only", "bob");
    expect(
      ids(
        orderElementsByCollaboratorLayer([bobOnly, myRect], layered(ALICE_TOP)),
      ),
    ).toEqual(["bob-only", "my-rect"]);
  });

  it("AC-B: a co-owned element is drawn in its highest owner's layer", () => {
    const shared = createCoOwnedRect("shared", "bob", ["alice"]);
    expect(
      ids(
        orderElementsByCollaboratorLayer([shared, myRect], layered(ALICE_TOP)),
      ),
    ).toEqual(["my-rect", "shared"]);
  });

  it("AC-G: with its highest owner hidden, it's drawn in its highest visible owner's layer", () => {
    const shared = createCoOwnedRect("shared", "bob", ["alice"]);
    expect(
      ids(
        orderElementsByCollaboratorLayer(
          [shared, myRect],
          layered(ALICE_TOP, { hiddenCollaboratorIds: new Set(["alice"]) }),
        ),
      ),
    ).toEqual(["shared", "my-rect"]);
  });

  it("AC-G: a hidden owner below doesn't change its layer", () => {
    const shared = createCoOwnedRect("shared", "bob", ["alice"]);
    expect(
      ids(
        orderElementsByCollaboratorLayer(
          [shared, myRect],
          layered(ALICE_TOP, { hiddenCollaboratorIds: new Set(["bob"]) }),
        ),
      ),
    ).toEqual(["my-rect", "shared"]);
  });

  it("with every owner hidden, it keeps its highest owner's layer", () => {
    const shared = createCoOwnedRect("shared", "bob", ["alice"]);
    expect(
      ids(
        orderElementsByCollaboratorLayer(
          [shared, myRect],
          layered(ALICE_TOP, {
            hiddenCollaboratorIds: new Set(["alice", "bob"]),
          }),
        ),
      ),
    ).toEqual(["my-rect", "shared"]);
  });

  it("AC-D: a label on a co-owned shape follows the shape's owners", () => {
    const container = createCoOwnedRect("container", "bob", ["alice"]);
    const label = createLabel("label", "container", "me");
    expect(
      ids(
        orderElementsByCollaboratorLayer(
          [container, myRect, label],
          layered(ALICE_TOP),
        ),
      ),
    ).toEqual(["my-rect", "container", "label"]);
  });

  it("AC-A: a co-owner this client never saw counts as the miscellaneous bucket", () => {
    const shared = createCoOwnedRect("shared", "bob", ["stranger"]);
    expect(
      ids(
        orderElementsByCollaboratorLayer(
          [shared, myRect],
          layered([UNKNOWN_CREATOR_ID, "alice", "me", "bob"]),
        ),
      ),
    ).toEqual(["my-rect", "shared"]);
  });
});

describe("getDefaultCollaboratorLayerOrder (first switch-on and Reset)", () => {
  it("default: me on top, then join order, miscellaneous at the bottom", () => {
    expect(getDefaultCollaboratorLayerOrder(baseState)).toEqual([
      "me",
      "alice",
      "bob",
      UNKNOWN_CREATOR_ID,
    ]);
  });

  it("default: join order is the directory's order, not the room's", () => {
    // bob was seen first (e.g. previously seen), alice later
    expect(
      getDefaultCollaboratorLayerOrder({
        collaborators: room("me", "alice", "bob"),
        collaboratorDirectory: directory("bob", "alice"),
      }),
    ).toEqual(["me", "bob", "alice", UNKNOWN_CREATOR_ID]);
  });

  it("default: me on top even when I'm late in the directory", () => {
    expect(
      getDefaultCollaboratorLayerOrder({
        collaborators: room("me", "alice"),
        collaboratorDirectory: directory("alice", "me"),
      }),
    ).toEqual(["me", "alice", UNKNOWN_CREATOR_ID]);
  });

  it("default: previously seen collaborators (not in the room) keep their place in join order", () => {
    expect(
      getDefaultCollaboratorLayerOrder({
        collaborators: room("me", "bob"),
        collaboratorDirectory: directory("alice", "bob"),
      }),
    ).toEqual(["me", "alice", "bob", UNKNOWN_CREATOR_ID]);
  });

  it("default: a live collaborator not yet in the directory comes after it, above miscellaneous", () => {
    expect(
      getDefaultCollaboratorLayerOrder({
        collaborators: room("me", "alice", "carol"),
        collaboratorDirectory: directory("alice"),
      }),
    ).toEqual(["me", "alice", "carol", UNKNOWN_CREATOR_ID]);
  });

  it("default: without a current user there is no own row", () => {
    expect(
      getDefaultCollaboratorLayerOrder({
        collaborators: new Map([["alice-socket", { id: "alice" }]]),
        collaboratorDirectory: directory("alice"),
      }),
    ).toEqual(["alice", UNKNOWN_CREATOR_ID]);
  });

  it("default: outside a room (no directory), me on top, then the live collaborators, miscellaneous last", () => {
    expect(
      getDefaultCollaboratorLayerOrder({
        collaborators: room("me", "alice"),
        collaboratorDirectory: null,
      }),
    ).toEqual(["me", "alice", UNKNOWN_CREATOR_ID]);
  });

  it("default: with no live collaborators given, the directory's join order, miscellaneous last", () => {
    expect(
      getDefaultCollaboratorLayerOrder({
        collaboratorDirectory: directory("alice", "bob"),
      }),
    ).toEqual(["alice", "bob", UNKNOWN_CREATOR_ID]);
  });

  it("default: a live collaborator without an id yet (still connecting) isn't listed", () => {
    // like #116's rows, which skip collaborators without an id
    expect(
      getDefaultCollaboratorLayerOrder({
        collaborators: new Map<
          string,
          { id?: string; isCurrentUser?: boolean }
        >([
          ["my-socket", { id: "me", isCurrentUser: true }],
          ["connecting-socket", {}],
          ["alice-socket", { id: "alice" }],
        ]),
        collaboratorDirectory: directory("me", "alice"),
      }),
    ).toEqual(["me", "alice", UNKNOWN_CREATOR_ID]);
  });
});

describe("getCollaboratorLayerOrder (the order the rows show and the canvas uses)", () => {
  it("AC-A: before layering was ever turned on, the default order is used", () => {
    expect(getCollaboratorLayerOrder(layered(null))).toEqual([
      "me",
      "alice",
      "bob",
      UNKNOWN_CREATOR_ID,
    ]);
  });

  it("AC-B: a stored order is used as it is", () => {
    const order = ["bob", UNKNOWN_CREATOR_ID, "alice", "me"];
    expect(getCollaboratorLayerOrder(layered(order))).toEqual(order);
  });

  // #83 Criteria D replaces #82's Criteria H ("added to the bottom")
  it("#83 AC-D: a collaborator who appears for the first time is added directly above miscellaneous", () => {
    const state = {
      collaborators: room("me", "alice", "carol"),
      collaboratorDirectory: directory("alice", "carol"),
      collaboratorLayeringEnabled: true,
      collaboratorLayerOrder: ["alice", "me", UNKNOWN_CREATOR_ID],
    };
    expect(getCollaboratorLayerOrder(state)).toEqual([
      "alice",
      "me",
      "carol",
      UNKNOWN_CREATOR_ID,
    ]);
  });

  it("#83 AC-D: several newcomers are added directly above miscellaneous in join order", () => {
    const state = {
      collaborators: room("me", "dave", "carol"),
      collaboratorDirectory: directory("carol", "dave"),
      collaboratorLayeringEnabled: true,
      collaboratorLayerOrder: ["me", UNKNOWN_CREATOR_ID],
    };
    expect(getCollaboratorLayerOrder(state)).toEqual([
      "me",
      "carol",
      "dave",
      UNKNOWN_CREATOR_ID,
    ]);
  });

  it("#83 AC-D: with miscellaneous moved up, a newcomer goes to the bottom", () => {
    const state = {
      collaborators: room("me", "alice", "carol"),
      collaboratorDirectory: directory("me", "alice", "carol"),
      collaboratorLayeringEnabled: true,
      collaboratorLayerOrder: ["alice", UNKNOWN_CREATOR_ID, "me"],
    };
    expect(getCollaboratorLayerOrder(state)).toEqual([
      "alice",
      UNKNOWN_CREATOR_ID,
      "me",
      "carol",
    ]);
  });

  it("#83 AC-E: my id missing from a stored order goes on top, not above miscellaneous", () => {
    // e.g. a restored order from a tab of mine that had another client id
    const state = {
      collaborators: room("me-2", "alice"),
      collaboratorDirectory: directory("me", "alice", "me-2"),
      collaboratorLayeringEnabled: true,
      collaboratorLayerOrder: ["alice", "me", UNKNOWN_CREATOR_ID],
    };
    expect(getCollaboratorLayerOrder(state)).toEqual([
      "me-2",
      "alice",
      "me",
      UNKNOWN_CREATOR_ID,
    ]);
  });

  it("AC-G: a collaborator who left or is hidden keeps their place in the order", () => {
    const order = ["bob", "me", "alice", UNKNOWN_CREATOR_ID];
    const state = {
      // bob left the room but is still in the directory, alice is hidden
      collaborators: room("me", "alice"),
      collaboratorDirectory: directory("alice", "bob"),
      hiddenCollaboratorIds: new Set(["alice"]),
      collaboratorLayeringEnabled: true,
      collaboratorLayerOrder: order,
    };
    expect(getCollaboratorLayerOrder(state)).toEqual(order);
  });
});

describe("moveCollaboratorLayer (↑ · ↓ and drag)", () => {
  const order = ["me", "alice", "bob", UNKNOWN_CREATOR_ID];

  it("AC-A: the up arrow moves a collaborator one place up", () => {
    expect(moveCollaboratorLayer(order, "bob", 1)).toEqual([
      "me",
      "bob",
      "alice",
      UNKNOWN_CREATOR_ID,
    ]);
  });

  it("AC-A: the down arrow moves a collaborator one place down", () => {
    expect(moveCollaboratorLayer(order, "alice", 2)).toEqual([
      "me",
      "bob",
      "alice",
      UNKNOWN_CREATOR_ID,
    ]);
  });

  it("AC-A: the top row can't move further up", () => {
    expect(moveCollaboratorLayer(order, "me", -1)).toBe(order);
  });

  it("AC-A: the bottom row can't move further down", () => {
    expect(moveCollaboratorLayer(order, UNKNOWN_CREATOR_ID, 4)).toBe(order);
  });

  it("AC-A: dragging moves a collaborator to the drop position (down)", () => {
    expect(moveCollaboratorLayer(order, "me", 3)).toEqual([
      "alice",
      "bob",
      UNKNOWN_CREATOR_ID,
      "me",
    ]);
  });

  it("AC-A: dragging moves a collaborator to the drop position (up)", () => {
    expect(moveCollaboratorLayer(order, UNKNOWN_CREATOR_ID, 0)).toEqual([
      UNKNOWN_CREATOR_ID,
      "me",
      "alice",
      "bob",
    ]);
  });

  it("AC-A: dropping a row where it already is changes nothing", () => {
    expect(moveCollaboratorLayer(order, "alice", 1)).toBe(order);
  });

  it("AC-A: a collaborator not in the order isn't moved", () => {
    expect(moveCollaboratorLayer(order, "carol", 0)).toBe(order);
  });

  it("doesn't mutate the input order", () => {
    const input = [...order];
    moveCollaboratorLayer(input, "bob", 0);
    expect(input).toEqual(order);
  });
});
