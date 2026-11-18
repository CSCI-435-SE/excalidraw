/**
 * Remote changes to elements this client is editing (resizing, dragging,
 * transforming, text editing): properties the edit doesn't own are merged in,
 * and a remote delete is accepted and re-issued so it sticks.
 */
import { KEYS, arrayToMap } from "@excalidraw/common";
import {
  CaptureUpdateAction,
  OMIT_SIDES_FOR_MULTIPLE_ELEMENTS,
  getCommonBounds,
  getTransformHandles,
  getTransformHandlesFromCoords,
} from "@excalidraw/element";

import type { Radians } from "@excalidraw/math";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import {
  endInProgressEdit,
  getInProgressEdit,
  getMergeableRemoteChanges,
} from "../data/inProgressEdit";
import { reconcileElements } from "../data/reconcile";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { getTextEditor, TEXT_EDITOR_SELECTOR } from "./queries/dom";
import { act, fireEvent, render, unmountComponent } from "./test-utils";

import type { RemoteExcalidrawElement } from "../data/reconcile";

unmountComponent();

const h = window.h;
const mouse = new Pointer("mouse");

const get = (id: string) =>
  h.app.scene
    .getElementsIncludingDeleted()
    .find((el) => el.id === id)! as NonDeletedExcalidrawElement &
    OrderedExcalidrawElement;

/**
 * A collaborator's copy of the element: `changes` applied on top of what we
 * have, made at `updated` (test elements are all stamped `updated: 1`, so
 * anything later counts as made after the edit started).
 */
const remoteCopy = (
  id: string,
  changes: Partial<ExcalidrawElement>,
  updated = 1000,
) =>
  ({
    ...get(id),
    ...changes,
    version: get(id).version + 1,
    versionNonce: 42,
    updated,
  } as RemoteExcalidrawElement);

/** applies a remote update the way collaboration does */
const receive = (remote: RemoteExcalidrawElement) => {
  act(() => {
    h.app.updateScene({
      elements: reconcileElements(
        h.app.scene.getElementsIncludingDeleted() as OrderedExcalidrawElement[],
        [remote],
        h.state,
      ),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  });
};

/** starts resizing `id` from its south-east handle, mid-gesture */
const startResize = (id: string) => {
  API.setSelectedElements([get(id)]);
  const [x, y, w, hgt] = getTransformHandles(
    get(id),
    h.state.zoom,
    arrayToMap(h.elements),
    "mouse",
    {},
  ).se!;
  mouse.reset();
  mouse.down(x + w / 2, y + hgt / 2);
  mouse.move(20, 20);
};

/** starts dragging the selection (grabbing `id`), mid-gesture */
const startDrag = (id: string, selection: string[] = [id]) => {
  API.setSelectedElements(selection.map(get));
  const el = get(id);
  mouse.reset();
  mouse.down(el.x + el.width / 2, el.y + el.height / 2);
  mouse.move(10, 10);
};

/** starts scaling the whole selection from its south-east handle */
const startMultiTransform = (ids: string[]) => {
  const elements = ids.map(get);
  API.setSelectedElements(elements);
  const [x1, y1, x2, y2] = getCommonBounds(elements);
  const [x, y, w, hgt] = getTransformHandlesFromCoords(
    [x1, y1, x2, y2, (x1 + x2) / 2, (y1 + y2) / 2],
    0 as Radians,
    h.state.zoom,
    "mouse",
    OMIT_SIDES_FOR_MULTIPLE_ELEMENTS,
  ).se!;
  mouse.reset();
  mouse.down(x + w / 2, y + hgt / 2);
  mouse.move(20, 20);
};

beforeEach(async () => {
  endInProgressEdit();
  await render(<Excalidraw handleKeyboardGlobally={true} />);
  API.setElements([
    API.createElement({
      type: "rectangle",
      id: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      strokeColor: "#000000",
    }),
    API.createElement({
      type: "rectangle",
      id: "rect2",
      x: 0,
      y: 200,
      width: 100,
      height: 100,
      strokeColor: "#000000",
    }),
    API.createElement({
      type: "text",
      id: "text",
      x: 300,
      y: 0,
      text: "hello",
      strokeColor: "#000000",
    }),
  ]);
});

describe("getMergeableRemoteChanges", () => {
  it("takes style changes but not what a resize owns", () => {
    const local = API.createElement({ type: "rectangle", x: 0, width: 50 });
    const remote = {
      ...local,
      x: 99,
      width: 10,
      strokeColor: "#ff0000",
      opacity: 40,
      version: 99,
      updated: 1000,
      isDeleted: true,
      customData: { creatorId: "x" },
    };
    expect(getMergeableRemoteChanges(local, remote, "resize")).toEqual({
      strokeColor: "#ff0000",
      opacity: 40,
    });
  });

  it("a text edit owns the text but not its color", () => {
    const local = API.createElement({ type: "text", text: "a" });
    const remote = {
      ...local,
      text: "b",
      originalText: "b",
      strokeColor: "red",
    };
    expect(getMergeableRemoteChanges(local, remote, "text")).toEqual({
      strokeColor: "red",
    });
  });
});

describe("while resizing", () => {
  it("tracks the edit's baseline from the element's pre-edit timestamp", () => {
    startResize("rect");
    expect(h.state.resizingElement?.id).toBe("rect");
    expect(getInProgressEdit()).toEqual({
      kind: "resize",
      bases: new Map([["rect", 1]]),
      deletedRemotely: new Set(),
    });
    mouse.up();
    expect(getInProgressEdit()).toBeNull();
  });

  it("a remote recolor is merged; remote geometry is not", () => {
    startResize("rect");
    receive(remoteCopy("rect", { strokeColor: "#ff0000", x: 500 }));

    expect(h.state.resizingElement?.id).toBe("rect");
    expect(get("rect").strokeColor).toBe("#ff0000");
    expect(get("rect").x).toBe(0);

    mouse.move(10, 10);
    mouse.up();
    expect(get("rect").strokeColor).toBe("#ff0000");
    expect(get("rect").width).toBe(130);
    expect(get("rect").x).toBe(0);
  });

  it("a stale remote copy (from before the edit) is ignored", () => {
    startResize("rect");
    receive(remoteCopy("rect", { strokeColor: "#ff0000" }, 1));
    expect(get("rect").strokeColor).toBe("#000000");
    mouse.up();
  });

  it("after merging a change, an older remote copy can't revert it", () => {
    startResize("rect");
    receive(remoteCopy("rect", { strokeColor: "#ff0000" }, 1000));
    receive(remoteCopy("rect", { strokeColor: "#00ff00" }, 500));
    expect(get("rect").strokeColor).toBe("#ff0000");
    mouse.up();
  });

  it("a remote delete cancels the resize, and the element stays deleted", () => {
    startResize("rect");
    const widthBefore = get("rect").width;
    receive(remoteCopy("rect", { isDeleted: true }));

    expect(h.state.resizingElement).toBeNull();
    expect(h.state.isResizing).toBe(false);
    expect(h.state.selectedElementIds.rect).toBeUndefined();
    expect(h.state.toast?.message).toMatch(/deleted the element/);
    expect(get("rect").isDeleted).toBe(true);
    expect(getInProgressEdit()).toBeNull();

    // the rest of the gesture does nothing
    mouse.move(50, 50);
    mouse.up();
    expect(get("rect").isDeleted).toBe(true);
    expect(get("rect").width).toBe(widthBefore);
  });

  it("the delete is re-issued as a newer change than the remote one", () => {
    startResize("rect");
    const remote = remoteCopy("rect", { isDeleted: true });
    receive(remote);
    expect(get("rect").version).toBeGreaterThan(remote.version);
    mouse.up();
  });

  it("a stale remote delete (from before the edit) doesn't cancel it", () => {
    startResize("rect");
    receive(remoteCopy("rect", { isDeleted: true }, 1));
    expect(h.state.resizingElement?.id).toBe("rect");
    expect(get("rect").isDeleted).toBe(false);
    mouse.up();
  });
});

describe("while editing text", () => {
  const openEditor = async () => {
    API.setSelectedElements([get("text")]);
    Keyboard.keyPress(KEYS.ENTER);
    const editor = await getTextEditor();
    expect(h.state.editingTextElement?.id).toBe("text");
    return editor;
  };

  it("a remote recolor is merged; the remote text is not", async () => {
    const editor = await openEditor();
    fireEvent.input(editor, { target: { value: "mine" } });

    receive(
      remoteCopy("text", {
        strokeColor: "#ff0000",
        text: "theirs",
        originalText: "theirs",
      } as Partial<ExcalidrawElement>),
    );
    expect(get("text").strokeColor).toBe("#ff0000");

    act(() => editor.blur());
    expect((get("text") as any).originalText).toBe("mine");
    expect(get("text").strokeColor).toBe("#ff0000");
  });

  it("a remote delete closes the editor without writing the text back", async () => {
    const editor = await openEditor();
    fireEvent.input(editor, { target: { value: "unsaved" } });

    receive(remoteCopy("text", { isDeleted: true }));

    expect(h.state.editingTextElement).toBeNull();
    expect(document.querySelector(TEXT_EDITOR_SELECTOR)).toBeNull();
    expect(get("text").isDeleted).toBe(true);
    expect(h.state.toast?.message).toMatch(/deleted the element/);

    // a late blur can't resurrect it
    act(() => editor.blur());
    expect(get("text").isDeleted).toBe(true);
  });
});

describe("while dragging", () => {
  it("registers the dragged elements with their pre-drag timestamps", () => {
    startDrag("rect", ["rect", "rect2"]);
    expect(h.state.selectedElementsAreBeingDragged).toBe(true);
    expect(getInProgressEdit()?.kind).toBe("drag");
    expect([...getInProgressEdit()!.bases]).toEqual([
      ["rect", 1],
      ["rect2", 1],
    ]);
    mouse.up();
    expect(getInProgressEdit()).toBeNull();
  });

  it("a remote recolor is merged; the drag keeps moving the element", () => {
    startDrag("rect");
    receive(remoteCopy("rect", { strokeColor: "#ff0000", x: 500 }));

    expect(get("rect").strokeColor).toBe("#ff0000");
    expect(get("rect").x).toBe(10);

    mouse.move(10, 10);
    mouse.up();
    expect(get("rect").strokeColor).toBe("#ff0000");
    expect(get("rect").x).toBe(20);
  });

  it("a remote delete drops the element from the drag; the rest keeps moving", () => {
    startDrag("rect", ["rect", "rect2"]);
    receive(remoteCopy("rect2", { isDeleted: true }));

    expect(h.state.selectedElementsAreBeingDragged).toBe(true);
    expect(h.state.selectedElementIds).toEqual({ rect: true });
    expect(h.state.toast?.message).toMatch(/deleted the element/);
    expect(get("rect2").isDeleted).toBe(true);
    const rect2X = get("rect2").x;

    mouse.move(10, 10);
    mouse.up();
    expect(get("rect").x).toBe(20);
    expect(get("rect2").isDeleted).toBe(true);
    expect(get("rect2").x).toBe(rect2X);
  });

  it("a stale remote copy (from before the drag) is ignored", () => {
    startDrag("rect");
    receive(remoteCopy("rect", { strokeColor: "#ff0000", isDeleted: true }, 1));
    expect(get("rect").strokeColor).toBe("#000000");
    expect(get("rect").isDeleted).toBe(false);
    mouse.up();
  });
});

describe("while transforming several elements", () => {
  it("registers the transform and merges a remote recolor", () => {
    startMultiTransform(["rect", "rect2"]);
    expect(h.state.resizingElement).toBeNull();
    expect(h.state.isResizing).toBe(true);
    expect(getInProgressEdit()?.kind).toBe("transform");

    receive(remoteCopy("rect2", { strokeColor: "#ff0000", width: 5 }));
    expect(get("rect2").strokeColor).toBe("#ff0000");
    expect(get("rect2").width).not.toBe(5);

    mouse.up();
    expect(get("rect2").strokeColor).toBe("#ff0000");
    expect(getInProgressEdit()).toBeNull();
  });

  it("a remote delete cancels the transform", () => {
    startMultiTransform(["rect", "rect2"]);
    receive(remoteCopy("rect2", { isDeleted: true }));

    expect(h.state.isResizing).toBe(false);
    expect(get("rect2").isDeleted).toBe(true);
    const rectWidth = get("rect").width;

    // the rest of the gesture does nothing
    mouse.move(40, 40);
    mouse.up();
    expect(get("rect").width).toBe(rectWidth);
    expect(get("rect2").isDeleted).toBe(true);
  });
});
