/**
 * Co-ownership in the editor: editing a collaborator's element makes you a
 * co-owner, as part of the edit's own undo entry, so undoing every edit you
 * made to it removes you again (and redo puts you back).
 */
import {
  CREATOR_ID_KEY,
  CaptureUpdateAction,
  EDITOR_IDS_KEY,
  EDITOR_SEQS_KEY,
  newElementWith,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { actionChangeStrokeWidth } from "../actions/actionProperties";
import { prepareElementsForExport } from "../data";
import { Excalidraw } from "../index";
import { getCollaboratorVisibilityRows } from "../scene/visibility";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { act, render, unmountComponent } from "./test-utils";

import type { AppState } from "../types";

unmountComponent();

const h = window.h;

const stamp = <T extends ExcalidrawElement>(
  element: T,
  creatorId: string,
  editorIds?: string[],
) =>
  newElementWith(element as ExcalidrawElement, {
    customData: {
      [CREATOR_ID_KEY]: creatorId,
      ...(editorIds ? { [EDITOR_IDS_KEY]: editorIds } : {}),
    },
  }) as T;

const createRect = (id: string, x: number) =>
  API.createElement({ type: "rectangle", id, x, y: 0, width: 10 });

const get = (id: string) =>
  h.elements.find((el) => el.id === id)! as NonDeletedExcalidrawElement;
const editorIdsOf = (id: string) => get(id).customData?.[EDITOR_IDS_KEY];

/** sets the selection's stroke width (one undo entry) */
const edit = (strokeWidth: number) =>
  act(() => {
    h.app.actionManager.executeAction(
      actionChangeStrokeWidth,
      "ui",
      strokeWidth,
    );
  });
const widthOf = (id: string) => get(id).strokeWidth;

const collaborators = new Map([
  ["my-socket", { id: "me", username: "Me", isCurrentUser: true }],
  ["alice-socket", { id: "alice", username: "Alice" }],
]) as unknown as AppState["collaborators"];

beforeEach(async () => {
  await render(<Excalidraw handleKeyboardGlobally={true} />);
  act(() => {
    h.app.updateScene({
      elements: [
        stamp(createRect("alice-rect", 0), "alice"),
        stamp(createRect("me-rect", 40), "me"),
      ],
      collaborators,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    API.setAppState({
      collaboratorDirectory: new Map([
        ["me", { username: "Me", lastSeen: 1 }],
        ["alice", { username: "Alice", lastSeen: 1 }],
        ["carol", { username: "Carol", lastSeen: 1 }],
      ]),
    });
  });
});

describe("becoming a co-owner", () => {
  it("editing a collaborator's element adds me as a co-owner, keeping the creator", () => {
    API.setSelectedElements([get("alice-rect")]);
    edit(4);

    expect(widthOf("alice-rect")).toBe(4);
    expect(get("alice-rect").customData?.[CREATOR_ID_KEY]).toBe("alice");
    expect(editorIdsOf("alice-rect")).toEqual(["me"]);
  });

  it("selecting without editing doesn't", () => {
    API.setSelectedElements([get("alice-rect")]);
    expect(editorIdsOf("alice-rect")).toBeUndefined();
  });

  it("editing my own element doesn't add me as a co-owner", () => {
    API.setSelectedElements([get("me-rect")]);
    edit(4);
    expect(editorIdsOf("me-rect")).toBeUndefined();
  });

  it("editing it again doesn't add me twice", () => {
    API.setSelectedElements([get("alice-rect")]);
    edit(4);
    edit(5);
    expect(editorIdsOf("alice-rect")).toEqual(["me"]);
  });

  it("a co-owned element counts for each owner in the menu", () => {
    API.setSelectedElements([get("alice-rect")]);
    edit(4);
    const rows = getCollaboratorVisibilityRows(h.elements, h.state);
    const counts = Object.fromEntries(
      rows.inRoom.map((row) => [row.id, row.drawingsCount]),
    );
    expect(counts).toEqual({ me: 2, alice: 1 });
  });

  it("once I co-own it, locking its creator doesn't lock it for me", () => {
    API.setSelectedElements([get("alice-rect")]);
    edit(4);
    API.setAppState({ lockedCollaboratorIds: new Set(["alice"]) });
    expect(h.state.selectedElementIds["alice-rect"]).toBe(true);
  });

  it("without co-owning, locking its creator deselects it (unchanged)", () => {
    API.setSelectedElements([get("alice-rect")]);
    API.setAppState({ lockedCollaboratorIds: new Set(["alice"]) });
    expect(h.state.selectedElementIds["alice-rect"]).toBeUndefined();
  });
});

describe("undo / redo", () => {
  it("undoing my only edit removes me as a co-owner, redo adds me back", () => {
    API.setSelectedElements([get("alice-rect")]);
    const original = widthOf("alice-rect");
    edit(4);

    Keyboard.undo();
    expect(widthOf("alice-rect")).toBe(original);
    expect(editorIdsOf("alice-rect")).toEqual([]);
    // the removal is kept (with a newer counter) so stale copies lose
    expect(get("alice-rect").customData?.[EDITOR_SEQS_KEY]).toEqual({ me: 2 });

    Keyboard.redo();
    expect(widthOf("alice-rect")).toBe(4);
    expect(editorIdsOf("alice-rect")).toEqual(["me"]);
  });

  it("I stay a co-owner until ALL my edits to the element are undone", () => {
    API.setSelectedElements([get("alice-rect")]);
    const original = widthOf("alice-rect");
    edit(4);
    edit(5);

    Keyboard.undo();
    expect(widthOf("alice-rect")).toBe(4);
    expect(editorIdsOf("alice-rect")).toEqual(["me"]);

    Keyboard.undo();
    expect(widthOf("alice-rect")).toBe(original);
    expect(editorIdsOf("alice-rect")).toEqual([]);
  });

  it("undo keeps co-owners other clients added in the meantime", () => {
    API.setSelectedElements([get("alice-rect")]);
    const original = widthOf("alice-rect");
    edit(4);

    // carol edits it too (a remote update, not part of my history)
    act(() => {
      h.app.updateScene({
        elements: h.elements.map((el) =>
          el.id === "alice-rect"
            ? stamp(newElementWith(el, { y: 5 }), "alice", ["me", "carol"])
            : el,
        ),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    });

    Keyboard.undo();
    expect(widthOf("alice-rect")).toBe(original);
    expect(editorIdsOf("alice-rect")).toEqual(["carol"]);

    Keyboard.redo();
    expect(widthOf("alice-rect")).toBe(4);
    expect(editorIdsOf("alice-rect")).toEqual(["carol", "me"]);
  });

  it("undoing an unrelated edit doesn't touch my co-ownership", () => {
    API.setSelectedElements([get("alice-rect")]);
    edit(4);
    API.setSelectedElements([get("me-rect")]);
    const original = widthOf("me-rect");
    edit(6);

    Keyboard.undo();
    expect(widthOf("me-rect")).toBe(original);
    expect(editorIdsOf("alice-rect")).toEqual(["me"]);
  });
});

describe("visibility of a co-owned element (rendering, AC-B)", () => {
  // what the canvas draws: the jsdom viewport is 0x0, so ask the renderer
  // with an explicit viewport (same approach as collaboratorVisibility.test)
  const getRenderedIds = () =>
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

  const getExportedIds = () =>
    prepareElementsForExport(h.elements, h.state, false)
      .exportedElements.map((el) => el.id)
      .sort();

  const setHidden = (ids: string[]) => {
    act(() => {
      API.setAppState({ hiddenCollaboratorIds: new Set(ids) });
    });
  };

  /** I edit alice's rectangle (a real edit, so I become a co-owner) */
  const coOwnAlicesRect = () => {
    API.setSelectedElements([get("alice-rect")]);
    edit(4);
    API.setSelectedElements([]);
  };

  /** a peer's update: carol's rectangle that dave has edited (co-owned) */
  const receiveCoOwnedRect = () => {
    act(() => {
      h.app.updateScene({
        elements: [
          ...h.elements,
          newElementWith(createRect("carol-rect", 80) as ExcalidrawElement, {
            customData: {
              [CREATOR_ID_KEY]: "carol",
              [EDITOR_IDS_KEY]: ["dave"],
              [EDITOR_SEQS_KEY]: { dave: 1 },
            },
          }),
        ],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      API.setAppState({
        collaboratorDirectory: new Map([
          ...h.state.collaboratorDirectory!,
          ["dave", { username: "Dave", lastSeen: 1 }],
        ]),
      });
    });
  };

  it("(control) without co-owners, hiding the creator hides the element", () => {
    expect(getRenderedIds()).toEqual(["alice-rect", "me-rect"]);
    setHidden(["alice"]);
    expect(getRenderedIds()).toEqual(["me-rect"]);
  });

  it("after I edit it, hiding its creator keeps it on my canvas and in exports", () => {
    coOwnAlicesRect();
    setHidden(["alice"]);
    expect(getRenderedIds()).toEqual(["alice-rect", "me-rect"]);
    expect(getExportedIds()).toEqual(["alice-rect", "me-rect"]);
  });

  it("it's hidden once every one of its co-owners is hidden", () => {
    coOwnAlicesRect();
    setHidden(["alice", "me"]);
    expect(getRenderedIds()).toEqual([]);
    expect(getExportedIds()).toEqual([]);
  });

  it("a peer's co-owned element stays visible while any co-owner is visible", () => {
    receiveCoOwnedRect();
    expect(getRenderedIds()).toContain("carol-rect");

    setHidden(["carol"]);
    expect(getRenderedIds()).toContain("carol-rect");

    setHidden(["dave"]);
    expect(getRenderedIds()).toContain("carol-rect");

    setHidden(["carol", "dave"]);
    expect(getRenderedIds()).not.toContain("carol-rect");
  });

  it("shows again as soon as one co-owner is shown again", () => {
    receiveCoOwnedRect();
    setHidden(["carol", "dave"]);
    expect(getRenderedIds()).not.toContain("carol-rect");
    setHidden(["carol"]);
    expect(getRenderedIds()).toContain("carol-rect");
  });
});
