/**
 * Editor side of multi-page live collaboration (#167). The room side (what's
 * sent and received) is tested in excalidraw-app/tests/collabPages.test.tsx.
 */
import React from "react";
import { KEYS } from "@excalidraw/common";
import {
  CREATOR_ID_KEY,
  PAGE_ID_KEY,
  newElementWith,
} from "@excalidraw/element";
import { vi } from "vitest";

import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
} from "@excalidraw/element/types";

import { actionChangeViewBackgroundColor } from "../actions/actionCanvas";
import { actionSaveFileToDisk } from "../actions/actionExport";
import { prepareElementsForExport, saveAsJSON } from "../data";
import { serializeAsJSON } from "../data/json";
import { Excalidraw } from "../index";
import { isCollaboratorOnPage } from "../pages";
import * as InteractiveScene from "../renderer/interactiveScene";
import * as SceneExport from "../scene/export";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import {
  act,
  fireEvent,
  render,
  unmountComponent,
  waitFor,
} from "./test-utils";

import type { JSONExportData } from "../data/json";
import type { DrawingPage } from "../pages";
import type { Collaborator, SocketId } from "../types";

vi.mock("../data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data")>()),
  saveAsJSON: vi.fn(async ({ data }) => ({
    fileHandle: null,
    data: await data,
  })),
}));

unmountComponent();

const { h } = window;
const mouse = new Pointer("mouse");

/** App's private page methods (#157, #160) */
type PageInternals = {
  createPage: () => void;
  selectPage: (pageId: string) => void;
};
const pageInternals = () => h.app as unknown as PageInternals;

const tag = <T extends ExcalidrawElement>(element: T, pageId: string) =>
  newElementWith(element as ExcalidrawElement, {
    customData: { [PAGE_ID_KEY]: pageId },
  }) as T;

// solid fill so pointer hits and bindings work on the interior
const createSolidRect = (id: string, x: number) =>
  API.createElement({
    type: "rectangle",
    id,
    x,
    y: 0,
    width: 100,
    height: 100,
    backgroundColor: "red",
    fillStyle: "solid",
  });

// the jsdom viewport is 0x0, so query the renderer with an explicit viewport
// (same approach as collaboratorVisibility.test.tsx)
const getVisibleIds = () =>
  h.app.renderer
    .getRenderableElements({
      zoom: h.state.zoom,
      offsetLeft: 0,
      offsetTop: 0,
      scrollX: 0,
      scrollY: 0,
      height: 1000,
      width: 1000,
      editingTextElement: h.state.editingTextElement,
      newElement: h.state.newElement,
      selectedElements: [],
      selectedElementsAreBeingDragged: false,
      frameToHighlight: null,
      hiddenCollaboratorIds: h.state.hiddenCollaboratorIds,
      collaboratorDirectory: h.state.collaboratorDirectory,
      openPageId: h.state.openPageId,
    })
    .visibleElements.map((el) => el.id)
    .sort();

const getSelectedIds = () =>
  API.getSelectedElements()
    .map((el) => el.id)
    .sort();

const isDeleted = (id: string) =>
  h.elements.find((el) => el.id === id)!.isDeleted;

describe("multi-page collaboration (editor)", () => {
  afterEach(() => {
    mouse.reset();
  });

  // AC 2.4: an element tagged for another page that reaches the open page
  // is treated like a hidden collaborator's element (#80)
  describe("safety net: elements tagged for another page", () => {
    const setUp = async ({ isCollaborating = true } = {}) => {
      await render(
        <Excalidraw
          isCollaborating={isCollaborating}
          handleKeyboardGlobally={true}
        />,
      );
      const openPageId = h.app.getActivePageId();
      API.setElements([
        tag(createSolidRect("here", 0), openPageId),
        tag(createSolidRect("elsewhere", 300), "another-page"),
      ]);
      return { openPageId };
    };

    it("knows the open page only while collaborating", async () => {
      const { openPageId } = await setUp();
      expect(h.state.openPageId).toBe(openPageId);

      unmountComponent();
      await setUp({ isCollaborating: false });
      expect(h.state.openPageId).toBeNull();
    });

    it("follows page switches", async () => {
      await setUp();
      act(() => pageInternals().createPage());
      expect(h.state.openPageId).toBe(h.app.getActivePageId());
    });

    it("is not drawn", async () => {
      await setUp();
      expect(getVisibleIds()).toEqual(["here"]);
    });

    it("(control) outside a room nothing is hidden", async () => {
      await setUp({ isCollaborating: false });
      expect(getVisibleIds()).toEqual(["elsewhere", "here"]);
    });

    it("can't be selected by clicking, box-selecting or select all", async () => {
      await setUp();

      mouse.clickAt(350, 50);
      expect(getSelectedIds()).toEqual([]);

      mouse.downAt(-50, -50);
      mouse.move(-1000, -1000);
      mouse.moveTo(450, 150);
      mouse.up();
      expect(getSelectedIds()).toEqual(["here"]);

      Keyboard.withModifierKeys({ ctrl: true }, () => {
        Keyboard.keyPress(KEYS.A);
      });
      expect(getSelectedIds()).toEqual(["here"]);

      // and so delete never reaches it
      Keyboard.keyPress(KEYS.DELETE);
      expect(isDeleted("here")).toBe(true);
      expect(isDeleted("elsewhere")).toBe(false);
    });

    // the eraser only sees elements in the viewport, which is 0x0 in jsdom:
    // move both shapes over the origin, then stroke through both
    const eraseThroughBoth = () => {
      API.setElements(
        h.elements.map((el) =>
          el.id === "elsewhere" ? newElementWith(el, { x: -60, y: -60 }) : el,
        ),
      );
      UI.clickTool("eraser");
      mouse.downAt(-80, 20);
      mouse.moveTo(0, 20);
      mouse.moveTo(80, 20);
      mouse.upAt(80, 20);
    };

    it("(control) outside a room the eraser reaches both", async () => {
      await setUp({ isCollaborating: false });
      eraseThroughBoth();
      expect(isDeleted("here")).toBe(true);
      expect(isDeleted("elsewhere")).toBe(true);
    });

    it("can't be erased", async () => {
      await setUp();
      eraseThroughBoth();
      expect(isDeleted("here")).toBe(true);
      expect(isDeleted("elsewhere")).toBe(false);
    });

    it("can't be bound to", async () => {
      await setUp();

      UI.clickTool("arrow");
      mouse.downAt(50, 50);
      mouse.moveTo(200, 50);
      mouse.moveTo(350, 50);
      mouse.upAt(350, 50);

      const arrow = h.elements.find(
        (el): el is ExcalidrawArrowElement => el.type === "arrow",
      )!;
      expect(arrow.startBinding?.elementId).toBe("here");
      expect(arrow.endBinding).toBeNull();
      expect(
        h.elements.find((el) => el.id === "elsewhere")!.boundElements ?? [],
      ).toEqual([]);
    });

    it("saving a file while collaborating keeps every page's elements", async () => {
      let exportData: JSONExportData | undefined;
      await render(
        <Excalidraw
          isCollaborating={true}
          onExport={(_type, data) => {
            exportData = data;
          }}
        />,
      );
      const firstPageId = h.app.getActivePageId();
      API.setElements([tag(createSolidRect("first", 0), firstPageId)]);
      act(() => pageInternals().createPage());
      const secondPageId = h.app.getActivePageId();
      API.setElements([tag(createSolidRect("second", 0), secondPageId)]);

      act(() => h.app.actionManager.executeAction(actionSaveFileToDisk));
      await waitFor(() => expect(exportData).toBeDefined());

      const saved = JSON.parse(
        serializeAsJSON(
          exportData!.elements,
          exportData!.appState,
          exportData!.files,
          "local",
        ),
      );
      expect(
        saved.appState.pages.map((page: DrawingPage) =>
          page.elements.map(({ id }) => id),
        ),
      ).toEqual([["first"], ["second"]]);
      expect(vi.mocked(saveAsJSON)).toHaveBeenCalled();
    });
  });

  // AC 2.2: elements reconciled from the room go to their own page
  describe("setPageElements", () => {
    it("updates the open page through the scene and other pages in place", async () => {
      await render(<Excalidraw isCollaborating={true} />);
      const firstPageId = h.app.getActivePageId();
      act(() => pageInternals().createPage());
      const secondPageId = h.app.getActivePageId();

      act(() => {
        h.app.setPageElements(
          new Map([
            [firstPageId, [tag(createSolidRect("on-first", 0), firstPageId)]],
            [
              secondPageId,
              [tag(createSolidRect("on-second", 0), secondPageId)],
            ],
          ]),
        );
      });

      expect(h.elements.map((el) => el.id)).toEqual(["on-second"]);
      const pages = h.app.getPages();
      expect(pages.map((page) => page.elements.map((el) => el.id))).toEqual([
        ["on-first"],
        ["on-second"],
      ]);
    });

    it("doesn't add history entries", async () => {
      await render(<Excalidraw isCollaborating={true} />);
      const pageId = h.app.getActivePageId();

      act(() => {
        h.app.setPageElements(
          new Map([[pageId, [tag(createSolidRect("remote", 0), pageId)]]]),
        );
      });

      expect(API.getUndoStack().length).toBe(0);
    });

    it("ignores unknown pages", async () => {
      await render(<Excalidraw isCollaborating={true} />);
      const pagesBefore = h.app.getPages();

      act(() => {
        h.app.setPageElements(
          new Map([["unknown-page", [createSolidRect("lost", 0)]]]),
        );
      });

      expect(h.app.getPages()).toEqual(pagesBefore);
    });
  });

  // AC 1.2 / 3.2 / 3.3: making the pages match the room's
  describe("applySharedPages", () => {
    const shared = (
      id: string,
      name = id,
      viewBackgroundColor = "#ffffff",
    ) => ({
      id,
      name,
      description: `about ${name}`,
      viewBackgroundColor,
    });

    /** three pages p1..p3 (as ids), the second one open */
    const setUpThreePages = async () => {
      await render(<Excalidraw isCollaborating={true} />);
      act(() => {
        h.app.applySharedPages([shared("p1"), shared("p2"), shared("p3")]);
      });
      act(() => pageInternals().selectPage("p2"));
    };

    it("adds, renames, describes, recolours and reorders pages", async () => {
      await setUpThreePages();

      act(() => {
        h.app.applySharedPages([
          shared("p3", "Third", "#ffc9c9"),
          shared("p2", "Second"),
          shared("new", "New"),
          shared("p1"),
        ]);
      });

      expect(
        h.app
          .getPages()
          .map((page) => [
            page.id,
            page.name,
            page.description,
            page.settings.viewBackgroundColor,
          ]),
      ).toEqual([
        ["p3", "Third", "about Third", "#ffc9c9"],
        ["p2", "Second", "about Second", "#ffffff"],
        ["new", "New", "about New", "#ffffff"],
        ["p1", "p1", "about p1", "#ffffff"],
      ]);
      expect(h.app.getActivePageId()).toBe("p2");
    });

    it("keeps personal settings: scroll, zoom, grid and thumbnail", async () => {
      await setUpThreePages();
      act(() => {
        h.app.updatePageInfo("p2", {
          name: "p2",
          description: "about p2",
          showThumbnail: false,
          grid: { gridModeEnabled: true, gridSnapEnabled: true, gridSize: 40 },
        });
        API.setAppState({ scrollX: 123 });
      });

      act(() => {
        h.app.applySharedPages([
          shared("p1"),
          shared("p2", "Renamed"),
          shared("p3"),
        ]);
      });

      const page = h.app.getPages()[1];
      expect(page.name).toBe("Renamed");
      expect(page.showThumbnail).toBe(false);
      expect(page.settings).toEqual(
        expect.objectContaining({
          gridModeEnabled: true,
          gridSnapEnabled: true,
          gridSize: 40,
          scrollX: 123,
        }),
      );
    });

    it("keeps each page's elements", async () => {
      await setUpThreePages();
      API.setElements([createSolidRect("on-p2", 0)]);

      act(() => {
        h.app.applySharedPages([shared("p2"), shared("p1"), shared("p3")]);
      });

      expect(h.elements.map((el) => el.id)).toEqual(["on-p2"]);
    });

    it("when the open page is removed, opens the page before it", async () => {
      await setUpThreePages();

      act(() => {
        h.app.applySharedPages([shared("p1"), shared("p3")]);
      });

      expect(h.app.getActivePageId()).toBe("p1");
      expect(h.state.openPageId).toBe("p1");
    });

    it("…or the page after it if it was first", async () => {
      await setUpThreePages();
      act(() => pageInternals().selectPage("p1"));

      act(() => {
        h.app.applySharedPages([shared("p2"), shared("p3")]);
      });

      expect(h.app.getActivePageId()).toBe("p2");
    });

    it("shows the pages flat, in the shared order, without folders", async () => {
      await setUpThreePages();
      act(() => {
        h.app.applySharedPages([shared("p3"), shared("p2"), shared("p1")]);
      });

      expect(h.app.getPageTree()).toEqual([
        { type: "page", pageId: "p3" },
        { type: "page", pageId: "p2" },
        { type: "page", pageId: "p1" },
      ]);
    });

    it("doesn't add history entries", async () => {
      await setUpThreePages();
      act(() => {
        h.app.applySharedPages([shared("p1"), shared("p2", "Renamed")]);
      });
      expect(API.getUndoStack().length).toBe(0);
    });

    it("ignores an empty page list", async () => {
      await setUpThreePages();
      const pagesBefore = h.app.getPages();
      act(() => h.app.applySharedPages([]));
      expect(h.app.getPages()).toEqual(pagesBefore);
    });
  });

  // AC 1.2: joining a room replaces the pages you had
  describe("resetPages", () => {
    it("replaces every page with one new blank page", async () => {
      await render(<Excalidraw isCollaborating={true} />);
      API.setElements([createSolidRect("mine", 0)]);
      const oldPageId = h.app.getActivePageId();
      act(() => pageInternals().createPage());

      act(() => h.app.resetPages());

      const pages = h.app.getPages();
      expect(pages.map((page) => [page.name, page.elements.length])).toEqual([
        ["Page 1", 0],
      ]);
      expect(pages[0].id).not.toBe(oldPageId);
      expect(h.elements).toEqual([]);
      expect(h.state.openPageId).toBe(pages[0].id);
      expect(API.getUndoStack().length).toBe(0);
    });
  });

  // AC 4.6: clearing reaches collaborators like any other change
  describe("clearPages", () => {
    it("marks a page's elements deleted instead of dropping them", async () => {
      await render(<Excalidraw isCollaborating={true} />);
      const firstPageId = h.app.getActivePageId();
      API.setElements([createSolidRect("on-first", 0)]);
      const before = h.elements[0];
      act(() => pageInternals().createPage());

      act(() => h.app.clearPages([firstPageId]));

      const [cleared] = h.app.getPages()[0].elements;
      expect(cleared.id).toBe("on-first");
      expect(cleared.isDeleted).toBe(true);
      // a new version, so the deletion is sent
      expect(cleared.version).toBeGreaterThan(before.version);
    });

    it("leaves already deleted elements as they are", async () => {
      await render(<Excalidraw isCollaborating={true} />);
      const firstPageId = h.app.getActivePageId();
      API.setElements([
        { ...createSolidRect("gone", 0), isDeleted: true } as ExcalidrawElement,
      ]);
      const before = h.elements[0];
      act(() => pageInternals().createPage());

      act(() => h.app.clearPages([firstPageId]));

      expect(h.app.getPages()[0].elements[0]).toBe(before);
    });
  });

  // AC 4.1: a collaborator deletes the page you're on
  describe("the open page deleted by a collaborator", () => {
    const shared = (id: string) => ({
      id,
      name: `Name of ${id}`,
      description: "",
      viewBackgroundColor: "#ffffff",
    });

    const setUpOnSecondPage = async () => {
      await render(<Excalidraw isCollaborating={true} />);
      act(() => {
        h.app.applySharedPages([shared("p1"), shared("p2"), shared("p3")]);
      });
      act(() => pageInternals().selectPage("p2"));
    };

    const deleteSecondPage = (deletedPageIds = ["p2"]) => {
      act(() => {
        h.app.applySharedPages([shared("p1"), shared("p3")], deletedPageIds);
      });
    };

    it("moves you to the page before it and names it in a toast", async () => {
      await setUpOnSecondPage();

      deleteSecondPage();

      expect(h.app.getActivePageId()).toBe("p1");
      expect(h.state.toast?.message).toBe(
        '"Name of p2" was deleted by a collaborator.',
      );
    });

    it("no toast when your page is replaced, not deleted (joining a room)", async () => {
      await setUpOnSecondPage();

      deleteSecondPage([]);

      expect(h.app.getActivePageId()).toBe("p1");
      expect(h.state.toast).toBeNull();
    });

    it("no toast when another page is deleted", async () => {
      await setUpOnSecondPage();

      act(() => {
        h.app.applySharedPages([shared("p1"), shared("p2")], ["p3"]);
      });

      expect(h.app.getActivePageId()).toBe("p2");
      expect(h.state.toast).toBeNull();
    });

    it("discards an element being drawn (pointer still down)", async () => {
      await setUpOnSecondPage();
      UI.clickTool("rectangle");
      mouse.downAt(10, 10);
      mouse.moveTo(60, 60);
      expect(h.state.newElement).not.toBeNull();

      deleteSecondPage();
      // discarded right away: nothing is being drawn any more
      expect(h.state.newElement).toBeNull();
      expect(h.state.multiElement).toBeNull();
      // the user keeps dragging, then lets go
      mouse.moveTo(90, 90);
      expect(h.elements).toEqual([]);
      mouse.upAt(90, 90);

      expect(h.state.newElement).toBeNull();
      expect(
        h.app
          .getPages()
          .flatMap((page) =>
            page.elements.filter((el) => !el.isDeleted).map((el) => el.type),
          ),
      ).toEqual([]);
    });

    it("closes the page info dialog of a removed page", async () => {
      await setUpOnSecondPage();
      act(() => h.app.openPageInfo("p3"));
      expect(h.state.openDialog).toEqual({ name: "pageInfo", pageId: "p3" });

      act(() => {
        h.app.applySharedPages([shared("p1"), shared("p2")], ["p3"]);
      });

      expect(h.state.openDialog).toBeNull();
    });

    it("drops a removed page from the clearing selection", async () => {
      await setUpOnSecondPage();
      act(() => {
        API.setAppState({ pageClearingSelection: ["p1", "p3"] });
      });

      act(() => {
        h.app.applySharedPages([shared("p1"), shared("p2")], ["p3"]);
      });

      expect(h.state.pageClearingSelection).toEqual(["p1"]);
    });
  });

  // ---------------------------------------------------------------------------
  // presence (step 5)
  // ---------------------------------------------------------------------------

  describe("isCollaboratorOnPage", () => {
    it("is true on the same page, false on another", () => {
      expect(isCollaboratorOnPage({ pageId: "p1" }, "p1")).toBe(true);
      expect(isCollaboratorOnPage({ pageId: "p2" }, "p1")).toBe(false);
    });

    it("a collaborator whose page isn't known shows everywhere (older clients)", () => {
      expect(isCollaboratorOnPage({}, "p1")).toBe(true);
    });

    it("outside a room (no open page) everyone shows", () => {
      expect(isCollaboratorOnPage({ pageId: "p2" }, null)).toBe(true);
    });
  });

  /** two shared pages p1, p2; p1 open; three collaborators */
  const setUpCollaborators = async () => {
    const renderSpy = vi.spyOn(InteractiveScene, "renderInteractiveScene");
    const rendered = await render(<Excalidraw isCollaborating={true} />);
    act(() => {
      h.app.applySharedPages(
        ["p1", "p2"].map((id) => ({
          id,
          name: id === "p1" ? "Page 1" : "Page 2",
          description: "",
          viewBackgroundColor: "#ffffff",
        })),
      );
    });
    const collaborator = (
      username: string,
      pageId: string | undefined,
      extra: Partial<Collaborator> = {},
    ): Collaborator => ({
      username,
      pointer: { x: 10, y: 10, tool: "pointer" },
      selectedElementIds: { [`${username}-selection`]: true },
      ...(pageId ? { pageId } : {}),
      ...extra,
    });
    const setCollaborators = (entries: [string, Collaborator][]) => {
      act(() => {
        API.updateScene({
          collaborators: new Map(
            entries.map(([socketId, c]) => [socketId as SocketId, c]),
          ),
        });
      });
    };
    setCollaborators([
      ["alice", collaborator("alice", "p1")],
      ["bob", collaborator("bob", "p2")],
      ["carol", collaborator("carol", undefined)],
    ]);
    const lastRenderConfig = () =>
      (renderSpy.mock.calls.at(-1)![0] as any).renderConfig;
    return { ...rendered, collaborator, setCollaborators, lastRenderConfig };
  };

  // AC 6.1
  describe("collaborators on other pages", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("their cursors and selections aren't drawn", async () => {
      const { lastRenderConfig } = await setUpCollaborators();

      await waitFor(() =>
        expect([
          ...lastRenderConfig().remotePointerViewportCoords.keys(),
        ]).toEqual(["alice", "carol"]),
      );
      expect([...lastRenderConfig().remoteSelectedElementIds.keys()]).toEqual([
        "alice-selection",
        "carol-selection",
      ]);
    });

    it("show again once we're on the same page", async () => {
      const { lastRenderConfig } = await setUpCollaborators();

      act(() => pageInternals().selectPage("p2"));

      await waitFor(() =>
        expect([
          ...lastRenderConfig().remotePointerViewportCoords.keys(),
        ]).toEqual(["bob", "carol"]),
      );
    });

    it("their laser trails aren't drawn either", async () => {
      await setUpCollaborators();
      const stopSpy = vi.spyOn(h.app.laserTrails as any, "stopCollabTrails");

      act(() => {
        h.app.laserTrails.updateCollabTrails(h.state.collaborators);
      });

      // trails are kept only for the collaborators passed on (on this page)
      expect([
        ...(stopSpy.mock.calls.at(-1)![0] as Map<string, unknown>).keys(),
      ]).toEqual(["alice", "carol"]);
    });

    it("(control) outside a room everyone is drawn", async () => {
      const renderSpy = vi.spyOn(InteractiveScene, "renderInteractiveScene");
      await render(<Excalidraw />);
      act(() => {
        API.updateScene({
          collaborators: new Map([
            [
              "bob" as SocketId,
              {
                username: "bob",
                pointer: { x: 1, y: 1, tool: "pointer" },
                pageId: "elsewhere",
              },
            ],
          ]),
        });
      });

      await waitFor(() =>
        expect([
          ...(
            renderSpy.mock.calls.at(-1)![0] as any
          ).renderConfig.remotePointerViewportCoords.keys(),
        ]).toEqual(["bob"]),
      );
    });
  });

  // AC 6.2
  describe("avatars on page tabs", () => {
    const openPages = (getByRole: (role: string, o: any) => HTMLElement) => {
      fireEvent.click(getByRole("button", { name: "Pages" }));
    };

    const getTabGroupLabel = (
      getByRole: (role: string, o: any) => HTMLElement,
      pageName: string,
    ) =>
      getByRole("button", { name: pageName })
        .querySelector(".page-navigation__collaborators")
        ?.getAttribute("aria-label") ?? null;

    it("each tab shows who is on that page", async () => {
      const { getByRole } = await setUpCollaborators();
      openPages(getByRole);

      expect(getTabGroupLabel(getByRole, "Page 1")).toBe("On this page: alice");
      expect(getTabGroupLabel(getByRole, "Page 2")).toBe("On this page: bob");
    });

    it("updates when someone switches pages or leaves", async () => {
      const { getByRole, collaborator, setCollaborators } =
        await setUpCollaborators();
      openPages(getByRole);

      setCollaborators([
        ["alice", collaborator("alice", "p2")],
        ["bob", collaborator("bob", "p2")],
      ]);
      expect(getTabGroupLabel(getByRole, "Page 1")).toBeNull();
      expect(getTabGroupLabel(getByRole, "Page 2")).toBe(
        "On this page: alice, bob",
      );

      // bob leaves
      setCollaborators([["alice", collaborator("alice", "p2")]]);
      expect(getTabGroupLabel(getByRole, "Page 2")).toBe("On this page: alice");
    });

    it("never shows you, nor collaborators on a page we don't have", async () => {
      const { getByRole, collaborator, setCollaborators } =
        await setUpCollaborators();
      openPages(getByRole);

      setCollaborators([
        ["me", collaborator("me", "p1", { isCurrentUser: true })],
        ["dave", collaborator("dave", "unknown-page")],
      ]);

      expect(getTabGroupLabel(getByRole, "Page 1")).toBeNull();
      expect(getTabGroupLabel(getByRole, "Page 2")).toBeNull();
    });

    it("shows three avatars, then +N", async () => {
      const { getByRole, collaborator, setCollaborators } =
        await setUpCollaborators();
      openPages(getByRole);

      setCollaborators(
        ["a", "b", "c", "d", "e"].map((name) => [
          name,
          collaborator(name, "p2"),
        ]),
      );

      const group = getByRole("button", { name: "Page 2" }).querySelector(
        ".page-navigation__collaborators",
      )!;
      expect(group.querySelectorAll(".page-navigation__avatar")).toHaveLength(
        3,
      );
      expect(group.textContent).toContain("+2");
    });
  });

  // ---------------------------------------------------------------------------
  // view mode, hide/lock, folders (step 6)
  // ---------------------------------------------------------------------------

  const sharedPage = (id: string, name = id) => ({
    id,
    name,
    description: `about ${name}`,
    viewBackgroundColor: "#ffffff",
  });

  const getPageNames = () => h.app.getPages().map((page) => page.name);

  // AC 7.1
  describe("view mode", () => {
    const setUpInViewMode = async () => {
      const rendered = await render(
        <Excalidraw isCollaborating={true} viewModeEnabled={true} />,
      );
      act(() => {
        h.app.applySharedPages([sharedPage("p1"), sharedPage("p2")]);
      });
      return rendered;
    };

    it("can still switch pages", async () => {
      await setUpInViewMode();

      act(() => pageInternals().selectPage("p2"));

      expect(h.app.getActivePageId()).toBe("p2");
    });

    it("can't create, delete, clear or reorder pages", async () => {
      await setUpInViewMode();
      API.setElements([createSolidRect("on-p1", 0)]);

      act(() => pageInternals().createPage());
      act(() => (h.app as any).deletePages(["p2"]));
      act(() => h.app.clearPages(["p1"]));
      act(() => {
        h.app.movePageToPosition("p2", "1");
        (h.app as any).movePageNavItem(
          { type: "page", id: "p2" },
          { type: "page", id: "p1" },
          "before",
        );
      });

      expect(h.app.getPageIds()).toEqual(["p1", "p2"]);
      expect(h.elements.map((el) => [el.id, el.isDeleted])).toEqual([
        ["on-p1", false],
      ]);
    });

    it("can't rename a page or change its description", async () => {
      await setUpInViewMode();

      act(() => {
        h.app.updatePageInfo("p1", {
          name: "Renamed",
          description: "Changed",
          showThumbnail: false,
          grid: { gridModeEnabled: true, gridSnapEnabled: false, gridSize: 20 },
        });
      });

      const [page] = h.app.getPages();
      expect([page.name, page.description]).toEqual(["p1", "about p1"]);
      // personal settings still change (only this user sees them)
      expect(page.showThumbnail).toBe(false);
      expect(h.state.gridModeEnabled).toBe(true);
    });

    it("can't change a page's background", async () => {
      await setUpInViewMode();

      expect(
        actionChangeViewBackgroundColor.predicate!(
          h.elements,
          h.state,
          h.app.props,
          h.app,
        ),
      ).toBe(false);
    });

    it("the page buttons are disabled", async () => {
      const { getByRole } = await setUpInViewMode();
      fireEvent.click(getByRole("button", { name: "Pages" }));

      for (const name of [
        "Add page",
        "Enter clearing mode",
        "Enter deleting mode",
      ]) {
        expect(getByRole("button", { name })).toHaveProperty("disabled", true);
      }
    });

    it("a peer's page changes still apply", async () => {
      await setUpInViewMode();

      act(() => {
        h.app.applySharedPages([sharedPage("p2", "Theirs"), sharedPage("p1")]);
      });

      expect(getPageNames()).toEqual(["Theirs", "p1"]);
    });
  });

  // AC 3.3 / 7.1: the page info dialog
  describe("page info dialog", () => {
    const openInfo = async (viewModeEnabled: boolean) => {
      const rendered = await render(
        <Excalidraw isCollaborating={true} viewModeEnabled={viewModeEnabled} />,
      );
      act(() => h.app.openPageInfo(h.app.getActivePageId()));
      return rendered;
    };

    /** the name field (its label isn't a <label>, see TextField) */
    const getNameInput = () =>
      document.querySelector<HTMLInputElement>(
        ".PageInfoDialog .ExcTextField__input input",
      )!;

    const getNotes = (container: HTMLElement) =>
      [
        ...container.ownerDocument.querySelectorAll(
          ".PageInfoDialog__only-you",
        ),
      ].map((note) => note.parentElement!.textContent);

    it("marks the grid and thumbnail settings 'Only you see this.'", async () => {
      const { container, getByRole } = await openInfo(false);

      // viewing
      expect(getNotes(container)).toEqual([
        "ThumbnailOnly you see this.",
        "GridOnly you see this.",
      ]);

      // editing
      fireEvent.click(getByRole("button", { name: "Edit" }));
      expect(getNotes(container)).toEqual([
        "Show thumbnailOnly you see this.",
        "GridOnly you see this.",
      ]);
    });

    it("in view mode, name and description are read-only; the rest saves", async () => {
      const { getByRole } = await openInfo(true);
      const pageName = h.app.getPages()[0].name;

      fireEvent.click(getByRole("button", { name: "Edit" }));
      const nameInput = getNameInput();
      const description = getByRole("textbox", {
        name: /Description/,
      }) as HTMLTextAreaElement;
      expect(nameInput.readOnly).toBe(true);
      expect(description.readOnly).toBe(true);

      // (the checkbox has no accessible name: click its row, as a user would)
      fireEvent.click(
        [...document.querySelectorAll(".PageInfoDialog .Checkbox")].find(
          (row) => row.textContent?.startsWith("Show thumbnail"),
        )!,
      );
      fireEvent.click(getByRole("button", { name: "Save" }));

      const [page] = h.app.getPages();
      expect(page.name).toBe(pageName);
      expect(page.showThumbnail).toBe(false);
    });

    it("(control) outside view mode the name is editable", async () => {
      const { getByRole } = await openInfo(false);

      fireEvent.click(getByRole("button", { name: "Edit" }));

      expect(getNameInput().readOnly).toBe(false);
    });
  });

  // AC 7.2
  describe("hiding and locking apply on every page", () => {
    const setUpAliceOnSecondPage = async () => {
      const rendered = await render(
        <Excalidraw isCollaborating={true} handleKeyboardGlobally={true} />,
      );
      act(() => {
        h.app.applySharedPages([sharedPage("p1"), sharedPage("p2")]);
      });
      act(() => pageInternals().selectPage("p2"));
      API.setElements([
        newElementWith(createSolidRect("alice-rect", 0), {
          customData: { [CREATOR_ID_KEY]: "alice", [PAGE_ID_KEY]: "p2" },
        }),
      ]);
      act(() => pageInternals().selectPage("p1"));
      return rendered;
    };

    it("a collaborator hidden on one page stays hidden on another", async () => {
      await setUpAliceOnSecondPage();
      act(() => {
        API.setAppState({ hiddenCollaboratorIds: new Set(["alice"]) });
      });

      act(() => pageInternals().selectPage("p2"));

      expect(getVisibleIds()).toEqual([]);
    });

    it("a collaborator locked on one page stays locked on another", async () => {
      await setUpAliceOnSecondPage();
      act(() => {
        API.setAppState({ lockedCollaboratorIds: new Set(["alice"]) });
      });

      act(() => pageInternals().selectPage("p2"));
      mouse.clickAt(50, 50);

      expect(getVisibleIds()).toEqual(["alice-rect"]);
      expect(API.getSelectedElements()).toEqual([]);
    });

    it("a hidden collaborator's elements aren't passed to any page preview", async () => {
      const exportSpy = vi.spyOn(SceneExport, "exportToCanvas");
      const { getByRole } = await setUpAliceOnSecondPage();
      fireEvent.click(getByRole("button", { name: "Pages" }));
      const previewedOnP2 = () =>
        exportSpy.mock.calls
          .map(([elements]) => elements.map((el) => el.id))
          .filter((ids) => ids.length);

      // (control) visible: p2's preview gets alice's element
      await waitFor(() =>
        expect(previewedOnP2()).toContainEqual(["alice-rect"]),
      );
      exportSpy.mockClear();

      act(() => {
        API.setAppState({ hiddenCollaboratorIds: new Set(["alice"]) });
      });

      // hidden: the preview is redrawn without it (the page looks empty)
      await waitFor(() =>
        expect(
          getByRole("button", { name: "p2" }).querySelector(
            "img.page-navigation__preview",
          ),
        ).toBeNull(),
      );
      expect(previewedOnP2()).toEqual([]);
      exportSpy.mockRestore();
    });
  });

  // AC 7.3
  describe("folders while collaborating", () => {
    /** three pages, with p1 and p3 in a folder, outside a room */
    const setUpFolder = async () => {
      const rendered = await render(<Excalidraw />);
      act(() => {
        h.app.applySharedPages(["p1", "p2", "p3"].map((id) => sharedPage(id)));
      });
      act(() => {
        (h.app as any).createPageFolder(["p1", "p3"], "Folder");
      });
      // the folder goes last: p2, then the folder with p1 and p3
      expect(h.app.getPageTree().map((node) => node.type)).toEqual([
        "page",
        "folder",
      ]);
      return rendered;
    };

    it("starting a room shows the pages flat, in their order, and they stay flat", async () => {
      const { rerender } = await setUpFolder();

      rerender(<Excalidraw isCollaborating={true} />);
      await waitFor(() =>
        expect(h.app.getPageTree()).toEqual([
          { type: "page", pageId: "p2" },
          { type: "page", pageId: "p1" },
          { type: "page", pageId: "p3" },
        ]),
      );
      expect(h.app.getPageIds()).toEqual(["p2", "p1", "p3"]);

      // after leaving: still flat
      rerender(<Excalidraw isCollaborating={false} />);
      expect(h.app.getPageTree().every((node) => node.type === "page")).toBe(
        true,
      );
    });

    it("folders can't be created in a room", async () => {
      await render(<Excalidraw isCollaborating={true} />);
      act(() => {
        h.app.applySharedPages([sharedPage("p1"), sharedPage("p2")]);
      });

      act(() => {
        (h.app as any).createPageFolder(["p1"], "Folder");
      });

      expect(h.app.getPageTree().every((node) => node.type === "page")).toBe(
        true,
      );
    });

    it("pages can still be reordered in a room (a shared change)", async () => {
      await render(<Excalidraw isCollaborating={true} />);
      act(() => {
        h.app.applySharedPages([sharedPage("p1"), sharedPage("p2")]);
      });

      act(() => {
        (h.app as any).movePageNavItem(
          { type: "page", id: "p2" },
          { type: "page", id: "p1" },
          "before",
        );
      });

      expect(h.app.getPageIds()).toEqual(["p2", "p1"]);
    });

    it("the page list says folders are off, and shift + right-click selects nothing", async () => {
      const { getByRole, getByText, container } = await render(
        <Excalidraw isCollaborating={true} />,
      );
      act(() => {
        h.app.applySharedPages([sharedPage("p1"), sharedPage("p2")]);
      });
      fireEvent.click(getByRole("button", { name: "Pages" }));

      expect(
        getByText(
          "Shift + drag to reorder. Folders are off while collaborating.",
        ),
      ).toBeTruthy();
      fireEvent.contextMenu(getByRole("button", { name: "p2" }), {
        shiftKey: true,
      });
      expect(container.querySelector(".page-folder-create")).toBeNull();
    });

    it("(control) outside a room, shift + right-click selects a page for a folder", async () => {
      const { getByRole, container } = await render(<Excalidraw />);
      act(() => {
        h.app.applySharedPages([sharedPage("p1"), sharedPage("p2")]);
      });
      fireEvent.click(getByRole("button", { name: "Pages" }));

      fireEvent.contextMenu(getByRole("button", { name: "p2" }), {
        shiftKey: true,
      });

      expect(container.querySelector(".page-folder-create")).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // coverage gaps
  // ---------------------------------------------------------------------------

  // AC 2.4: the safety net covers image export (PNG/SVG of the scene) too
  describe("image export", () => {
    const elements = [
      tag(createSolidRect("here", 0), "p1"),
      tag(createSolidRect("elsewhere", 300), "p2"),
    ];

    const exportedIds = (openPageId: string | null) =>
      prepareElementsForExport(
        elements,
        {
          selectedElementIds: {},
          hiddenCollaboratorIds: new Set(),
          collaboratorDirectory: null,
          openPageId,
        },
        false,
      ).exportedElements.map((el) => el.id);

    it("leaves out elements tagged for another page than the open one", () => {
      expect(exportedIds("p1")).toEqual(["here"]);
    });

    it("(control) outside a room everything is exported", () => {
      expect(exportedIds(null)).toEqual(["here", "elsewhere"]);
    });
  });

  // AC 6.2
  it("a collaborator without a name shows as 'Collaborator' on the tab", async () => {
    const { getByRole } = await render(<Excalidraw isCollaborating={true} />);
    act(() => {
      h.app.applySharedPages([
        {
          id: "p1",
          name: "Page 1",
          description: "",
          viewBackgroundColor: "#ffffff",
        },
      ]);
      API.updateScene({
        collaborators: new Map([["anon" as SocketId, { pageId: "p1" }]]),
      });
    });
    fireEvent.click(getByRole("button", { name: "Pages" }));

    expect(
      getByRole("button", { name: "Page 1" })
        .querySelector(".page-navigation__collaborators")
        ?.getAttribute("aria-label"),
    ).toBe("On this page: Collaborator");
  });
});
