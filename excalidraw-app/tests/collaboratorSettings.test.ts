/**
 * Issue #83 — the collaborator dropdown's saved settings
 * (`collab/collaboratorSettings.ts`). Expected values come from the
 * acceptance criteria in #83 and its Design comment, not from running the
 * implementation:
 *
 * - F: the newcomer default, hidden collaborators, locked collaborators, the
 *   Layering switch and the layer order are restored as I left them. The
 *   newcomer default is one preference for all rooms; the rest is per room
 * - I: unreadable data or data from an older version is ignored without
 *   errors, falling back to the defaults; hiding my own drawings is never
 *   restored
 * - A: the newcomer default's default is Locked
 * - Design comment: one versioned localStorage entry next to #116's
 *   directory; collaborators who never return are kept (and ignored if
 *   unknown)
 * - defaults otherwise (#116, #81, #82): nobody hidden or locked, layering
 *   off, no stored layer order
 */
import { vi } from "vitest";

import { STORAGE_KEYS } from "../app_constants";
import {
  loadCollaboratorSettings,
  saveCollaboratorSettings,
} from "../collab/collaboratorSettings";

const KEY = STORAGE_KEYS.LOCAL_STORAGE_COLLABORATOR_SETTINGS;

const DEFAULTS = {
  newCollaboratorDefault: "locked",
  hiddenCollaboratorIds: new Set(),
  lockedCollaboratorIds: new Set(),
  collaboratorLayeringEnabled: false,
  collaboratorLayerOrder: null,
};

/** every setting changed from its default */
const CHANGED = {
  newCollaboratorDefault: "hidden" as const,
  hiddenCollaboratorIds: new Set(["bob"]),
  lockedCollaboratorIds: new Set(["alice", "bob"]),
  collaboratorLayeringEnabled: true,
  collaboratorLayerOrder: ["alice", "me", "bob", "__unknown__"],
};

const readStored = () => JSON.parse(localStorage.getItem(KEY)!);
const writeStored = (value: unknown) =>
  localStorage.setItem(KEY, JSON.stringify(value));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("collaborator settings — Criteria F (remembered)", () => {
  it("AC-F: every setting round-trips as I left it", () => {
    saveCollaboratorSettings("room-a", CHANGED, "me");
    expect(loadCollaboratorSettings("room-a", "me")).toEqual(CHANGED);
  });

  it("AC-F: hidden and locked collaborators come back as sets", () => {
    saveCollaboratorSettings("room-a", CHANGED, "me");
    const loaded = loadCollaboratorSettings("room-a", "me");
    expect(loaded.hiddenCollaboratorIds).toBeInstanceOf(Set);
    expect(loaded.lockedCollaboratorIds).toBeInstanceOf(Set);
  });

  it("AC-F: the newcomer default is one preference for all rooms", () => {
    saveCollaboratorSettings(
      "room-a",
      { ...DEFAULTS, newCollaboratorDefault: "visible" } as any,
      "me",
    );
    expect(loadCollaboratorSettings("room-b", "me")).toEqual({
      ...DEFAULTS,
      newCollaboratorDefault: "visible",
    });
  });

  it("AC-F: hidden, locked, the Layering switch and the order are saved per room", () => {
    saveCollaboratorSettings("room-a", CHANGED, "me");
    saveCollaboratorSettings(
      "room-b",
      {
        ...CHANGED,
        hiddenCollaboratorIds: new Set(["carol"]),
        lockedCollaboratorIds: new Set(["carol"]),
        collaboratorLayeringEnabled: false,
        collaboratorLayerOrder: null,
      },
      "me",
    );

    expect(loadCollaboratorSettings("room-a", "me")).toEqual(CHANGED);
    expect(loadCollaboratorSettings("room-b", "me")).toEqual({
      ...CHANGED,
      hiddenCollaboratorIds: new Set(["carol"]),
      lockedCollaboratorIds: new Set(["carol"]),
      collaboratorLayeringEnabled: false,
      collaboratorLayerOrder: null,
    });
  });

  it("AC-F: a room's settings don't carry into a room never saved", () => {
    saveCollaboratorSettings("room-a", CHANGED, "me");
    expect(loadCollaboratorSettings("room-new", "me")).toEqual({
      ...DEFAULTS,
      // the one global preference
      newCollaboratorDefault: "hidden",
    });
  });

  it("Design: sets are stored as plain arrays in one versioned entry", () => {
    saveCollaboratorSettings("room-a", CHANGED, "me");
    const stored = readStored();
    expect(typeof stored.version).toBe("number");
    expect(JSON.stringify(stored)).toContain('["bob"]');
    expect(JSON.stringify(stored)).toContain('["alice","bob"]');
  });

  it("Design: collaborators who never returned are kept in the room's entry", () => {
    saveCollaboratorSettings(
      "room-a",
      { ...CHANGED, hiddenCollaboratorIds: new Set(["long-gone"]) },
      "me",
    );
    expect(
      loadCollaboratorSettings("room-a", "me").hiddenCollaboratorIds,
    ).toEqual(new Set(["long-gone"]));
  });

  it("Design: keeps only the 20 most recently used rooms, like #116's directory", () => {
    // one save per millisecond, so "most recently used" is well defined
    const now = vi.spyOn(Date, "now");
    for (let i = 0; i < 25; i++) {
      now.mockReturnValue(1_000_000 + i);
      saveCollaboratorSettings(`room-${i}`, CHANGED, "me");
    }
    // the room saved last is always kept, the oldest is dropped
    expect(loadCollaboratorSettings("room-24", "me")).toEqual(CHANGED);
    expect(loadCollaboratorSettings("room-0", "me")).toEqual({
      ...DEFAULTS,
      newCollaboratorDefault: "hidden",
    });
  });
});

describe("collaborator settings — Criteria I (safe restore)", () => {
  it("(control) hiding a collaborator other than me is restored", () => {
    saveCollaboratorSettings(
      "room-a",
      { ...CHANGED, hiddenCollaboratorIds: new Set(["alice"]) },
      "me",
    );
    expect(
      loadCollaboratorSettings("room-a", "me").hiddenCollaboratorIds,
    ).toEqual(new Set(["alice"]));
  });

  it("AC-I: hiding my own drawings is not restored", () => {
    saveCollaboratorSettings(
      "room-a",
      { ...CHANGED, hiddenCollaboratorIds: new Set(["me", "alice"]) },
      "me",
    );
    expect(
      loadCollaboratorSettings("room-a", "me").hiddenCollaboratorIds,
    ).toEqual(new Set(["alice"]));
  });

  it("AC-I: my own id saved as hidden (e.g. saved without knowing me) is dropped on load", () => {
    saveCollaboratorSettings(
      "room-a",
      { ...CHANGED, hiddenCollaboratorIds: new Set(["me", "alice"]) },
      null,
    );
    expect(
      loadCollaboratorSettings("room-a", "me").hiddenCollaboratorIds,
    ).toEqual(new Set(["alice"]));
  });

  it("AC-I: nothing saved → the defaults (newcomers Locked)", () => {
    expect(loadCollaboratorSettings("room-a", "me")).toEqual(DEFAULTS);
  });

  it("AC-I: unreadable data → the defaults, without throwing", () => {
    localStorage.setItem(KEY, "not json");
    expect(loadCollaboratorSettings("room-a", "me")).toEqual(DEFAULTS);

    writeStored(["not", "settings"]);
    expect(loadCollaboratorSettings("room-a", "me")).toEqual(DEFAULTS);

    writeStored(null);
    expect(loadCollaboratorSettings("room-a", "me")).toEqual(DEFAULTS);
  });

  it("AC-I: data from an older version → the defaults", () => {
    saveCollaboratorSettings("room-a", CHANGED, "me");
    const stored = readStored();

    writeStored({ ...stored, version: stored.version - 1 });
    expect(loadCollaboratorSettings("room-a", "me")).toEqual(DEFAULTS);

    // failsafe: doesn't depend on the current version number
    writeStored({ ...stored, version: 0 });
    expect(loadCollaboratorSettings("room-a", "me")).toEqual(DEFAULTS);

    const { version: _version, ...withoutVersion } = stored;
    writeStored(withoutVersion);
    expect(loadCollaboratorSettings("room-a", "me")).toEqual(DEFAULTS);
  });

  it("AC-I: settings with the wrong shape fall back to their defaults", () => {
    saveCollaboratorSettings("room-a", CHANGED, "me");
    const stored = readStored();
    writeStored({
      ...stored,
      newcomerDefault: "purple",
      rooms: {
        "room-a": {
          updated: 1,
          hidden: "bob",
          locked: [1, 2],
          layeringEnabled: "yes",
          layerOrder: { 0: "alice" },
        },
      },
    });
    expect(loadCollaboratorSettings("room-a", "me")).toEqual(DEFAULTS);
  });

  it("AC-I: a broken room list keeps the newcomer default", () => {
    saveCollaboratorSettings("room-a", CHANGED, "me");
    writeStored({ ...readStored(), rooms: "broken" });
    expect(loadCollaboratorSettings("room-a", "me")).toEqual({
      ...DEFAULTS,
      newCollaboratorDefault: "hidden",
    });
  });

  it("AC-I: saving doesn't throw when storage is unavailable", () => {
    // (the test setup's localStorage is a plain object, so spy on it directly)
    const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() =>
      saveCollaboratorSettings("room-a", CHANGED, "me"),
    ).not.toThrow();
    expect(setItem).toHaveBeenCalled();
  });

  it("AC-I: loading doesn't throw when storage is unavailable", () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadCollaboratorSettings("room-a", "me")).toEqual(DEFAULTS);
  });
});
