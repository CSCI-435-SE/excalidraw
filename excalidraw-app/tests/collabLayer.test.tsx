/**
 * Issue #82 — Criteria E (shared-state integrity) driven through the real
 * Collab/Portal classes. The socket records everything this client sends;
 * encryption is a passthrough. Setup mirrors collabLock.test.tsx (#81).
 *
 * AC-E: "Reordering changes no element (`index` and `version` stay the
 * same) and sends nothing new to other collaborators. Other collaborators
 * see the shared order."
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

const execute = (name: string, value?: unknown) => {
  const action = h.app.actionManager.actions[name as ActionName];
  assert.isDefined(action, `action "${name}" should be registered`);
  act(() => {
    h.app.actionManager.executeAction(action, "ui", value as any);
  });
};

/** what AC-E says must not change */
const getShared = () =>
  h.elements.map(({ id, index, version, versionNonce }) => ({
    id,
    index,
    version,
    versionNonce,
  }));

const getElement = (id: string) => h.elements.find((el) => el.id === id)!;

/** a peer's element arrives in the room, on top of the shared order */
const receivePeerElement = async (id: string) => {
  await deliver({
    type: WS_SUBTYPES.UPDATE,
    payload: {
      elements: syncInvalidIndices([
        ...h.app.scene.getElementsIncludingDeleted(),
        stamp(API.createElement({ id, x: 0 }), "alice"),
      ]),
    },
  });
  await waitFor(() => expect(getElement(id)).toBeDefined());
};

/** layering on, with the miscellaneous bucket (alice's, unseen) on top */
const reorderLocally = () => {
  execute("toggleCollaboratorLayering");
  execute("moveCollaboratorLayer", { id: UNKNOWN_CREATOR_ID, toIndex: 0 });
};

describe("collaborator layering (collaboration) — Criteria E", () => {
  beforeEach(async () => {
    mocks.handlers.clear();
    mocks.emitted.length = 0;
    localStorage.clear();
    sessionStorage.clear();
    // a previous test's room link would make the app auto-join that room
    window.history.replaceState({}, "", window.location.origin);
    await render(<ExcalidrawApp />);
    await startNewRoom();
    await receivePeerElement("theirs");
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

  it("(control) the same reorder does change my local drawing order", () => {
    // my element on top of alice's in the shared order
    API.updateScene({
      elements: syncInvalidIndices([
        ...h.app.scene.getElementsIncludingDeleted(),
        stamp(API.createElement({ id: "mine" }), window.collab.getClientId()!),
      ]),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    act(() => {
      // jsdom's viewport is 0×0: give the canvas a size so elements are drawn
      API.setAppState({ width: 1000, height: 1000 });
    });
    expect(h.app.visibleElements.map((el) => el.id)).toEqual([
      "theirs",
      "mine",
    ]);

    reorderLocally();

    expect(h.app.visibleElements.map((el) => el.id)).toEqual([
      "mine",
      "theirs",
    ]);
  });

  it("AC-E: switching layering, reordering and resetting send nothing new to other collaborators", async () => {
    const sentBefore = getSentUpdates().length;
    const emittedBefore = mocks.emitted.length;

    reorderLocally();
    execute("resetCollaboratorLayerOrder");
    execute("toggleCollaboratorLayering");
    // what onChange would do after each state change
    sync();

    // messages go out in order: if the first update sent after reordering
    // is this marker edit, reordering itself sent nothing
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

  it("AC-E: reordering changes no element index or version", () => {
    const before = getShared();

    reorderLocally();
    sync();

    expect(getShared()).toEqual(before);
  });

  it("AC-E: a local edit while reordered sends the shared indices", async () => {
    reorderLocally();
    const sharedIndex = getElement("theirs").index;
    const sentBefore = getSentUpdates().length;

    addLocalElement("marker");
    await waitFor(() =>
      expect(getSentUpdates().length).toBeGreaterThan(sentBefore),
    );

    const sentTheirs = getSentUpdates()
      .slice(sentBefore)
      .flatMap((message) => message.payload.elements)
      .find((el: ExcalidrawElement) => el.id === "theirs");
    // either not resent at all, or resent unchanged
    expect(sentTheirs?.index ?? sharedIndex).toBe(sharedIndex);
  });

  it("AC-E: a peer's update still arrives, and my scene keeps the shared order", async () => {
    reorderLocally();

    await receivePeerElement("theirs-2");

    const indices = h.elements.map((el) => el.index!);
    expect(indices).toEqual([...indices].sort());
    expect(h.elements.map((el) => el.id)).toEqual(["theirs", "theirs-2"]);
  });
});
