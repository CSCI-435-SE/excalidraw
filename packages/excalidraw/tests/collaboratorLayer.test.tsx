/**
 * Issue #82 — local collaborator layering, at the editor level: actions and
 * state, drawing, clicking, binding and export. Every expected value below
 * is derived from the acceptance criteria in #82 and the decisions approved
 * on it, not from running the implementation:
 *
 * - A: rows move up/down one place or to a drop position; controls only
 *   while the switch is on
 * - B: off → the shared order; on → a higher row's elements are drawn above
 *   every element of a lower one (shared order within a row); the order is
 *   kept across switching off and on
 * - C: clicking selects what's drawn on top; a locked top element lets the
 *   click through (#81 D)
 * - D: labels drawn with their container; frame children still clipped
 * - E: no element changes; Bring forward still works, within the layer
 * - F: local, not in history, reset on reload
 * - G: hiding/locking and moving don't affect each other
 * - H: newcomers go to the bottom
 * - I: PNG/SVG export follows the local order
 * - default/reset order (decision): me on top, then join order (#116's
 *   collaborator directory order), miscellaneous last
 * - binding (decision): arrows bind to the shape on top in my layering
 */
import {
  CREATOR_ID_KEY,
  EDITOR_IDS_KEY,
  UNKNOWN_CREATOR_ID,
} from "@excalidraw/element";
import { getCollaboratorLayerOrder, newElementWith } from "@excalidraw/element";
import { assert } from "vitest";

import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import {
  clearAppStateForDatabase,
  clearAppStateForLocalStorage,
  cleanAppStateForExport,
} from "../appState";
import * as Clipboard from "../clipboard";
import { exportCanvas } from "../data";
import { restoreAppState } from "../data/restore";
import { Excalidraw } from "../index";
import * as StaticScene from "../renderer/staticScene";
import { exportToCanvas } from "../scene/export";
import { getCollaboratorLayerRows } from "../scene/visibility";

import { API } from "./helpers/api";
import { Pointer, UI } from "./helpers/ui";
import {
  act,
  fireEvent,
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
  unmountComponent,
  waitFor,
} from "./test-utils";

import type { ActionName } from "../actions/types";
import type { ExportedElements } from "../data";
import type { CollaboratorVisibilityRows } from "../scene/visibility";
import type { AppState } from "../types";

unmountComponent();

const h = window.h;
const mouse = new Pointer("mouse");

const stamp = <T extends ExcalidrawElement>(element: T, creatorId: string) =>
  newElementWith(element as ExcalidrawElement, {
    customData: { [CREATOR_ID_KEY]: creatorId },
  }) as T;

/** solid fill so clicking the interior counts as a hit */
const createSolidRect = (
  id: string,
  extra: Partial<{
    x: number;
    y: number;
    width: number;
    strokeColor: string;
    frameId: string;
    boundElements: { type: "text"; id: string }[];
  }> = {},
) =>
  API.createElement({
    type: "rectangle",
    id,
    x: extra.x ?? 0,
    y: extra.y ?? 0,
    width: extra.width ?? 100,
    height: 100,
    backgroundColor: "red",
    fillStyle: "solid",
    strokeColor: extra.strokeColor,
    frameId: extra.frameId ?? null,
    boundElements: extra.boundElements ?? null,
  });

/**
 * Runs a registered action by name (a missing action fails as a readable
 * assertion rather than a broken import, as in #81's tests)
 */
const execute = (name: string, value?: unknown) => {
  const action = h.app.actionManager.actions[name as ActionName];
  assert.isDefined(action, `action "${name}" should be registered`);
  act(() => {
    h.app.actionManager.executeAction(action, "ui", value as any);
  });
};

const toggleLayering = () => execute("toggleCollaboratorLayering");
const move = (id: string, toIndex: number) =>
  execute("moveCollaboratorLayer", { id, toIndex });

/** the order the rows show and the canvas uses (top row first) */
const layerOrder = () => getCollaboratorLayerOrder(h.state);

/** ids of the elements App draws, in drawing order (last = on top) */
const drawnIds = () => h.app.visibleElements.map((el) => el.id);

const getElement = (id: string) => h.elements.find((el) => el.id === id)!;

const getSelectedIds = () => API.getSelectedElements().map((el) => el.id);

/** what AC-E says must not change */
const getShared = () =>
  h.elements.map(({ id, index, version, versionNonce }) => ({
    id,
    index,
    version,
    versionNonce,
  }));

// Session used by every test:
// - me    : this client (recorded first in the directory, like Collab does)
// - alice : in the room, joined before bob
// - bob   : in the room
const collaborators = new Map([
  ["my-socket", { id: "me", username: "Me", isCurrentUser: true }],
  ["alice-socket", { id: "alice", username: "Alice" }],
  ["bob-socket", { id: "bob", username: "Bob" }],
]) as unknown as AppState["collaborators"];

const collaboratorDirectory = new Map([
  ["me", { username: "Me", lastSeen: 1 }],
  ["alice", { username: "Alice", lastSeen: 1 }],
  ["bob", { username: "Bob", lastSeen: 1 }],
]);

/** the default (and reset) order for this session */
const DEFAULT_ORDER = ["me", "alice", "bob", UNKNOWN_CREATOR_ID];

beforeEach(async () => {
  await render(<Excalidraw handleKeyboardGlobally={true} />);
  // alice's shape under bob's, at the same position (bob's on top in the
  // shared order)
  API.setElements([
    stamp(createSolidRect("alice-under"), "alice"),
    stamp(createSolidRect("bob-over"), "bob"),
  ]);
  act(() => {
    h.app.updateScene({ collaborators });
    // jsdom's viewport is 0×0: give the canvas a size so elements are drawn
    API.setAppState({ collaboratorDirectory, width: 1000, height: 1000 });
  });
});

afterEach(() => {
  mouse.reset();
});

// -----------------------------------------------------------------------------
// actions and state
// -----------------------------------------------------------------------------

describe("collaborator layering — switch and order (A, B, reset)", () => {
  it("AC-A: the Layering switch is off by default", () => {
    expect(h.state.collaboratorLayeringEnabled).toBe(false);
    expect(h.state.collaboratorLayerOrder).toBe(null);
  });

  it("default order: the first switch-on puts me on top, then join order, miscellaneous last", () => {
    toggleLayering();
    expect(h.state.collaboratorLayeringEnabled).toBe(true);
    expect(h.state.collaboratorLayerOrder).toEqual(DEFAULT_ORDER);
  });

  it("AC-A: moving a row one place up", () => {
    toggleLayering();
    move("bob", 1);
    expect(layerOrder()).toEqual(["me", "bob", "alice", UNKNOWN_CREATOR_ID]);
  });

  it("AC-A: moving a row to a drop position", () => {
    toggleLayering();
    move(UNKNOWN_CREATOR_ID, 0);
    expect(layerOrder()).toEqual([UNKNOWN_CREATOR_ID, "me", "alice", "bob"]);
  });

  it("AC-A: rows can't be moved while the switch is off (controls hidden)", () => {
    move("bob", 0);
    expect(h.state.collaboratorLayerOrder).toBe(null);
  });

  it("AC-B: turning the switch off and on again keeps the chosen order", () => {
    toggleLayering();
    move("bob", 0);
    toggleLayering();
    expect(h.state.collaboratorLayeringEnabled).toBe(false);
    toggleLayering();
    expect(layerOrder()).toEqual(["bob", "me", "alice", UNKNOWN_CREATOR_ID]);
  });

  it("reset: returns to the default order with me on top", () => {
    toggleLayering();
    move("me", 3);
    move("bob", 0);
    execute("resetCollaboratorLayerOrder");
    expect(layerOrder()).toEqual(DEFAULT_ORDER);
  });

  it("reset: does nothing while the switch is off (grayed out)", () => {
    toggleLayering();
    move("bob", 0);
    toggleLayering();
    execute("resetCollaboratorLayerOrder");
    expect(h.state.collaboratorLayerOrder).toEqual([
      "bob",
      "me",
      "alice",
      UNKNOWN_CREATOR_ID,
    ]);
  });

  it("reset: me can be moved down again after a reset", () => {
    toggleLayering();
    execute("resetCollaboratorLayerOrder");
    move("me", 1);
    expect(layerOrder()).toEqual(["alice", "me", "bob", UNKNOWN_CREATOR_ID]);
  });
});

describe("collaborator layering — Criteria G (visibility and locking)", () => {
  it("AC-G: hiding or locking a collaborator doesn't change their place", () => {
    toggleLayering();
    move("bob", 0);
    const order = layerOrder();

    execute("toggleCollaboratorVisibility", "alice");
    execute("toggleCollaboratorLock", "bob");

    expect(layerOrder()).toEqual(order);
  });

  it("AC-G: moving a collaborator doesn't change their lock or visibility", () => {
    execute("toggleCollaboratorVisibility", "alice");
    execute("toggleCollaboratorLock", "bob");
    const hidden = [...h.state.hiddenCollaboratorIds].sort();
    const locked = [...h.state.lockedCollaboratorIds].sort();

    toggleLayering();
    move("alice", 0);
    move("bob", 3);

    expect([...h.state.hiddenCollaboratorIds].sort()).toEqual(hidden);
    expect([...h.state.lockedCollaboratorIds].sort()).toEqual(locked);
  });

  it("AC-G: a hidden collaborator is drawn in their place when shown again", () => {
    toggleLayering();
    move("alice", 0); // alice above bob

    execute("toggleCollaboratorVisibility", "alice");
    expect(drawnIds()).toEqual(["bob-over"]);

    execute("toggleCollaboratorVisibility", "alice");
    expect(drawnIds()).toEqual(["bob-over", "alice-under"]);
  });
});

describe("collaborator layering — Criteria H (new collaborators)", () => {
  it("AC-H: a collaborator who joins while layering is on is added to the bottom", () => {
    toggleLayering();
    act(() => {
      h.app.updateScene({
        collaborators: new Map([
          ...collaborators,
          ["carol-socket", { id: "carol", username: "Carol" }],
        ]) as unknown as AppState["collaborators"],
      });
      API.setAppState({
        collaboratorDirectory: new Map([
          ...collaboratorDirectory,
          ["carol", { username: "Carol", lastSeen: 2 }],
        ]),
      });
    });

    expect(layerOrder()).toEqual([...DEFAULT_ORDER, "carol"]);
  });

  it("AC-H: the newcomer's drawings are drawn below everyone", () => {
    toggleLayering();
    act(() => {
      h.app.updateScene({
        collaborators: new Map([
          ...collaborators,
          ["carol-socket", { id: "carol", username: "Carol" }],
        ]) as unknown as AppState["collaborators"],
      });
      API.setAppState({
        collaboratorDirectory: new Map([
          ...collaboratorDirectory,
          ["carol", { username: "Carol", lastSeen: 2 }],
        ]),
      });
    });
    // carol draws on top of everything in the shared order
    API.setElements([
      ...h.elements,
      stamp(createSolidRect("carol-top"), "carol"),
    ]);

    expect(drawnIds()[0]).toBe("carol-top");
  });
});

describe("collaborator layering — Criteria F (local and non-persistent)", () => {
  it("AC-F: the switch, moves and reset add no undo history entries", () => {
    const undoStackSize = API.getUndoStack().length;

    toggleLayering();
    move("bob", 0);
    execute("resetCollaboratorLayerOrder");
    toggleLayering();

    expect(API.getUndoStack().length).toBe(undoStackSize);
  });

  it("AC-F: the layer order is not saved to local storage", () => {
    toggleLayering();
    const saved = clearAppStateForLocalStorage(h.state);
    expect(saved).not.toHaveProperty("collaboratorLayeringEnabled");
    expect(saved).not.toHaveProperty("collaboratorLayerOrder");
  });

  it("AC-F: the layer order is not included in exported files", () => {
    toggleLayering();
    const exported = cleanAppStateForExport(h.state);
    expect(exported).not.toHaveProperty("collaboratorLayeringEnabled");
    expect(exported).not.toHaveProperty("collaboratorLayerOrder");
  });

  it("AC-F: the layer order is not sent to the server / other collaborators", () => {
    toggleLayering();
    const sent = clearAppStateForDatabase(h.state);
    expect(sent).not.toHaveProperty("collaboratorLayeringEnabled");
    expect(sent).not.toHaveProperty("collaboratorLayerOrder");
  });

  it("AC-F: the layer order resets when the page reloads", () => {
    toggleLayering();
    move("bob", 0);

    // a reload restores app state from what was saved locally
    const restored = restoreAppState(
      clearAppStateForLocalStorage(h.state),
      null,
    );

    expect(restored.collaboratorLayeringEnabled).toBe(false);
    expect(restored.collaboratorLayerOrder).toBe(null);
  });
});

// -----------------------------------------------------------------------------
// drawing
// -----------------------------------------------------------------------------

describe("collaborator layering — Criteria B (drawing)", () => {
  it("AC-B: with the switch off the canvas uses the shared order, even with a chosen order", () => {
    toggleLayering();
    move("alice", 0);
    toggleLayering();
    expect(drawnIds()).toEqual(["alice-under", "bob-over"]);
  });

  it("AC-B: (control) the same setup with the switch on is drawn differently", () => {
    toggleLayering();
    move("alice", 0);
    expect(drawnIds()).not.toEqual(["alice-under", "bob-over"]);
  });

  it("AC-B: a higher collaborator's elements are drawn above a lower one's", () => {
    toggleLayering();
    move("alice", 0);
    expect(drawnIds()).toEqual(["bob-over", "alice-under"]);
  });

  it("AC-B: every element of a higher collaborator is above every element of a lower one; each keeps the shared order", () => {
    API.setElements([
      stamp(createSolidRect("a1"), "alice"),
      stamp(createSolidRect("b1"), "bob"),
      stamp(createSolidRect("a2"), "alice"),
      stamp(createSolidRect("b2"), "bob"),
    ]);
    toggleLayering();
    move("alice", 0);
    expect(drawnIds()).toEqual(["b1", "b2", "a1", "a2"]);
  });

  it("AC-E: my own Bring forward changes the shared order and takes effect within my layer", () => {
    // shared: m1 < m2 < alice's a1; in my layering (default) I'm on top
    API.setElements([
      stamp(createSolidRect("m1"), "me"),
      stamp(createSolidRect("m2"), "me"),
      stamp(createSolidRect("a1"), "alice"),
    ]);
    toggleLayering();
    expect(drawnIds()).toEqual(["a1", "m1", "m2"]);

    API.setSelectedElements([getElement("m1") as NonDeletedExcalidrawElement]);
    execute("bringForward");

    // shared order changed as before (m1 now above m2)…
    expect(getElement("m1").index! > getElement("m2").index!).toBe(true);
    // …and on my screen within my layer (still above alice's a1)
    expect(drawnIds()).toEqual(["a1", "m2", "m1"]);
  });
});

describe("collaborator layering — Criteria D (attached elements)", () => {
  it("AC-D: a label is drawn directly with its container, even when the label's creator is higher", () => {
    API.setElements([
      stamp(
        createSolidRect("container", {
          boundElements: [{ type: "text", id: "label" }],
        }),
        "alice",
      ),
      stamp(createSolidRect("bob-shape"), "bob"),
      stamp(
        API.createElement({
          type: "text",
          id: "label",
          text: "label",
          containerId: "container",
        }),
        "bob",
      ),
    ]);
    toggleLayering(); // default: alice above bob
    move("bob", 0); // bob on top

    expect(drawnIds()).toEqual(["container", "label", "bob-shape"]);
  });

  describe("frame children are still clipped", () => {
    // alice's frame (x 0–100) with bob's child sticking out (x 50–150)
    beforeEach(() => {
      API.setElements([
        stamp(createSolidRect("child", { x: 50, frameId: "frame" }), "bob"),
        stamp(
          API.createElement({
            type: "frame",
            id: "frame",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          }),
          "alice",
        ),
      ]);
      toggleLayering();
      move("bob", 0); // bob above alice: child drawn after its frame
    });

    it("AC-D: (control) layering on does reorder the frame and its child", () => {
      expect(drawnIds()).toEqual(["frame", "child"]);
    });

    it("AC-D: the child keeps its frame, so it's still clipped to it", () => {
      expect(getElement("child").frameId).toBe("frame");
    });

    it("AC-D: clicking the child inside the frame selects it", () => {
      mouse.clickAt(75, 50);
      expect(getSelectedIds()).toEqual(["child"]);
    });

    it("AC-D: clicking the child's clipped part outside the frame selects nothing", () => {
      mouse.clickAt(125, 50);
      expect(getSelectedIds()).toEqual([]);
    });
  });
});

// -----------------------------------------------------------------------------
// clicking and binding
// -----------------------------------------------------------------------------

describe("collaborator layering — Criteria C (what I click is what I see)", () => {
  it("AC-C: (control) with the switch off, clicking the overlap selects the shared top element", () => {
    mouse.clickAt(50, 50);
    expect(getSelectedIds()).toEqual(["bob-over"]);
  });

  it("AC-C: with the switch on, clicking the overlap selects the element drawn on top", () => {
    toggleLayering();
    move("alice", 0);
    mouse.clickAt(50, 50);
    expect(getSelectedIds()).toEqual(["alice-under"]);
  });

  it("AC-C: a locked top element lets the click through to the element underneath", () => {
    toggleLayering();
    move("alice", 0);
    execute("toggleCollaboratorLock", "alice");
    mouse.clickAt(50, 50);
    expect(getSelectedIds()).toEqual(["bob-over"]);
  });

  describe("arrow binding (decision: binds to the shape on top)", () => {
    const getArrow = () =>
      h.elements.find(
        (el): el is ExcalidrawArrowElement =>
          el.type === "arrow" && !el.isDeleted,
      )!;

    const drawArrowIntoOverlap = () => {
      UI.clickTool("arrow");
      mouse.downAt(300, 50);
      mouse.moveTo(200, 50);
      mouse.moveTo(50, 50);
      mouse.upAt(50, 50);
    };

    it("(control) with the switch off, the arrow binds to the shared top shape", () => {
      drawArrowIntoOverlap();
      expect(getArrow().endBinding?.elementId).toBe("bob-over");
    });

    it("with the switch on, the arrow binds to the shape drawn on top", () => {
      toggleLayering();
      move("alice", 0);
      drawArrowIntoOverlap();
      expect(getArrow().endBinding?.elementId).toBe("alice-under");
    });
  });
});

// -----------------------------------------------------------------------------
// shared state and export
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// co-owned elements (#84): drawn in the layer of their highest visible owner
// (decision on #82, option C)
// -----------------------------------------------------------------------------

describe("collaborator layering — co-owned elements (#84, highest visible owner)", () => {
  /** I edit the element, which makes me a co-owner (#84), then deselect it */
  const coOwn = (id: string) => {
    API.setSelectedElements([getElement(id) as NonDeletedExcalidrawElement]);
    execute("changeStrokeWidth", 4);
    API.setSelectedElements([]);
    expect(getElement(id).customData?.[EDITOR_IDS_KEY]).toContain("me");
  };

  /** ids in the order the PNG (canvas) export draws them */
  const exportPngDrawOrder = async () => {
    const renderSpy = vi.spyOn(StaticScene, "renderStaticScene");
    await exportToCanvas(
      h.elements.filter((el) => !el.isDeleted) as NonDeletedExcalidrawElement[],
      h.state,
      {},
      { exportBackground: false, viewBackgroundColor: "#ffffff" },
    );
    const drawn = renderSpy.mock.calls[0][0].visibleElements.map((el) => el.id);
    renderSpy.mockRestore();
    return drawn;
  };

  it("(control) before I edit Bob's shape, it's drawn in Bob's layer", () => {
    toggleLayering(); // default: me, alice, bob
    expect(drawnIds()).toEqual(["bob-over", "alice-under"]);
  });

  it("AC-B: after I edit Bob's shape I co-own it, so it's drawn in my higher layer", () => {
    toggleLayering();
    coOwn("bob-over");
    expect(drawnIds()).toEqual(["alice-under", "bob-over"]);
  });

  it("AC-C: (control) before I edit Bob's shape, clicking the overlap selects Alice's shape on top", () => {
    toggleLayering();
    mouse.clickAt(50, 50);
    expect(getSelectedIds()).toEqual(["alice-under"]);
  });

  it("AC-C: once I co-own Bob's shape, clicking the overlap selects it", () => {
    toggleLayering();
    // a click before co-owning, so the cached drawing order already exists
    mouse.clickAt(50, 50);
    expect(getSelectedIds()).toEqual(["alice-under"]);
    coOwn("bob-over");
    mouse.clickAt(50, 50);
    expect(getSelectedIds()).toEqual(["bob-over"]);
  });

  it("AC-G: hiding its higher co-owner moves it to its highest visible owner's layer, and back when shown again", () => {
    // my own shape on top of both in the shared order
    API.setElements([...h.elements, stamp(createSolidRect("m1"), "me")]);
    toggleLayering();
    move("bob", 0); // bob, me, alice
    coOwn("bob-over"); // owned by bob and me
    expect(drawnIds()).toEqual(["alice-under", "m1", "bob-over"]);

    execute("toggleCollaboratorVisibility", "bob");
    // still visible through me (#84), now in my layer (shared order: before m1)
    expect(drawnIds()).toEqual(["alice-under", "bob-over", "m1"]);

    execute("toggleCollaboratorVisibility", "bob");
    expect(drawnIds()).toEqual(["alice-under", "m1", "bob-over"]);
  });

  it("AC-I: the export draws a co-owned shape in the same layer as the canvas", async () => {
    toggleLayering();
    coOwn("bob-over");
    expect(await exportPngDrawOrder()).toEqual(["alice-under", "bob-over"]);
  });
});

describe("collaborator layering — Criteria E (shared-state integrity, editor side)", () => {
  it("AC-E: the switch, moves and reset change no element index or version", () => {
    const before = getShared();

    toggleLayering();
    move("alice", 0);
    execute("resetCollaboratorLayerOrder");
    toggleLayering();

    expect(getShared()).toEqual(before);
  });

  it("AC-E: the scene keeps the shared order while layering is on", () => {
    toggleLayering();
    move("alice", 0);
    expect(h.elements.map((el) => el.id)).toEqual(["alice-under", "bob-over"]);
  });
});

describe("collaborator layering — Criteria I (export)", () => {
  // distinct stroke colors to find each shape in the SVG
  const ALICE = "#aa0000";
  const BOB = "#0000bb";

  beforeEach(() => {
    API.setElements([
      stamp(createSolidRect("alice-under", { strokeColor: ALICE }), "alice"),
      stamp(createSolidRect("bob-over", { strokeColor: BOB }), "bob"),
    ]);
  });

  const exportElements = () =>
    h.elements.filter((el) => !el.isDeleted) as unknown as ExportedElements;

  /** SVG text as the "copy as SVG" export produces it */
  const exportSvg = async () => {
    const copy = vi
      .spyOn(Clipboard, "copyTextToSystemClipboard")
      .mockResolvedValue(undefined);
    await exportCanvas(
      "clipboard-svg",
      exportElements(),
      h.state,
      {},
      {
        exportBackground: false,
        viewBackgroundColor: "#ffffff",
        exportingFrame: null,
      },
    );
    const svg = copy.mock.calls[0][0] as string;
    copy.mockRestore();
    return svg;
  };

  /** ids in the order the PNG (canvas) export draws them */
  const exportPngDrawOrder = async () => {
    const renderSpy = vi.spyOn(StaticScene, "renderStaticScene");
    await exportToCanvas(
      exportElements() as readonly NonDeletedExcalidrawElement[],
      h.state,
      {},
      {
        exportBackground: false,
        viewBackgroundColor: "#ffffff",
      },
    );
    const drawn = renderSpy.mock.calls[0][0].visibleElements.map((el) => el.id);
    renderSpy.mockRestore();
    return drawn;
  };

  it("AC-I: (control) with the switch off, the SVG export uses the shared order", async () => {
    const svg = await exportSvg();
    expect(svg.indexOf(ALICE)).toBeLessThan(svg.indexOf(BOB));
  });

  it("AC-I: the SVG export follows my layer order", async () => {
    toggleLayering();
    move("alice", 0);
    const svg = await exportSvg();
    expect(svg.indexOf(BOB)).toBeLessThan(svg.indexOf(ALICE));
  });

  it("AC-I: (control) with the switch off, the PNG export uses the shared order", async () => {
    expect(await exportPngDrawOrder()).toEqual(["alice-under", "bob-over"]);
  });

  it("AC-I: the PNG export follows my layer order", async () => {
    toggleLayering();
    move("alice", 0);
    expect(await exportPngDrawOrder()).toEqual(["bob-over", "alice-under"]);
  });

  it("AC-I: the Export image dialog's preview renders in my layer order (no error, no freeze)", async () => {
    toggleLayering();
    move("alice", 0);

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
      // the preview's export reaches drawing only if the layering state
      // survived the dialog's snapshot (it used to throw before drawing)
      await waitFor(() => expect(exportRenders().length).toBeGreaterThan(0));
      expect(exportRenders()[0][0].visibleElements.map((el) => el.id)).toEqual([
        "bob-over",
        "alice-under",
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

  it("AC-E: exporting with layering on changes no element index or version", async () => {
    toggleLayering();
    move("alice", 0);
    const before = getShared();

    await exportPngDrawOrder();
    await exportSvg();

    expect(getShared()).toEqual(before);
  });
});

// -----------------------------------------------------------------------------
// UI (Criteria A, B, G and reset in the collaborator dropdown, desktop and
// phone)
// -----------------------------------------------------------------------------

describe("collaborator layering — dropdown UI", () => {
  const MISC = UNKNOWN_CREATOR_ID;

  const openMenu = (scope: ParentNode = document) => {
    fireEvent.click(
      scope.querySelector<HTMLElement>(
        "[data-testid='collaborator-visibility-trigger']",
      )!,
    );
  };

  const getSwitch = () =>
    document.querySelector<HTMLInputElement>(
      "input[name='collaborator-layering']",
    )!;

  const getResetButton = () =>
    document.querySelector<HTMLButtonElement>(
      "[data-testid='collaborator-layer-reset']",
    )!;

  const queryControl = (kind: "up" | "handle" | "down", id: string) =>
    document.querySelector<HTMLElement>(
      `[data-testid='collaborator-layer-${kind}-${id}']`,
    );

  const getUp = (id: string) => queryControl("up", id) as HTMLButtonElement;
  const getDown = (id: string) => queryControl("down", id) as HTMLButtonElement;

  const getRowElement = (id: string) =>
    document.querySelector<HTMLElement>(
      `[data-testid='collaborator-row-${id}']`,
    )!;

  /** row ids in the order the single layered list shows them */
  const listedIds = () =>
    [
      ...document
        .querySelector("[data-testid='collaborator-layer-list']")!
        .querySelectorAll<HTMLElement>("[data-testid^='collaborator-row-']"),
    ].map((row) => row.dataset.testid!.replace("collaborator-row-", ""));

  const sectionTitles = () =>
    [
      ...document.querySelectorAll(
        ".CollaboratorVisibilityMenu__section-title",
      ),
    ].map((title) => title.textContent);

  /** a drag by `id`'s handle, dropped on `targetId`'s row */
  const dragRow = (id: string, targetId: string) => {
    const dataTransfer = {
      setData: () => {},
      setDragImage: () => {},
    };
    const handle = queryControl("handle", id)!;
    const target = getRowElement(targetId);
    fireEvent.dragStart(handle, { dataTransfer });
    fireEvent.dragEnter(target, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    fireEvent.dragEnd(handle, { dataTransfer });
  };

  describe("desktop", () => {
    beforeEach(() => {
      openMenu();
    });

    it("AC-A: the Layering switch is shown and off by default", () => {
      expect(getSwitch()).not.toBe(null);
      expect(getSwitch().checked).toBe(false);
    });

    it("AC-A: while the switch is off, no row shows ↑ · ↓ and #116's sections are unchanged", () => {
      for (const id of ["me", "alice", "bob", MISC]) {
        expect(queryControl("up", id)).toBe(null);
        expect(queryControl("handle", id)).toBe(null);
        expect(queryControl("down", id)).toBe(null);
      }
      expect(sectionTitles()).toEqual(["In the room", "Miscellaneous"]);
    });

    it("AC-A: (control) turning the switch on shows ↑ · ↓ on every row, including mine and miscellaneous", () => {
      fireEvent.click(getSwitch());
      expect(getSwitch().checked).toBe(true);
      for (const id of ["me", "alice", "bob", MISC]) {
        expect(queryControl("up", id)).not.toBe(null);
        expect(queryControl("handle", id)).not.toBe(null);
        expect(queryControl("down", id)).not.toBe(null);
      }
    });

    it("AC-A: while on, rows are a single list in layer order, each labelled with its section", () => {
      fireEvent.click(getSwitch());
      expect(sectionTitles()).toEqual([]);
      expect(listedIds()).toEqual(DEFAULT_ORDER);
      expect(getRowElement("alice").textContent).toContain("In the room");
      expect(getRowElement(MISC).textContent).toContain("Miscellaneous");
    });

    it("AC-A: the top row's up arrow and the bottom row's down arrow are disabled", () => {
      fireEvent.click(getSwitch());
      expect(getUp("me").disabled).toBe(true);
      expect(getDown("me").disabled).toBe(false);
      expect(getUp("alice").disabled).toBe(false);
      expect(getDown("alice").disabled).toBe(false);
      expect(getUp(MISC).disabled).toBe(false);
      expect(getDown(MISC).disabled).toBe(true);
    });

    it("AC-A: the down arrow moves a row one place down", () => {
      fireEvent.click(getSwitch());
      fireEvent.click(getDown("me"));
      expect(listedIds()).toEqual(["alice", "me", "bob", MISC]);
      expect(layerOrder()).toEqual(["alice", "me", "bob", MISC]);
    });

    it("AC-A: the up arrow moves a row one place up", () => {
      fireEvent.click(getSwitch());
      fireEvent.click(getUp("bob"));
      expect(listedIds()).toEqual(["me", "bob", "alice", MISC]);
    });

    it("AC-A: the new top row's up arrow becomes disabled after a move", () => {
      fireEvent.click(getSwitch());
      fireEvent.click(getUp("bob"));
      fireEvent.click(getUp("bob"));
      expect(getUp("bob").disabled).toBe(true);
      expect(getUp("me").disabled).toBe(false);
    });

    it("AC-A: an arrow moves the layer only, not the collaborator's visibility or lock", () => {
      fireEvent.click(getSwitch());
      fireEvent.click(getDown("alice"));
      expect(h.state.hiddenCollaboratorIds.size).toBe(0);
      expect(h.state.lockedCollaboratorIds.size).toBe(0);
    });

    it("AC-A: dragging a row by its handle up to another row moves it there", () => {
      fireEvent.click(getSwitch());
      dragRow("bob", "me");
      expect(listedIds()).toEqual(["bob", "me", "alice", MISC]);
    });

    it("AC-A: dragging a row by its handle down to another row moves it there", () => {
      fireEvent.click(getSwitch());
      dragRow("me", "bob");
      expect(listedIds()).toEqual(["alice", "bob", "me", MISC]);
    });

    it("AC-A: dropping a row on itself changes nothing", () => {
      fireEvent.click(getSwitch());
      dragRow("alice", "alice");
      expect(listedIds()).toEqual(DEFAULT_ORDER);
    });

    describe("while dragging (drop line and cursor)", () => {
      const dataTransfer = { setData: () => {}, setDragImage: () => {} };
      const getList = () =>
        document.querySelector<HTMLElement>(
          "[data-testid='collaborator-layer-list']",
        )!;
      const startDrag = (id: string) =>
        fireEvent.dragStart(queryControl("handle", id)!, { dataTransfer });
      /** `false` when the list accepted the drag (no "no drop" cursor) */
      const enter = (element: Element) =>
        fireEvent.dragEnter(element, { dataTransfer });

      beforeEach(() => {
        fireEvent.click(getSwitch());
      });

      it("AC-A: dragging up shows the drop line above the target, including the top row", () => {
        startDrag("bob");
        enter(getRowElement("me"));
        expect(getRowElement("me").classList).toContain("is-drop-above");
        expect(getRowElement("me").classList).not.toContain("is-drop-below");
      });

      it("AC-A: dragging down shows the drop line below the target", () => {
        startDrag("me");
        enter(getRowElement("bob"));
        expect(getRowElement("bob").classList).toContain("is-drop-below");
        expect(getRowElement("bob").classList).not.toContain("is-drop-above");
      });

      it("AC-A: only the row under the pointer shows the drop line", () => {
        startDrag("bob");
        enter(getRowElement("me"));
        enter(getRowElement("alice"));
        expect(getRowElement("me").className).not.toMatch(/is-drop-/);
        expect(getRowElement("alice").classList).toContain("is-drop-above");
      });

      it("AC-A: (control) when nothing is dragged, the list doesn't accept drags", () => {
        expect(enter(getList())).toBe(true);
      });

      it("AC-A: while dragging, the whole list accepts the drag, so the cursor doesn't change", () => {
        startDrag("bob");
        // a gap between rows (the list itself), a row, and a row's contents
        expect(enter(getList())).toBe(false);
        expect(enter(getRowElement("alice"))).toBe(false);
        expect(
          enter(
            getRowElement("alice").querySelector(
              ".CollaboratorVisibilityMenu__row-name",
            )!,
          ),
        ).toBe(false);
        expect(fireEvent.dragOver(getList(), { dataTransfer })).toBe(false);
      });

      it("AC-A: dropping in a gap moves the row to the last row the pointer was over", () => {
        startDrag("bob");
        enter(getRowElement("me"));
        enter(getList());
        fireEvent.drop(getList(), { dataTransfer });
        expect(listedIds()).toEqual(["bob", "me", "alice", MISC]);
      });

      it("AC-A: the drop line goes away when the drag ends", () => {
        startDrag("bob");
        enter(getRowElement("me"));
        fireEvent.dragEnd(queryControl("handle", "bob")!, { dataTransfer });
        expect(getRowElement("me").className).not.toMatch(/is-drop-/);
      });
    });

    it("AC-A: turning the switch off hides the controls and brings back #116's sections", () => {
      fireEvent.click(getSwitch());
      fireEvent.click(getSwitch());
      expect(queryControl("up", "alice")).toBe(null);
      expect(sectionTitles()).toEqual(["In the room", "Miscellaneous"]);
    });

    it("AC-B: switching off and on again shows the chosen order", () => {
      fireEvent.click(getSwitch());
      fireEvent.click(getDown("me"));
      fireEvent.click(getSwitch());
      fireEvent.click(getSwitch());
      expect(listedIds()).toEqual(["alice", "me", "bob", MISC]);
    });

    it("reset: Reset order is grayed out while the switch is off", () => {
      expect(getResetButton().disabled).toBe(true);
    });

    it("reset: (control) Reset order is enabled while the switch is on", () => {
      fireEvent.click(getSwitch());
      expect(getResetButton().disabled).toBe(false);
    });

    it("reset: Reset order returns the rows to the default order", () => {
      fireEvent.click(getSwitch());
      dragRow(MISC, "me");
      fireEvent.click(getDown("alice"));
      fireEvent.click(getResetButton());
      expect(listedIds()).toEqual(DEFAULT_ORDER);
    });

    it("AC-G: hiding a collaborator from their row keeps their place in the list", () => {
      fireEvent.click(getSwitch());
      fireEvent.click(getUp("bob"));
      fireEvent.click(
        document.querySelector<HTMLElement>(
          "[data-testid='collaborator-visibility-row-bob']",
        )!,
      );
      expect(h.state.hiddenCollaboratorIds.has("bob")).toBe(true);
      expect(listedIds()).toEqual(["me", "bob", "alice", MISC]);
    });

    it("AC-G: a collaborator who left keeps their place in the list, labelled Previously seen", () => {
      // carol was seen after bob (directory order) but is no longer in the room
      act(() => {
        API.setAppState({
          collaboratorDirectory: new Map([
            ...collaboratorDirectory,
            ["carol", { username: "Carol", lastSeen: 2 }],
          ]),
        });
      });
      fireEvent.click(getSwitch());
      expect(listedIds()).toEqual(["me", "alice", "bob", "carol", MISC]);
      expect(getRowElement("carol").textContent).toContain("Previously seen");
    });
  });

  describe("phone layout", () => {
    beforeAll(() => {
      mockBoundingClientRect({ height: 400, width: 800 });
    });

    afterAll(() => {
      restoreOriginalGetBoundingClientRect();
    });

    it("AC-A: the Layering switch and ↑ · ↓ are in the main menu's collaborator section", async () => {
      act(() => {
        h.app.refreshEditorInterface();
      });
      expect(h.app.editorInterface.formFactor).toBe("phone");

      fireEvent.click(document.querySelector(".main-menu-trigger")!);
      const row = await waitFor(() => {
        const element = document.querySelector(".UserList-Wrapper__row");
        expect(element).not.toBe(null);
        return element!;
      });
      openMenu(row);

      expect(queryControl("up", "alice")).toBe(null);
      fireEvent.click(getSwitch());
      fireEvent.click(getDown("me"));
      expect(listedIds()).toEqual(["alice", "me", "bob", MISC]);
    });
  });
});

// -----------------------------------------------------------------------------
// getCollaboratorLayerRows (pure): the rows of the layered list
// -----------------------------------------------------------------------------

describe("getCollaboratorLayerRows", () => {
  const row = (id: string) => ({
    id,
    username: id,
    isCurrentUser: false,
    isHidden: false,
    isLocked: false,
    isLockDisabled: false,
    drawingsCount: 0,
  });
  const rows: CollaboratorVisibilityRows = {
    inRoom: [row("me"), row("alice")],
    previouslySeen: [row("carol")],
    miscellaneous: row(UNKNOWN_CREATOR_ID),
  };

  it("AC-A: lists every row in layer order, each with its section", () => {
    expect(
      getCollaboratorLayerRows(rows, [
        "carol",
        UNKNOWN_CREATOR_ID,
        "me",
        "alice",
      ]).map(({ id, section }) => [id, section]),
    ).toEqual([
      ["carol", "previouslySeen"],
      [UNKNOWN_CREATOR_ID, "miscellaneous"],
      ["me", "inRoom"],
      ["alice", "inRoom"],
    ]);
  });

  it("AC-A: an id in the order with no collaborator row (e.g. pruned from the directory) isn't listed", () => {
    expect(
      getCollaboratorLayerRows(rows, [
        "me",
        "pruned",
        "alice",
        "carol",
        UNKNOWN_CREATOR_ID,
      ]).map(({ id }) => id),
    ).toEqual(["me", "alice", "carol", UNKNOWN_CREATOR_ID]);
  });
});
