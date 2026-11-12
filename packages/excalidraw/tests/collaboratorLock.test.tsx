/**
 * Issue #81 — per-collaborator lock (visible but non-interactive).
 *
 * State-logic tests for Criteria A, B, C, G, H and the unknown /
 * miscellaneous bucket. Every expected value below is derived from the
 * acceptance criteria in #81, not from running the implementation.
 */
import { KEYS } from "@excalidraw/common";
import { CREATOR_ID_KEY, UNKNOWN_CREATOR_ID } from "@excalidraw/element";
import { newElementWith } from "@excalidraw/element";
import { assert } from "vitest";

import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
} from "@excalidraw/element/types";

import {
  clearAppStateForDatabase,
  clearAppStateForLocalStorage,
  cleanAppStateForExport,
} from "../appState";
import { restoreAppState } from "../data/restore";
import { Excalidraw } from "../index";
import {
  getBulkLockAvailability,
  getCollaboratorVisibilityRows,
} from "../scene/visibility";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import {
  act,
  fireEvent,
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
  unmountComponent,
  waitFor,
} from "./test-utils";

import type { ActionName } from "../actions/types";
import type { CollaboratorVisibilityRow } from "../scene/visibility";
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

describe("collaborator lock — bulk button availability (getBulkLockAvailability)", () => {
  const row = (
    id: string,
    flags: { isLocked?: boolean; isLockDisabled?: boolean } = {},
  ): CollaboratorVisibilityRow => ({
    id,
    username: id,
    isCurrentUser: false,
    isHidden: false,
    isLocked: false,
    isLockDisabled: false,
    drawingsCount: 0,
    ...flags,
  });

  const availability = (
    others: CollaboratorVisibilityRow[],
    misc = row(UNKNOWN_CREATOR_ID),
  ) =>
    getBulkLockAvailability({
      // my own row: never lockable
      inRoom: [row("me", { isLockDisabled: true }), ...others],
      previouslySeen: [],
      miscellaneous: misc,
    });

  it("AC-B: with a visible, unlocked collaborator only Lock all applies", () => {
    expect(availability([row("alice")])).toEqual({
      canLockAll: true,
      canUnlockAll: false,
    });
  });

  it("AC-B: with every visible collaborator locked only Unlock all applies", () => {
    expect(
      availability(
        [row("alice", { isLocked: true })],
        row(UNKNOWN_CREATOR_ID, { isLocked: true }),
      ),
    ).toEqual({ canLockAll: false, canUnlockAll: true });
  });

  it("AC-B: with visible locked and unlocked collaborators both apply", () => {
    expect(availability([row("alice", { isLocked: true })])).toEqual({
      canLockAll: true,
      canUnlockAll: true,
    });
  });

  it("AC-C: hidden collaborators (locked, can't change) count for neither", () => {
    const hidden = { isLocked: true, isLockDisabled: true };
    expect(
      availability([row("alice", hidden)], row(UNKNOWN_CREATOR_ID, hidden)),
    ).toEqual({ canLockAll: false, canUnlockAll: false });
  });

  it("AC-H: my own row counts for neither", () => {
    expect(
      getBulkLockAvailability({
        inRoom: [row("me", { isLockDisabled: true })],
        previouslySeen: [],
        miscellaneous: row(UNKNOWN_CREATOR_ID, {
          isLocked: true,
          isLockDisabled: true,
        }),
      }),
    ).toEqual({ canLockAll: false, canUnlockAll: false });
  });

  it("AC-B: previously seen collaborators count too", () => {
    expect(
      getBulkLockAvailability({
        inRoom: [row("me", { isLockDisabled: true })],
        previouslySeen: [row("carol")],
        miscellaneous: row(UNKNOWN_CREATOR_ID, {
          isLocked: true,
          isLockDisabled: true,
        }),
      }).canLockAll,
    ).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Enforcement (Criteria D, E, F, plus H at the interaction level)
// -----------------------------------------------------------------------------

describe("collaborator lock — enforcement", () => {
  const mouse = new Pointer("mouse");

  // solid fill so clicking the interior counts as a hit
  const createSolidRect = (
    id: string,
    x: number,
    extra: { groupIds?: string[]; y?: number } = {},
  ) =>
    API.createElement({
      type: "rectangle",
      id,
      x,
      y: extra.y ?? 0,
      width: 100,
      height: 100,
      backgroundColor: "red",
      fillStyle: "solid",
      groupIds: extra.groupIds ?? [],
    });

  const getElement = (id: string) => h.elements.find((el) => el.id === id)!;

  const getNonDeleted = (id: string) =>
    h.app.scene.getNonDeletedElementsMap().get(id)!;

  const getSelectedIds = () =>
    API.getSelectedElements()
      .map((el) => el.id)
      .sort();

  /** position, size, rotation and deletion — what E says can't change */
  const getGeometry = (id: string) => {
    const { x, y, width, height, angle, isDeleted } = getElement(id);
    return { x, y, width, height, angle, isDeleted };
  };

  const getVersions = () =>
    h.elements.map(({ id, version, versionNonce }) => ({
      id,
      version,
      versionNonce,
    }));

  const lockAlice = () => execute("toggleCollaboratorLock", "alice");

  // me-rect: x 0–100 (mine) · alice-rect: x 200–300 (alice, the one locked)
  beforeEach(() => {
    API.setElements([
      stamp(createSolidRect("me-rect", 0), "me"),
      stamp(createSolidRect("alice-rect", 200), "alice"),
    ]);
  });

  afterEach(() => {
    mouse.reset();
  });

  describe("Criteria D (selection)", () => {
    it("(control) clicking an unlocked collaborator's element selects it", () => {
      mouse.clickAt(250, 50);
      expect(getSelectedIds()).toEqual(["alice-rect"]);
    });

    it("AC-D: clicking a locked element selects nothing (like empty canvas)", () => {
      lockAlice();
      mouse.clickAt(250, 50);
      expect(getSelectedIds()).toEqual([]);
    });

    it("AC-D: clicking a locked element selects the unlocked element underneath it", () => {
      // carol's rect sits under alice's (earlier in z-order), same position
      API.setElements([
        stamp(createSolidRect("carol-under", 200), "carol"),
        stamp(createSolidRect("alice-rect", 200), "alice"),
      ]);
      lockAlice();

      mouse.clickAt(250, 50);
      expect(getSelectedIds()).toEqual(["carol-under"]);
    });

    // same gesture as #116's box-select (moves past the drag threshold)
    const boxSelectBoth = () => {
      mouse.downAt(-50, -50);
      mouse.move(-1000, -1000);
      mouse.moveTo(350, 150);
      mouse.up();
    };

    it("(control) a marquee over both selects both", () => {
      boxSelectBoth();
      expect(getSelectedIds()).toEqual(["alice-rect", "me-rect"]);
    });

    it("AC-D: a marquee over locked and unlocked elements selects only the unlocked ones", () => {
      lockAlice();
      boxSelectBoth();
      expect(getSelectedIds()).toEqual(["me-rect"]);
    });

    it("AC-D: Select All (Ctrl/Cmd+A) skips locked elements", () => {
      lockAlice();
      Keyboard.withModifierKeys({ ctrl: true }, () => {
        Keyboard.keyPress(KEYS.A);
      });
      expect(getSelectedIds()).toEqual(["me-rect"]);
    });

    it("AC-D: locking a collaborator deselects their selected elements", () => {
      API.setSelectedElements([...h.app.scene.getNonDeletedElements()]);
      expect(getSelectedIds()).toEqual(["alice-rect", "me-rect"]);

      lockAlice();
      expect(getSelectedIds()).toEqual(["me-rect"]);
    });

    it("AC-D: a locked element can't be selected even when the selection is set directly", () => {
      lockAlice();
      API.setSelectedElements([getNonDeleted("alice-rect")]);
      expect(getSelectedIds()).toEqual([]);
    });

    it("AC-D: selecting my member of a mixed group never selects the locked member", () => {
      API.setElements([
        stamp(createSolidRect("me-rect", 0, { groupIds: ["g"] }), "me"),
        stamp(createSolidRect("alice-rect", 200, { groupIds: ["g"] }), "alice"),
      ]);
      lockAlice();

      mouse.clickAt(50, 50);
      expect(getSelectedIds()).toEqual(["me-rect"]);
      expect(h.state.selectedGroupIds).not.toHaveProperty("g");
    });
  });

  describe("Criteria E (changes)", () => {
    it("AC-E: dragging a locked element doesn't move it", () => {
      lockAlice();
      const before = getGeometry("alice-rect");

      mouse.downAt(250, 50);
      mouse.moveTo(300, 100);
      mouse.moveTo(350, 150);
      mouse.upAt(350, 150);

      expect(getGeometry("alice-rect")).toEqual(before);
    });

    it("(control) dragging an unlocked element moves it", () => {
      const before = getGeometry("alice-rect");

      mouse.downAt(250, 50);
      mouse.moveTo(300, 100);
      mouse.moveTo(350, 150);
      mouse.upAt(350, 150);

      expect(getGeometry("alice-rect").x).not.toBe(before.x);
    });

    it("AC-E: arrow keys after Select All move my elements but not locked ones", () => {
      lockAlice();
      const aliceBefore = getGeometry("alice-rect");
      const meBefore = getGeometry("me-rect");

      Keyboard.withModifierKeys({ ctrl: true }, () => {
        Keyboard.keyPress(KEYS.A);
      });
      Keyboard.keyPress(KEYS.ARROW_RIGHT);

      expect(getGeometry("alice-rect")).toEqual(aliceBefore);
      expect(getGeometry("me-rect").x).toBeGreaterThan(meBefore.x);
    });

    it("(control) resizing an unlocked element changes its size", () => {
      UI.resize(getElement("alice-rect"), "se", [50, 50]);
      expect(getGeometry("alice-rect").width).not.toBe(100);
    });

    it("AC-E: a locked element can't be resized", () => {
      lockAlice();
      const before = getGeometry("alice-rect");

      UI.resize(getElement("alice-rect"), "se", [50, 50]);

      expect(getGeometry("alice-rect")).toEqual(before);
    });

    it("(control) rotating an unlocked element changes its angle", () => {
      UI.rotate(getElement("alice-rect"), [100, 100]);
      expect(getGeometry("alice-rect").angle).not.toBe(0);
    });

    it("AC-E: a locked element can't be rotated", () => {
      lockAlice();
      const before = getGeometry("alice-rect");

      UI.rotate(getElement("alice-rect"), [100, 100]);

      expect(getGeometry("alice-rect")).toEqual(before);
    });

    it("AC-E: Select All + Delete deletes my elements but not locked ones", () => {
      lockAlice();
      Keyboard.withModifierKeys({ ctrl: true }, () => {
        Keyboard.keyPress(KEYS.A);
      });
      Keyboard.keyPress(KEYS.DELETE);

      expect(getElement("me-rect").isDeleted).toBe(true);
      expect(getElement("alice-rect").isDeleted).toBe(false);
    });

    it("AC-E: Delete can't remove a locked element selected directly", () => {
      lockAlice();
      API.setSelectedElements([getNonDeleted("alice-rect")]);
      Keyboard.keyPress(KEYS.DELETE);

      expect(getElement("alice-rect").isDeleted).toBe(false);
    });

    // Same gesture as #116's eraser tests: from just outside into a shape at
    // x 0–100. The eraser only considers on-screen elements and the jsdom
    // viewport is 0×0, so the shape being erased must sit at the origin.
    const eraseThroughOrigin = () => {
      UI.clickTool("eraser");
      mouse.downAt(-20, 50);
      mouse.moveTo(20, 50);
      mouse.moveTo(60, 50);
      mouse.upAt(60, 50);
    };

    const aliceAtOrigin = () =>
      API.setElements([stamp(createSolidRect("alice-rect", 0), "alice")]);

    it("(control) the eraser erases an unlocked collaborator's element", () => {
      aliceAtOrigin();
      eraseThroughOrigin();
      expect(getElement("alice-rect").isDeleted).toBe(true);
    });

    it("AC-E: the eraser can't erase a locked element", () => {
      aliceAtOrigin();
      lockAlice();
      eraseThroughOrigin();
      expect(getElement("alice-rect").isDeleted).toBe(false);
    });

    it("AC-E: with a collaborator locked, the eraser still erases my elements", () => {
      lockAlice();
      eraseThroughOrigin();
      expect(getElement("me-rect").isDeleted).toBe(true);
    });

    describe("mixed-collaborator group", () => {
      beforeEach(() => {
        API.setElements([
          stamp(createSolidRect("me-rect", 0, { groupIds: ["g"] }), "me"),
          stamp(
            createSolidRect("alice-rect", 200, { groupIds: ["g"] }),
            "alice",
          ),
        ]);
      });

      it("(control) erasing my member erases the whole group", () => {
        eraseThroughOrigin();
        expect(getElement("me-rect").isDeleted).toBe(true);
        expect(getElement("alice-rect").isDeleted).toBe(true);
      });

      it("AC-E: erasing my member never erases the locked member", () => {
        lockAlice();
        eraseThroughOrigin();
        expect(getElement("me-rect").isDeleted).toBe(true);
        expect(getElement("alice-rect").isDeleted).toBe(false);
      });
    });

    describe("text editing by double-click", () => {
      const aliceText = () =>
        stamp(
          API.createElement({
            type: "text",
            id: "alice-text",
            text: "hello",
            x: 400,
            y: 0,
          }),
          "alice",
        );

      it("(control) double-clicking an unlocked text element edits it", () => {
        API.setElements([aliceText()]);
        mouse.doubleClickOn(getElement("alice-text"));
        expect(h.state.editingTextElement?.id).toBe("alice-text");
      });

      it("AC-E: double-clicking a locked text element doesn't edit it", () => {
        API.setElements([aliceText()]);
        lockAlice();

        mouse.doubleClickOn(getElement("alice-text"));

        expect(h.state.editingTextElement?.id).not.toBe("alice-text");
      });

      it("(control) double-clicking an unlocked shape adds a label to it", () => {
        mouse.doubleClickAt(250, 50);
        expect(h.state.editingTextElement?.containerId).toBe("alice-rect");
      });

      it("AC-E: double-clicking a locked shape doesn't add a label to it", () => {
        lockAlice();
        const before = getElement("alice-rect").boundElements;

        mouse.doubleClickAt(250, 50);

        expect(h.state.editingTextElement?.containerId ?? null).toBe(null);
        expect(getElement("alice-rect").boundElements).toEqual(before);
      });
    });

    describe("arrow binding (amended AC-E: still allowed, by visibility)", () => {
      const getArrow = () =>
        h.elements.find(
          (el): el is ExcalidrawArrowElement =>
            el.type === "arrow" && !el.isDeleted,
        )!;

      const drawArrowFromMeToAlice = () => {
        UI.clickTool("arrow");
        mouse.downAt(50, 50);
        mouse.moveTo(150, 50);
        mouse.moveTo(250, 50);
        mouse.upAt(250, 50);
      };

      it("AC-E (amended): a new arrow can still bind to a locked element", () => {
        lockAlice();
        drawArrowFromMeToAlice();
        expect(getArrow().endBinding?.elementId).toBe("alice-rect");
      });

      it("AC-E (amended): binding to a locked element doesn't move, resize, or rotate it", () => {
        lockAlice();
        const before = getGeometry("alice-rect");

        drawArrowFromMeToAlice();

        expect(getGeometry("alice-rect")).toEqual(before);
      });

      it("AC-C: a new arrow can't bind to a hidden (and so non-interactive) element", () => {
        execute("toggleCollaboratorVisibility", "alice");
        drawArrowFromMeToAlice();
        expect(getArrow().endBinding).toBeNull();
      });
    });
  });

  describe("Criteria C (enforcement)", () => {
    it("AC-C: a hidden collaborator is non-interactive even if they're not in the lock list", () => {
      act(() => {
        API.setAppState({
          hiddenCollaboratorIds: new Set(["alice"]),
          lockedCollaboratorIds: new Set(),
        });
      });
      Keyboard.withModifierKeys({ ctrl: true }, () => {
        Keyboard.keyPress(KEYS.A);
      });
      expect(getSelectedIds()).toEqual(["me-rect"]);
    });

    it("AC-C: shown again after hiding, a collaborator's elements still can't be selected", () => {
      execute("toggleCollaboratorVisibility", "alice");
      execute("toggleCollaboratorVisibility", "alice");

      mouse.clickAt(250, 50);
      expect(getSelectedIds()).toEqual([]);
    });
  });

  describe("Criteria H (enforcement)", () => {
    it("AC-H: my own elements stay selectable even if my id is put on the lock list", () => {
      act(() => {
        API.setAppState({ lockedCollaboratorIds: new Set(["me"]) });
      });
      mouse.clickAt(50, 50);
      expect(getSelectedIds()).toEqual(["me-rect"]);
    });

    it("AC-H: Lock all leaves my own elements interactive", () => {
      execute("lockAllCollaborators");
      Keyboard.withModifierKeys({ ctrl: true }, () => {
        Keyboard.keyPress(KEYS.A);
      });
      expect(getSelectedIds()).toEqual(["me-rect"]);
    });
  });

  describe("Criteria F (shared-state integrity, editor side)", () => {
    it("AC-F: locking and unlocking change no element versions", () => {
      const before = getVersions();

      lockAlice();
      execute("lockAllCollaborators");
      execute("unlockAllCollaborators");
      execute("toggleCollaboratorLock", UNKNOWN_CREATOR_ID);

      expect(getVersions()).toEqual(before);
    });

    it("AC-F: locking deselects without changing any element", () => {
      API.setSelectedElements([getNonDeleted("alice-rect")]);
      const before = getVersions();

      lockAlice();

      expect(getSelectedIds()).toEqual([]);
      expect(getVersions()).toEqual(before);
    });

    it("AC-F: lock actions add no undo history entries", () => {
      const undoStackSize = API.getUndoStack().length;

      lockAlice();
      execute("lockAllCollaborators");
      execute("unlockAllCollaborators");

      expect(API.getUndoStack().length).toBe(undoStackSize);
    });
  });
});

// -----------------------------------------------------------------------------
// UI (Criteria A, B, C, H in the collaborator dropdown, desktop and phone)
// -----------------------------------------------------------------------------

describe("collaborator lock — dropdown UI", () => {
  const openMenu = (scope: ParentNode = document) => {
    fireEvent.click(
      scope.querySelector<HTMLElement>(
        "[data-testid='collaborator-visibility-trigger']",
      )!,
    );
  };

  const queryVisibilityToggle = (id: string) =>
    document.querySelector<HTMLButtonElement>(
      `[data-testid='collaborator-visibility-row-${id}']`,
    );

  const queryLockToggle = (id: string) =>
    document.querySelector<HTMLButtonElement>(
      `[data-testid='collaborator-lock-row-${id}']`,
    );

  const getButton = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === label,
    )!;

  const isPressed = (button: HTMLElement | null) =>
    button?.getAttribute("aria-pressed") === "true";

  describe("desktop", () => {
    beforeEach(() => {
      openMenu();
    });

    it("AC-A: every listed collaborator, including miscellaneous, has a lock toggle next to their visibility toggle", () => {
      for (const id of ["me", "alice", "carol", UNKNOWN_CREATOR_ID]) {
        const lockToggle = queryLockToggle(id);
        expect(lockToggle).not.toBe(null);
        // same row: the lock toggle sits beside the visibility toggle
        expect(lockToggle!.parentElement).toBe(
          queryVisibilityToggle(id)!.parentElement,
        );
      }
    });

    it("AC-A: clicking a lock toggle locks the collaborator, clicking again unlocks them", () => {
      fireEvent.click(queryLockToggle("alice")!);
      expect(lockedIds()).toEqual(["alice"]);
      expect(isPressed(queryLockToggle("alice"))).toBe(true);

      fireEvent.click(queryLockToggle("alice")!);
      expect(lockedIds()).toEqual([]);
      expect(isPressed(queryLockToggle("alice"))).toBe(false);
    });

    it("AC-A: locking from the dropdown keeps the collaborator visible", () => {
      fireEvent.click(queryLockToggle("alice")!);
      expect(isPressed(queryVisibilityToggle("alice"))).toBe(true);
      expect(hiddenIds()).toEqual([]);
    });

    it("AC-A (misc): the miscellaneous row's lock toggle locks the miscellaneous bucket", () => {
      fireEvent.click(queryLockToggle(UNKNOWN_CREATOR_ID)!);
      expect(lockedIds()).toEqual([UNKNOWN_CREATOR_ID]);
      expect(isPressed(queryLockToggle(UNKNOWN_CREATOR_ID))).toBe(true);
    });

    it("AC-B: Lock all locks every listed collaborator (except me)", () => {
      fireEvent.click(getButton("Lock all"));
      expect(lockedIds()).toEqual(OTHERS);
      for (const id of OTHERS) {
        expect(isPressed(queryLockToggle(id))).toBe(true);
      }
    });

    it("AC-B: Unlock all unlocks every visible collaborator", () => {
      fireEvent.click(getButton("Lock all"));
      fireEvent.click(getButton("Unlock all"));
      expect(lockedIds()).toEqual([]);
    });

    it("AC-B: Unlock all is disabled while no visible collaborator is locked", () => {
      expect(getButton("Unlock all").disabled).toBe(true);

      fireEvent.click(queryLockToggle("alice")!);
      expect(getButton("Unlock all").disabled).toBe(false);
    });

    it("(control) Lock all is enabled while a visible collaborator is unlocked", () => {
      expect(getButton("Lock all").disabled).toBe(false);
    });

    it("AC-B: Lock all is disabled once every visible collaborator is locked", () => {
      fireEvent.click(getButton("Lock all"));
      expect(getButton("Lock all").disabled).toBe(true);

      fireEvent.click(queryLockToggle("alice")!);
      expect(getButton("Lock all").disabled).toBe(false);
    });

    it("AC-B + AC-C: after Hide all, neither Lock all nor Unlock all can be used", () => {
      fireEvent.click(getButton("Hide all"));

      expect(getButton("Lock all").disabled).toBe(true);
      expect(getButton("Unlock all").disabled).toBe(true);
    });

    it("AC-B + AC-C: after Hide all → Show all, only Unlock all can be used", () => {
      fireEvent.click(getButton("Hide all"));
      fireEvent.click(getButton("Show all"));

      expect(getButton("Lock all").disabled).toBe(true);
      expect(getButton("Unlock all").disabled).toBe(false);
    });

    it("AC-B + AC-C: Lock all stays enabled while one collaborator is hidden and another is visible and unlocked", () => {
      fireEvent.click(queryVisibilityToggle("carol")!);
      expect(getButton("Lock all").disabled).toBe(false);
    });

    it("AC-B + AC-C: Unlock all is disabled when the only locked collaborators are hidden", () => {
      fireEvent.click(queryVisibilityToggle("carol")!);
      expect(getButton("Unlock all").disabled).toBe(true);
    });

    it("AC-B: Unlock all leaves a hidden collaborator locked", () => {
      fireEvent.click(queryLockToggle("alice")!);
      fireEvent.click(queryVisibilityToggle("carol")!);

      fireEvent.click(getButton("Unlock all"));

      expect(isPressed(queryLockToggle("alice"))).toBe(false);
      expect(isPressed(queryLockToggle("carol"))).toBe(true);
      expect(queryLockToggle("carol")!.disabled).toBe(true);
    });

    it("AC-C: hiding a collaborator shows their lock toggle as locked and disables it", () => {
      fireEvent.click(queryVisibilityToggle("alice")!);

      expect(isPressed(queryLockToggle("alice"))).toBe(true);
      expect(queryLockToggle("alice")!.disabled).toBe(true);
    });

    it("AC-C: shown again, they stay locked until I unlock them from the toggle", () => {
      fireEvent.click(queryVisibilityToggle("alice")!);
      fireEvent.click(queryVisibilityToggle("alice")!);

      expect(isPressed(queryLockToggle("alice"))).toBe(true);
      expect(queryLockToggle("alice")!.disabled).toBe(false);

      fireEvent.click(queryLockToggle("alice")!);
      expect(isPressed(queryLockToggle("alice"))).toBe(false);
    });

    it("AC-H: my own lock toggle is disabled and shows unlocked", () => {
      expect(queryLockToggle("me")!.disabled).toBe(true);
      expect(isPressed(queryLockToggle("me"))).toBe(false);
    });
  });

  describe("phone layout", () => {
    beforeAll(() => {
      mockBoundingClientRect({ height: 400, width: 800 });
    });

    afterAll(() => {
      restoreOriginalGetBoundingClientRect();
    });

    it("AC-A + AC-B: the lock toggles and Lock all / Unlock all are in the main menu's collaborator section", async () => {
      act(() => {
        h.app.refreshEditorInterface();
      });
      expect(h.app.editorInterface.formFactor).toBe("phone");

      fireEvent.click(document.querySelector(".main-menu-trigger")!);
      const row = await waitFor(() => {
        const element = document.querySelector(".UserList-Wrapper__row");
        expect(element).not.toBe(null);
        return element!;
      });
      openMenu(row);

      expect(getButton("Lock all")).toBeDefined();
      expect(getButton("Unlock all")).toBeDefined();

      fireEvent.click(queryLockToggle("alice")!);
      expect(lockedIds()).toEqual(["alice"]);
    });
  });
});
