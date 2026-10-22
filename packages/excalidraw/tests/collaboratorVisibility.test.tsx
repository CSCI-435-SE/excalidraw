import { CLASSES, CODES, KEYS, setFeatureFlag } from "@excalidraw/common";
import {
  CREATOR_ID_KEY,
  UNKNOWN_CREATOR_ID,
  LinearElementEditor,
  handleFocusPointDrag,
  newElementWith,
  selectGroupsForSelectedElements,
} from "@excalidraw/element";
import { vi } from "vitest";

import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
  NonDeleted,
} from "@excalidraw/element/types";

import {
  actionHideAllCollaborators,
  actionSaveFileToDisk,
  actionShowAllCollaborators,
  actionToggleCollaboratorVisibility,
} from "../actions";
import { actionToggleViewMode } from "../actions/actionToggleViewMode";
import { prepareElementsForExport } from "../data";
import { Excalidraw } from "../index";
import {
  getCollaboratorVisibilityRows,
  getLocallyVisibleElements,
  getSelectionWithoutHiddenElements,
} from "../scene/visibility";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { updateTextEditor } from "./queries/dom";
import {
  act,
  fireEvent,
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
  unmountComponent,
  waitFor,
} from "./test-utils";

import type { AppState } from "../types";

unmountComponent();

// same as excalidraw.test.tsx: no real file is written when saving
vi.mock("../data/filesystem.ts", async (importOriginal) => {
  const module = await importOriginal();
  return {
    __esmodule: true,
    //@ts-ignore
    ...module,
    get nativeFileSystemSupported() {
      //@ts-ignore
      return module.nativeFileSystemSupported;
    },
    fileSave: vi.fn().mockResolvedValue(undefined),
  };
});

const h = window.h;
const mouse = new Pointer("mouse");

const stamp = <T extends ExcalidrawElement>(element: T, creatorId: string) =>
  newElementWith(element as ExcalidrawElement, {
    customData: { [CREATOR_ID_KEY]: creatorId },
  }) as T;

// the jsdom viewport is 0x0, so query the renderer with an explicit viewport
// (same approach as frame.test.tsx)
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
    })
    .visibleElements.map((el) => el.id)
    .sort();

const setHidden = (ids: string[]) => {
  act(() => {
    API.setAppState({ hiddenCollaboratorIds: new Set(ids) });
  });
};

const createRect = (id: string, x: number) =>
  API.createElement({ type: "rectangle", id, x, y: 0, width: 10 });

describe("collaborator visibility (rendering)", () => {
  const aliceRect = stamp(createRect("alice-rect", 0), "alice");
  const bobRect = stamp(createRect("bob-rect", 20), "bob");
  const legacyRect = createRect("legacy-rect", 40);

  beforeEach(async () => {
    await render(<Excalidraw />);
    API.setElements([aliceRect, bobRect, legacyRect]);
  });

  it("renders everything by default", () => {
    expect(h.state.hiddenCollaboratorIds.size).toBe(0);
    expect(getVisibleIds()).toEqual(["alice-rect", "bob-rect", "legacy-rect"]);
  });

  it("hides only the hidden collaborator's elements", () => {
    setHidden(["bob"]);
    expect(getVisibleIds()).toEqual(["alice-rect", "legacy-rect"]);
  });

  it("re-renders hidden elements when shown again", () => {
    setHidden(["bob"]);
    setHidden([]);
    expect(getVisibleIds()).toEqual(["alice-rect", "bob-rect", "legacy-rect"]);
  });

  it("hides untagged elements via the unknown bucket", () => {
    setHidden([UNKNOWN_CREATOR_ID]);
    expect(getVisibleIds()).toEqual(["alice-rect", "bob-rect"]);
  });

  it("does not modify scene data when hiding", () => {
    const before = h.elements.map((el) => ({
      id: el.id,
      version: el.version,
      versionNonce: el.versionNonce,
      isDeleted: el.isDeleted,
    }));

    setHidden(["alice", "bob", UNKNOWN_CREATOR_ID]);

    expect(getVisibleIds()).toEqual([]);
    expect(
      h.elements.map((el) => ({
        id: el.id,
        version: el.version,
        versionNonce: el.versionNonce,
        isDeleted: el.isDeleted,
      })),
    ).toEqual(before);
  });

  it("bound text is hidden together with its container", () => {
    const container = stamp(createRect("container", 0), "bob");
    const label = stamp(
      API.createElement({
        type: "text",
        id: "label",
        x: 2,
        y: 2,
        containerId: container.id,
      }),
      "alice",
    );
    API.setElements([container, label]);

    setHidden(["bob"]);
    expect(getVisibleIds()).toEqual([]);

    setHidden(["alice"]);
    expect(getVisibleIds()).toEqual(["container", "label"]);
  });

  it("hides frame names (DOM) together with the frame", () => {
    const frame = stamp(
      API.createElement({ type: "frame", id: "frame", x: 0, y: 0, width: 50 }),
      "bob",
    );
    API.setElements([frame]);

    const getFrameNames = () =>
      document.querySelectorAll(`.${CLASSES.FRAME_NAME}`);

    expect(getFrameNames().length).toBe(1);

    setHidden(["bob"]);
    expect(getFrameNames().length).toBe(0);

    setHidden([]);
    expect(getFrameNames().length).toBe(1);
  });

  it("is never persisted or exported", async () => {
    const { clearAppStateForLocalStorage, cleanAppStateForExport } =
      await import("../appState");

    setHidden(["bob"]);

    expect(clearAppStateForLocalStorage(h.state)).not.toHaveProperty(
      "hiddenCollaboratorIds",
    );
    expect(cleanAppStateForExport(h.state)).not.toHaveProperty(
      "hiddenCollaboratorIds",
    );
  });
});

describe("collaborator visibility (interaction safety)", () => {
  // solid fill so clicking the interior counts as a hit
  const createSolidRect = (id: string, x: number, groupIds: string[] = []) =>
    API.createElement({
      type: "rectangle",
      id,
      x,
      y: 0,
      width: 100,
      height: 100,
      backgroundColor: "red",
      fillStyle: "solid",
      groupIds,
    });

  const isDeleted = (id: string) =>
    h.elements.find((el) => el.id === id)!.isDeleted;

  const getSelectedIds = () =>
    API.getSelectedElements()
      .map((el) => el.id)
      .sort();

  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    API.setElements([
      stamp(createSolidRect("alice-rect", 0), "alice"),
      stamp(createSolidRect("bob-rect", 200), "bob"),
    ]);
  });

  it("clicking a hidden element doesn't select it", () => {
    setHidden(["bob"]);

    mouse.clickAt(250, 50);
    expect(getSelectedIds()).toEqual([]);

    mouse.clickAt(50, 50);
    expect(getSelectedIds()).toEqual(["alice-rect"]);
  });

  // same gesture as selection.test.tsx (intermediate move past the drag threshold)
  const boxSelectBoth = () => {
    mouse.downAt(-50, -50);
    mouse.move(-1000, -1000);
    mouse.moveTo(350, 150);
    mouse.up();
  };

  it("(control) box-selecting selects all covered elements", () => {
    boxSelectBoth();
    expect(getSelectedIds()).toEqual(["alice-rect", "bob-rect"]);
  });

  it("box-selecting skips hidden elements", () => {
    setHidden(["bob"]);

    boxSelectBoth();
    expect(getSelectedIds()).toEqual(["alice-rect"]);
  });

  it("select all + delete never deletes hidden elements", () => {
    setHidden(["bob"]);

    Keyboard.withModifierKeys({ ctrl: true }, () => {
      Keyboard.keyPress(KEYS.A);
    });
    expect(getSelectedIds()).toEqual(["alice-rect"]);

    Keyboard.keyPress(KEYS.DELETE);
    expect(isDeleted("alice-rect")).toBe(true);
    expect(isDeleted("bob-rect")).toBe(false);
  });

  it("hiding a selected element deselects it", () => {
    API.setSelectedElements([...h.app.scene.getNonDeletedElements()]);
    expect(getSelectedIds()).toEqual(["alice-rect", "bob-rect"]);

    setHidden(["bob"]);
    expect(getSelectedIds()).toEqual(["alice-rect"]);
  });

  describe("mixed-collaborator groups", () => {
    beforeEach(() => {
      API.setElements([
        stamp(createSolidRect("alice-rect", 0, ["group"]), "alice"),
        stamp(createSolidRect("bob-rect", 200, ["group"]), "bob"),
      ]);
    });

    it("selecting a visible member never selects hidden members", () => {
      setHidden(["bob"]);

      mouse.clickAt(50, 50);
      expect(getSelectedIds()).toEqual(["alice-rect"]);
      expect(h.state.selectedGroupIds).not.toHaveProperty("group");

      Keyboard.keyPress(KEYS.DELETE);
      expect(isDeleted("alice-rect")).toBe(true);
      expect(isDeleted("bob-rect")).toBe(false);
    });

    const eraseThroughAliceRect = () => {
      UI.clickTool("eraser");
      mouse.downAt(-20, 50);
      mouse.moveTo(20, 50);
      mouse.moveTo(60, 50);
      mouse.upAt(60, 50);
    };

    it("(control) erasing a member erases the whole group", () => {
      eraseThroughAliceRect();
      expect(isDeleted("alice-rect")).toBe(true);
      expect(isDeleted("bob-rect")).toBe(true);
    });

    it("erasing a visible member never erases hidden members", () => {
      setHidden(["bob"]);

      eraseThroughAliceRect();
      expect(isDeleted("alice-rect")).toBe(true);
      expect(isDeleted("bob-rect")).toBe(false);
    });
  });
});

describe("collaborator visibility (export)", () => {
  const aliceRect = stamp(createRect("alice-rect", 0), "alice");
  const bobRect = stamp(createRect("bob-rect", 20), "bob");

  beforeEach(async () => {
    await render(<Excalidraw />);
    API.setElements([aliceRect, bobRect]);
  });

  const getExportedIds = (exportSelectionOnly = false) =>
    prepareElementsForExport(h.elements, h.state, exportSelectionOnly)
      .exportedElements.map((el) => el.id)
      .sort();

  it("exports everything when nothing is hidden", () => {
    expect(getExportedIds()).toEqual(["alice-rect", "bob-rect"]);
  });

  it("exports only visible elements", () => {
    setHidden(["bob"]);
    expect(getExportedIds()).toEqual(["alice-rect"]);
  });

  it("export follows the current visibility", () => {
    setHidden(["bob"]);
    expect(getExportedIds()).toEqual(["alice-rect"]);

    setHidden(["alice"]);
    expect(getExportedIds()).toEqual(["bob-rect"]);
  });

  it("getLocallyVisibleElements returns the same array when nothing is hidden", () => {
    const elements = h.elements;
    expect(getLocallyVisibleElements(elements, h.state)).toBe(elements);
  });
});

describe("collaborator visibility (chokepoints)", () => {
  // solid fill so pointer hits/bindings work on the interior
  const createSolidRect = (id: string, x: number, groupIds: string[] = []) =>
    API.createElement({
      type: "rectangle",
      id,
      x,
      y: 0,
      width: 100,
      height: 100,
      backgroundColor: "red",
      fillStyle: "solid",
      groupIds,
    });

  const getArrow = () =>
    h.elements.find(
      (el): el is ExcalidrawArrowElement =>
        el.type === "arrow" && !el.isDeleted,
    )!;

  const drawArrowFromAliceToBob = () => {
    UI.clickTool("arrow");
    mouse.downAt(50, 50);
    mouse.moveTo(200, 50);
    mouse.moveTo(350, 50);
    mouse.upAt(350, 50);
  };

  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    API.setElements([
      stamp(createSolidRect("alice-rect", 0), "alice"),
      stamp(createSolidRect("bob-rect", 300), "bob"),
    ]);
  });

  afterEach(() => {
    mouse.reset();
  });

  describe("selection (selectGroupsForSelectedElements)", () => {
    it("never returns hidden elements, even without the App safety net", () => {
      API.setElements([
        stamp(createSolidRect("alice-rect", 0, ["group"]), "alice"),
        stamp(createSolidRect("bob-rect", 300, ["group"]), "bob"),
      ]);
      setHidden(["bob"]);

      const result = selectGroupsForSelectedElements(
        {
          selectedElementIds: { "alice-rect": true, "bob-rect": true },
          editingGroupId: null,
        },
        h.app.scene.getNonDeletedElements(),
        h.state,
        null,
      );

      expect(Object.keys(result.selectedElementIds)).toEqual(["alice-rect"]);
      // with its hidden member excluded the group has a single member, so it
      // isn't selected as a group
      expect(result.selectedGroupIds.group).toBeFalsy();
    });

    it("(control) selects the whole group when nothing is hidden", () => {
      API.setElements([
        stamp(createSolidRect("alice-rect", 0, ["group"]), "alice"),
        stamp(createSolidRect("bob-rect", 300, ["group"]), "bob"),
      ]);

      const result = selectGroupsForSelectedElements(
        { selectedElementIds: { "alice-rect": true }, editingGroupId: null },
        h.app.scene.getNonDeletedElements(),
        h.state,
        null,
      );

      expect(Object.keys(result.selectedElementIds).sort()).toEqual([
        "alice-rect",
        "bob-rect",
      ]);
      expect(result.selectedGroupIds.group).toBe(true);
    });
  });

  describe("arrow binding", () => {
    it("(control) a new arrow binds to both shapes", () => {
      drawArrowFromAliceToBob();

      expect(getArrow().startBinding?.elementId).toBe("alice-rect");
      expect(getArrow().endBinding?.elementId).toBe("bob-rect");
    });

    it("a new arrow can't bind to a hidden shape", () => {
      setHidden(["bob"]);
      drawArrowFromAliceToBob();

      expect(getArrow().startBinding?.elementId).toBe("alice-rect");
      expect(getArrow().endBinding).toBeNull();
      // and the hidden shape's data is untouched
      expect(
        h.elements.find((el) => el.id === "bob-rect")!.boundElements ?? [],
      ).toEqual([]);
    });

    it("existing bindings to a hidden shape are kept", () => {
      drawArrowFromAliceToBob();
      expect(getArrow().endBinding?.elementId).toBe("bob-rect");

      setHidden(["bob"]);

      // move the visible, bound shape
      UI.clickTool("selection");
      mouse.downAt(50, 80);
      mouse.moveTo(50, 130);
      mouse.moveTo(50, 180);
      mouse.upAt(50, 180);

      expect(getArrow().startBinding?.elementId).toBe("alice-rect");
      expect(getArrow().endBinding?.elementId).toBe("bob-rect");
    });
  });
});

describe("collaborator visibility (miscellaneous bucket)", () => {
  const aliceRect = stamp(createRect("alice-rect", 0), "alice");
  const bobRect = stamp(createRect("bob-rect", 20), "bob");
  const legacyRect = createRect("legacy-rect", 40);

  const setDirectory = (ids: string[] | null) => {
    act(() => {
      API.setAppState({
        collaboratorDirectory: ids
          ? new Map(ids.map((id) => [id, { username: id, lastSeen: 0 }]))
          : null,
      });
    });
  };

  beforeEach(async () => {
    await render(<Excalidraw />);
    API.setElements([aliceRect, bobRect, legacyRect]);
  });

  it("hides never-seen creators together with untagged elements", () => {
    setDirectory(["alice"]);
    setHidden([UNKNOWN_CREATOR_ID]);

    expect(getVisibleIds()).toEqual(["alice-rect"]);
  });

  it("moves a creator to their own (visible) bucket once seen", () => {
    setDirectory(["alice"]);
    setHidden([UNKNOWN_CREATOR_ID]);
    expect(getVisibleIds()).toEqual(["alice-rect"]);

    setDirectory(["alice", "bob"]);
    expect(getVisibleIds()).toEqual(["alice-rect", "bob-rect"]);
  });

  it("(control) without a directory every creator is its own bucket", () => {
    setDirectory(null);
    setHidden([UNKNOWN_CREATOR_ID]);

    expect(getVisibleIds()).toEqual(["alice-rect", "bob-rect"]);
  });
});

describe("collaborator visibility (actions + own-drawings lock)", () => {
  const collaborators = new Map([
    ["my-socket", { id: "me", isCurrentUser: true }],
    ["alice-socket", { id: "alice", username: "Alice" }],
  ]) as unknown as AppState["collaborators"];

  const execute = (
    action:
      | typeof actionToggleCollaboratorVisibility
      | typeof actionShowAllCollaborators
      | typeof actionHideAllCollaborators
      | typeof actionToggleViewMode,
    value?: string,
  ) => {
    act(() => {
      h.app.actionManager.executeAction(action, "ui", value as any);
    });
  };

  const hidden = () => [...h.state.hiddenCollaboratorIds].sort();
  const isBannerShown = () => !!document.querySelector(".own-drawings-hidden");

  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    API.setElements([
      stamp(createRect("alice-rect", 0), "alice"),
      stamp(createRect("bob-rect", 20), "bob"),
    ]);
    act(() => {
      h.app.updateScene({ collaborators });
    });
  });

  it("toggles one bucket on and off", () => {
    execute(actionToggleCollaboratorVisibility, "alice");
    expect(hidden()).toEqual(["alice"]);

    execute(actionToggleCollaboratorVisibility, "alice");
    expect(hidden()).toEqual([]);
  });

  it("hide all hides every known bucket, including your own", () => {
    execute(actionHideAllCollaborators);
    // live (me, alice) + scene creators (bob) + miscellaneous
    expect(hidden()).toEqual(["alice", "bob", "me", UNKNOWN_CREATOR_ID].sort());
  });

  it("show all clears everything", () => {
    execute(actionHideAllCollaborators);
    execute(actionShowAllCollaborators);
    expect(hidden()).toEqual([]);
    expect(h.state.viewModeEnabled).toBe(false);
  });

  it("never adds undo history entries", () => {
    const undoStackSize = API.getUndoStack().length;
    execute(actionToggleCollaboratorVisibility, "alice");
    execute(actionHideAllCollaborators);
    execute(actionShowAllCollaborators);
    expect(API.getUndoStack().length).toBe(undoStackSize);
  });

  it("(control) hiding others doesn't lock view mode", () => {
    execute(actionToggleCollaboratorVisibility, "alice");
    expect(h.state.viewModeEnabled).toBe(false);
    expect(isBannerShown()).toBe(false);
  });

  it("hiding your own drawings locks view mode and shows the hint", () => {
    execute(actionToggleCollaboratorVisibility, "me");

    expect(h.state.viewModeEnabled).toBe(true);
    expect(h.state.viewModeBeforeSelfHide).toBe(false);
    expect(isBannerShown()).toBe(true);
  });

  it("(control) Alt+R toggles view mode when nothing of yours is hidden", () => {
    Keyboard.withModifierKeys({ alt: true }, () => {
      Keyboard.codePress(CODES.R);
    });
    expect(h.state.viewModeEnabled).toBe(true);
  });

  it("view mode can't be exited while your drawings are hidden", () => {
    execute(actionToggleCollaboratorVisibility, "me");

    // keyboard shortcut (Alt+R) — doesn't consult predicates
    Keyboard.withModifierKeys({ alt: true }, () => {
      Keyboard.codePress(CODES.R);
    });
    expect(h.state.viewModeEnabled).toBe(true);

    // menu / API
    execute(actionToggleViewMode);
    expect(h.state.viewModeEnabled).toBe(true);

    // direct state change (e.g. host app) is reverted
    act(() => {
      API.setAppState({ viewModeEnabled: false });
    });
    expect(h.state.viewModeEnabled).toBe(true);
  });

  it("the hint's button shows your drawings and unlocks", () => {
    execute(actionToggleCollaboratorVisibility, "me");

    act(() => {
      (
        document.querySelector(
          ".own-drawings-hidden__show-btn",
        ) as HTMLButtonElement
      ).click();
    });

    expect(hidden()).toEqual([]);
    expect(h.state.viewModeEnabled).toBe(false);
    expect(h.state.viewModeBeforeSelfHide).toBe(null);
    expect(isBannerShown()).toBe(false);
  });

  it("restores the view mode you had before (if already in view mode)", () => {
    act(() => {
      API.setAppState({ viewModeEnabled: true });
    });
    execute(actionToggleCollaboratorVisibility, "me");
    execute(actionToggleCollaboratorVisibility, "me");

    expect(h.state.viewModeEnabled).toBe(true);
    expect(h.state.viewModeBeforeSelfHide).toBe(null);
  });

  it("unlocks however the hidden set was cleared (e.g. leaving the room)", () => {
    execute(actionHideAllCollaborators);
    expect(h.state.viewModeEnabled).toBe(true);

    setHidden([]);
    expect(h.state.viewModeEnabled).toBe(false);
    expect(isBannerShown()).toBe(false);
  });
});

describe("collaborator visibility (menu rows)", () => {
  const directory = new Map([
    ["me", { username: "Me", lastSeen: 3 }],
    ["alice", { username: "Alice", lastSeen: 3 }],
    ["bob", { username: "Bob", lastSeen: 1 }],
    ["carol", { username: "Carol", lastSeen: 2 }],
  ]);
  const collaborators = new Map([
    ["alice-socket", { id: "alice", username: "Alice" }],
    ["my-socket", { id: "me", username: "Me", isCurrentUser: true }],
  ]) as unknown as AppState["collaborators"];

  const container = stamp(createRect("container", 0), "bob");
  const label = stamp(
    API.createElement({ type: "text", id: "label", containerId: "container" }),
    "alice",
  );
  const elements = [
    stamp(createRect("alice-1", 0), "alice"),
    stamp(createRect("alice-2", 0), "alice"),
    stamp(
      API.createElement({
        type: "rectangle",
        id: "alice-deleted",
        isDeleted: true,
      }),
      "alice",
    ),
    container,
    label,
    stamp(createRect("never-seen", 0), "dave"),
    createRect("legacy", 0),
  ];

  const getRows = (hidden: string[] = []) =>
    getCollaboratorVisibilityRows(elements, {
      collaborators,
      collaboratorDirectory: directory,
      hiddenCollaboratorIds: new Set(hidden),
    });

  it("lists live collaborators first, you on top", () => {
    expect(getRows().inRoom.map((row) => [row.id, row.isCurrentUser])).toEqual([
      ["me", true],
      ["alice", false],
    ]);
  });

  it("lists previously seen (not live) collaborators, most recent first", () => {
    expect(getRows().previouslySeen.map((row) => row.id)).toEqual([
      "carol",
      "bob",
    ]);
  });

  it("counts non-deleted drawings; labels count with their shape", () => {
    const { inRoom, previouslySeen } = getRows();
    expect(inRoom.find((row) => row.id === "alice")!.drawingsCount).toBe(2);
    expect(previouslySeen.find((row) => row.id === "bob")!.drawingsCount).toBe(
      1,
    );
  });

  it("groups untagged and never-seen creators into miscellaneous", () => {
    expect(getRows().miscellaneous).toEqual(
      expect.objectContaining({ id: UNKNOWN_CREATOR_ID, drawingsCount: 2 }),
    );
  });

  it("reflects hidden state per row", () => {
    const rows = getRows(["bob", UNKNOWN_CREATOR_ID]);
    expect(rows.previouslySeen.find((row) => row.id === "bob")!.isHidden).toBe(
      true,
    );
    expect(rows.inRoom.every((row) => !row.isHidden)).toBe(true);
    expect(rows.miscellaneous.isHidden).toBe(true);
  });
});

describe("collaborator visibility (menu UI)", () => {
  const collaborators = new Map([
    ["my-socket", { id: "me", username: "Me", isCurrentUser: true }],
    ["alice-socket", { id: "alice", username: "Alice" }],
  ]) as unknown as AppState["collaborators"];

  const queryTrigger = () =>
    document.querySelector<HTMLElement>(
      "[data-testid='collaborator-visibility-trigger']",
    );
  const queryRow = (id: string) =>
    document.querySelector<HTMLElement>(
      `[data-testid='collaborator-visibility-row-${id}']`,
    );
  const queryBadge = () =>
    document.querySelector("[data-testid='collaborator-visibility-badge']");
  const clickButton = (label: string) =>
    fireEvent.click(
      [...document.querySelectorAll("button")].find(
        (button) => button.textContent === label,
      )!,
    );

  const openMenu = () => {
    fireEvent.click(queryTrigger()!);
  };

  beforeEach(async () => {
    await render(<Excalidraw />);
    API.setElements([stamp(createRect("alice-rect", 0), "alice")]);
  });

  it("is only shown while collaborating", () => {
    expect(queryTrigger()).toBe(null);

    act(() => {
      h.app.updateScene({ collaborators });
    });
    expect(queryTrigger()).not.toBe(null);
  });

  describe("while collaborating", () => {
    beforeEach(() => {
      act(() => {
        h.app.updateScene({
          collaborators,
          appState: {
            collaboratorDirectory: new Map([
              ["me", { username: "Me", lastSeen: 2 }],
              ["alice", { username: "Alice", lastSeen: 2 }],
              ["bob", { username: "Bob", lastSeen: 1 }],
            ]),
          },
        });
      });
    });

    it("opens with all three sections", () => {
      openMenu();

      expect(queryRow("me")!.textContent).toContain("Me (you)");
      expect(queryRow("alice")).not.toBe(null);
      expect(queryRow("bob")!.textContent).toContain("Left the room");
      expect(queryRow(UNKNOWN_CREATOR_ID)).not.toBe(null);
    });

    it("toggles a collaborator from their row and shows the badge", () => {
      openMenu();
      expect(queryBadge()).toBe(null);

      fireEvent.click(queryRow("alice")!);
      expect([...h.state.hiddenCollaboratorIds]).toEqual(["alice"]);
      expect(queryRow("alice")!.getAttribute("aria-pressed")).toBe("false");
      expect(queryBadge()).not.toBe(null);

      fireEvent.click(queryRow("alice")!);
      expect(h.state.hiddenCollaboratorIds.size).toBe(0);
      expect(queryBadge()).toBe(null);
    });

    it("hide all / show all buttons", () => {
      openMenu();

      clickButton("Hide all");
      expect(h.state.hiddenCollaboratorIds.has("me")).toBe(true);
      expect(h.state.viewModeEnabled).toBe(true); // own drawings hidden → lock

      clickButton("Show all");
      expect(h.state.hiddenCollaboratorIds.size).toBe(0);
      expect(h.state.viewModeEnabled).toBe(false);
    });

    it("stays usable in view mode (the way back from hiding yourself)", () => {
      openMenu();
      fireEvent.click(queryRow("me")!);
      expect(h.state.viewModeEnabled).toBe(true);

      expect(queryTrigger()).not.toBe(null);
      fireEvent.click(queryRow("me")!);
      expect(h.state.viewModeEnabled).toBe(false);
    });
  });
});

// -----------------------------------------------------------------------------
// remaining filters (each: hidden → excluded, plus a control where useful)
// -----------------------------------------------------------------------------

describe("collaborator visibility (remaining filters)", () => {
  const createSolidRect = (id: string, x: number, extra: { y?: number } = {}) =>
    API.createElement({
      type: "rectangle",
      id,
      x,
      y: extra.y ?? 0,
      width: 100,
      height: 100,
      backgroundColor: "red",
      fillStyle: "solid",
    });

  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  afterEach(() => {
    mouse.reset();
  });

  it("JSON save (Save as) only contains visible elements", async () => {
    const onExport = vi.fn();
    await render(
      <Excalidraw handleKeyboardGlobally={true} onExport={onExport} />,
    );
    API.setElements([
      stamp(createRect("alice-rect", 0), "alice"),
      stamp(createRect("bob-rect", 20), "bob"),
    ]);
    setHidden(["bob"]);

    await act(async () => {
      await h.app.actionManager.executeAction(actionSaveFileToDisk, "ui");
    });

    await waitFor(() => expect(onExport).toHaveBeenCalled());
    expect(
      (onExport.mock.calls[0][1].elements as ExcalidrawElement[]).map(
        (el) => el.id,
      ),
    ).toEqual(["alice-rect"]);
  });

  describe("search (Ctrl+F)", () => {
    const search = async (term: string) => {
      Keyboard.withModifierKeys({ ctrl: true }, () => {
        Keyboard.keyPress(KEYS.F);
      });
      const input = await waitFor(() => {
        const element =
          h.app.excalidrawContainerValue.container!.querySelector<HTMLInputElement>(
            `.${CLASSES.SEARCH_MENU_INPUT_WRAPPER} input`,
          );
        expect(element).not.toBe(null);
        return element!;
      });
      updateTextEditor(input, term);
    };

    beforeEach(() => {
      window.HTMLElement.prototype.scrollIntoView = vi.fn();
      API.setElements([
        stamp(
          API.createElement({ type: "text", id: "bob-text", text: "secret" }),
          "bob",
        ),
      ]);
    });

    it("(control) finds visible text", async () => {
      await search("secret");
      await waitFor(() =>
        expect(h.state.searchMatches?.matches.length).toBe(1),
      );
    });

    it("never finds hidden collaborators' text", async () => {
      setHidden(["bob"]);
      await search("secret");
      // let the debounced search run, then confirm nothing matched
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(h.state.searchMatches?.matches.length ?? 0).toBe(0);
    });
  });

  it("hides embeds/iframes (DOM) of hidden collaborators", () => {
    API.setElements([
      stamp(
        API.createElement({ type: "iframe", id: "bob-iframe", width: 100 }),
        "bob",
      ),
    ]);
    act(() => {
      API.setAppState({ width: 1000, height: 1000 });
    });
    const countEmbeds = () =>
      document.querySelectorAll(".excalidraw__embeddable-container").length;

    expect(countEmbeds()).toBe(1);
    setHidden(["bob"]);
    expect(countEmbeds()).toBe(0);
  });

  describe("adding text by double-click", () => {
    beforeEach(() => {
      API.setElements([stamp(createSolidRect("bob-rect", 0), "bob")]);
    });

    it("(control) binds the new text to the visible shape", () => {
      mouse.doubleClickAt(50, 50);
      expect(h.state.editingTextElement?.containerId).toBe("bob-rect");
    });

    it("never binds new text to a hidden shape", () => {
      setHidden(["bob"]);
      mouse.doubleClickAt(50, 50);
      expect(h.state.editingTextElement).not.toBe(null);
      expect(h.state.editingTextElement?.containerId).toBe(null);
    });
  });

  describe("drawing into frames", () => {
    beforeEach(() => {
      API.setElements([
        stamp(
          API.createElement({
            type: "frame",
            id: "bob-frame",
            width: 300,
            height: 300,
          }),
          "bob",
        ),
      ]);
    });

    // same gesture as frame.test.tsx; read the result from the scene, as
    // frameId is assigned on pointer up
    const drawRectInsideFrame = () => {
      UI.clickTool("rectangle");
      mouse.downAt(50, 50);
      mouse.moveTo(100, 100);
      mouse.upAt(100, 100);
      return h.elements.find((element) => element.id !== "bob-frame")!;
    };

    it("(control) a new shape joins the visible frame", () => {
      expect(drawRectInsideFrame().frameId).toBe("bob-frame");
    });

    it("a new shape never joins a hidden frame", () => {
      setHidden(["bob"]);
      expect(drawRectInsideFrame().frameId).toBe(null);
    });
  });

  describe("motion path target", () => {
    const clickWithPathTool = () => {
      act(() => {
        h.app.setActiveTool({ type: "path" });
      });
      const canvas = document.querySelector("canvas.interactive")!;
      fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50 });
      fireEvent.pointerUp(canvas, { clientX: 50, clientY: 50 });
    };

    beforeEach(() => {
      API.setElements([stamp(createSolidRect("bob-rect", 0), "bob")]);
    });

    it("(control) picks the visible shape as target", () => {
      clickWithPathTool();
      expect(h.state.pendingPathTarget?.elementId).toBe("bob-rect");
    });

    it("never picks a hidden shape as target", () => {
      setHidden(["bob"]);
      clickWithPathTool();
      expect(h.state.pendingPathTarget?.elementId).not.toBe("bob-rect");
    });
  });

  describe("arrow binding highlight (hover)", () => {
    const hoverWithArrowTool = () => {
      UI.clickTool("arrow");
      mouse.moveTo(50, 50);
      mouse.moveTo(55, 55);
    };

    beforeEach(() => {
      API.setElements([stamp(createSolidRect("bob-rect", 0), "bob")]);
    });

    it("(control) suggests binding to the visible shape", () => {
      hoverWithArrowTool();
      expect(h.state.suggestedBinding?.element.id).toBe("bob-rect");
    });

    it("never suggests binding to a hidden shape", () => {
      setHidden(["bob"]);
      hoverWithArrowTool();
      expect(h.state.suggestedBinding).toBe(null);
    });
  });

  describe("re-targeting a binding's focus point", () => {
    beforeEach(() => {
      API.setElements([
        stamp(createSolidRect("alice-rect", 0), "alice"),
        stamp(createSolidRect("carol-rect", 300), "carol"),
        stamp(createSolidRect("bob-rect", 0, { y: 300 }), "bob"),
      ]);
      // arrow alice → carol (both visible)
      UI.clickTool("arrow");
      mouse.downAt(50, 50);
      mouse.moveTo(200, 50);
      mouse.moveTo(350, 50);
      mouse.upAt(350, 50);
    });

    const dragEndFocusPointOntoBob = () => {
      const arrow = h.elements.find(
        (el): el is NonDeleted<ExcalidrawArrowElement> => el.type === "arrow",
      )!;
      const elementsMap = h.app.scene.getNonDeletedElementsMap();
      const editor = Object.assign(
        new LinearElementEditor(arrow, elementsMap),
        {
          hoveredFocusPointBinding: "end",
          draggedFocusPointBinding: "end",
          pointerOffset: { x: 0, y: 0 },
        },
      );
      act(() => {
        handleFocusPointDrag(
          editor as LinearElementEditor,
          elementsMap,
          { x: 50, y: 350 }, // inside bob-rect
          h.app.scene,
          h.state,
          null,
          false,
        );
      });
      return h.elements.find((el) => el.id === arrow.id) as
        | ExcalidrawArrowElement
        | undefined;
    };

    it("(control) moves the binding onto a visible shape", () => {
      expect(dragEndFocusPointOntoBob()?.endBinding?.elementId).toBe(
        "bob-rect",
      );
    });

    it("never moves the binding onto a hidden shape", () => {
      setHidden(["bob"]);
      expect(dragEndFocusPointOntoBob()?.endBinding?.elementId).not.toBe(
        "bob-rect",
      );
    });
  });

  describe("COMPLEX_BINDINGS feature flag", () => {
    beforeEach(() => {
      setFeatureFlag("COMPLEX_BINDINGS", true);
      API.setElements([
        stamp(createSolidRect("alice-rect", 0), "alice"),
        stamp(createSolidRect("bob-rect", 300), "bob"),
      ]);
    });

    afterEach(() => {
      setFeatureFlag("COMPLEX_BINDINGS", false);
    });

    const drawArrowFromAliceToBob = () => {
      UI.clickTool("arrow");
      mouse.downAt(50, 50);
      mouse.moveTo(200, 50);
      mouse.moveTo(350, 50);
      mouse.upAt(350, 50);
      return h.elements.find(
        (el): el is ExcalidrawArrowElement => el.type === "arrow",
      )!;
    };

    it("(control) binds to the visible shape", () => {
      expect(drawArrowFromAliceToBob().endBinding?.elementId).toBe("bob-rect");
    });

    it("can't bind to a hidden shape either", () => {
      setHidden(["bob"]);
      expect(drawArrowFromAliceToBob().endBinding?.elementId).not.toBe(
        "bob-rect",
      );
    });
  });
});

// -----------------------------------------------------------------------------
// menu: search + phone layout + unnamed collaborators
// -----------------------------------------------------------------------------

describe("collaborator visibility (menu UI, more)", () => {
  const openMenu = (scope: ParentNode = document) => {
    fireEvent.click(
      scope.querySelector<HTMLElement>(
        "[data-testid='collaborator-visibility-trigger']",
      )!,
    );
  };
  const rowIds = () =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "[data-testid^='collaborator-visibility-row-']",
      ),
    ].map((row) =>
      row.dataset.testid!.replace("collaborator-visibility-row-", ""),
    );
  const setCollaborators = (
    entries: [
      string,
      { id: string; username?: string; isCurrentUser?: boolean },
    ][],
  ) => {
    act(() => {
      h.app.updateScene({
        collaborators: new Map(entries) as unknown as AppState["collaborators"],
      });
    });
  };

  it("filters rows by name once there are many collaborators", async () => {
    await render(<Excalidraw />);
    const names = ["Ann", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal"];
    setCollaborators(
      names.map((name, i) => [
        `${name}-socket`,
        { id: name.toLowerCase(), username: name, isCurrentUser: i === 0 },
      ]),
    );

    openMenu();
    const search = document.querySelector<HTMLInputElement>(
      ".CollaboratorVisibilityMenu__content .QuickSearch__input",
    );
    expect(search).not.toBe(null);

    fireEvent.change(search!, { target: { value: "ev" } });
    // miscellaneous has no name, so it's hidden while filtering
    expect(rowIds()).toEqual(["eve"]);
  });

  it("(control) has no search with few collaborators", async () => {
    await render(<Excalidraw />);
    setCollaborators([
      ["me-socket", { id: "me", username: "Me", isCurrentUser: true }],
    ]);

    openMenu();
    expect(
      document.querySelector(
        ".CollaboratorVisibilityMenu__content .QuickSearch__input",
      ),
    ).toBe(null);
  });

  it("labels collaborators without a name", async () => {
    await render(<Excalidraw />);
    setCollaborators([
      ["me-socket", { id: "me", isCurrentUser: true }],
      ["anon-socket", { id: "anon" }],
    ]);

    openMenu();
    expect(
      document.querySelector(
        "[data-testid='collaborator-visibility-row-anon']",
      )!.textContent,
    ).toContain("Unnamed collaborator");
  });

  describe("phone layout", () => {
    beforeAll(() => {
      mockBoundingClientRect({ height: 400, width: 800 });
    });

    afterAll(() => {
      restoreOriginalGetBoundingClientRect();
    });

    it("is available next to the avatars in the main menu", async () => {
      await render(<Excalidraw />);
      act(() => {
        h.app.refreshEditorInterface();
      });
      setCollaborators([
        ["me-socket", { id: "me", username: "Me", isCurrentUser: true }],
      ]);
      expect(h.app.editorInterface.formFactor).toBe("phone");

      fireEvent.click(document.querySelector(".main-menu-trigger")!);
      const row = await waitFor(() => {
        const element = document.querySelector(".UserList-Wrapper__row");
        expect(element).not.toBe(null);
        return element!;
      });

      openMenu(row);
      expect(rowIds()).toContain("me");
    });
  });
});

// -----------------------------------------------------------------------------
// small branches
// -----------------------------------------------------------------------------

describe("collaborator visibility (edge cases)", () => {
  beforeEach(async () => {
    await render(<Excalidraw />);
  });

  it("toggling without a bucket id does nothing", () => {
    setHidden(["alice"]);
    act(() => {
      h.app.actionManager.executeAction(
        actionToggleCollaboratorVisibility,
        "ui",
        undefined as any,
      );
    });
    expect([...h.state.hiddenCollaboratorIds]).toEqual(["alice"]);
  });

  it("show all is only offered while something is hidden", () => {
    const isOffered = () =>
      actionShowAllCollaborators.predicate!(h.elements, h.state);
    expect(isOffered()).toBe(false);
    setHidden(["alice"]);
    expect(isOffered()).toBe(true);
  });

  it("the selection safety net also clears a hidden linear element editor", () => {
    const arrow = stamp(
      API.createElement({ type: "arrow", id: "bob-arrow" }),
      "bob",
    );

    const result = getSelectionWithoutHiddenElements(
      {
        hiddenCollaboratorIds: new Set(["bob"]),
        collaboratorDirectory: null,
        selectedElementIds: {},
        selectedGroupIds: {},
        selectedLinearElement: { elementId: arrow.id } as any,
      },
      new Map([[arrow.id, arrow]]),
    );

    expect(result?.selectedLinearElement).toBe(null);
  });

  it("menu rows fall back to the directory name; no directory → no previously seen", () => {
    const rows = getCollaboratorVisibilityRows([], {
      collaborators: new Map([
        ["s", { id: "alice", isCurrentUser: false }],
      ]) as unknown as AppState["collaborators"],
      collaboratorDirectory: new Map([
        ["alice", { username: "Alice (from directory)", lastSeen: 0 }],
      ]),
      hiddenCollaboratorIds: new Set(),
    });
    expect(rows.inRoom[0].username).toBe("Alice (from directory)");

    expect(
      getCollaboratorVisibilityRows([], {
        collaborators: new Map(),
        collaboratorDirectory: null,
        hiddenCollaboratorIds: new Set(),
      }).previouslySeen,
    ).toEqual([]);
  });

  it("export without a hidden set keeps every element (other callers)", () => {
    const elements = [
      stamp(createRect("alice-rect", 0), "alice"),
      stamp(createRect("bob-rect", 20), "bob"),
    ];
    expect(
      prepareElementsForExport(elements, { selectedElementIds: {} }, false)
        .exportedElements.length,
    ).toBe(2);
  });
});
