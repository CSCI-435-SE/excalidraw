/**
 * Room storage with pages (#167): the real firebase.ts save/load code run
 * against an in-memory Firestore (encryption is a passthrough). Everywhere
 * else in the collab tests firebase.ts is mocked out entirely.
 */
import {
  PAGE_ID_KEY,
  newElementWith,
  syncInvalidIndices,
} from "@excalidraw/element";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { Bytes } from "firebase/firestore";
import { vi } from "vitest";

import type {
  ExcalidrawElement,
  FractionalIndex,
} from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

import {
  EMPTY_PAGE_DATA,
  getLocalPageChanges,
  getSharedPageInfos,
} from "../collab/pageSync";
import {
  isSavedToFirebase,
  loadFromFirebase,
  saveToFirebase,
} from "../data/firebase";

import type { SharedPageData } from "../collab/pageSync";
import type { SyncableExcalidrawElement } from "../data";
import type Portal from "../collab/Portal";

const store = vi.hoisted(() => ({ docs: new Map<string, any>() }));

vi.mock("firebase/app", () => ({ initializeApp: () => ({}) }));
vi.mock("firebase/storage", () => ({
  getStorage: () => ({}),
  ref: () => ({}),
  uploadBytes: async () => {},
}));
vi.mock("firebase/firestore", () => {
  class Bytes {
    constructor(private bytes: Uint8Array) {}
    static fromUint8Array(bytes: Uint8Array) {
      return new Bytes(new Uint8Array(bytes));
    }
    toUint8Array() {
      return this.bytes;
    }
  }
  const snapshot = (path: string) => ({
    exists: () => store.docs.has(path),
    data: () => store.docs.get(path),
  });
  return {
    Bytes,
    getFirestore: () => ({}),
    doc: (_db: unknown, collection: string, id: string) =>
      `${collection}/${id}`,
    getDoc: async (path: string) => snapshot(path),
    runTransaction: async (_db: unknown, run: (t: any) => Promise<any>) =>
      run({
        get: async (path: string) => snapshot(path),
        set: (path: string, data: any) => store.docs.set(path, data),
        // like Firestore: only the given fields change
        update: (path: string, data: any) =>
          store.docs.set(path, { ...store.docs.get(path), ...data }),
      }),
  };
});
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

// -----------------------------------------------------------------------------

const ROOM_ID = "room";
const DOC_PATH = `scenes/${ROOM_ID}`;
const appState = getDefaultAppState() as AppState;

/** a fresh client's portal (a new socket: nothing saved by it yet) */
const createPortal = () =>
  ({ roomId: ROOM_ID, roomKey: "room-key", socket: {} } as unknown as Portal);

const onPage = (
  id: string,
  pageId: string,
  index = "a0",
  updates: Partial<ExcalidrawElement> = {},
) =>
  ({
    ...newElementWith(API.createElement({ type: "rectangle", id }), {
      customData: { [PAGE_ID_KEY]: pageId },
    }),
    index: index as FractionalIndex,
    ...updates,
  } as SyncableExcalidrawElement);

const pageData = (
  pages: { id: string; name: string }[],
  updated = 1,
): SharedPageData =>
  getLocalPageChanges(
    EMPTY_PAGE_DATA,
    pages.map((page) => ({
      ...page,
      description: "",
      viewBackgroundColor: "#ffffff",
    })),
    updated,
  )!;

const ids = (elements: readonly ExcalidrawElement[]) =>
  elements.map((el) => el.id);

const names = (data: SharedPageData | null) =>
  data && getSharedPageInfos(data).map((page) => page.name);

/** writes a stored room the way an older client did: elements only */
const storeLegacyRoom = (elements: readonly ExcalidrawElement[]) => {
  const json = new TextEncoder().encode(JSON.stringify(elements));
  store.docs.set(DOC_PATH, {
    sceneVersion: 1,
    iv: Bytes.fromUint8Array(new Uint8Array(12)),
    ciphertext: Bytes.fromUint8Array(json),
  });
};

describe("room storage with pages (#167)", () => {
  beforeEach(() => {
    store.docs.clear();
  });

  // AC 1.1 / 1.3
  it("a new room stores every page's elements and the page data", async () => {
    const pages = pageData([
      { id: "p1", name: "Architecture" },
      { id: "p2", name: "Database" },
    ]);

    await saveToFirebase(
      createPortal(),
      syncInvalidIndices([onPage("box", "p1"), onPage("table", "p2")]),
      appState,
      undefined,
      pages,
    );
    const loaded = await loadFromFirebase(ROOM_ID, "room-key", null);

    expect(ids(loaded!.elements)).toEqual(["box", "table"]);
    expect(loaded!.pageData).toEqual(pages);
  });

  it("a room saved before pages were shared loads without page data", async () => {
    storeLegacyRoom(syncInvalidIndices([onPage("old", "p1")]));

    const loaded = await loadFromFirebase(ROOM_ID, "room-key", null);

    expect(ids(loaded!.elements)).toEqual(["old"]);
    expect(loaded!.pageData).toBeNull();
  });

  it("nothing stored yet: loads nothing", async () => {
    expect(await loadFromFirebase(ROOM_ID, "room-key", null)).toBeNull();
  });

  // AC 5.1 (stored copy)
  it.each([
    ["invalid", { pages: [], deletedPageIds: {} }],
    ["unreadable", "{not json"],
  ])("%s stored page data is treated as missing", async (_, value) => {
    storeLegacyRoom(syncInvalidIndices([onPage("box", "p1")]));
    const raw = typeof value === "string" ? value : JSON.stringify(value);
    store.docs.set(DOC_PATH, {
      ...store.docs.get(DOC_PATH),
      pagesIv: Bytes.fromUint8Array(new Uint8Array(12)),
      pagesCiphertext: Bytes.fromUint8Array(new TextEncoder().encode(raw)),
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const loaded = await loadFromFirebase(ROOM_ID, "room-key", null);

    expect(loaded!.pageData).toBeNull();
    expect(ids(loaded!.elements)).toEqual(["box"]);
    error.mockRestore();
  });

  // AC 4.4 / 4.5 (stored copy): the same merge as for peers' page data
  it("saving merges our page data with the stored copy", async () => {
    const stored = pageData([{ id: "p1", name: "Stored later" }], 20);
    await saveToFirebase(
      createPortal(),
      syncInvalidIndices([onPage("box", "p1")]),
      appState,
      undefined,
      stored,
    );
    // another client, who renamed p1 earlier and added p2
    const ours = getLocalPageChanges(
      pageData([{ id: "p1", name: "Ours earlier" }], 10),
      [
        {
          id: "p1",
          name: "Ours earlier",
          description: "",
          viewBackgroundColor: "#ffffff",
        },
        {
          id: "p2",
          name: "New page",
          description: "",
          viewBackgroundColor: "#ffffff",
        },
      ],
      30,
    )!;

    const result = await saveToFirebase(
      createPortal(),
      syncInvalidIndices([onPage("box", "p1")]),
      appState,
      undefined,
      ours,
    );

    expect(names(result!.pageData)).toEqual(["Stored later", "New page"]);
    expect(
      names((await loadFromFirebase(ROOM_ID, "room-key", null))!.pageData),
    ).toEqual(["Stored later", "New page"]);
  });

  // AC 4.2 (storage): delete wins
  it("drops a deleted page's elements from storage, whoever still had them", async () => {
    await saveToFirebase(
      createPortal(),
      syncInvalidIndices([onPage("box", "p1"), onPage("table", "p2")]),
      appState,
      undefined,
      pageData([
        { id: "p1", name: "One" },
        { id: "p2", name: "Two" },
      ]),
    );
    // a client that deleted p2 but still sends a stale copy of its element
    const withoutP2: SharedPageData = {
      pages: pageData([{ id: "p1", name: "One" }]).pages,
      deletedPageIds: { p2: 50 },
    };

    const result = await saveToFirebase(
      createPortal(),
      syncInvalidIndices([
        onPage("box", "p1"),
        onPage("table", "p2", "a0", { version: 99 }),
      ]),
      appState,
      undefined,
      withoutP2,
    );

    expect(ids(result!.elements)).toEqual(["box"]);
  });

  it("keeps each page's own order keys in storage", async () => {
    await saveToFirebase(
      createPortal(),
      [onPage("on-p1", "p1", "a5")],
      appState,
      undefined,
      pageData([{ id: "p1", name: "One" }]),
    );

    const result = await saveToFirebase(
      createPortal(),
      [onPage("on-p2", "p2", "a5")],
      appState,
      undefined,
      pageData([
        { id: "p1", name: "One" },
        { id: "p2", name: "Two" },
      ]),
    );

    expect(result!.elements.map((el) => `${el.id}@${el.index}`).sort()).toEqual(
      ["on-p1@a5", "on-p2@a5"],
    );
  });

  describe("isSavedToFirebase", () => {
    it("a page change alone counts as unsaved", async () => {
      const portal = createPortal();
      const elements = syncInvalidIndices([onPage("box", "p1")]);
      const saved = pageData([{ id: "p1", name: "One" }]);
      await saveToFirebase(portal, elements, appState, undefined, saved);

      expect(isSavedToFirebase(portal, elements, saved)).toBe(true);
      expect(
        isSavedToFirebase(
          portal,
          elements,
          pageData([{ id: "p1", name: "Renamed" }], 2),
        ),
      ).toBe(false);
      // (page data left out: elements only, as before #167)
      expect(isSavedToFirebase(portal, elements)).toBe(true);
    });

    // bug found in review: the same page data built in a different order
    // (e.g. after a merge) never counted as saved
    it("the same page data in a different order counts as saved", async () => {
      const portal = createPortal();
      const elements = syncInvalidIndices([onPage("box", "p1")]);
      const pages = pageData([{ id: "p1", name: "One" }]).pages;
      await saveToFirebase(portal, elements, appState, undefined, {
        pages,
        deletedPageIds: { a: 1, b: 2 },
      });

      expect(
        isSavedToFirebase(portal, elements, {
          pages,
          deletedPageIds: { b: 2, a: 1 },
        }),
      ).toBe(true);
    });

    it("saving again with nothing changed writes nothing", async () => {
      const portal = createPortal();
      const elements = syncInvalidIndices([onPage("box", "p1")]);
      const saved = pageData([{ id: "p1", name: "One" }]);
      await saveToFirebase(portal, elements, appState, undefined, saved);

      expect(
        await saveToFirebase(portal, elements, appState, undefined, saved),
      ).toBeNull();
    });
  });
});
