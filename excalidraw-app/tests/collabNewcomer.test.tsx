/**
 * Issue #83 — the newcomer default and saved collaborator settings, driven
 * through the real Collab/Portal classes and the real app (socket,
 * encryption and Firebase mocked, as in collabVisibility.test.tsx).
 * Expected values come from the acceptance criteria in #83 and the decisions
 * approved on it, not from running the implementation:
 *
 * - A: "New collaborators" defaults to Locked
 * - B: a collaborator seen for the first time starts in the chosen state;
 *   one seen before (in the directory, even if they left) isn't affected
 * - C: changing the setting only affects future newcomers; Show all /
 *   Unlock all still work
 * - D: with layering on, a newcomer goes directly above miscellaneous,
 *   several in join order
 * - E: never applies to me
 * - F: after a reload the newcomer default (all rooms) and, per room,
 *   hidden, locked, the Layering switch and the order are restored
 * - G: local only: not synced, exported or in undo history
 * - H: applying the default or restoring changes no element (index,
 *   version) and sends nothing new to the room
 * - I: unreadable or unknown saved settings are ignored; hiding my own
 *   drawings is not restored (no view mode)
 */
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  cleanAppStateForExport,
  clearAppStateForDatabase,
  clearAppStateForLocalStorage,
} from "@excalidraw/excalidraw/appState";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import * as StaticScene from "@excalidraw/excalidraw/renderer/staticScene";
import {
  act,
  fireEvent,
  render,
  unmountComponent,
  waitFor,
} from "@excalidraw/excalidraw/tests/test-utils";
import {
  CREATOR_ID_KEY,
  UNKNOWN_CREATOR_ID,
  excludeElementsByHiddenCreators,
  newElementWith,
  syncInvalidIndices,
} from "@excalidraw/element";
import { assert, vi } from "vitest";

import type { ActionName } from "@excalidraw/excalidraw/actions/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { SocketId } from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS, WS_EVENTS, WS_SUBTYPES } from "../app_constants";
import ExcalidrawApp from "../App";
import { saveCollaboratorDirectory } from "../collab/collaboratorDirectory";
import { saveCollaboratorSettings } from "../collab/collaboratorSettings";

import type { SocketUpdateDataSource } from "../data";

const { h } = window;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  emitted: [] as any[][],
  storedRoomElements: null as readonly any[] | null,
}));

vi.mock("socket.io-client", () => ({
  default: () => ({
    id: "my-socket",
    on: (event: string, handler: (...args: any[]) => any) => {
      mocks.handlers.set(event, handler);
    },
    once: () => {},
    off: () => {},
    emit: (...args: any[]) => {
      mocks.emitted.push(args);
    },
    close: () => {},
  }),
}));

// all exports mocked explicitly: spreading `importOriginal()` here deadlocks
// the app's module initialization
vi.mock("@excalidraw/excalidraw/data/encryption", () => ({
  IV_LENGTH_BYTES: 12,
  createIV: () => new Uint8Array(12),
  getCryptoKey: async () => ({}),
  generateEncryptionKey: async () => "test-room-key",
  encryptData: async (_key: string, data: Uint8Array) => ({
    encryptedBuffer: data,
    iv: new Uint8Array(12),
  }),
  decryptData: async (_iv: Uint8Array, data: ArrayBuffer) => data,
}));

vi.mock("../data/firebase", () => ({
  loadFromFirebase: async () => mocks.storedRoomElements,
  saveToFirebase: async () => null,
  isSavedToFirebase: () => true,
  loadFilesFromFirebase: async () => ({ loadedFiles: [], erroredFiles: [] }),
  saveFilesToFirebase: async () => ({
    savedFiles: new Map(),
    erroredFiles: new Map(),
  }),
}));

// -----------------------------------------------------------------------------

const ROOM = { roomId: "room83", roomKey: "abcdefghijklmnopqrstuv" };
const OTHER_ROOM = { roomId: "room83b", roomKey: "abcdefghijklmnopqrstuv" };

const stamp = <T extends ExcalidrawElement>(element: T, creatorId: string) =>
  newElementWith(element as ExcalidrawElement, {
    customData: { [CREATOR_ID_KEY]: creatorId },
  }) as T;

/** scene updates this client sent to the room (decoded) */
const getSentUpdates = () =>
  mocks.emitted
    .filter(([event]) => event === WS_EVENTS.SERVER)
    .map(([, , buffer]) => JSON.parse(new TextDecoder().decode(buffer)))
    .filter(
      (message) =>
        message.type === WS_SUBTYPES.UPDATE ||
        message.type === WS_SUBTYPES.INIT,
    );

/** simulates a message from another client arriving through the room */
const deliver = async (
  message: SocketUpdateDataSource[keyof SocketUpdateDataSource],
) => {
  await mocks.handlers.get("client-broadcast")!(
    new TextEncoder().encode(JSON.stringify(message)),
    new Uint8Array(12),
  );
};

/** local changes reach Collab through onChange → syncElements */
const sync = () => {
  act(() => {
    window.collab.syncElements(h.app.scene.getElementsIncludingDeleted());
  });
};

const execute = (name: string, value?: unknown) => {
  const action = h.app.actionManager.actions[name as ActionName];
  assert.isDefined(action, `action "${name}" should be registered`);
  act(() => {
    h.app.actionManager.executeAction(action, "ui", value as any);
  });
};

const getClientId = () => window.collab.getClientId()!;

/** the server's member list (it always includes me, "my-socket") */
const roomMembersAre = async (...socketIds: string[]) => {
  act(() => {
    mocks.handlers.get("room-user-change")!(["my-socket", ...socketIds]);
  });
};

/**
 * what the server does when we join: we're alone ("first-in-room"), and the
 * member list (which tells the editor which collaborator is me)
 */
const finishInitialization = async () => {
  // opening a room link joins asynchronously (client id, socket.io import),
  // which can take over waitFor's 1s default when the machine is busy
  await waitFor(() => expect(mocks.handlers.has("first-in-room")).toBe(true), {
    timeout: 5000,
  });
  await mocks.handlers.get("first-in-room")!();
  await waitFor(() =>
    expect(window.collab.portal.socketInitialized).toBe(true),
  );
  await roomMembersAre();
};

/** start a new room and finish initialization (we're alone in it) */
const startNewRoom = async () => {
  act(() => {
    window.collab.startCollaboration(null);
  });
  await finishInitialization();
};

/** join an existing room (as from a room link) and finish initialization */
const joinRoom = async (room: { roomId: string; roomKey: string }) => {
  act(() => {
    window.collab.startCollaboration(room);
  });
  await finishInitialization();
};

/**
 * Opens the app on the room's link, like loading or reloading the page
 * (the app joins the room by itself), and waits until the scene is loaded.
 * Storage (local and session) is kept, like in a real reload.
 */
const openRoomLink = async (room: { roomId: string; roomKey: string }) => {
  unmountComponent();
  mocks.handlers.clear();
  mocks.emitted.length = 0;
  window.history.replaceState(
    {},
    "",
    `${window.location.origin}/#room=${room.roomId},${room.roomKey}`,
  );
  // the app keeps loading until the room is initialized, and `render` waits
  // for loading to finish, so initialize the room while it renders
  const rendering = render(<ExcalidrawApp />);
  await finishInitialization();
  await rendering;
};

/** a peer introduces themselves (#116's USER_IDENTITY) */
const peerJoins = async (clientId: string, socketId = `${clientId}-socket`) => {
  await deliver({
    type: WS_SUBTYPES.USER_IDENTITY,
    payload: {
      socketId: socketId as SocketId,
      clientId,
      username: clientId,
    },
  });
  await waitFor(() =>
    expect(h.state.collaboratorDirectory?.has(clientId)).toBe(true),
  );
};

const isHidden = (id: string) => h.state.hiddenCollaboratorIds.has(id);
const isLocked = (id: string) => h.state.lockedCollaboratorIds.has(id);

/** what AC-H says must not change */
const getShared = () =>
  h.elements.map(({ id, index, version, versionNonce }) => ({
    id,
    index,
    version,
    versionNonce,
  }));

/** a peer's element arrives in the room */
const receivePeerElement = async (id: string, creatorId: string) => {
  await deliver({
    type: WS_SUBTYPES.UPDATE,
    payload: {
      elements: syncInvalidIndices([
        ...h.app.scene.getElementsIncludingDeleted(),
        stamp(API.createElement({ id }), creatorId),
      ]),
    },
  });
  await waitFor(() =>
    expect(h.elements.some((element) => element.id === id)).toBe(true),
  );
};

beforeEach(async () => {
  mocks.handlers.clear();
  mocks.emitted.length = 0;
  mocks.storedRoomElements = null;
  localStorage.clear();
  sessionStorage.clear();
  // a previous test's room link would make the app auto-join that room
  window.history.replaceState({}, "", window.location.origin);
  await render(<ExcalidrawApp />);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// -----------------------------------------------------------------------------

describe("newcomer default — Criteria A and B (first-seen collaborators)", () => {
  it("AC-A: in a room, the New collaborators setting starts as Locked", async () => {
    await startNewRoom();
    expect(h.state.newCollaboratorDefault).toBe("locked");
  });

  it("AC-B: by default, a collaborator joining for the first time starts visible but locked", async () => {
    await startNewRoom();
    await peerJoins("alice");
    expect(isHidden("alice")).toBe(false);
    expect(isLocked("alice")).toBe(true);
  });

  it("AC-B: with Visible, a collaborator joining for the first time starts visible and interactive", async () => {
    await startNewRoom();
    API.setAppState({ newCollaboratorDefault: "visible" });
    await peerJoins("alice");
    expect(isHidden("alice")).toBe(false);
    expect(isLocked("alice")).toBe(false);
  });

  it("AC-B (decision Q4): with Visible, a first-time collaborator's leftover saved lock is cleared", async () => {
    // alice is locked in this room's saved settings but not in its
    // directory (e.g. pruned from it), so she's seen for the first time
    saveCollaboratorSettings(
      ROOM.roomId,
      {
        newCollaboratorDefault: "visible",
        hiddenCollaboratorIds: new Set(),
        lockedCollaboratorIds: new Set(["alice"]),
        collaboratorLayeringEnabled: false,
        collaboratorLayerOrder: null,
      },
      null,
    );
    await joinRoom(ROOM);
    expect(isLocked("alice")).toBe(true);

    await peerJoins("alice");

    expect(isLocked("alice")).toBe(false);
    expect(isHidden("alice")).toBe(false);
  });

  it("AC-B: with Hidden, a collaborator joining for the first time starts hidden (and therefore locked)", async () => {
    await startNewRoom();
    API.setAppState({ newCollaboratorDefault: "hidden" });
    await peerJoins("alice");
    expect(isHidden("alice")).toBe(true);
    expect(isLocked("alice")).toBe(true);
  });

  it("AC-B: a collaborator first seen through a pointer message starts in the default too", async () => {
    await startNewRoom();
    await deliver({
      type: WS_SUBTYPES.MOUSE_LOCATION,
      payload: {
        socketId: "bob-socket" as SocketId,
        pointer: { x: 0, y: 0, tool: "pointer" },
        button: "up",
        selectedElementIds: {},
        username: "Bob",
        clientId: "bob",
      },
    });
    await waitFor(() => expect(isLocked("bob")).toBe(true));
  });

  it("AC-B: a collaborator who leaves and rejoins keeps the settings I gave them", async () => {
    await startNewRoom();
    await peerJoins("alice");
    execute("toggleCollaboratorLock", "alice");
    expect(isLocked("alice")).toBe(false);

    await roomMembersAre();
    await peerJoins("alice", "alice-socket-2");

    expect(isLocked("alice")).toBe(false);
    expect(isHidden("alice")).toBe(false);
  });

  it("AC-B: a collaborator seen in an earlier session isn't new (control: one never seen is)", async () => {
    saveCollaboratorDirectory(
      ROOM.roomId,
      new Map([["alice", { username: "alice", lastSeen: Date.now() }]]),
    );
    await joinRoom(ROOM);

    await peerJoins("alice");
    await peerJoins("bob");

    expect(isLocked("alice")).toBe(false);
    // (control) bob was never seen in this room
    expect(isLocked("bob")).toBe(true);
  });
});

describe("newcomer default — Criteria C (only future newcomers)", () => {
  it("AC-C: changing the setting doesn't change collaborators already seen", async () => {
    await startNewRoom();
    await peerJoins("alice");

    API.setAppState({ newCollaboratorDefault: "hidden" });
    expect(isHidden("alice")).toBe(false);
    expect(isLocked("alice")).toBe(true);

    // (control) the new setting does apply to the next newcomer
    await peerJoins("bob");
    expect(isHidden("bob")).toBe(true);
  });

  it("AC-C: Show all and Unlock all still work for collaborators already seen", async () => {
    await startNewRoom();
    API.setAppState({ newCollaboratorDefault: "hidden" });
    await peerJoins("alice");
    expect(isHidden("alice")).toBe(true);

    execute("showAllCollaborators");
    expect(isHidden("alice")).toBe(false);
    // #81 C: shown again → still locked until unlocked
    expect(isLocked("alice")).toBe(true);

    execute("unlockAllCollaborators");
    expect(isLocked("alice")).toBe(false);
  });
});

describe("newcomer default — Criteria D (layer order)", () => {
  it("AC-D: with layering on, newcomers land directly above miscellaneous, in join order", async () => {
    await startNewRoom();
    execute("toggleCollaboratorLayering");

    await peerJoins("alice");
    await peerJoins("bob");

    expect(h.state.collaboratorLayerOrder).toEqual([
      getClientId(),
      "alice",
      "bob",
      UNKNOWN_CREATOR_ID,
    ]);
  });
});

describe("newcomer default — Criteria E (me)", () => {
  it("AC-E: with Hidden saved as the default, my own drawings are never hidden (control: a newcomer is)", async () => {
    saveCollaboratorSettings(
      "any-room",
      {
        newCollaboratorDefault: "hidden",
        hiddenCollaboratorIds: new Set(),
        lockedCollaboratorIds: new Set(),
        collaboratorLayeringEnabled: false,
        collaboratorLayerOrder: null,
      },
      null,
    );
    await startNewRoom();
    expect(h.state.newCollaboratorDefault).toBe("hidden");

    expect(isHidden(getClientId())).toBe(false);
    expect(isLocked(getClientId())).toBe(false);
    expect(h.state.viewModeEnabled).toBe(false);

    // (control)
    await peerJoins("alice");
    expect(isHidden("alice")).toBe(true);
  });
});

describe("saved settings — Criteria F (remembered across reloads)", () => {
  it("AC-F: after a reload, hidden, locked, the Layering switch, the order and the newcomer default are restored", async () => {
    await openRoomLink(ROOM);
    await peerJoins("alice");
    await peerJoins("bob");
    execute("toggleCollaboratorVisibility", "bob");
    execute("toggleCollaboratorLayering");
    execute("moveCollaboratorLayer", { id: "bob", toIndex: 0 });
    API.setAppState({ newCollaboratorDefault: "visible" });
    const me = getClientId();
    const order = [...h.state.collaboratorLayerOrder!];
    expect(order[0]).toBe("bob");

    await openRoomLink(ROOM);

    expect(getClientId()).toBe(me);
    expect(h.state.newCollaboratorDefault).toBe("visible");
    expect([...h.state.hiddenCollaboratorIds]).toEqual(["bob"]);
    expect([...h.state.lockedCollaboratorIds].sort()).toEqual(["alice", "bob"]);
    expect(h.state.collaboratorLayeringEnabled).toBe(true);
    expect(h.state.collaboratorLayerOrder).toEqual(order);
  });

  it("AC-F: a rejoining collaborator keeps their settings after a reload", async () => {
    // newcomers start visible and interactive; I lock alice myself
    await openRoomLink(ROOM);
    API.setAppState({ newCollaboratorDefault: "visible" });
    await peerJoins("alice");
    expect(isLocked("alice")).toBe(false);
    execute("toggleCollaboratorLock", "alice");

    await openRoomLink(ROOM);
    await peerJoins("alice");

    expect(isLocked("alice")).toBe(true);
  });

  it("AC-F: settings are per room: another room opens with its own settings, the newcomer default with me", async () => {
    await openRoomLink(ROOM);
    await peerJoins("alice");
    execute("toggleCollaboratorVisibility", "alice");
    execute("toggleCollaboratorLayering");
    API.setAppState({ newCollaboratorDefault: "hidden" });

    await openRoomLink(OTHER_ROOM);

    expect(h.state.hiddenCollaboratorIds.size).toBe(0);
    expect(h.state.lockedCollaboratorIds.size).toBe(0);
    expect(h.state.collaboratorLayeringEnabled).toBe(false);
    expect(h.state.collaboratorLayerOrder).toBe(null);
    expect(h.state.newCollaboratorDefault).toBe("hidden");
  });
});

describe("saved settings — Criteria I (safe restore)", () => {
  /** hides alice's drawings and my own (#116 then forces view mode) */
  const hideAliceAndMe = async () => {
    await openRoomLink(ROOM);
    await peerJoins("alice");
    execute("toggleCollaboratorVisibility", "alice");
    execute("toggleCollaboratorVisibility", getClientId());
  };

  it("(control) hiding my own drawings puts me in view mode", async () => {
    await hideAliceAndMe();
    expect(isHidden(getClientId())).toBe(true);
    expect(h.state.viewModeEnabled).toBe(true);
  });

  it("AC-I: after a reload, hiding my own drawings is not restored, so the room doesn't open in view mode", async () => {
    await hideAliceAndMe();

    await openRoomLink(ROOM);

    expect(isHidden(getClientId())).toBe(false);
    expect(h.state.viewModeEnabled).toBe(false);
    // hiding alice is restored
    expect(isHidden("alice")).toBe(true);
  });

  it("AC-I: unreadable saved settings are ignored: the room opens with the defaults", async () => {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_COLLABORATOR_SETTINGS,
      "{not json",
    );
    await joinRoom(ROOM);

    expect(h.state.newCollaboratorDefault).toBe("locked");
    expect(h.state.hiddenCollaboratorIds.size).toBe(0);
    expect(h.state.collaboratorLayeringEnabled).toBe(false);
    await peerJoins("alice");
    expect(isLocked("alice")).toBe(true);
  });

  it("AC-I: saved settings for a collaborator no longer known are ignored", async () => {
    saveCollaboratorSettings(
      ROOM.roomId,
      {
        newCollaboratorDefault: "locked",
        hiddenCollaboratorIds: new Set(["ghost"]),
        lockedCollaboratorIds: new Set(["ghost"]),
        collaboratorLayeringEnabled: true,
        collaboratorLayerOrder: ["ghost", UNKNOWN_CREATOR_ID],
      },
      null,
    );
    await joinRoom(ROOM);
    await receivePeerElement("ghost-rect", "ghost");

    // the saved settings were restored (without errors)…
    expect(h.state.collaboratorLayeringEnabled).toBe(true);
    // …but ghost isn't in this client's directory: their drawing counts as
    // miscellaneous (#116), which isn't hidden
    expect(
      excludeElementsByHiddenCreators(h.elements, h.state).map((el) => el.id),
    ).toContain("ghost-rect");
  });
});

describe("newcomer default and saved settings — Criteria G and H (local only, shared state untouched)", () => {
  it("(control) a local edit is sent to the room and changes the shared state", async () => {
    await startNewRoom();
    await receivePeerElement("theirs", "alice");
    const sentBefore = getSentUpdates().length;
    const sharedBefore = getShared();

    API.updateScene({
      elements: syncInvalidIndices([
        ...h.app.scene.getElementsIncludingDeleted(),
        API.createElement({ id: "mine" }),
      ]),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    sync();

    await waitFor(() =>
      expect(getSentUpdates().length).toBeGreaterThan(sentBefore),
    );
    expect(getShared()).not.toEqual(sharedBefore);
  });

  it("AC-H: applying the default and changing the setting send nothing and change no element", async () => {
    await startNewRoom();
    await receivePeerElement("theirs", "alice");
    const sentBefore = getSentUpdates().length;
    const sharedBefore = getShared();

    await peerJoins("alice");
    API.setAppState({ newCollaboratorDefault: "hidden" });
    await peerJoins("bob");
    sync();

    expect(isLocked("alice")).toBe(true);
    expect(isHidden("bob")).toBe(true);
    expect(getSentUpdates().length).toBe(sentBefore);
    expect(getShared()).toEqual(sharedBefore);
  });

  it("AC-H: restoring saved settings on join sends nothing and changes no element", async () => {
    mocks.storedRoomElements = syncInvalidIndices([
      stamp(API.createElement({ id: "theirs" }), "alice"),
    ]);
    saveCollaboratorSettings(
      ROOM.roomId,
      {
        newCollaboratorDefault: "hidden",
        hiddenCollaboratorIds: new Set(["alice"]),
        lockedCollaboratorIds: new Set(["alice"]),
        collaboratorLayeringEnabled: true,
        collaboratorLayerOrder: ["alice", UNKNOWN_CREATOR_ID],
      },
      null,
    );

    await openRoomLink(ROOM);
    sync();

    expect(isHidden("alice")).toBe(true);
    expect(getSentUpdates()).toEqual([]);
    const stored = mocks.storedRoomElements[0];
    expect(getShared()).toEqual([
      {
        id: "theirs",
        index: stored.index,
        version: stored.version,
        versionNonce: stored.versionNonce,
      },
    ]);
  });

  it("AC-G: applying the default and restoring add no undo history entries", async () => {
    saveCollaboratorSettings(
      ROOM.roomId,
      {
        newCollaboratorDefault: "locked",
        hiddenCollaboratorIds: new Set(["carol"]),
        lockedCollaboratorIds: new Set(["carol"]),
        collaboratorLayeringEnabled: false,
        collaboratorLayerOrder: null,
      },
      null,
    );
    await openRoomLink(ROOM);
    expect(isHidden("carol")).toBe(true);
    expect(API.getUndoStack().length).toBe(0);

    await peerJoins("alice");
    API.setAppState({ newCollaboratorDefault: "visible" });
    await peerJoins("bob");

    expect(isLocked("alice")).toBe(true);
    expect(isLocked("bob")).toBe(false);
    expect(API.getUndoStack().length).toBe(0);
  });

  it("AC-G: the newcomer default is never saved with the scene, exported or sent to the server", async () => {
    await startNewRoom();
    API.setAppState({ newCollaboratorDefault: "hidden" });

    expect(clearAppStateForLocalStorage(h.state)).not.toHaveProperty(
      "newCollaboratorDefault",
    );
    expect(cleanAppStateForExport(h.state)).not.toHaveProperty(
      "newCollaboratorDefault",
    );
    expect(clearAppStateForDatabase(h.state)).not.toHaveProperty(
      "newCollaboratorDefault",
    );
  });
});

describe("New collaborators setting — dropdown UI in the app", () => {
  const openMenu = () => {
    fireEvent.click(
      document.querySelector<HTMLElement>(
        "[data-testid='collaborator-visibility-trigger']",
      )!,
    );
  };

  /** Visible, Locked, Hidden (the AC's order) */
  const getRadios = () => [
    ...document.querySelectorAll<HTMLInputElement>(
      "input[name='collaborator-newcomer-default']",
    ),
  ];

  it("AC-F: an option chosen in the dropdown is still selected after a reload, and applies to newcomers", async () => {
    await openRoomLink(ROOM);
    openMenu();
    fireEvent.click(getRadios()[2]); // Hidden
    expect(h.state.newCollaboratorDefault).toBe("hidden");

    await openRoomLink(ROOM);
    openMenu();

    expect(getRadios().map((radio) => radio.checked)).toEqual([
      false,
      false,
      true,
    ]);
    await peerJoins("alice");
    expect(isHidden("alice")).toBe(true);
  });

  it("AC-D (#82 I): Export image with layering on and a newcomer present renders without freezing", async () => {
    await startNewRoom();
    execute("toggleCollaboratorLayering");
    await peerJoins("alice");
    // shared order: alice's shape, then an untagged (miscellaneous) one on top
    await receivePeerElement("alice-rect", "alice");
    await deliver({
      type: WS_SUBTYPES.UPDATE,
      payload: {
        elements: syncInvalidIndices([
          ...h.app.scene.getElementsIncludingDeleted(),
          API.createElement({ id: "untagged" }),
        ]),
      },
    });
    await waitFor(() =>
      expect(h.elements.some((element) => element.id === "untagged")).toBe(
        true,
      ),
    );

    // jsdom gives elements no size, and the preview only renders into a
    // sized container
    const width = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockReturnValue(400);
    const height = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(300);
    const renderSpy = vi.spyOn(StaticScene, "renderStaticScene");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      act(() => {
        h.setState({ openDialog: { name: "imageExport" } });
      });

      const exportRenders = () =>
        renderSpy.mock.calls.filter(([args]) => args.renderConfig.isExporting);
      await waitFor(() => expect(exportRenders().length).toBeGreaterThan(0));
      // drawing order, bottom first: miscellaneous, then the newcomer above it
      expect(exportRenders()[0][0].visibleElements.map((el) => el.id)).toEqual([
        "untagged",
        "alice-rect",
      ]);
      expect(
        errorSpy.mock.calls.some(([error]) =>
          String(error).includes("is not a function"),
        ),
      ).toBe(false);
    } finally {
      act(() => {
        h.setState({ openDialog: null });
      });
      width.mockRestore();
      height.mockRestore();
      renderSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
