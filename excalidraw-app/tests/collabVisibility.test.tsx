/**
 * Collaboration-side behaviour of collaborator visibility, driven through the
 * real Collab/Portal classes with a socket that records what's sent and lets
 * tests deliver messages (encryption is a passthrough).
 */
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { act, render, waitFor } from "@excalidraw/excalidraw/tests/test-utils";
import {
  CREATOR_ID_KEY,
  newElementWith,
  syncInvalidIndices,
} from "@excalidraw/element";
import { vi } from "vitest";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { SocketId } from "@excalidraw/excalidraw/types";

import { WS_EVENTS, WS_SUBTYPES } from "../app_constants";
import ExcalidrawApp from "../App";

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

const stamp = <T extends ExcalidrawElement>(element: T, creatorId: string) =>
  newElementWith(element as ExcalidrawElement, {
    customData: { [CREATOR_ID_KEY]: creatorId },
  }) as T;

const getCreatorId = (id: string) =>
  h.elements.find((el) => el.id === id)?.customData?.[CREATOR_ID_KEY];

/** messages this client broadcast (decoded) */
const getSentMessages = () =>
  mocks.emitted
    .filter(([event]) => event === WS_EVENTS.SERVER)
    .map(([, , buffer]) => JSON.parse(new TextDecoder().decode(buffer)));

const getSentOfType = (type: WS_SUBTYPES) =>
  getSentMessages().filter((message) => message.type === type);

// NOTE: server events are awaited directly (not inside an async `act`), which
// would also wait for the room's 5s initialization fallback timer. Callers
// assert through `waitFor`.

/** simulates a message from another client arriving through the room */
const deliver = async (
  message: SocketUpdateDataSource[keyof SocketUpdateDataSource],
) => {
  await mocks.handlers.get("client-broadcast")!(
    new TextEncoder().encode(JSON.stringify(message)),
    new Uint8Array(12),
  );
};

const triggerServerEvent = async (event: string, ...args: any[]) => {
  await mocks.handlers.get(event)!(...args);
};

/** local changes reach Collab through onChange → syncElements */
const sync = () => {
  act(() => {
    window.collab.syncElements(h.app.scene.getElementsIncludingDeleted());
  });
};

/**
 * Returns the scene promise wrapped in an object: returning it directly from
 * this async function would make callers wait for the room's scene, which
 * only arrives after the "first-in-room" event they still have to send.
 */
const startCollaboration = async (
  roomLinkData: { roomId: string; roomKey: string } | null = null,
) => {
  let scenePromise!: ReturnType<typeof window.collab.startCollaboration>;
  act(() => {
    scenePromise = window.collab.startCollaboration(roomLinkData);
  });
  await waitFor(() => expect(mocks.handlers.has("first-in-room")).toBe(true));
  return { scenePromise };
};

/** start a new room and finish initialization (we're alone in it) */
const startNewRoom = async () => {
  await startCollaboration();
  await triggerServerEvent("first-in-room");
  await waitFor(() =>
    expect(window.collab.portal.socketInitialized).toBe(true),
  );
};

const getClientId = () => window.collab.getClientId()!;

describe("collaborator visibility (collaboration)", () => {
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

  describe("identity", () => {
    it("announces its identity once the room is initialized", async () => {
      expect(getSentOfType(WS_SUBTYPES.USER_IDENTITY)).toEqual([]);

      await startNewRoom();

      // (announced again once the random username has been picked)
      await waitFor(() => {
        const sent = getSentOfType(WS_SUBTYPES.USER_IDENTITY);
        expect(sent.length).toBeGreaterThan(0);
        for (const message of sent) {
          expect(message.payload).toEqual(
            expect.objectContaining({
              socketId: "my-socket",
              clientId: getClientId(),
            }),
          );
        }
      });
    });

    it("introduces itself to newcomers (new-user)", async () => {
      await startNewRoom();
      mocks.emitted.length = 0;

      await triggerServerEvent("new-user", "peer-socket");

      expect(getSentMessages().map((message) => message.type)).toEqual([
        WS_SUBTYPES.INIT,
        WS_SUBTYPES.USER_IDENTITY,
      ]);
    });

    it("re-announces itself when renaming", async () => {
      await startNewRoom();
      mocks.emitted.length = 0;

      act(() => {
        window.collab.setUsername("Renamed");
      });

      await waitFor(() => {
        expect(getSentOfType(WS_SUBTYPES.USER_IDENTITY)).toEqual([
          expect.objectContaining({
            payload: expect.objectContaining({ username: "Renamed" }),
          }),
        ]);
        expect(
          h.state.collaboratorDirectory?.get(getClientId())?.username,
        ).toBe("Renamed");
      });
    });

    it("sends its client id with pointer and idle updates", async () => {
      await startNewRoom();
      mocks.emitted.length = 0;

      await act(async () => {
        await window.collab.portal.broadcastMouseLocation({
          pointer: { x: 0, y: 0, tool: "pointer" },
          button: "up",
        });
        await window.collab.portal.broadcastIdleChange("active" as any);
      });

      const volatile = mocks.emitted
        .filter(([event]) => event === WS_EVENTS.SERVER_VOLATILE)
        .map(([, , buffer]) => JSON.parse(new TextDecoder().decode(buffer)));
      expect(volatile.map((message) => message.payload.clientId)).toEqual([
        getClientId(),
        getClientId(),
      ]);
    });

    it("learns peers' ids from USER_IDENTITY, pointer and idle messages", async () => {
      await startNewRoom();

      await deliver({
        type: WS_SUBTYPES.USER_IDENTITY,
        payload: {
          socketId: "alice-socket" as SocketId,
          clientId: "alice",
          username: "Alice",
        },
      });
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
      await deliver({
        type: WS_SUBTYPES.IDLE_STATUS,
        payload: {
          socketId: "carol-socket" as SocketId,
          userState: "active" as any,
          username: "Carol",
          clientId: "carol",
        },
      });

      const ids = (socketId: string) =>
        h.state.collaborators.get(socketId as SocketId)?.id;
      await waitFor(() => {
        expect([
          ids("alice-socket"),
          ids("bob-socket"),
          ids("carol-socket"),
        ]).toEqual(["alice", "bob", "carol"]);
        expect(h.state.collaboratorDirectory?.get("alice")?.username).toBe(
          "Alice",
        );
      });

      // a repeated sighting (within a minute) doesn't rewrite the directory
      const directoryBefore = h.state.collaboratorDirectory;
      await deliver({
        type: WS_SUBTYPES.USER_IDENTITY,
        payload: {
          socketId: "alice-socket" as SocketId,
          clientId: "alice",
          username: "Alice",
        },
      });
      await waitFor(() => {
        expect(
          h.state.collaborators.get("alice-socket" as SocketId)?.username,
        ).toBe("Alice");
      });
      expect(h.state.collaboratorDirectory).toBe(directoryBefore);
    });

    it("(control) clients without collaborator visibility send no id", async () => {
      await startNewRoom();

      await deliver({
        type: WS_SUBTYPES.MOUSE_LOCATION,
        payload: {
          socketId: "old-socket" as SocketId,
          pointer: { x: 0, y: 0, tool: "pointer" },
          button: "up",
          selectedElementIds: {},
          username: "Old client",
        },
      });
      await deliver({
        type: WS_SUBTYPES.IDLE_STATUS,
        payload: {
          socketId: "old-socket" as SocketId,
          userState: "idle" as any,
          username: "Old client",
        },
      });

      // the collaborator is known (by name), just without an id
      await waitFor(() => {
        expect(
          h.state.collaborators.get("old-socket" as SocketId)?.username,
        ).toBe("Old client");
      });
      expect(
        h.state.collaborators.get("old-socket" as SocketId)?.id,
      ).toBeUndefined();
    });

    it("marks its own collaborator entry with its client id", async () => {
      await startNewRoom();

      await triggerServerEvent("room-user-change", [
        "my-socket",
        "alice-socket",
      ]);

      await waitFor(() => {
        expect(h.state.collaborators.get("my-socket" as SocketId)).toEqual(
          expect.objectContaining({ isCurrentUser: true, id: getClientId() }),
        );
      });
    });

    it("refreshes when it last saw a collaborator who left", async () => {
      const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      await startNewRoom();
      await deliver({
        type: WS_SUBTYPES.USER_IDENTITY,
        payload: {
          socketId: "alice-socket" as SocketId,
          clientId: "alice",
          username: "Alice",
        },
      });

      now.mockReturnValue(1_000_000 + 5 * 60 * 1000);
      await triggerServerEvent("room-user-change", ["my-socket"]);
      // sightings are recorded synchronously above; restore before waitFor,
      // which relies on a real clock for its timeout
      now.mockRestore();

      await waitFor(() => {
        expect(h.state.collaboratorDirectory?.get("alice")).toEqual({
          username: "Alice",
          lastSeen: 1_000_000 + 5 * 60 * 1000,
        });
      });
    });
  });

  describe("ownership", () => {
    it("stamps new local elements during sync, never peers' elements", async () => {
      await startNewRoom();

      await deliver({
        type: WS_SUBTYPES.UPDATE,
        payload: {
          elements: syncInvalidIndices([
            stamp(API.createElement({ id: "theirs" }), "alice"),
            API.createElement({ id: "legacy" }),
          ]),
        },
      });

      API.updateScene({
        elements: syncInvalidIndices([
          ...h.app.scene.getElementsIncludingDeleted(),
          API.createElement({ id: "mine" }),
        ]),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      sync();

      expect(getCreatorId("mine")).toBe(getClientId());
      expect(getCreatorId("theirs")).toBe("alice");
      expect(getCreatorId("legacy")).toBeUndefined();
    });

    it("editing a peer's element doesn't transfer ownership", async () => {
      await startNewRoom();
      await deliver({
        type: WS_SUBTYPES.UPDATE,
        payload: {
          elements: syncInvalidIndices([
            stamp(API.createElement({ id: "theirs" }), "alice"),
          ]),
        },
      });

      API.updateElement(h.elements[0], { x: 500 });
      sync();

      expect(getCreatorId("theirs")).toBe("alice");
    });

    it("an echo of our own element doesn't make it remote", async () => {
      await startCollaboration();

      // drawn before the room finished initializing → not stamped yet
      API.updateScene({
        elements: syncInvalidIndices([
          ...h.app.scene.getElementsIncludingDeleted(),
          API.createElement({ id: "early" }),
        ]),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      sync();
      expect(getCreatorId("early")).toBeUndefined();

      // the room echoes it back (e.g. a peer's full resync)
      await deliver({
        type: WS_SUBTYPES.UPDATE,
        payload: {
          elements: h.app.scene.getElementsIncludingDeleted(),
        },
      });

      await triggerServerEvent("first-in-room");
      await waitFor(() =>
        expect(window.collab.portal.socketInitialized).toBe(true),
      );
      sync();

      expect(getCreatorId("early")).toBe(getClientId());
    });

    it("joining a room never stamps the room's stored elements", async () => {
      mocks.storedRoomElements = syncInvalidIndices([
        stamp(API.createElement({ id: "theirs" }), "alice"),
        API.createElement({ id: "legacy" }),
      ]);

      const { scenePromise } = await startCollaboration({
        roomId: "room",
        roomKey: "key",
      });
      await triggerServerEvent("first-in-room");
      const scene = await scenePromise;

      // what the app does with the returned scene (App.initializeScene)
      API.updateScene({
        elements: scene!.elements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      sync();

      expect(getCreatorId("theirs")).toBe("alice");
      expect(getCreatorId("legacy")).toBeUndefined();
      // and the directory was re-published after the join reset the scene
      expect(h.state.collaboratorDirectory?.has(getClientId())).toBe(true);
    });
  });
});
