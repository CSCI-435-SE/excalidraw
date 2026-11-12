/**
 * Issue #81 — unit tests for the pure interactivity rule and lock-list
 * transitions in `ownership.ts`. Expected values come from the acceptance
 * criteria in #81:
 *
 * - C: no interactivity without visibility (hidden → never interactive)
 * - H: my own drawings are never locked and always stay interactive
 * - A/B: locking / unlocking a bucket, Lock all, Unlock all
 */
import { arrayToMap } from "@excalidraw/common";

import { newElement, newTextElement } from "../newElement";
import {
  CREATOR_ID_KEY,
  UNKNOWN_CREATOR_ID,
  addLockedCollaborators,
  excludeNonInteractiveElements,
  getSelfCreatorId,
  isCollaboratorInteractive,
  isElementInteractive,
  toggleLockedCollaborator,
  unlockVisibleCollaborators,
} from "../ownership";

const createRect = (creatorId?: string) =>
  newElement({
    type: "rectangle",
    x: 0,
    y: 0,
    customData:
      creatorId === undefined ? undefined : { [CREATOR_ID_KEY]: creatorId },
  });

const sets = (hidden: string[] = [], locked: string[] = []) => ({
  hiddenCollaboratorIds: new Set(hidden),
  lockedCollaboratorIds: new Set(locked),
});

/** `collaborators` as the editor stores them, with "me" as the current user */
const collaborators = new Map([
  ["my-socket", { id: "me", isCurrentUser: true }],
  ["alice-socket", { id: "alice" }],
]);

describe("isCollaboratorInteractive (the interactivity rule)", () => {
  it("AC-A: a bucket that is neither hidden nor locked is interactive", () => {
    expect(isCollaboratorInteractive("alice", sets(), "me")).toBe(true);
  });

  it("AC-A: a locked, visible bucket is not interactive", () => {
    expect(isCollaboratorInteractive("alice", sets([], ["alice"]), "me")).toBe(
      false,
    );
  });

  it("AC-C: a hidden bucket is not interactive even if it isn't locked", () => {
    expect(isCollaboratorInteractive("alice", sets(["alice"]), "me")).toBe(
      false,
    );
  });

  it("AC-C: a hidden and locked bucket is not interactive", () => {
    expect(
      isCollaboratorInteractive("alice", sets(["alice"], ["alice"]), "me"),
    ).toBe(false);
  });

  it("AC-A: locking one bucket doesn't affect another", () => {
    expect(isCollaboratorInteractive("bob", sets([], ["alice"]), "me")).toBe(
      true,
    );
  });

  it("AC-H: my own bucket stays interactive even if it is in the lock list", () => {
    expect(isCollaboratorInteractive("me", sets([], ["me"]), "me")).toBe(true);
  });

  it("AC-C over AC-H: my own hidden bucket is not interactive (no interactivity without visibility)", () => {
    expect(isCollaboratorInteractive("me", sets(["me"]), "me")).toBe(false);
  });

  it("AC-A (misc): the miscellaneous bucket can be locked", () => {
    expect(
      isCollaboratorInteractive(
        UNKNOWN_CREATOR_ID,
        sets([], [UNKNOWN_CREATOR_ID]),
        "me",
      ),
    ).toBe(false);
  });

  it("AC-G: with no lock or visibility state (e.g. outside a room) everything is interactive", () => {
    expect(isCollaboratorInteractive("alice", {}, null)).toBe(true);
  });

  it("without a known self id, a locked bucket is still not interactive", () => {
    expect(isCollaboratorInteractive("alice", sets([], ["alice"]), null)).toBe(
      false,
    );
  });
});

describe("addLockedCollaborators", () => {
  it("AC-B: adds every given bucket to the lock list", () => {
    expect(
      [...addLockedCollaborators(new Set(), ["alice", "bob"], "me")].sort(),
    ).toEqual(["alice", "bob"]);
  });

  it("AC-B: keeps buckets that were already locked", () => {
    expect(
      [...addLockedCollaborators(new Set(["carol"]), ["alice"], "me")].sort(),
    ).toEqual(["alice", "carol"]);
  });

  it("AC-H: never adds me", () => {
    expect([
      ...addLockedCollaborators(new Set(), ["me", "alice"], "me"),
    ]).toEqual(["alice"]);
  });

  it("AC-G: doesn't mutate the current lock list (state is replaced, not edited)", () => {
    const locked = new Set(["carol"]);
    addLockedCollaborators(locked, ["alice"], "me");
    expect([...locked]).toEqual(["carol"]);
  });

  it("accepts a missing lock list", () => {
    expect([...addLockedCollaborators(undefined, ["alice"], null)]).toEqual([
      "alice",
    ]);
  });
});

describe("toggleLockedCollaborator", () => {
  it("AC-A: locks an unlocked, visible bucket", () => {
    expect([...toggleLockedCollaborator(sets(), "alice", "me")]).toEqual([
      "alice",
    ]);
  });

  it("AC-A: unlocks a locked, visible bucket", () => {
    expect([
      ...toggleLockedCollaborator(sets([], ["alice"]), "alice", "me"),
    ]).toEqual([]);
  });

  it("AC-A: leaves other buckets' locks unchanged", () => {
    expect(
      [...toggleLockedCollaborator(sets([], ["carol"]), "alice", "me")].sort(),
    ).toEqual(["alice", "carol"]);
  });

  it("AC-C: can't unlock a hidden bucket", () => {
    expect([
      ...toggleLockedCollaborator(sets(["alice"], ["alice"]), "alice", "me"),
    ]).toEqual(["alice"]);
  });

  it("AC-C: can't change the lock of a hidden bucket that isn't in the list", () => {
    expect([
      ...toggleLockedCollaborator(sets(["alice"]), "alice", "me"),
    ]).toEqual([]);
  });

  it("AC-H: can't lock me", () => {
    expect([...toggleLockedCollaborator(sets(), "me", "me")]).toEqual([]);
  });

  it("AC-G: doesn't mutate the current lock list", () => {
    const state = sets([], ["carol"]);
    toggleLockedCollaborator(state, "alice", "me");
    expect([...state.lockedCollaboratorIds]).toEqual(["carol"]);
  });
});

describe("unlockVisibleCollaborators (Unlock all)", () => {
  it("AC-B: unlocks every visible bucket", () => {
    expect([
      ...unlockVisibleCollaborators(sets([], ["alice", "bob"]), "me"),
    ]).toEqual([]);
  });

  it("AC-B + AC-C: hidden buckets stay locked, so they're still locked once shown", () => {
    expect([
      ...unlockVisibleCollaborators(sets(["bob"], ["alice", "bob"]), "me"),
    ]).toEqual(["bob"]);
  });

  it("AC-C: a hidden bucket that wasn't in the lock list ends up locked", () => {
    expect([...unlockVisibleCollaborators(sets(["bob"]), "me")]).toEqual([
      "bob",
    ]);
  });

  it("AC-H: never locks me, even when I'm hidden", () => {
    expect([...unlockVisibleCollaborators(sets(["me"]), "me")]).toEqual([]);
  });
});

describe("getSelfCreatorId", () => {
  it("AC-H: returns the current user's client id", () => {
    expect(getSelfCreatorId({ collaborators })).toBe("me");
  });

  it("returns null without a current user", () => {
    expect(
      getSelfCreatorId({ collaborators: new Map([["s", { id: "alice" }]]) }),
    ).toBe(null);
  });

  it("returns null when the current user has no client id yet", () => {
    expect(
      getSelfCreatorId({
        collaborators: new Map([["s", { isCurrentUser: true }]]),
      }),
    ).toBe(null);
  });

  it("returns null outside of a room (no collaborators)", () => {
    expect(getSelfCreatorId({})).toBe(null);
  });
});

describe("isElementInteractive", () => {
  const state = (hidden: string[] = [], locked: string[] = []) => ({
    ...sets(hidden, locked),
    collaborators,
  });

  it("AC-D: an element of a locked collaborator is not interactive", () => {
    const rect = createRect("alice");
    expect(
      isElementInteractive(rect, arrayToMap([rect]), state([], ["alice"])),
    ).toBe(false);
  });

  it("(control) an element of an unlocked collaborator is interactive", () => {
    const rect = createRect("alice");
    expect(isElementInteractive(rect, arrayToMap([rect]), state())).toBe(true);
  });

  it("AC-H: my own element stays interactive even if I'm in the lock list", () => {
    const rect = createRect("me");
    expect(
      isElementInteractive(rect, arrayToMap([rect]), state([], ["me"])),
    ).toBe(true);
  });

  it("AC-A (misc): an untagged element follows the miscellaneous bucket's lock", () => {
    const rect = createRect();
    expect(
      isElementInteractive(
        rect,
        arrayToMap([rect]),
        state([], [UNKNOWN_CREATOR_ID]),
      ),
    ).toBe(false);
  });

  it("AC-A (misc): a never-seen creator's element follows the miscellaneous bucket's lock", () => {
    const rect = createRect("dave");
    expect(
      isElementInteractive(rect, arrayToMap([rect]), {
        ...state([], [UNKNOWN_CREATOR_ID]),
        collaboratorDirectory: new Map([["alice", {}]]),
      }),
    ).toBe(false);
  });

  it("AC-D: a label follows its container's lock, not its own creator's", () => {
    const container = createRect("alice");
    const label = newTextElement({
      text: "label",
      x: 0,
      y: 0,
      containerId: container.id,
      customData: { [CREATOR_ID_KEY]: "me" },
    });
    expect(
      isElementInteractive(
        label,
        arrayToMap([container, label]),
        state([], ["alice"]),
      ),
    ).toBe(false);
  });
});

describe("excludeNonInteractiveElements", () => {
  const me = createRect("me");
  const alice = createRect("alice");
  const bob = createRect("bob");
  const elements = [me, alice, bob];

  it("returns the same array when nobody is hidden or locked", () => {
    expect(
      excludeNonInteractiveElements(elements, { ...sets(), collaborators }),
    ).toBe(elements);
  });

  it("AC-D: drops locked collaborators' elements", () => {
    expect(
      excludeNonInteractiveElements(elements, {
        ...sets([], ["alice"]),
        collaborators,
      }),
    ).toEqual([me, bob]);
  });

  it("AC-C: drops hidden collaborators' elements", () => {
    expect(
      excludeNonInteractiveElements(elements, {
        ...sets(["bob"]),
        collaborators,
      }),
    ).toEqual([me, alice]);
  });

  it("AC-H: keeps my own elements even if I'm in the lock list", () => {
    expect(
      excludeNonInteractiveElements(elements, {
        ...sets([], ["me", "alice", "bob"]),
        collaborators,
      }),
    ).toEqual([me]);
  });
});
