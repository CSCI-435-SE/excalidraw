/**
 * Issue #81 — Criteria F (shared-state integrity) driven through the real
 * Collab/Portal classes. The socket records everything this client sends;
 * encryption is a passthrough. Setup mirrors collabVisibility.test.tsx (#116).
 *
 * AC-F: "Locking or unlocking changes no element in the scene (element
 * versions stay the same) and sends nothing new to other collaborators.
 * Other collaborators can still see and edit their own and others' drawings
 * as before."
 */
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { act, render, waitFor } from "@excalidraw/excalidraw/tests/test-utils";
import {
  CREATOR_ID_KEY,
  UNKNOWN_CREATOR_ID,
  newElementWith,
  syncInvalidIndices,
} from "@excalidraw/element";
import { assert, vi } from "vitest";

import type { ActionName } from "@excalidraw/excalidraw/actions/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { WS_EVENTS, WS_SUBTYPES } from "../app_constants";
import ExcalidrawApp from "../App";

import type { SocketUpdateDataSource } from "../data";

const { h } = window;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  emitted: [] as any[][],
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

// all exports mocked explicitly (spreading `importOriginal()` deadlocks the
// app's module initialization, see collabVisibility.test.tsx)
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
  loadFromFirebase: async () => null,
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

/** scene updates this client sent to the room (decoded) */
const getSentUpdates = () =>
  mocks.emitted
    .filter(([event]) => event === WS_EVENTS.SERVER)
    .map(([, , buffer]) => JSON.parse(new TextDecoder().decode(buffer)))
    .filter((message) => message.type === WS_SUBTYPES.UPDATE);

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

/** start a new room and finish initialization (we're alone in it) */
const startNewRoom = async () => {
  act(() => {
    window.collab.startCollaboration(null);
  });
  await waitFor(() => expect(mocks.handlers.has("first-in-room")).toBe(true));
  await mocks.handlers.get("first-in-room")!();
  await waitFor(() =>
    expect(window.collab.portal.socketInitialized).toBe(true),
  );
};

const execute = (name: string, value?: string) => {
  const action = h.app.actionManager.actions[name as ActionName];
  assert.isDefined(action, `action "${name}" should be registered`);
  act(() => {
    h.app.actionManager.executeAction(action, "ui", value as any);
  });
};

const getVersions = () =>
  h.elements.map(({ id, version, versionNonce }) => ({
    id,
    version,
    versionNonce,
  }));

const getElement = (id: string) => h.elements.find((el) => el.id === id)!;

/** a peer's element arrives in the room */
const receivePeerElement = async () => {
  await deliver({
    type: WS_SUBTYPES.UPDATE,
    payload: {
      elements: syncInvalidIndices([
        stamp(API.createElement({ id: "theirs", x: 0 }), "alice"),
      ]),
    },
  });
  await waitFor(() => expect(getElement("theirs")).toBeDefined());
};

describe("collaborator lock (collaboration) — Criteria F", () => {
  beforeEach(async () => {
    mocks.handlers.clear();
    mocks.emitted.length = 0;
    localStorage.clear();
    sessionStorage.clear();
    // a previous test's room link would make the app auto-join that room
    window.history.replaceState({}, "", window.location.origin);
    await render(<ExcalidrawApp />);
    await startNewRoom();
    await receivePeerElement();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** a local edit (adds an element), synced to the room */
  const addLocalElement = (id: string) => {
    API.updateScene({
      elements: syncInvalidIndices([
        ...h.app.scene.getElementsIncludingDeleted(),
        API.createElement({ id }),
      ]),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    sync();
  };

  /**
   * ids of the elements in each scene update sent after `from` (sending is
   * async: messages are encrypted first, so callers wait for them)
   */
  const getSentElementIdsSince = (from: number) =>
    getSentUpdates()
      .slice(from)
      .map((message) =>
        message.payload.elements.map((el: ExcalidrawElement) => el.id),
      );

  it("(control) a local edit is sent to the room", async () => {
    const sentBefore = getSentUpdates().length;

    addLocalElement("mine");

    await waitFor(() =>
      expect(getSentElementIdsSince(sentBefore)[0]).toContain("mine"),
    );
  });

  it("AC-F: locking and unlocking sends nothing new to other collaborators", async () => {
    const sentBefore = getSentUpdates().length;
    const emittedBefore = mocks.emitted.length;

    execute("toggleCollaboratorLock", UNKNOWN_CREATOR_ID);
    execute("toggleCollaboratorLock", "alice");
    execute("lockAllCollaborators");
    execute("unlockAllCollaborators");
    // what onChange would do after each state change
    sync();

    // messages go out in order: if the first update sent after locking is
    // this marker edit, locking itself sent nothing
    addLocalElement("marker");
    await waitFor(() =>
      expect(getSentUpdates().length).toBeGreaterThan(sentBefore),
    );

    expect(getSentElementIdsSince(sentBefore)[0]).toContain("marker");
    // and nothing else (e.g. volatile messages) was emitted before it
    expect(
      mocks.emitted
        .slice(emittedBefore)
        .findIndex(([event]) => event === WS_EVENTS.SERVER),
    ).toBe(0);
  });

  it("AC-F: locking and unlocking change no element versions", () => {
    const before = getVersions();

    execute("lockAllCollaborators");
    execute("unlockAllCollaborators");
    sync();

    expect(getVersions()).toEqual(before);
  });

  it("AC-F: a peer's edit to a locked collaborator's element still arrives", async () => {
    execute("lockAllCollaborators");

    await deliver({
      type: WS_SUBTYPES.UPDATE,
      payload: {
        elements: syncInvalidIndices([
          newElementWith(getElement("theirs"), { x: 500 }),
        ]),
      },
    });

    await waitFor(() => expect(getElement("theirs").x).toBe(500));
  });
});
