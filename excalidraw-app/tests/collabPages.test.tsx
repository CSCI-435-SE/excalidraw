/**
 * Multi-page live collaboration (#167), driven through the real Collab/Portal
 * classes with a socket that records what's sent and lets tests deliver
 * peers' messages (encryption is a passthrough). Same harness as
 * collabVisibility.test.tsx.
 *
 * Editor-only behaviour (safety net, toasts, view mode…) is tested in
 * packages/excalidraw/tests/pagesCollab.test.tsx.
 */
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { actionClearCanvas } from "@excalidraw/excalidraw/actions";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import {
  act,
  configure,
  render,
  unmountComponent,
  waitFor,
} from "@excalidraw/excalidraw/tests/test-utils";
import {
  CREATOR_ID_KEY,
  PAGE_ID_KEY,
  getElementPageId,
  newElementWith,
  syncInvalidIndices,
} from "@excalidraw/element";
import { vi } from "vitest";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { SocketId } from "@excalidraw/excalidraw/types";

import type { SharedPageInfo } from "@excalidraw/excalidraw/pages";

import { WS_EVENTS, WS_SUBTYPES } from "../app_constants";
import ExcalidrawApp from "../App";
import { appJotaiStore } from "../app-jotai";
import { collabAPIAtom } from "../collab/Collab";

import {
  EMPTY_PAGE_DATA,
  getLocalPageChanges,
  getSharedPageInfos,
} from "../collab/pageSync";

import type { SocketUpdateDataSource } from "../data";
import type { SharedPageData } from "../collab/pageSync";

const { h } = window;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  emitted: [] as any[][],
  storedRoomElements: null as readonly any[] | null,
  /** what saveToFirebase returns (the stored room after a save) */
  saveResult: null as { elements: readonly any[]; pageData: unknown } | null,
  /** what isSavedToFirebase answers */
  isSaved: true,
  storedPageData: null as unknown,
  /** what this client saved to the room (each call's elements) */
  savedRoomElements: [] as (readonly any[])[],
  /** the page data saved with each call */
  savedPageData: [] as unknown[],
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
  loadFromFirebase: async () =>
    mocks.storedRoomElements && {
      elements: mocks.storedRoomElements,
      pageData: mocks.storedPageData,
    },
  saveToFirebase: async (
    _portal: unknown,
    elements: readonly any[],
    _appState: unknown,
    _isKnownToRoom: unknown,
    pageData: unknown,
  ) => {
    mocks.savedPageData.push(pageData);
    mocks.savedRoomElements.push(elements);
    // what the room stores after the save (null: nothing was saved)
    return mocks.saveResult;
  },
  isSavedToFirebase: () => mocks.isSaved,
  loadFilesFromFirebase: async () => ({ loadedFiles: [], erroredFiles: [] }),
  saveFilesToFirebase: async () => ({
    savedFiles: new Map(),
    erroredFiles: new Map(),
  }),
}));

// -----------------------------------------------------------------------------

/** App's private page methods (#157, #158) */
type PageInternals = {
  createPage: () => void;
  selectPage: (pageId: string) => void;
  deletePages: (pageIds: readonly string[]) => void;
};
const pageInternals = () => h.app as unknown as PageInternals;

const getPageIds = () => h.app.getPages().map((page) => page.id);

const getPageElementIds = () =>
  h.app.getPages().map((page) => page.elements.map((el) => el.id));

const tag = <T extends ExcalidrawElement>(element: T, pageId: string) =>
  newElementWith(element as ExcalidrawElement, {
    customData: { ...element.customData, [PAGE_ID_KEY]: pageId },
  }) as T;

const createRect = (id: string) =>
  API.createElement({ type: "rectangle", id, x: 0, y: 0 });

/** messages this client broadcast (decoded) */
const getSentMessages = () =>
  mocks.emitted
    .filter(([event]) => event === WS_EVENTS.SERVER)
    .map(([, , buffer]) => JSON.parse(new TextDecoder().decode(buffer)));

const getSentElements = (): ExcalidrawElement[] =>
  getSentMessages()
    .filter(
      (message) =>
        message.type === WS_SUBTYPES.UPDATE ||
        message.type === WS_SUBTYPES.INIT,
    )
    .flatMap((message) => message.payload.elements);

/** the last copy of the element this client sent */
const getLastSent = (id: string) =>
  getSentElements()
    .filter((el) => el.id === id)
    .at(-1);

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

/** a peer's UPDATE carrying `elements` (indexed, as peers always send them) */
const deliverUpdate = (elements: readonly ExcalidrawElement[]) =>
  deliver({
    type: WS_SUBTYPES.UPDATE,
    payload: {
      elements: syncInvalidIndices(elements.map((el) => ({ ...el }))) as any,
      // no `sentAt`: element timestamps are 1 in tests, which would look a
      // day old to the expired-deletion guard (expiredDeletions.ts)
    },
  });

const triggerServerEvent = async (event: string, ...args: any[]) => {
  await mocks.handlers.get(event)!(...args);
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
  await triggerServerEvent("first-in-room");
  await waitFor(() =>
    expect(window.collab.portal.socketInitialized).toBe(true),
  );
};

/** adds a page (it becomes the open page) and returns its id */
const addPage = () => {
  act(() => pageInternals().createPage());
  return h.app.getActivePageId();
};

const selectPage = (pageId: string) => {
  act(() => pageInternals().selectPage(pageId));
};

/** draws an (untagged) element on the open page, as the user would */
const drawOnOpenPage = (element: ExcalidrawElement) => {
  API.updateScene({
    elements: [...h.app.scene.getElementsIncludingDeleted(), element],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};

describe("multi-page collaboration (room)", () => {
  beforeEach(async () => {
    mocks.handlers.clear();
    mocks.emitted.length = 0;
    mocks.storedRoomElements = null;
    mocks.savedRoomElements.length = 0;
    mocks.savedPageData.length = 0;
    mocks.storedPageData = null;
    mocks.saveResult = null;
    mocks.isSaved = true;
    localStorage.clear();
    sessionStorage.clear();
    // a previous test's room link would make the app auto-join that room
    window.history.replaceState({}, "", window.location.origin);
    await render(<ExcalidrawApp />);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // throttled saves/broadcasts of this test's room must not fire during
    // the next test (they'd land in the shared mocks it reads)
    window.collab?.queueSaveToFirebase?.cancel();
    window.collab?.queueBroadcastAllElements?.cancel();
    window.collab?.portal?.queueFileUpload?.cancel();
  });

  // ---------------------------------------------------------------------------
  // 2. Elements stay on their page
  // ---------------------------------------------------------------------------

  describe("AC 2.1: page tag", () => {
    it("stamps an element with the page it was drawn on when it syncs", async () => {
      await startNewRoom();
      addPage();
      const secondPageId = addPage();

      drawOnOpenPage(createRect("drawn"));
      sync();

      await waitFor(() =>
        expect(getLastSent("drawn")?.customData?.[PAGE_ID_KEY]).toBe(
          secondPageId,
        ),
      );
      expect(getElementPageId(h.elements[0])).toBe(secondPageId);
    });

    it("never changes the tag when the element is edited or moved", async () => {
      await startNewRoom();
      const pageId = h.app.getActivePageId();
      drawOnOpenPage(createRect("drawn"));
      sync();

      API.updateScene({
        elements: [newElementWith(h.elements[0], { x: 500, y: 300 })],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      sync();

      await waitFor(() => expect(getLastSent("drawn")?.x).toBe(500));
      expect(getLastSent("drawn")?.customData?.[PAGE_ID_KEY]).toBe(pageId);
    });

    it("never changes the tag when other pages are reordered or deleted", async () => {
      await startNewRoom();
      const firstPageId = h.app.getActivePageId();
      const secondPageId = addPage();
      const thirdPageId = addPage();
      selectPage(firstPageId);
      drawOnOpenPage(createRect("drawn"));
      sync();

      act(() => {
        h.app.movePageToPosition(thirdPageId, "1");
      });
      act(() => pageInternals().deletePages([secondPageId]));
      sync();

      expect(getPageIds()).toEqual([thirdPageId, firstPageId]);
      expect(getElementPageId(h.elements[0])).toBe(firstPageId);
    });

    it("leaves a peer's tag alone when the element lands on the open page", async () => {
      await startNewRoom();
      const pageId = h.app.getActivePageId();

      await deliverUpdate([tag(createRect("theirs"), pageId)]);
      await waitFor(() =>
        expect(h.elements.map((el) => el.id)).toEqual(["theirs"]),
      );
      const versionBefore = h.elements[0].version;
      sync();

      expect(getElementPageId(h.elements[0])).toBe(pageId);
      expect(h.elements[0].version).toBe(versionBefore);
    });
  });

  describe("AC 2.2: routing", () => {
    it("shows a peer's element on the open page right away", async () => {
      await startNewRoom();
      const pageId = h.app.getActivePageId();

      await deliverUpdate([tag(createRect("theirs"), pageId)]);

      await waitFor(() =>
        expect(h.elements.map((el) => el.id)).toEqual(["theirs"]),
      );
    });

    it("stores a peer's element for another page on that page only", async () => {
      await startNewRoom();
      const firstPageId = h.app.getActivePageId();
      addPage();
      const thirdPageId = addPage();
      selectPage(firstPageId);

      await deliverUpdate([tag(createRect("theirs"), thirdPageId)]);

      // the page list (what the page previews are drawn from) has it on the
      // third page; the open page and the second page don't
      await waitFor(() =>
        expect(getPageElementIds()).toEqual([[], [], ["theirs"]]),
      );
      expect(h.elements).toEqual([]);

      // and it's there when that page is opened
      selectPage(thirdPageId);
      expect(h.elements.map((el) => el.id)).toEqual(["theirs"]);
    });

    it("updates the stored copy when the peer edits it later", async () => {
      await startNewRoom();
      const firstPageId = h.app.getActivePageId();
      const secondPageId = addPage();
      selectPage(firstPageId);
      const theirs = tag(createRect("theirs"), secondPageId);

      await deliverUpdate([theirs]);
      await deliverUpdate([newElementWith(theirs, { x: 123 })]);

      await waitFor(() =>
        expect(h.app.getPages()[1].elements.map((el) => el.x)).toEqual([123]),
      );
    });

    it("splits one update across pages", async () => {
      await startNewRoom();
      const firstPageId = h.app.getActivePageId();
      const secondPageId = addPage();
      selectPage(firstPageId);

      await deliverUpdate([
        tag(createRect("for-first"), firstPageId),
        tag(createRect("for-second"), secondPageId),
      ]);

      await waitFor(() =>
        expect(getPageElementIds()).toEqual([["for-first"], ["for-second"]]),
      );
      expect(h.elements.map((el) => el.id)).toEqual(["for-first"]);
    });

    it("doesn't put an element for a page it doesn't have on any page", async () => {
      await startNewRoom();

      await deliverUpdate([tag(createRect("lost"), "unknown-page")]);
      // a later update proves the first one was processed
      await deliverUpdate([tag(createRect("marker"), h.app.getActivePageId())]);

      await waitFor(() =>
        expect(h.elements.map((el) => el.id)).toEqual(["marker"]),
      );
      expect(getPageElementIds()).toEqual([["marker"]]);
    });
  });

  describe("AC 2.3: untagged elements", () => {
    it("stamps an untagged element once with the first page and puts it there", async () => {
      await startNewRoom();
      const firstPageId = h.app.getActivePageId();
      addPage(); // the second page stays open
      const untagged = createRect("untagged");

      await deliverUpdate([untagged]);

      await waitFor(() =>
        expect(getPageElementIds()).toEqual([["untagged"], []]),
      );
      const stored = h.app.getPages()[0].elements[0];
      expect(getElementPageId(stored)).toBe(firstPageId);
      // a new version, so the tag syncs to the room
      expect(stored.version).toBeGreaterThan(untagged.version);
      expect(h.elements).toEqual([]);
    });

    it("uses the first page in the page list, not the first created or the open one", async () => {
      await startNewRoom();
      const firstCreatedPageId = h.app.getActivePageId();
      const secondPageId = addPage();
      act(() => {
        h.app.movePageToPosition(secondPageId, "1");
      });
      selectPage(firstCreatedPageId);

      await deliverUpdate([createRect("untagged")]);

      await waitFor(() =>
        expect(getPageElementIds()).toEqual([["untagged"], []]),
      );
      expect(getElementPageId(h.app.getPages()[0].elements[0])).toBe(
        secondPageId,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // every page's elements go through the room (page data: see AC 3.2)
  // ---------------------------------------------------------------------------

  /** two local pages with one element each; the first page stays open */
  const setUpTwoPages = () => {
    const firstPageId = h.app.getActivePageId();
    drawOnOpenPage(createRect("on-first"));
    const secondPageId = addPage();
    drawOnOpenPage(createRect("on-second"));
    selectPage(firstPageId);
    return { firstPageId, secondPageId };
  };

  const describeElements = (elements: readonly ExcalidrawElement[]) =>
    elements.map((el) => [
      el.id,
      el.customData?.[PAGE_ID_KEY],
      el.customData?.[CREATOR_ID_KEY],
    ]);

  describe("AC 1.1: starting a room (elements)", () => {
    it("puts every page's elements into the room, tagged with their page and creator", async () => {
      const { firstPageId, secondPageId } = setUpTwoPages();

      await startNewRoom();

      const clientId = window.collab.getClientId();
      expect(describeElements(mocks.savedRoomElements[0])).toEqual([
        ["on-first", firstPageId, clientId],
        ["on-second", secondPageId, clientId],
      ]);
      // the pages hold the stamped copies too
      expect(describeElements(h.app.getPages()[1].elements)).toEqual([
        ["on-second", secondPageId, clientId],
      ]);
    });

    it("leaves deleted elements of every page out of the room", async () => {
      setUpTwoPages();
      addPage();
      drawOnOpenPage(createRect("deleted"));
      API.updateScene({
        elements: [newElementWith(h.elements[0], { isDeleted: true })],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      selectPage(getPageIds()[0]);

      await startNewRoom();

      expect(mocks.savedRoomElements[0].map((el) => el.id)).toEqual([
        "on-first",
        "on-second",
      ]);
      expect(getPageElementIds()).toEqual([["on-first"], ["on-second"], []]);
    });

    it("sends every page's elements to a newcomer (INIT)", async () => {
      const { firstPageId, secondPageId } = setUpTwoPages();
      await startNewRoom();
      mocks.emitted.length = 0;

      await triggerServerEvent("new-user", "peer-socket");

      await waitFor(() => {
        const [init] = getSentMessages().filter(
          (message) => message.type === WS_SUBTYPES.INIT,
        );
        expect(
          init.payload.elements.map((el: ExcalidrawElement) => [
            el.id,
            el.customData?.[PAGE_ID_KEY],
          ]),
        ).toEqual([
          ["on-first", firstPageId],
          ["on-second", secondPageId],
        ]);
      });
    });
  });

  describe("broadcasts, full resync and storage cover every page", () => {
    it("an update carries only what changed", async () => {
      setUpTwoPages();
      await startNewRoom();
      mocks.emitted.length = 0;

      drawOnOpenPage(createRect("new"));
      sync();

      await waitFor(() =>
        expect(getSentElements().map((el) => el.id)).toEqual(["new"]),
      );
    });

    it("the periodic full resync sends every page", async () => {
      setUpTwoPages();
      await startNewRoom();
      mocks.emitted.length = 0;

      act(() => {
        window.collab.queueBroadcastAllElements.cancel();
        // throttled: the first call runs right away
        window.collab.queueBroadcastAllElements();
      });

      await waitFor(() =>
        expect(getSentElements().map((el) => el.id)).toEqual([
          "on-first",
          "on-second",
        ]),
      );
    });

    it("saves every page to room storage", async () => {
      setUpTwoPages();
      await startNewRoom();
      mocks.savedRoomElements.length = 0;

      drawOnOpenPage(createRect("new"));
      sync();
      act(() => {
        window.collab.queueSaveToFirebase.flush();
      });

      await waitFor(() =>
        expect(mocks.savedRoomElements.at(-1)!.map((el) => el.id)).toEqual([
          "on-first",
          "new",
          "on-second",
        ]),
      );
    });

    it("doesn't send a peer's element for another page back to the room", async () => {
      const { secondPageId } = setUpTwoPages();
      await startNewRoom();
      mocks.emitted.length = 0;

      await deliverUpdate([tag(createRect("theirs"), secondPageId)]);
      await waitFor(() =>
        expect(getPageElementIds()[1]).toEqual(["on-second", "theirs"]),
      );
      sync();

      expect(getLastSent("theirs")).toBeUndefined();
    });
  });

  describe("AC 2.2: reconciling with another page's elements", () => {
    it("keeps the newer copy, whichever side has it", async () => {
      const { secondPageId } = setUpTwoPages();
      await startNewRoom();
      const getOnSecond = () =>
        h.app.getPages()[1].elements.find((el) => el.id === "on-second")!;
      const local = getOnSecond();

      await deliverUpdate([{ ...local, x: 111, version: local.version - 1 }]);
      // a later update proves the first one was processed
      await deliverUpdate([tag(createRect("marker"), secondPageId)]);
      await waitFor(() =>
        // (both have order key a0, so the id breaks the tie)
        expect(getPageElementIds()[1]).toEqual(["marker", "on-second"]),
      );
      // older: ours stays
      expect(getOnSecond().x).toBe(local.x);

      await deliverUpdate([{ ...local, x: 222, version: local.version + 1 }]);
      await waitFor(() => expect(getOnSecond().x).toBe(222));
    });

    it("keeps each page's own element order keys", async () => {
      const { firstPageId, secondPageId } = setUpTwoPages();
      await startNewRoom();

      // the same order key on two pages is fine: each page orders its own
      await deliver({
        type: WS_SUBTYPES.UPDATE,
        payload: {
          elements: [
            { ...tag(createRect("first-a5"), firstPageId), index: "a5" },
            { ...tag(createRect("second-a5"), secondPageId), index: "a5" },
          ] as any,
        },
      });

      await waitFor(() =>
        expect(
          h.app
            .getPages()
            .map((page) => page.elements.map((el) => `${el.id}@${el.index}`)),
        ).toEqual([
          ["on-first@a0", "first-a5@a5"],
          ["on-second@a0", "second-a5@a5"],
        ]),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // page data (#167): order, names, descriptions, backgrounds, deletions
  // ---------------------------------------------------------------------------

  const ROOM = { roomId: "room-id", roomKey: "room-key-0000000000000" };

  /** room page data with every field changed at `updated` */
  const roomPageData = (
    pages: (Partial<SharedPageInfo> & { id: string })[],
    updated = 1,
  ) =>
    getLocalPageChanges(
      EMPTY_PAGE_DATA,
      pages.map((page) => ({
        name: page.id,
        description: "",
        viewBackgroundColor: "#ffffff",
        ...page,
      })),
      updated,
    )!;

  const deliverPageData = (pageData: unknown) =>
    deliver({ type: WS_SUBTYPES.PAGE_DATA, payload: pageData as any });

  const getSentPageData = (): SharedPageData[] =>
    getSentMessages()
      .filter((message) => message.type === WS_SUBTYPES.PAGE_DATA)
      .map((message) => message.payload);

  const getLastSentPageInfos = () =>
    getSharedPageInfos(getSentPageData().at(-1)!);

  /** what the page list shows: [name, description, background] */
  const getPageInfos = () =>
    h.app
      .getPages()
      .map((page) => [
        page.name,
        page.description,
        page.settings.viewBackgroundColor,
      ]);

  /** joins ROOM by its link; the room's messages are delivered by the test */
  const joinRoom = async () => {
    act(() => {
      window.collab.startCollaboration(ROOM);
    });
    await waitFor(() =>
      expect(mocks.handlers.has("client-broadcast")).toBe(true),
    );
  };

  /** joins ROOM while nobody else is online: the stored room is loaded */
  const joinRoomAlone = async () => {
    await joinRoom();
    await triggerServerEvent("first-in-room");
    await waitFor(() =>
      expect(window.collab.portal.socketInitialized).toBe(true),
    );
  };

  /** a peer's INIT (the room's elements), which completes joining */
  const deliverInit = async (elements: readonly ExcalidrawElement[]) => {
    await deliver({
      type: WS_SUBTYPES.INIT,
      payload: {
        elements: syncInvalidIndices(elements.map((el) => ({ ...el }))) as any,
      },
    });
    await waitFor(() =>
      expect(window.collab.portal.socketInitialized).toBe(true),
    );
  };

  /** the room every joining test joins: two pages, one element on each */
  const ARCHITECTURE = {
    id: "architecture",
    name: "Architecture",
    description: "Services",
    viewBackgroundColor: "#ffffff",
  };
  const DATABASE = {
    id: "database",
    name: "Database",
    description: "Tables",
    viewBackgroundColor: "#ffec99",
  };
  const ROOM_PAGE_INFOS = [
    ["Architecture", "Services", "#ffffff"],
    ["Database", "Tables", "#ffec99"],
  ];
  const roomElements = () => [
    tag(createRect("box"), ARCHITECTURE.id),
    tag(createRect("table"), DATABASE.id),
  ];

  /** a local drawing that joining must replace */
  const setUpLocalDrawing = () => {
    drawOnOpenPage(createRect("mine"));
    addPage();
  };

  describe("AC 1.1: starting a room (page data)", () => {
    it("shares every page's order, name, description and background", async () => {
      const firstPageId = h.app.getActivePageId();
      act(() => {
        h.app.updatePageInfo(firstPageId, {
          name: "Architecture",
          description: "Services",
          showThumbnail: true,
          grid: {
            gridModeEnabled: false,
            gridSnapEnabled: false,
            gridSize: 20,
          },
        });
      });
      addPage();
      act(() => {
        API.setAppState({ viewBackgroundColor: "#ffec99" });
      });

      await startNewRoom();

      expect(
        getSharedPageInfos(mocks.savedPageData[0] as SharedPageData),
      ).toEqual([
        {
          id: firstPageId,
          name: "Architecture",
          description: "Services",
          viewBackgroundColor: "#ffffff",
        },
        {
          id: getPageIds()[1],
          // the next free default name once page 1 is renamed (#160)
          name: "Page 1",
          description: "",
          viewBackgroundColor: "#ffec99",
        },
      ]);
    });

    it("sends the pages to a newcomer before the elements", async () => {
      await startNewRoom();
      mocks.emitted.length = 0;

      await triggerServerEvent("new-user", "peer-socket");

      await waitFor(() =>
        expect(getSentMessages().map((message) => message.type)).toEqual([
          WS_SUBTYPES.PAGE_DATA,
          WS_SUBTYPES.INIT,
          WS_SUBTYPES.USER_IDENTITY,
        ]),
      );
    });
  });

  describe("AC 1.2: joining a room", () => {
    it("replaces the pages you had with the room's pages", async () => {
      setUpLocalDrawing();
      const localPageIds = getPageIds();

      await joinRoom();
      await deliverPageData(roomPageData([ARCHITECTURE, DATABASE]));
      await deliverInit(roomElements());

      expect(getPageInfos()).toEqual(ROOM_PAGE_INFOS);
      expect(getPageIds()).toEqual(["architecture", "database"]);
      expect(getPageIds()).not.toEqual(expect.arrayContaining(localPageIds));
      await waitFor(() =>
        expect(getPageElementIds()).toEqual([["box"], ["table"]]),
      );
    });

    it("keeps the room's pages as the local drawing after leaving", async () => {
      await joinRoom();
      await deliverPageData(roomPageData([ARCHITECTURE, DATABASE]));
      await deliverInit(roomElements());
      await waitFor(() =>
        expect(getPageElementIds()).toEqual([["box"], ["table"]]),
      );

      act(() => {
        window.collab.stopCollaboration(false);
      });

      expect(window.collab.isCollaborating()).toBe(false);
      expect(getPageInfos()).toEqual(ROOM_PAGE_INFOS);
      expect(getPageElementIds()).toEqual([["box"], ["table"]]);
    });

    it("puts elements that arrive before their page on it once it arrives", async () => {
      await startNewRoom();

      await deliverUpdate([tag(createRect("early"), "late-page")]);
      expect(getPageElementIds()).toEqual([[]]);

      // the peer's page, added after ours
      const ours = window.collab.getPageData()!;
      await deliverPageData(
        getLocalPageChanges(
          ours,
          [
            ...getSharedPageInfos(ours),
            {
              id: "late-page",
              name: "Late",
              description: "",
              viewBackgroundColor: "#ffffff",
            },
          ],
          Date.now(),
        ),
      );

      await waitFor(() => expect(getPageElementIds()).toEqual([[], ["early"]]));
    });
  });

  describe("AC 1.3: room storage", () => {
    it("a user who joins while nobody is online gets every page", async () => {
      setUpLocalDrawing();
      mocks.storedPageData = roomPageData([ARCHITECTURE, DATABASE]);
      mocks.storedRoomElements = syncInvalidIndices(roomElements());

      await joinRoomAlone();

      await waitFor(() =>
        expect(getPageElementIds()).toEqual([["box"], ["table"]]),
      );
      expect(getPageInfos()).toEqual(ROOM_PAGE_INFOS);
      expect(h.elements.map((el) => el.id)).toEqual(["box"]);
    });

    it("puts untagged stored elements on the first page, stamped once", async () => {
      mocks.storedPageData = roomPageData([ARCHITECTURE, DATABASE]);
      mocks.storedRoomElements = syncInvalidIndices([
        createRect("stored-untagged"),
      ]);

      await joinRoomAlone();

      await waitFor(() =>
        expect(getPageElementIds()).toEqual([["stored-untagged"], []]),
      );
      expect(getElementPageId(h.app.getPages()[0].elements[0])).toBe(
        ARCHITECTURE.id,
      );
      // and the new stamp is sent to the room
      sync();
      await waitFor(() =>
        expect(getLastSent("stored-untagged")?.customData?.[PAGE_ID_KEY]).toBe(
          ARCHITECTURE.id,
        ),
      );
    });

    it("a room stored without pages starts from one blank page", async () => {
      setUpLocalDrawing();
      mocks.storedRoomElements = syncInvalidIndices([createRect("legacy")]);

      await joinRoomAlone();

      await waitFor(() => expect(getPageElementIds()).toEqual([["legacy"]]));
      expect(getPageInfos()).toEqual([["Page 1", "", "#ffffff"]]);
    });

    it("saves page changes with the room", async () => {
      await startNewRoom();
      act(() => {
        h.app.updatePageInfo(h.app.getActivePageId(), {
          name: "Renamed",
          description: "",
          showThumbnail: true,
          grid: {
            gridModeEnabled: false,
            gridSnapEnabled: false,
            gridSize: 20,
          },
        });
      });
      sync();
      act(() => {
        window.collab.queueSaveToFirebase.flush();
      });

      await waitFor(() =>
        expect(
          getSharedPageInfos(mocks.savedPageData.at(-1) as SharedPageData).map(
            (page) => page.name,
          ),
        ).toEqual(["Renamed"]),
      );
    });
  });

  describe("AC 3.2: shared page changes", () => {
    /** a room with two pages, the first open; returns their ids */
    const startRoomWithTwoPages = async () => {
      const firstPageId = h.app.getActivePageId();
      const secondPageId = addPage();
      selectPage(firstPageId);
      await startNewRoom();
      mocks.emitted.length = 0;
      return { firstPageId, secondPageId };
    };

    const changePageInfo = (
      pageId: string,
      patch: { name?: string; description?: string },
    ) => {
      const page = h.app.getPages().find((p) => p.id === pageId)!;
      act(() => {
        h.app.updatePageInfo(pageId, {
          name: patch.name ?? page.name,
          description: patch.description ?? page.description,
          showThumbnail: page.showThumbnail,
          grid: {
            gridModeEnabled: page.settings.gridModeEnabled,
            gridSnapEnabled: page.settings.gridSnapEnabled,
            gridSize: page.settings.gridSize,
          },
        });
      });
    };

    describe("sends", () => {
      it("a new page", async () => {
        await startRoomWithTwoPages();
        const pageId = addPage();
        sync();

        await waitFor(() =>
          expect(getLastSentPageInfos().map((page) => page.id)).toEqual([
            ...getPageIds().slice(0, 2),
            pageId,
          ]),
        );
      });

      it("a rename and a description", async () => {
        const { secondPageId } = await startRoomWithTwoPages();
        changePageInfo(secondPageId, {
          name: "Schema",
          description: "Tables",
        });
        sync();

        await waitFor(() =>
          expect(getLastSentPageInfos()[1]).toEqual({
            id: secondPageId,
            name: "Schema",
            description: "Tables",
            viewBackgroundColor: "#ffffff",
          }),
        );
      });

      it("a reorder by drag", async () => {
        const { firstPageId, secondPageId } = await startRoomWithTwoPages();
        act(() => {
          (h.app as any).movePageNavItem(
            { type: "page", id: secondPageId },
            { type: "page", id: firstPageId },
            "before",
          );
        });
        sync();

        await waitFor(() =>
          expect(getLastSentPageInfos().map((page) => page.id)).toEqual([
            secondPageId,
            firstPageId,
          ]),
        );
      });

      it("a reorder by typed position", async () => {
        const { firstPageId, secondPageId } = await startRoomWithTwoPages();
        act(() => {
          h.app.movePageToPosition(firstPageId, "2");
        });
        sync();

        await waitFor(() =>
          expect(getLastSentPageInfos().map((page) => page.id)).toEqual([
            secondPageId,
            firstPageId,
          ]),
        );
      });

      it("the open page's background, for that page only", async () => {
        await startRoomWithTwoPages();
        act(() => {
          API.setAppState({ viewBackgroundColor: "#ffc9c9" });
        });
        sync();

        await waitFor(() =>
          expect(
            getLastSentPageInfos().map((page) => page.viewBackgroundColor),
          ).toEqual(["#ffc9c9", "#ffffff"]),
        );
      });
    });

    describe("applies a peer's", () => {
      /** our pages as page data, with `change` applied by a peer later */
      const peerChanges = (
        change: (
          pages: SharedPageInfo[],
        ) => (Partial<SharedPageInfo> & { id: string })[],
      ) => {
        const ours = window.collab.getPageData()!;
        // a peer's change: later than ours, positions taken from its order
        return getLocalPageChanges(
          ours,
          change(getSharedPageInfos(ours)) as SharedPageInfo[],
          Date.now() + 1000,
        )!;
      };

      it("new page, rename, description and background", async () => {
        const { firstPageId, secondPageId } = await startRoomWithTwoPages();

        await deliverPageData(
          peerChanges((pages) => [
            { ...pages[0], viewBackgroundColor: "#ffc9c9" },
            { ...pages[1], name: "Schema", description: "Tables" },
            {
              id: "peer-page",
              name: "UI flow",
              description: "",
              viewBackgroundColor: "#ffffff",
            },
          ]),
        );

        expect(getPageIds()).toEqual([firstPageId, secondPageId, "peer-page"]);
        // (the open page's background is editor state: committed by React)
        await waitFor(() =>
          expect(getPageInfos()).toEqual([
            ["Page 1", "", "#ffc9c9"],
            ["Schema", "Tables", "#ffffff"],
            ["UI flow", "", "#ffffff"],
          ]),
        );
        // the open page's background shows right away
        expect(h.state.viewBackgroundColor).toBe("#ffc9c9");
        // and switching pages is still ours alone (AC 3.1)
        expect(h.app.getActivePageId()).toBe(firstPageId);
      });

      it("reorder", async () => {
        const { firstPageId, secondPageId } = await startRoomWithTwoPages();

        await deliverPageData(peerChanges((pages) => [pages[1], pages[0]]));

        expect(getPageIds()).toEqual([secondPageId, firstPageId]);
      });

      it("change without echoing it back", async () => {
        await startRoomWithTwoPages();

        await deliverPageData(
          peerChanges((pages) => [{ ...pages[0], name: "Theirs" }, pages[1]]),
        );
        sync();

        expect(getSentPageData()).toEqual([]);
      });
    });
  });

  describe("AC 3.3: personal settings", () => {
    it("scroll, zoom, grid and thumbnail changes send nothing", async () => {
      await startNewRoom();
      mocks.emitted.length = 0;
      const page = h.app.getPages()[0];

      act(() => {
        API.setAppState({
          scrollX: 100,
          scrollY: 200,
          zoom: { value: 2 as any },
        });
        h.app.updatePageInfo(page.id, {
          name: page.name,
          description: page.description,
          showThumbnail: false,
          grid: { gridModeEnabled: true, gridSnapEnabled: true, gridSize: 40 },
        });
      });
      sync();

      expect(getSentPageData()).toEqual([]);
    });

    it("page messages carry only the shared fields", async () => {
      await startNewRoom();
      mocks.emitted.length = 0;
      addPage();
      sync();

      await waitFor(() => expect(getSentPageData()).not.toEqual([]));
      for (const pageData of getSentPageData()) {
        expect(Object.keys(pageData).sort()).toEqual([
          "deletedPageIds",
          "pages",
        ]);
        for (const page of pageData.pages) {
          expect(Object.keys(page).sort()).toEqual([
            "description",
            "id",
            "name",
            "position",
            "viewBackgroundColor",
          ]);
        }
      }
    });
  });

  describe("AC 4.2: delete wins (pages)", () => {
    it("sends a deleted page as deleted", async () => {
      await startNewRoom();
      const secondPageId = addPage();
      sync();
      act(() => pageInternals().deletePages([secondPageId]));
      sync();

      await waitFor(() =>
        expect(Object.keys(getSentPageData().at(-1)!.deletedPageIds)).toEqual([
          secondPageId,
        ]),
      );
    });

    it("a page a peer deleted never comes back from a late edit", async () => {
      await startNewRoom();
      const firstPageId = h.app.getActivePageId();
      const secondPageId = addPage();
      selectPage(firstPageId);
      sync();
      const before = window.collab.getPageData()!;

      // a peer deletes the second page…
      await deliverPageData({
        pages: before.pages.filter((page) => page.id === firstPageId),
        deletedPageIds: { [secondPageId]: Date.now() + 1000 },
      });
      expect(getPageIds()).toEqual([firstPageId]);

      // …while another peer, who hadn't heard yet, renamed it later
      await deliverPageData(
        getLocalPageChanges(
          before,
          getSharedPageInfos(before).map((page) =>
            page.id === secondPageId ? { ...page, name: "Edited" } : page,
          ),
          Date.now() + 2000,
        ),
      );
      // and drew on it
      await deliverUpdate([tag(createRect("late"), secondPageId)]);

      expect(getPageIds()).toEqual([firstPageId]);
      expect(getPageElementIds()).toEqual([[]]);
    });
  });

  describe("AC 4.4 and 4.5: changes that cross in transit", () => {
    const renameOpenPage = (name: string) => {
      const page = h.app.getPages()[0];
      act(() => {
        h.app.updatePageInfo(page.id, {
          name,
          description: page.description,
          showThumbnail: page.showThumbnail,
          grid: {
            gridModeEnabled: false,
            gridSnapEnabled: false,
            gridSize: 20,
          },
        });
      });
      sync();
    };

    /** the room's page data before either change */
    const startCrossing = async () => {
      await startNewRoom();
      addPage();
      selectPage(getPageIds()[0]);
      sync();
      return window.collab.getPageData()!;
    };

    it("a later rename of the same page by a peer wins", async () => {
      const before = await startCrossing();
      renameOpenPage("Mine");

      await deliverPageData(
        getLocalPageChanges(
          before,
          getSharedPageInfos(before).map((page, i) =>
            i === 0 ? { ...page, name: "Theirs" } : page,
          ),
          Date.now() + 1000,
        ),
      );

      expect(h.app.getPages()[0].name).toBe("Theirs");
    });

    it("an earlier rename by a peer loses, and the peer gets ours", async () => {
      const before = await startCrossing();
      renameOpenPage("Mine");
      mocks.emitted.length = 0;

      await deliverPageData(
        getLocalPageChanges(
          before,
          getSharedPageInfos(before).map((page, i) =>
            i === 0 ? { ...page, name: "Theirs" } : page,
          ),
          1,
        ),
      );

      expect(h.app.getPages()[0].name).toBe("Mine");
      await waitFor(() => expect(getLastSentPageInfos()[0].name).toBe("Mine"));
    });

    it("two pages renamed to the same name: the later one becomes Page N", async () => {
      const before = await startCrossing();
      renameOpenPage("Plan");

      // a peer renamed the second page to "plan" after our rename
      await deliverPageData(
        getLocalPageChanges(
          before,
          getSharedPageInfos(before).map((page, i) =>
            i === 1 ? { ...page, name: "plan" } : page,
          ),
          Date.now() + 1000,
        ),
      );

      // "Page 1" was the first page's old name, so it's free again
      expect(h.app.getPages().map((page) => page.name)).toEqual([
        "Plan",
        "Page 1",
      ]);
    });
  });

  describe("AC 5.1: bad page data from a peer", () => {
    const validPage = () => window.collab.getPageData()!.pages[0];

    it.each([
      [
        "a duplicate page id",
        () => ({ pages: [validPage(), validPage()], deletedPageIds: {} }),
      ],
      [
        "a page with missing fields",
        () => ({
          pages: [{ id: validPage().id, name: validPage().name }],
          deletedPageIds: {},
        }),
      ],
      [
        "an unknown, empty page id",
        () => ({ pages: [{ ...validPage(), id: "" }], deletedPageIds: {} }),
      ],
      ["no pages at all", () => ({ deletedPageIds: {} })],
    ])("ignores %s and leaves the pages unchanged", async (_, payload) => {
      await startNewRoom();
      addPage();
      sync();
      const pagesBefore = h.app.getPages();
      const pageDataBefore = window.collab.getPageData();

      await deliverPageData(payload());

      expect(h.app.getPages()).toEqual(pagesBefore);
      expect(window.collab.getPageData()).toBe(pageDataBefore);
    });
  });

  // ---------------------------------------------------------------------------
  // deleting, clearing, failures (step 4)
  // ---------------------------------------------------------------------------

  /** a room with two pages and one element on each; the first page open */
  const startRoomWithTwoDrawnPages = async () => {
    const firstPageId = h.app.getActivePageId();
    drawOnOpenPage(createRect("on-first"));
    const secondPageId = addPage();
    drawOnOpenPage(createRect("on-second"));
    selectPage(firstPageId);
    await startNewRoom();
    mocks.emitted.length = 0;
    return { firstPageId, secondPageId };
  };

  /** our page data with pages removed by a peer, later than any change */
  const peerDeletes = (...pageIds: string[]): SharedPageData => {
    const ours = window.collab.getPageData()!;
    return {
      pages: ours.pages.filter((page) => !pageIds.includes(page.id)),
      deletedPageIds: {
        ...ours.deletedPageIds,
        ...Object.fromEntries(pageIds.map((id) => [id, Date.now() + 1000])),
      },
    };
  };

  describe("AC 4.1: deleting a page someone is on", () => {
    it("deleting a page sends it as deleted; its elements go with it", async () => {
      const { secondPageId } = await startRoomWithTwoDrawnPages();

      act(() => pageInternals().deletePages([secondPageId]));
      sync();

      await waitFor(() =>
        expect(Object.keys(getSentPageData().at(-1)!.deletedPageIds)).toEqual([
          secondPageId,
        ]),
      );
      expect(getPageElementIds()).toEqual([["on-first"]]);
    });

    it("a peer deleting the page you're on moves you to the page before it", async () => {
      const { firstPageId, secondPageId } = await startRoomWithTwoDrawnPages();
      selectPage(secondPageId);

      await deliverPageData(peerDeletes(secondPageId));

      expect(getPageIds()).toEqual([firstPageId]);
      expect(h.app.getActivePageId()).toBe(firstPageId);
      expect(h.elements.map((el) => el.id)).toEqual(["on-first"]);
      await waitFor(() =>
        expect(h.state.toast?.message).toBe(
          '"Page 2" was deleted by a collaborator.',
        ),
      );
    });

    it("…or the next one if it was first", async () => {
      const { firstPageId, secondPageId } = await startRoomWithTwoDrawnPages();

      await deliverPageData(peerDeletes(firstPageId));

      expect(h.app.getActivePageId()).toBe(secondPageId);
      expect(h.elements.map((el) => el.id)).toEqual(["on-second"]);
    });

    it("an element mid-drag on the deleted page is sent nowhere afterwards", async () => {
      const { secondPageId } = await startRoomWithTwoDrawnPages();
      selectPage(secondPageId);
      drawOnOpenPage(createRect("in-progress"));
      sync();
      await waitFor(() => expect(getLastSent("in-progress")).toBeDefined());

      await deliverPageData(peerDeletes(secondPageId));
      mocks.emitted.length = 0;
      sync();
      act(() => {
        window.collab.queueBroadcastAllElements.cancel();
        window.collab.queueBroadcastAllElements();
      });

      await waitFor(() => expect(getSentElements()).not.toEqual([]));
      expect(getLastSent("in-progress")).toBeUndefined();
      expect(getPageElementIds()).toEqual([["on-first"]]);
    });
  });

  describe("AC 4.2: delete wins (elements)", () => {
    it("edits to a deleted page's elements that arrive later are discarded", async () => {
      const { secondPageId } = await startRoomWithTwoDrawnPages();
      const onSecond = h.app.getPages()[1].elements[0];

      await deliverPageData(peerDeletes(secondPageId));
      await deliverUpdate([
        { ...onSecond, x: 999, version: onSecond.version + 10 },
      ]);

      expect(getPageIds()).not.toContain(secondPageId);
      expect(getPageElementIds()).toEqual([["on-first"]]);
    });

    it("keeps sending our changes after pages (and their elements) are gone", async () => {
      const { secondPageId } = await startRoomWithTwoDrawnPages();
      await deliverPageData(peerDeletes(secondPageId));
      mocks.emitted.length = 0;

      drawOnOpenPage(createRect("after"));
      sync();

      await waitFor(() =>
        expect(getSentElements().map((el) => el.id)).toEqual(["after"]),
      );
    });
  });

  describe("AC 4.3: deleting every page", () => {
    it("leaves one new blank page, first, and sends it", async () => {
      const { firstPageId, secondPageId } = await startRoomWithTwoDrawnPages();

      act(() => pageInternals().deletePages([firstPageId, secondPageId]));
      sync();

      const [blank] = getPageIds();
      expect(getPageIds()).toEqual([blank]);
      await waitFor(() => {
        const sent = getSentPageData().at(-1)!;
        expect(sent.pages.map((page) => page.id)).toEqual([blank]);
        expect(Object.keys(sent.deletedPageIds).sort()).toEqual(
          [firstPageId, secondPageId].sort(),
        );
      });
    });

    it("every collaborator gets the same blank page, first", async () => {
      const { firstPageId, secondPageId } = await startRoomWithTwoDrawnPages();
      const ours = window.collab.getPageData()!;
      // what the deleting peer sends: every page deleted, its blank page
      const theirs = getLocalPageChanges(
        ours,
        [
          {
            id: "peer-blank",
            name: "Page 1",
            description: "",
            viewBackgroundColor: "#ffffff",
          },
        ],
        Date.now() + 1000,
      )!;

      await deliverPageData(theirs);

      expect(getPageIds()).toEqual(["peer-blank"]);
      expect(getPageIds()).not.toContain(firstPageId);
      expect(getPageIds()).not.toContain(secondPageId);
      expect(getPageElementIds()).toEqual([[]]);
    });
  });

  describe("AC 4.6: clearing", () => {
    /**
     * What Collab hands to Portal to send that Portal hasn't sent yet.
     * (Checked before Portal's own filter: in tests every element's
     * `updated` is 1, so a deletion always looks a day old and Portal's
     * existing expiry filter drops it. Live clients use the real clock.)
     */
    const spyOnUnsent = () => {
      const { portal } = window.collab;
      const sent = new Map(portal.broadcastedElementVersions);
      const handedOver: ExcalidrawElement[] = [];
      const spy = vi
        .spyOn(portal, "broadcastScene")
        .mockImplementation(async (_type, elements) => {
          handedOver.push(...elements);
        });
      return {
        unsent: (id: string) =>
          handedOver
            .filter((el) => el.id === id)
            .filter((el) => el.version > (sent.get(el.id) ?? -1))
            .at(-1),
        restore: () => spy.mockRestore(),
      };
    };

    it("clearing a page that isn't open sends its elements as deleted", async () => {
      const { secondPageId } = await startRoomWithTwoDrawnPages();
      const { unsent } = spyOnUnsent();

      act(() => h.app.clearPages([secondPageId]));
      sync();

      expect(unsent("on-second")?.isDeleted).toBe(true);
      expect(unsent("on-first")).toBeUndefined();
    });

    it("'Clear canvas and all pages' sends every page's elements as deleted", async () => {
      await startRoomWithTwoDrawnPages();
      const { unsent } = spyOnUnsent();

      act(() => {
        h.app.actionManager.executeAction(actionClearCanvas, "api", {
          scope: "allPages",
        });
      });
      sync();

      expect(unsent("on-first")?.isDeleted).toBe(true);
      expect(unsent("on-second")?.isDeleted).toBe(true);
    });

    it("a peer's clearing empties that page here", async () => {
      await startRoomWithTwoDrawnPages();
      const onSecond = h.app.getPages()[1].elements[0];

      await deliverUpdate([
        newElementWith(onSecond, { isDeleted: true }) as ExcalidrawElement,
      ]);

      await waitFor(() =>
        expect(
          h.app.getPages()[1].elements.filter((el) => !el.isDeleted),
        ).toEqual([]),
      );
    });
  });

  describe("AC 5.2: reconnecting", () => {
    it("catches up with the room's pages and elements, and sends ours", async () => {
      const { firstPageId, secondPageId } = await startRoomWithTwoDrawnPages();
      const before = window.collab.getPageData()!;

      // offline: we rename the first page…
      act(() => {
        h.app.updatePageInfo(firstPageId, {
          name: "Ours",
          description: "",
          showThumbnail: true,
          grid: {
            gridModeEnabled: false,
            gridSnapEnabled: false,
            gridSize: 20,
          },
        });
      });
      sync();
      // …while someone else added a page with a drawing and saved the room
      mocks.storedPageData = getLocalPageChanges(
        before,
        [
          ...getSharedPageInfos(before),
          {
            id: "added-offline",
            name: "Added",
            description: "",
            viewBackgroundColor: "#ffffff",
          },
        ],
        Date.now() + 1000,
      );
      mocks.storedRoomElements = syncInvalidIndices([
        tag(createRect("drawn-offline"), "added-offline"),
      ]);
      mocks.emitted.length = 0;

      // the socket reconnects: the server asks us to join again
      await triggerServerEvent("init-room");

      await waitFor(() =>
        expect(getPageIds()).toEqual([
          firstPageId,
          secondPageId,
          "added-offline",
        ]),
      );
      expect(h.app.getPages()[0].name).toBe("Ours");
      await waitFor(() =>
        expect(getPageElementIds()[2]).toEqual(["drawn-offline"]),
      );
      // and ours went out: page data with our rename, a full resync
      await waitFor(() => {
        expect(getLastSentPageInfos()[0].name).toBe("Ours");
        expect(getSentElements().map((el) => el.id)).toEqual(
          expect.arrayContaining(["on-first", "on-second"]),
        );
      });
    });

    it("rejoins the room when reconnecting", async () => {
      await startNewRoom();
      mocks.emitted.length = 0;

      await triggerServerEvent("init-room");

      expect(mocks.emitted).toContainEqual(["join-room", expect.any(String)]);
    });
  });

  // ---------------------------------------------------------------------------
  // presence and follow mode (step 5)
  // ---------------------------------------------------------------------------

  const ALICE = "alice-socket" as SocketId;
  const BOB = "bob-socket" as SocketId;

  /** a peer tells the room which page it's on */
  const deliverPresence = (socketId: SocketId, pageId?: string) =>
    deliver({
      type: WS_SUBTYPES.USER_IDENTITY,
      payload: {
        socketId,
        clientId: `${socketId}-client`,
        username: socketId,
        ...(pageId ? { pageId } : {}),
      },
    });

  const getCollaboratorPage = (socketId: SocketId) =>
    h.state.collaborators.get(socketId)?.pageId;

  /** a room with two pages, the first open; returns their ids */
  const startRoomOnFirstOfTwoPages = async () => {
    const firstPageId = h.app.getActivePageId();
    const secondPageId = addPage();
    selectPage(firstPageId);
    await startNewRoom();
    mocks.emitted.length = 0;
    return { firstPageId, secondPageId };
  };

  const getSentVolatile = () =>
    mocks.emitted
      .filter(([event]) => event === WS_EVENTS.SERVER_VOLATILE)
      .map(([, , buffer]) => JSON.parse(new TextDecoder().decode(buffer)));

  describe("AC 3.1 / 6: our page in presence messages", () => {
    it("pointer, idle and identity messages carry the page we're on", async () => {
      const { firstPageId } = await startRoomOnFirstOfTwoPages();

      await act(async () => {
        await window.collab.portal.broadcastMouseLocation({
          pointer: { x: 0, y: 0, tool: "pointer" },
          button: "up",
        });
        await window.collab.portal.broadcastIdleChange("active" as any);
        await window.collab.portal.broadcastUserIdentity();
      });

      expect(
        [...getSentVolatile(), ...getSentMessages()].map((message) => [
          message.type,
          message.payload.pageId,
        ]),
      ).toEqual([
        [WS_SUBTYPES.MOUSE_LOCATION, firstPageId],
        [WS_SUBTYPES.IDLE_STATUS, firstPageId],
        [WS_SUBTYPES.USER_IDENTITY, firstPageId],
      ]);
    });

    it("switching pages tells the room once, without changing anything else", async () => {
      const { secondPageId } = await startRoomOnFirstOfTwoPages();

      selectPage(secondPageId);
      sync();
      sync();

      await waitFor(() =>
        expect(
          getSentMessages().map((message) => [
            message.type,
            message.payload.pageId,
          ]),
        ).toEqual([[WS_SUBTYPES.USER_IDENTITY, secondPageId]]),
      );
      // nothing that would move anyone else: no page data, no elements
      expect(getSentPageData()).toEqual([]);
      expect(getSentElements()).toEqual([]);
    });

    it("a peer switching pages never changes our page", async () => {
      const { firstPageId, secondPageId } = await startRoomOnFirstOfTwoPages();

      await deliverPresence(ALICE, firstPageId);
      await deliverPresence(ALICE, secondPageId);

      await waitFor(() =>
        expect(getCollaboratorPage(ALICE)).toBe(secondPageId),
      );
      expect(h.app.getActivePageId()).toBe(firstPageId);
    });
  });

  describe("AC 6.2: who is on which page", () => {
    it("follows peers across pages and forgets them when they leave", async () => {
      const { firstPageId, secondPageId } = await startRoomOnFirstOfTwoPages();
      await triggerServerEvent("room-user-change", ["my-socket", ALICE, BOB]);

      await deliverPresence(ALICE, firstPageId);
      await deliverPresence(BOB, secondPageId);
      await waitFor(() => expect(getCollaboratorPage(ALICE)).toBe(firstPageId));
      await waitFor(() => expect(getCollaboratorPage(BOB)).toBe(secondPageId));

      // alice switches
      await deliverPresence(ALICE, secondPageId);
      await waitFor(() =>
        expect(getCollaboratorPage(ALICE)).toBe(secondPageId),
      );

      // bob leaves
      await triggerServerEvent("room-user-change", ["my-socket", ALICE]);
      await waitFor(() => expect(h.state.collaborators.has(BOB)).toBe(false));
    });

    it("a pointer update keeps the page it carries", async () => {
      const { secondPageId } = await startRoomOnFirstOfTwoPages();

      await deliver({
        type: WS_SUBTYPES.MOUSE_LOCATION,
        payload: {
          socketId: ALICE,
          pointer: { x: 1, y: 1, tool: "pointer" },
          button: "up",
          selectedElementIds: {},
          username: "Alice",
          pageId: secondPageId,
        },
      });

      await waitFor(() =>
        expect(getCollaboratorPage(ALICE)).toBe(secondPageId),
      );
    });

    it("a message without a page (older client) keeps the page we knew", async () => {
      const { secondPageId } = await startRoomOnFirstOfTwoPages();

      await deliverPresence(ALICE, secondPageId);
      await waitFor(() =>
        expect(getCollaboratorPage(ALICE)).toBe(secondPageId),
      );
      // an older client: idle status without a page
      await deliver({
        type: WS_SUBTYPES.IDLE_STATUS,
        payload: {
          socketId: ALICE,
          userState: "idle" as any,
          username: "Renamed",
        },
      });

      await waitFor(() =>
        expect(h.state.collaborators.get(ALICE)?.username).toBe("Renamed"),
      );
      expect(getCollaboratorPage(ALICE)).toBe(secondPageId);
    });
  });

  describe("AC 6.3: follow mode", () => {
    const follow = (socketId: SocketId) => {
      act(() => {
        API.setAppState({
          userToFollow: { socketId, username: socketId },
        });
      });
    };

    it("starting to follow someone on another page opens their page", async () => {
      // like following a presenter in PowerPoint
      const { secondPageId } = await startRoomOnFirstOfTwoPages();
      await deliverPresence(ALICE, secondPageId);

      follow(ALICE);

      expect(h.app.getActivePageId()).toBe(secondPageId);
    });

    it("stopping following keeps the page we are on", async () => {
      const { firstPageId, secondPageId } = await startRoomOnFirstOfTwoPages();
      await deliverPresence(ALICE, secondPageId);
      follow(ALICE);
      selectPage(firstPageId);

      act(() => {
        API.setAppState({ userToFollow: null });
      });

      expect(h.app.getActivePageId()).toBe(firstPageId);
    });

    it("when the followed collaborator switches pages, we switch too", async () => {
      const { firstPageId, secondPageId } = await startRoomOnFirstOfTwoPages();
      await deliverPresence(ALICE, firstPageId);
      follow(ALICE);

      await deliverPresence(ALICE, secondPageId);

      expect(h.app.getActivePageId()).toBe(secondPageId);
    });

    it("(control) without following, we stay", async () => {
      const { firstPageId, secondPageId } = await startRoomOnFirstOfTwoPages();
      await deliverPresence(ALICE, firstPageId);

      await deliverPresence(ALICE, secondPageId);

      expect(h.app.getActivePageId()).toBe(firstPageId);
    });

    it("others switching pages don't move us", async () => {
      const { firstPageId, secondPageId } = await startRoomOnFirstOfTwoPages();
      follow(ALICE);

      await deliverPresence(BOB, secondPageId);

      expect(h.app.getActivePageId()).toBe(firstPageId);
    });

    it("a page we don't have is ignored (unknown page id)", async () => {
      const { firstPageId } = await startRoomOnFirstOfTwoPages();
      follow(ALICE);

      await deliverPresence(ALICE, "unknown-page");

      expect(h.app.getActivePageId()).toBe(firstPageId);
      await waitFor(() =>
        expect(getCollaboratorPage(ALICE)).toBe("unknown-page"),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // view mode (step 6)
  // ---------------------------------------------------------------------------

  describe("AC 7.1: view mode in a room", () => {
    const enterViewMode = () => {
      act(() => {
        API.setAppState({ viewModeEnabled: true });
      });
    };

    it("can follow a collaborator to another page", async () => {
      const { firstPageId, secondPageId } = await startRoomOnFirstOfTwoPages();
      await deliverPresence(ALICE, firstPageId);
      enterViewMode();
      act(() => {
        API.setAppState({ userToFollow: { socketId: ALICE, username: "a" } });
      });

      await deliverPresence(ALICE, secondPageId);

      expect(h.app.getActivePageId()).toBe(secondPageId);
    });

    it("a peer's page changes still apply", async () => {
      await startRoomOnFirstOfTwoPages();
      enterViewMode();
      const ours = window.collab.getPageData()!;

      await deliverPageData(
        getLocalPageChanges(
          ours,
          getSharedPageInfos(ours).map((page, i) =>
            i === 0 ? { ...page, name: "Theirs" } : page,
          ),
          Date.now() + 1000,
        ),
      );

      expect(h.app.getPages()[0].name).toBe("Theirs");
    });

    it("sends no page changes of its own", async () => {
      const { firstPageId, secondPageId } = await startRoomOnFirstOfTwoPages();
      enterViewMode();

      act(() => {
        (h.app as any).createPage();
        (h.app as any).deletePages([secondPageId]);
        h.app.movePageToPosition(secondPageId, "1");
        h.app.updatePageInfo(firstPageId, {
          name: "Renamed",
          description: "",
          showThumbnail: false,
          grid: { gridModeEnabled: true, gridSnapEnabled: false, gridSize: 20 },
        });
      });
      sync();

      expect(getSentPageData()).toEqual([]);
      expect(getPageIds()).toEqual([firstPageId, secondPageId]);
    });
  });

  // ---------------------------------------------------------------------------
  // coverage gaps
  // ---------------------------------------------------------------------------

  describe("saving the room", () => {
    // AC 1.3 / 4.5: what the room stores after our save may include others'
    // changes (merged in the save), and they apply here
    it("applies the stored room returned by a save: pages first, then elements", async () => {
      const { secondPageId } = await startRoomOnFirstOfTwoPages();
      const ours = window.collab.getPageData()!;
      mocks.saveResult = {
        pageData: getLocalPageChanges(
          ours,
          getSharedPageInfos(ours).map((page) =>
            page.id === secondPageId
              ? { ...page, name: "Saved by a peer" }
              : page,
          ),
          Date.now() + 1000,
        ),
        elements: syncInvalidIndices([
          tag(createRect("saved-by-peer"), secondPageId),
        ]),
      };

      drawOnOpenPage(createRect("ours"));
      sync();
      await act(async () => {
        window.collab.queueSaveToFirebase.flush();
      });

      await waitFor(() =>
        expect(h.app.getPages()[1].name).toBe("Saved by a peer"),
      );
      await waitFor(() =>
        expect(getPageElementIds()[1]).toEqual(["saved-by-peer"]),
      );
    });

    // AC 1.3: closing the tab saves every page (and the page data) first
    it("before the tab closes, unsaved pages are saved", async () => {
      const { secondPageId } = await startRoomOnFirstOfTwoPages();
      selectPage(secondPageId);
      drawOnOpenPage(createRect("on-second"));
      selectPage(getPageIds()[0]);
      mocks.savedRoomElements.length = 0;
      mocks.savedPageData.length = 0;
      mocks.isSaved = false;

      act(() => {
        window.dispatchEvent(new Event("beforeunload"));
      });

      await waitFor(() =>
        expect(mocks.savedRoomElements.at(-1)!.map((el) => el.id)).toEqual([
          "on-second",
        ]),
      );
      expect(mocks.savedPageData.at(-1)).toEqual(window.collab.getPageData());
    });

    // AC 1.1: images on every page are re-uploaded for the new room
    it("starting a room marks saved images on every page as pending", async () => {
      const firstPageId = h.app.getActivePageId();
      addPage();
      drawOnOpenPage(
        API.createElement({
          type: "image",
          id: "picture",
          fileId: "file-1",
          status: "saved",
        }) as ExcalidrawElement,
      );
      selectPage(firstPageId);

      await startNewRoom();

      const picture = h.app.getPages()[1].elements[0] as ExcalidrawElement & {
        status: string;
      };
      expect(picture.status).toBe("pending");
      expect(
        (mocks.savedRoomElements[0].find((el) => el.id === "picture") as any)
          .status,
      ).toBe("pending");
    });
  });

  // ---------------------------------------------------------------------------
  // bug fix: opening a room link kept only one page (AC 1.2, 1.3)
  // ---------------------------------------------------------------------------

  describe("opening a room link (the app's own join path)", () => {
    // a full app load + join takes longer than the default 1s the test
    // render waits for loading (same as pagePersistence.test.tsx)
    beforeEach(() => {
      configure({ asyncUtilTimeout: 5000 });
    });
    afterEach(() => {
      configure({ asyncUtilTimeout: 1000 });
    });

    /**
     * Loads the app with the room link in the URL, as a joining user does.
     * The room's scene then reaches the editor as its initial data.
     */
    const openRoomLink = async () => {
      const previousCollab = window.collab;
      unmountComponent();
      // a fresh load: the old app's Collab must not be reused
      appJotaiStore.set(collabAPIAtom, null);
      mocks.handlers.clear();
      window.history.replaceState(
        {},
        "",
        `${window.location.origin}/#room=${ROOM.roomId},${ROOM.roomKey}`,
      );
      const rendering = render(<ExcalidrawApp />);
      await waitFor(() => expect(window.collab).not.toBe(previousCollab), {
        timeout: 5000,
      });
      await waitFor(
        () => expect(mocks.handlers.has("first-in-room")).toBe(true),
        { timeout: 5000 },
      );
      // wrapped: returning the promise itself would make callers wait for
      // loading, which only ends after the messages they still have to send
      return { rendering };
    };

    const expectRoomPagesShown = async () => {
      await waitFor(
        () => expect(getPageIds()).toEqual([ARCHITECTURE.id, DATABASE.id]),
        // fail on the page list, not on the test's own timeout
        { timeout: 2000 },
      );
      expect(getPageInfos()).toEqual(ROOM_PAGE_INFOS);
      expect(getPageElementIds()).toEqual([["box"], ["table"]]);
      // the open page is a room page, so its elements aren't hidden by the
      // safety net (they were all hidden while this bug was there)
      expect(h.app.getActivePageId()).toBe(ARCHITECTURE.id);
      expect(h.state.openPageId).toBe(ARCHITECTURE.id);
      expect(
        h.elements.filter((el) => !el.isDeleted).map((el) => el.id),
      ).toEqual(["box"]);
    };

    it("with others online: you get every room page, not a blank one", async () => {
      const { rendering } = await openRoomLink();

      await deliverPageData(roomPageData([ARCHITECTURE, DATABASE]));
      await deliverInit(roomElements());
      await rendering;

      await expectRoomPagesShown();
    });

    it("pasting the link into an open tab joins with the room's pages", async () => {
      mocks.handlers.clear();
      // the app is already open; the room link is pasted into its address bar
      act(() => {
        window.history.replaceState(
          {},
          "",
          `${window.location.origin}/#room=${ROOM.roomId},${ROOM.roomKey}`,
        );
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      });
      await waitFor(
        () => expect(mocks.handlers.has("client-broadcast")).toBe(true),
        { timeout: 5000 },
      );

      await deliverPageData(roomPageData([ARCHITECTURE, DATABASE]));
      await deliverInit(roomElements());

      await expectRoomPagesShown();
      // pages are kept by the editor, never copied into its appState
      await waitFor(() => expect(h.state.isLoading).toBe(false));
      expect(h.state).not.toHaveProperty("pages");
      expect(h.state).not.toHaveProperty("activePageId");
    });

    it("alone: the stored room's pages load, not a blank one", async () => {
      mocks.storedPageData = roomPageData([ARCHITECTURE, DATABASE]);
      mocks.storedRoomElements = syncInvalidIndices(roomElements());
      const { rendering } = await openRoomLink();

      await triggerServerEvent("first-in-room");
      await rendering;

      await expectRoomPagesShown();
    });
  });

  // bug fix: default page names follow their position after a delete
  describe("renumbering default page names in a room", () => {
    it("deleting a page sends the renumbered names; custom names stay", async () => {
      const firstPageId = h.app.getActivePageId();
      const secondPageId = addPage();
      const thirdPageId = addPage();
      act(() => {
        h.app.updatePageInfo(secondPageId, {
          name: "Notes",
          description: "",
          showThumbnail: true,
          grid: {
            gridModeEnabled: false,
            gridSnapEnabled: false,
            gridSize: 20,
          },
        });
      });
      await startNewRoom();
      mocks.emitted.length = 0;

      act(() => pageInternals().deletePages([firstPageId]));
      sync();

      await waitFor(() =>
        expect(
          getLastSentPageInfos().map((page) => [page.id, page.name]),
        ).toEqual([
          [secondPageId, "Notes"],
          [thirdPageId, "Page 2"],
        ]),
      );
    });

    it("a peer's delete brings its renames; we don't renumber on our own", async () => {
      const { firstPageId, secondPageId } = await startRoomOnFirstOfTwoPages();
      const before = window.collab.getPageData()!;

      // the deleting peer: page 1 gone, page 2 renamed "Page 1"
      await deliverPageData(
        getLocalPageChanges(
          before,
          getSharedPageInfos(before)
            .filter((page) => page.id !== firstPageId)
            .map((page) => ({ ...page, name: "Page 1" })),
          Date.now() + 1000,
        ),
      );

      expect(h.app.getPages().map((page) => [page.id, page.name])).toEqual([
        [secondPageId, "Page 1"],
      ]);
      // and nothing to send back: the names came with the delete
      sync();
      expect(getSentPageData()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // bugs found in the code review
  // ---------------------------------------------------------------------------

  describe("bugs found in review", () => {
    it("an element pasted from another page takes the page it's pasted on", async () => {
      const { firstPageId, secondPageId } = await startRoomOnFirstOfTwoPages();
      selectPage(secondPageId);

      // a copy of a page-1 element: new id, but page 1's tag copied with it
      drawOnOpenPage(tag(createRect("pasted"), firstPageId));
      sync();

      const pasted = h.elements.find((el) => el.id === "pasted")!;
      expect(getElementPageId(pasted)).toBe(secondPageId);
      // so it's shown where it was pasted (not hidden by the safety net)
      expect(h.state.openPageId).toBe(secondPageId);
      await waitFor(() =>
        expect(getLastSent("pasted")?.customData?.[PAGE_ID_KEY]).toBe(
          secondPageId,
        ),
      );
    });

    it("images on pages that aren't open are marked saved after uploading", async () => {
      const firstPageId = h.app.getActivePageId();
      addPage();
      drawOnOpenPage(
        API.createElement({
          type: "image",
          id: "picture",
          fileId: "file-1",
          status: "pending",
        }) as ExcalidrawElement,
      );
      selectPage(firstPageId);
      await startNewRoom();
      vi.spyOn(
        window.collab.fileManager,
        "shouldUpdateImageElementStatus",
      ).mockImplementation(
        (element) =>
          element.type === "image" && (element as any).status === "pending",
      );

      await act(async () => {
        window.collab.portal.queueFileUpload();
        await window.collab.portal.queueFileUpload.flush();
      });

      await waitFor(() =>
        expect((h.app.getPages()[1].elements[0] as any).status).toBe("saved"),
      );
    });

    it("joining when the room's elements arrive before its pages adds no blank page", async () => {
      await joinRoom();

      // INIT handled before PAGE_DATA (each is decrypted on its own)
      await deliverInit(roomElements());
      await deliverPageData(roomPageData([ARCHITECTURE, DATABASE]));
      sync();

      await waitFor(() =>
        expect(getPageIds()).toEqual([ARCHITECTURE.id, DATABASE.id]),
      );
      expect(getPageElementIds()).toEqual([["box"], ["table"]]);
      // and we never offered the room a page of our own
      for (const pageData of getSentPageData()) {
        expect(pageData.pages.map((page) => page.id).sort()).toEqual(
          [ARCHITECTURE.id, DATABASE.id].sort(),
        );
      }
    });

    it("stored elements whose page isn't known yet show once it arrives", async () => {
      // the stored page data is unusable, but the elements are tagged
      mocks.storedPageData = { pages: [], deletedPageIds: {} };
      mocks.storedRoomElements = syncInvalidIndices(roomElements());
      await joinRoomAlone();

      await deliverPageData(roomPageData([ARCHITECTURE, DATABASE]));

      await waitFor(() => {
        const pages = h.app.getPages();
        expect(
          pages
            .find((page) => page.id === ARCHITECTURE.id)
            ?.elements.map((el) => el.id),
        ).toEqual(["box"]);
        expect(
          pages
            .find((page) => page.id === DATABASE.id)
            ?.elements.map((el) => el.id),
        ).toEqual(["table"]);
      });
    });

    it("while following, a page you open yourself stays open until they switch", async () => {
      const { firstPageId, secondPageId } = await startRoomOnFirstOfTwoPages();
      await deliverPresence(ALICE, firstPageId);
      act(() => {
        API.setAppState({ userToFollow: { socketId: ALICE, username: "a" } });
      });

      selectPage(secondPageId);
      // alice keeps moving her mouse on page 1
      await deliver({
        type: WS_SUBTYPES.MOUSE_LOCATION,
        payload: {
          socketId: ALICE,
          pointer: { x: 5, y: 5, tool: "pointer" },
          button: "up",
          selectedElementIds: {},
          username: "Alice",
          pageId: firstPageId,
        },
      });
      expect(h.app.getActivePageId()).toBe(secondPageId);

      // she switches pages: we follow again
      await deliverPresence(ALICE, secondPageId);
      await deliverPresence(ALICE, firstPageId);
      expect(h.app.getActivePageId()).toBe(firstPageId);
    });

    it("leaving and keeping the room marks images on every page for saving", async () => {
      const firstPageId = h.app.getActivePageId();
      addPage();
      drawOnOpenPage(
        API.createElement({
          type: "image",
          id: "picture",
          fileId: "file-1",
          status: "saved",
        }) as ExcalidrawElement,
      );
      selectPage(firstPageId);
      await startNewRoom();
      // the room marks it saved once it's uploaded
      act(() => {
        h.app.setPageElements(
          new Map([
            [
              getPageIds()[1],
              h.app
                .getPages()[1]
                .elements.map((el) =>
                  newElementWith(el as any, { status: "saved" } as any),
                ),
            ],
          ]),
        );
      });
      vi.spyOn(window, "confirm").mockReturnValue(true);

      act(() => {
        window.collab.stopCollaboration(true);
      });

      expect((h.app.getPages()[1].elements[0] as any).status).toBe("pending");
    });
  });
});
