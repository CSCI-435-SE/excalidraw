/**
 * Issue #81 — per-collaborator lock (visible but non-interactive).
 *
 * State-logic tests for Criteria A, B, C, G, H and the unknown /
 * miscellaneous bucket. Every expected value below is derived from the
 * acceptance criteria in #81, not from running the implementation.
 */
import { CREATOR_ID_KEY, UNKNOWN_CREATOR_ID } from "@excalidraw/element";
import { newElementWith } from "@excalidraw/element";
import { assert } from "vitest";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import {
  clearAppStateForDatabase,
  clearAppStateForLocalStorage,
  cleanAppStateForExport,
} from "../appState";
import { restoreAppState } from "../data/restore";
import { Excalidraw } from "../index";
import { getCollaboratorVisibilityRows } from "../scene/visibility";

import { API } from "./helpers/api";
import { act, render, unmountComponent } from "./test-utils";

import type { ActionName } from "../actions/types";
import type { AppState } from "../types";

unmountComponent();

const h = window.h;

const stamp = <T extends ExcalidrawElement>(element: T, creatorId: string) =>
  newElementWith(element as ExcalidrawElement, {
    customData: { [CREATOR_ID_KEY]: creatorId },
  }) as T;

const createRect = (id: string, x: number) =>
  API.createElement({ type: "rectangle", id, x, y: 0, width: 10 });

/**
 * Runs a registered action by name. Looking actions up in the registry
 * (instead of importing them) makes a not-yet-implemented action fail as a
 * readable assertion rather than as a broken import.
 */
const execute = (name: string, value?: string) => {
  const action = h.app.actionManager.actions[name as ActionName];
  assert.isDefined(action, `action "${name}" should be registered`);
  act(() => {
    h.app.actionManager.executeAction(action, "ui", value as any);
  });
};

const lockedIds = () => {
  expect(h.state.lockedCollaboratorIds).toBeInstanceOf(Set);
  return [...h.state.lockedCollaboratorIds].sort();
};

const hiddenIds = () => [...h.state.hiddenCollaboratorIds].sort();

/** every row the dropdown lists, keyed by bucket id */
const getRows = () => {
  const rows = getCollaboratorVisibilityRows(h.elements, h.state);
  return new Map(
    [...rows.inRoom, ...rows.previouslySeen, rows.miscellaneous].map((row) => [
      row.id,
      row,
    ]),
  );
};

const getRow = (id: string) => {
  const row = getRows().get(id);
  assert.isDefined(row, `row "${id}" should be listed`);
  return row!;
};

// Session used by every test:
// - me    : this client (in the room)
// - alice : in the room
// - carol : previously seen (in the directory, no longer live)
// - misc  : untagged elements + "dave", a creator this client never saw
const collaborators = new Map([
  ["my-socket", { id: "me", username: "Me", isCurrentUser: true }],
  ["alice-socket", { id: "alice", username: "Alice" }],
]) as unknown as AppState["collaborators"];

const collaboratorDirectory = new Map([
  ["me", { username: "Me", lastSeen: 3 }],
  ["alice", { username: "Alice", lastSeen: 3 }],
  ["carol", { username: "Carol", lastSeen: 2 }],
]);

/** the buckets the dropdown lists for this session, other than me */
const OTHERS = ["alice", "carol", UNKNOWN_CREATOR_ID].sort();

beforeEach(async () => {
  await render(<Excalidraw handleKeyboardGlobally={true} />);
  API.setElements([
    stamp(createRect("me-rect", 0), "me"),
    stamp(createRect("alice-rect", 20), "alice"),
    stamp(createRect("carol-rect", 40), "carol"),
    stamp(createRect("dave-rect", 60), "dave"),
    createRect("legacy-rect", 80),
  ]);
  act(() => {
    h.app.updateScene({ collaborators });
    API.setAppState({ collaboratorDirectory });
  });
});

describe("collaborator lock — Criteria A (per-collaborator toggle)", () => {
  it("AC-A: nobody is locked by default", () => {
    expect(lockedIds()).toEqual([]);
    for (const id of ["me", "alice", "carol", UNKNOWN_CREATOR_ID]) {
      expect(getRow(id).isLocked).toBe(false);
    }
  });

  it("AC-A: toggling a collaborator's lock locks them, toggling again unlocks them", () => {
    execute("toggleCollaboratorLock", "alice");
    expect(lockedIds()).toEqual(["alice"]);
    expect(getRow("alice").isLocked).toBe(true);

    execute("toggleCollaboratorLock", "alice");
    expect(lockedIds()).toEqual([]);
    expect(getRow("alice").isLocked).toBe(false);
  });

  it("AC-A: locking leaves the collaborator visible", () => {
    execute("toggleCollaboratorLock", "alice");
    expect(hiddenIds()).toEqual([]);
    expect(getRow("alice").isHidden).toBe(false);
  });

  it("AC-A: locking one collaborator doesn't lock anyone else", () => {
    execute("toggleCollaboratorLock", "carol");
    expect(lockedIds()).toEqual(["carol"]);
    expect(getRow("alice").isLocked).toBe(false);
    expect(getRow(UNKNOWN_CREATOR_ID).isLocked).toBe(false);
  });

  it("AC-A: a visible collaborator's lock toggle is enabled", () => {
    expect(getRow("alice").isLockDisabled).toBe(false);
    expect(getRow("carol").isLockDisabled).toBe(false);
  });
});

describe("collaborator lock — unknown / miscellaneous bucket", () => {
  it("AC-A (misc): the miscellaneous bucket can be locked and unlocked like any collaborator", () => {
    execute("toggleCollaboratorLock", UNKNOWN_CREATOR_ID);
    expect(lockedIds()).toEqual([UNKNOWN_CREATOR_ID]);
    expect(getRow(UNKNOWN_CREATOR_ID).isLocked).toBe(true);

    execute("toggleCollaboratorLock", UNKNOWN_CREATOR_ID);
    expect(lockedIds()).toEqual([]);
  });

  it("AC-A (misc): the miscellaneous row's lock toggle is enabled while visible", () => {
    expect(getRow(UNKNOWN_CREATOR_ID).isLockDisabled).toBe(false);
  });

  it("AC-B (misc): Lock all includes the miscellaneous bucket", () => {
    execute("lockAllCollaborators");
    expect(lockedIds()).toContain(UNKNOWN_CREATOR_ID);
  });

  it("AC-C (misc): hiding the miscellaneous bucket shows it locked and disables its toggle", () => {
    execute("toggleCollaboratorVisibility", UNKNOWN_CREATOR_ID);
    expect(getRow(UNKNOWN_CREATOR_ID).isLocked).toBe(true);
    expect(getRow(UNKNOWN_CREATOR_ID).isLockDisabled).toBe(true);
  });
});

describe("collaborator lock — Criteria B (bulk controls)", () => {
  it("AC-B: Lock all locks every listed collaborator (except me, see AC-H)", () => {
    execute("lockAllCollaborators");
    expect(lockedIds()).toEqual(OTHERS);
    for (const id of OTHERS) {
      expect(getRow(id).isLocked).toBe(true);
    }
  });

  it("AC-B: Lock all doesn't hide anyone", () => {
    execute("lockAllCollaborators");
    expect(hiddenIds()).toEqual([]);
  });

  it("AC-B: Unlock all unlocks every visible collaborator", () => {
    execute("lockAllCollaborators");
    execute("unlockAllCollaborators");
    expect(lockedIds()).toEqual([]);
    for (const id of OTHERS) {
      expect(getRow(id).isLocked).toBe(false);
    }
  });

  it("AC-B: Unlock all leaves hidden collaborators non-interactive", () => {
    execute("toggleCollaboratorLock", "alice");
    execute("toggleCollaboratorVisibility", "carol");

    execute("unlockAllCollaborators");

    // alice was visible → unlocked
    expect(getRow("alice").isLocked).toBe(false);
    // carol is hidden → still shown locked (no interactivity without visibility)
    expect(getRow("carol").isLocked).toBe(true);
    expect(getRow("carol").isLockDisabled).toBe(true);
  });

  it("AC-B + AC-C: a collaborator hidden during Unlock all is still locked once shown again", () => {
    execute("toggleCollaboratorVisibility", "carol");
    execute("unlockAllCollaborators");
    execute("toggleCollaboratorVisibility", "carol");

    expect(getRow("carol").isHidden).toBe(false);
    expect(getRow("carol").isLocked).toBe(true);
  });
});

describe("collaborator lock — Criteria C (no interactivity without visibility)", () => {
  it("AC-C: a hidden collaborator's lock toggle shows locked and is disabled", () => {
    execute("toggleCollaboratorVisibility", "alice");
    expect(getRow("alice").isLocked).toBe(true);
    expect(getRow("alice").isLockDisabled).toBe(true);
  });

  it("AC-C: a hidden collaborator can't be unlocked", () => {
    execute("toggleCollaboratorLock", "alice");
    execute("toggleCollaboratorVisibility", "alice");

    execute("toggleCollaboratorLock", "alice");

    expect(getRow("alice").isLocked).toBe(true);
    execute("toggleCollaboratorVisibility", "alice");
    expect(getRow("alice").isLocked).toBe(true);
  });

  it("AC-C: toggling the lock of a hidden, never-locked collaborator changes nothing", () => {
    execute("toggleCollaboratorVisibility", "alice");
    execute("toggleCollaboratorLock", "alice");
    execute("toggleCollaboratorVisibility", "alice");

    // hiding locked them; the ignored toggle didn't flip that
    expect(getRow("alice").isLocked).toBe(true);
  });

  it("AC-C: shown again individually, a collaborator stays locked until I unlock them", () => {
    execute("toggleCollaboratorVisibility", "alice");
    execute("toggleCollaboratorVisibility", "alice");

    expect(getRow("alice").isHidden).toBe(false);
    expect(getRow("alice").isLocked).toBe(true);
    expect(getRow("alice").isLockDisabled).toBe(false);

    execute("toggleCollaboratorLock", "alice");
    expect(getRow("alice").isLocked).toBe(false);
  });

  it("AC-C: after Hide all → Show all, everyone stays locked until I unlock them (except me, see AC-H)", () => {
    execute("hideAllCollaborators");
    execute("showAllCollaborators");

    expect(hiddenIds()).toEqual([]);
    expect(lockedIds()).toEqual(OTHERS);
  });

  it("AC-C: showing a collaborator who was locked before hiding keeps them locked", () => {
    execute("toggleCollaboratorLock", "carol");
    execute("toggleCollaboratorVisibility", "carol");
    execute("toggleCollaboratorVisibility", "carol");

    expect(getRow("carol").isLocked).toBe(true);
  });
});

describe("collaborator lock — Criteria G (local and non-persistent)", () => {
  it("AC-G: lock settings are not saved to local storage", () => {
    execute("toggleCollaboratorLock", "alice");
    expect(clearAppStateForLocalStorage(h.state)).not.toHaveProperty(
      "lockedCollaboratorIds",
    );
  });

  it("AC-G: lock settings are not included in exports", () => {
    execute("toggleCollaboratorLock", "alice");
    expect(cleanAppStateForExport(h.state)).not.toHaveProperty(
      "lockedCollaboratorIds",
    );
  });

  it("AC-G: lock settings are not sent to the server / other collaborators", () => {
    execute("toggleCollaboratorLock", "alice");
    expect(clearAppStateForDatabase(h.state)).not.toHaveProperty(
      "lockedCollaboratorIds",
    );
  });

  it("AC-G: lock settings reset when the page reloads", () => {
    execute("toggleCollaboratorLock", "alice");

    // a reload restores app state from what was saved locally
    const saved = clearAppStateForLocalStorage(h.state);
    const restored = restoreAppState(saved, null);

    expect(restored.lockedCollaboratorIds).toBeInstanceOf(Set);
    expect(restored.lockedCollaboratorIds.size).toBe(0);
  });
});

describe("collaborator lock — Criteria H (my own drawings)", () => {
  it("AC-H: I can't lock myself", () => {
    execute("toggleCollaboratorLock", "me");
    expect(lockedIds()).toEqual([]);
    expect(getRow("me").isLocked).toBe(false);
  });

  it("AC-H: my own row's lock toggle is disabled and shows unlocked", () => {
    expect(getRow("me").isLocked).toBe(false);
    expect(getRow("me").isLockDisabled).toBe(true);
  });

  it("AC-H: Lock all never puts me in the lock list", () => {
    execute("lockAllCollaborators");
    expect(lockedIds()).not.toContain("me");
    expect(getRow("me").isLocked).toBe(false);
  });

  it("AC-H: Hide all → Show all never puts me in the lock list", () => {
    execute("hideAllCollaborators");
    execute("showAllCollaborators");
    expect(lockedIds()).not.toContain("me");
    expect(getRow("me").isLocked).toBe(false);
  });

  it("AC-H: a lock list set from outside never makes my row locked", () => {
    act(() => {
      API.setAppState({ lockedCollaboratorIds: new Set(["me"]) });
    });
    expect(getRow("me").isLocked).toBe(false);
  });
});
