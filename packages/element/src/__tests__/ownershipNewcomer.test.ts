/**
 * Issue #83 — unit tests for the newcomer default in `ownership.ts`.
 * Expected values come from the acceptance criteria in #83 and the decisions
 * approved on it (Phase 1), not from running the implementation:
 *
 * - B: a collaborator seen for the first time (not in #116's directory yet)
 *   starts in the chosen state: Visible → visible and interactive; Locked →
 *   visible but locked; Hidden → hidden (and therefore locked, per #81). A
 *   collaborator seen before (in the directory, even if they left) is not
 *   affected when they rejoin
 * - C: changing the setting doesn't change anyone already seen
 * - D: with a layer order, a newcomer is added directly above
 *   "unknown / miscellaneous"; several newcomers in join order. Decision
 *   (Q1): if I moved miscellaneous up, newcomers go to the very bottom
 * - E: never applies to me or to the miscellaneous bucket
 * - decision (Phase 1, Q4): a first-seen collaborator with leftover state
 *   (e.g. pruned from the directory) starts in the chosen state
 *
 * `getNewcomerState` is given the state from before the sighting is
 * recorded. Layer orders are top row first.
 */
import {
  UNKNOWN_CREATOR_ID,
  getNewcomerState,
  isCollaboratorInteractive,
} from "../ownership";

import type { NewCollaboratorDefault } from "../ownership";

/** directory as #116 fills it: insertion order = order first seen */
const directory = (...clientIds: string[]) =>
  new Map(clientIds.map((id) => [id, { username: id, lastSeen: 0 }]));

/** `collaborators` as the editor stores them; the first entry is me */
const room = (...clientIds: string[]) =>
  new Map(
    clientIds.map((id, i) => [`${id}-socket`, { id, isCurrentUser: i === 0 }]),
  );

/**
 * me and alice seen before (alice locked), bob seen before and since left
 * (hidden, so also locked); carol is about to be seen for the first time
 */
const state = (
  newCollaboratorDefault: NewCollaboratorDefault,
  extra: Record<string, unknown> = {},
) => ({
  collaborators: room("me", "alice", "carol"),
  collaboratorDirectory: directory("me", "alice", "bob"),
  hiddenCollaboratorIds: new Set(["bob"]),
  lockedCollaboratorIds: new Set(["alice", "bob"]),
  collaboratorLayeringEnabled: false,
  collaboratorLayerOrder: null as readonly string[] | null,
  newCollaboratorDefault,
  ...extra,
});

const ALL_DEFAULTS: NewCollaboratorDefault[] = ["visible", "locked", "hidden"];

describe("getNewcomerState — Criteria B (first-seen collaborators)", () => {
  it("AC-B: with Locked, a first-seen collaborator starts visible but locked", () => {
    const next = getNewcomerState("carol", state("locked"))!;
    expect(next.hiddenCollaboratorIds.has("carol")).toBe(false);
    expect(next.lockedCollaboratorIds.has("carol")).toBe(true);
    expect(isCollaboratorInteractive("carol", next, "me")).toBe(false);
  });

  it("AC-B: with Visible, a first-seen collaborator starts visible and interactive", () => {
    const next = getNewcomerState("carol", state("visible"))!;
    expect(next.hiddenCollaboratorIds.has("carol")).toBe(false);
    expect(next.lockedCollaboratorIds.has("carol")).toBe(false);
    expect(isCollaboratorInteractive("carol", next, "me")).toBe(true);
  });

  it("AC-B: with Hidden, a first-seen collaborator starts hidden, and therefore locked", () => {
    const next = getNewcomerState("carol", state("hidden"))!;
    expect(next.hiddenCollaboratorIds.has("carol")).toBe(true);
    expect(next.lockedCollaboratorIds.has("carol")).toBe(true);
    expect(isCollaboratorInteractive("carol", next, "me")).toBe(false);
  });

  it("AC-B: the default changes only the newcomer, not anyone else", () => {
    for (const mode of ALL_DEFAULTS) {
      const next = getNewcomerState("carol", state(mode))!;
      const others = (ids: ReadonlySet<string>) =>
        [...ids].filter((id) => id !== "carol").sort();
      expect(others(next.hiddenCollaboratorIds)).toEqual(["bob"]);
      expect(others(next.lockedCollaboratorIds)).toEqual(["alice", "bob"]);
    }
  });

  it("AC-B: a collaborator seen before is not affected when they rejoin, even after leaving", () => {
    // bob left (not in the room) but is in the directory
    for (const mode of ALL_DEFAULTS) {
      expect(getNewcomerState("bob", state(mode))).toBe(null);
    }
  });

  it("AC-B: a collaborator seen before and still in the room is not affected", () => {
    for (const mode of ALL_DEFAULTS) {
      expect(getNewcomerState("alice", state(mode))).toBe(null);
    }
  });

  it("decision (Q4): a first-seen collaborator's leftover state is replaced by the chosen state", () => {
    // carol was pruned from the directory but is still in the saved sets
    const leftover = {
      hiddenCollaboratorIds: new Set(["bob", "carol"]),
      lockedCollaboratorIds: new Set(["alice", "bob", "carol"]),
    };

    const visible = getNewcomerState("carol", state("visible", leftover))!;
    expect(visible.hiddenCollaboratorIds.has("carol")).toBe(false);
    expect(visible.lockedCollaboratorIds.has("carol")).toBe(false);

    const locked = getNewcomerState("carol", state("locked", leftover))!;
    expect(locked.hiddenCollaboratorIds.has("carol")).toBe(false);
    expect(locked.lockedCollaboratorIds.has("carol")).toBe(true);
  });

  it("AC-B: doesn't mutate the given state", () => {
    const before = state("hidden");
    getNewcomerState("carol", before);
    expect([...before.hiddenCollaboratorIds]).toEqual(["bob"]);
    expect([...before.lockedCollaboratorIds]).toEqual(["alice", "bob"]);
  });
});

describe("getNewcomerState — Criteria C (only future newcomers)", () => {
  it("(control) the same default does change a first-seen collaborator", () => {
    expect(getNewcomerState("carol", state("hidden"))).not.toBe(null);
  });

  it("AC-C: whatever the default, a collaborator already seen is left as they are", () => {
    // alice: visible and locked; bob: hidden and locked; me: visible
    for (const mode of ALL_DEFAULTS) {
      for (const seen of ["me", "alice", "bob"]) {
        expect(getNewcomerState(seen, state(mode))).toBe(null);
      }
    }
  });
});

describe("getNewcomerState — Criteria E (me and miscellaneous)", () => {
  it("(control) a first-seen collaborator other than me is affected", () => {
    const next = getNewcomerState("carol", state("hidden"))!;
    expect(next.hiddenCollaboratorIds.has("carol")).toBe(true);
  });

  it("AC-E: never applies to me, even when my id is new to the directory", () => {
    // e.g. a new tab of mine that got a new client id
    const withNewSelfId = state("hidden", {
      collaborators: room("me-2", "alice"),
    });
    expect(getNewcomerState("me-2", withNewSelfId)).toBe(null);
  });

  it("AC-E: never applies to the miscellaneous bucket", () => {
    for (const mode of ALL_DEFAULTS) {
      expect(getNewcomerState(UNKNOWN_CREATOR_ID, state(mode))).toBe(null);
    }
  });
});

describe("getNewcomerState — Criteria D (layer order)", () => {
  it("AC-D: with layering on, a newcomer is added directly above miscellaneous", () => {
    const next = getNewcomerState(
      "carol",
      state("locked", {
        collaboratorLayeringEnabled: true,
        collaboratorLayerOrder: ["alice", "me", "bob", UNKNOWN_CREATOR_ID],
      }),
    )!;
    expect(next.collaboratorLayerOrder).toEqual([
      "alice",
      "me",
      "bob",
      "carol",
      UNKNOWN_CREATOR_ID,
    ]);
  });

  it("AC-D: several newcomers are added above miscellaneous in join order", () => {
    const first = state("locked", {
      collaborators: room("me", "carol", "dave"),
      collaboratorLayeringEnabled: true,
      collaboratorLayerOrder: ["me", "alice", "bob", UNKNOWN_CREATOR_ID],
    });
    // carol is seen first, then dave (with carol now in the directory)
    const afterCarol = { ...first, ...getNewcomerState("carol", first)! };
    const afterDave = getNewcomerState("dave", {
      ...afterCarol,
      collaboratorDirectory: directory("me", "alice", "bob", "carol"),
    })!;
    expect(afterDave.collaboratorLayerOrder).toEqual([
      "me",
      "alice",
      "bob",
      "carol",
      "dave",
      UNKNOWN_CREATOR_ID,
    ]);
  });

  it("AC-D: with miscellaneous moved up, a newcomer goes to the bottom", () => {
    const next = getNewcomerState(
      "carol",
      state("locked", {
        collaboratorLayeringEnabled: true,
        collaboratorLayerOrder: ["alice", UNKNOWN_CREATOR_ID, "me", "bob"],
      }),
    )!;
    expect(next.collaboratorLayerOrder).toEqual([
      "alice",
      UNKNOWN_CREATOR_ID,
      "me",
      "bob",
      "carol",
    ]);
  });

  it("AC-D: a newcomer who joins while layering is off is above miscellaneous once it's turned on", () => {
    const next = getNewcomerState(
      "carol",
      state("locked", {
        collaboratorLayeringEnabled: false,
        collaboratorLayerOrder: ["bob", "me", "alice", UNKNOWN_CREATOR_ID],
      }),
    )!;
    expect(next.collaboratorLayerOrder).toEqual([
      "bob",
      "me",
      "alice",
      "carol",
      UNKNOWN_CREATOR_ID,
    ]);
  });

  it("AC-D: before layering was ever turned on, there's still no stored order", () => {
    // #82: the order is null until first turned on; the default order then
    // already lists the directory (join order) above miscellaneous
    const next = getNewcomerState("carol", state("locked"))!;
    expect(next.collaboratorLayerOrder).toBe(null);
  });

  it("AC-D: doesn't mutate the stored order", () => {
    const order = ["me", "alice", "bob", UNKNOWN_CREATOR_ID];
    getNewcomerState(
      "carol",
      state("locked", {
        collaboratorLayeringEnabled: true,
        collaboratorLayerOrder: order,
      }),
    );
    expect(order).toEqual(["me", "alice", "bob", UNKNOWN_CREATOR_ID]);
  });
});
