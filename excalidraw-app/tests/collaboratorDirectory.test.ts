import { vi } from "vitest";

import { STORAGE_KEYS } from "../app_constants";
import {
  SIGHTING_REFRESH_MS,
  loadCollaboratorDirectory,
  recordCollaboratorSighting,
  saveCollaboratorDirectory,
} from "../collab/collaboratorDirectory";

const NOW = 1_000_000;

describe("collaborator directory storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips per room", () => {
    saveCollaboratorDirectory(
      "room-a",
      new Map([["alice", { username: "Alice", lastSeen: NOW }]]),
    );
    saveCollaboratorDirectory(
      "room-b",
      new Map([["bob", { username: "Bob", lastSeen: NOW }]]),
    );

    expect([...loadCollaboratorDirectory("room-a")]).toEqual([
      ["alice", { username: "Alice", lastSeen: NOW }],
    ]);
    expect([...loadCollaboratorDirectory("room-b").keys()]).toEqual(["bob"]);
    expect(loadCollaboratorDirectory("unknown-room").size).toBe(0);
  });

  it("ignores malformed storage instead of throwing", () => {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_COLLABORATOR_DIRECTORY,
      "not json",
    );
    expect(loadCollaboratorDirectory("room-a").size).toBe(0);

    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_COLLABORATOR_DIRECTORY,
      JSON.stringify({
        "room-a": {
          updated: NOW,
          entries: {
            valid: { username: null, lastSeen: NOW },
            invalid: { username: 42 },
          },
        },
      }),
    );
    expect([...loadCollaboratorDirectory("room-a").keys()]).toEqual(["valid"]);
  });

  it("keeps only the 20 most recently used rooms", () => {
    for (let i = 0; i < 25; i++) {
      saveCollaboratorDirectory(`room-${i}`, new Map());
    }
    const stored = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_COLLABORATOR_DIRECTORY)!,
    );
    expect(Object.keys(stored).length).toBe(20);
    // the room saved last is always kept
    expect(stored).toHaveProperty("room-24");
  });
});

describe("recordCollaboratorSighting", () => {
  const known = new Map([["alice", { username: "Alice", lastSeen: NOW }]]);

  it("adds new collaborators", () => {
    const next = recordCollaboratorSighting(known, "bob", "Bob", NOW);
    expect(next?.get("bob")).toEqual({ username: "Bob", lastSeen: NOW });
    // doesn't mutate the previous directory
    expect(known.has("bob")).toBe(false);
  });

  it("returns null for repeated sightings (no write per pointer move)", () => {
    expect(recordCollaboratorSighting(known, "alice", "Alice", NOW + 1)).toBe(
      null,
    );
  });

  it("updates the name when it changes", () => {
    const next = recordCollaboratorSighting(known, "alice", "Alicia", NOW + 1);
    expect(next?.get("alice")?.username).toBe("Alicia");
  });

  it("keeps the known name when an update has none", () => {
    expect(recordCollaboratorSighting(known, "alice", "", NOW + 1)).toBe(null);
    const stale = recordCollaboratorSighting(
      known,
      "alice",
      undefined,
      NOW + SIGHTING_REFRESH_MS,
    );
    expect(stale?.get("alice")?.username).toBe("Alice");
  });

  it("refreshes lastSeen once it's stale", () => {
    const later = NOW + SIGHTING_REFRESH_MS;
    expect(
      recordCollaboratorSighting(known, "alice", "Alice", later)?.get("alice"),
    ).toEqual({ username: "Alice", lastSeen: later });
  });
});

describe("collaborator directory storage edge cases", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ignores storage that isn't an object of rooms", () => {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_COLLABORATOR_DIRECTORY,
      JSON.stringify(["not", "rooms"]),
    );
    expect(loadCollaboratorDirectory("room-a").size).toBe(0);
  });

  it("doesn't throw when storage is unavailable", () => {
    // (the test setup's localStorage is a plain object, so spy on it directly)
    const setItem = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() =>
      saveCollaboratorDirectory(
        "room-a",
        new Map([["alice", { username: "Alice", lastSeen: NOW }]]),
      ),
    ).not.toThrow();
    expect(setItem).toHaveBeenCalled();
  });

  it("prunes rooms without a timestamp first", () => {
    const rooms: Record<string, unknown> = {
      "no-timestamp": { entries: {} },
    };
    for (let i = 0; i < 19; i++) {
      rooms[`room-${i}`] = { updated: NOW + i, entries: {} };
    }
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_COLLABORATOR_DIRECTORY,
      JSON.stringify(rooms),
    );

    saveCollaboratorDirectory("current", new Map());

    const stored = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_COLLABORATOR_DIRECTORY)!,
    );
    expect(Object.keys(stored).length).toBe(20);
    expect(stored).not.toHaveProperty("no-timestamp");
    expect(stored).toHaveProperty("current");
  });
});
