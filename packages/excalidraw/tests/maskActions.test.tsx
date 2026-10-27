import React from "react";

import { CODES, KEYS } from "@excalidraw/common";

import { CaptureUpdateAction } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import {
  actionAddToMask,
  actionApplyMask,
  actionCancelMasking,
  actionEditMask,
  actionRemoveMask,
  actionToggleMaskEnabled,
} from "../actions";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { act, fireEvent, render, unmountComponent } from "./test-utils";

const { h } = window;

/** Ctrl+Alt+G; `key` is what the layout produces, e.g. "©" for Option+G */
const pressMaskShortcut = (key: string = KEYS.G) => {
  fireEvent.keyDown(document, {
    key,
    code: CODES.G,
    ctrlKey: true,
    altKey: true,
  });
};

const applyMask = (element: ExcalidrawElement) => {
  act(() => {
    h.app.actionManager.executeAction(actionApplyMask, "api", element.id);
  });
};

/** the element's content, i.e. everything but its mask fields and versioning */
const content = (element: ExcalidrawElement) => {
  const { maskIds, maskEnabled, version, versionNonce, updated, ...rest } =
    API.getElement(element);
  return rest;
};

const setup = () => {
  const mask = API.createElement({
    type: "ellipse",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  const target = API.createElement({
    type: "rectangle",
    x: 50,
    y: 50,
    width: 100,
    height: 100,
    backgroundColor: "#ffc9c9",
  });
  // part of the initial scene, not an undoable change
  API.updateScene({
    elements: [mask, target],
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return { mask, target };
};

/** masks `targets` with `mask` the way the user does, then leaves masking mode */
const createMask = (
  mask: NonDeletedExcalidrawElement,
  ...targets: ExcalidrawElement[]
) => {
  API.setSelectedElements([mask]);
  pressMaskShortcut();
  targets.forEach(applyMask);
  API.executeAction(actionCancelMasking);
};

beforeEach(async () => {
  unmountComponent();
  await render(<Excalidraw autoFocus={true} handleKeyboardGlobally={true} />);
});

describe("mask shortcut", () => {
  it("enters masking mode for a single basic shape", () => {
    const { mask } = setup();
    API.setSelectedElements([mask]);

    pressMaskShortcut();

    expect(h.state.maskEditor).toEqual({ maskId: mask.id, mode: "picking" });
  });

  it("works when Alt changes the typed character (macOS)", () => {
    const { mask } = setup();
    API.setSelectedElements([mask]);

    pressMaskShortcut("©");

    expect(h.state.maskEditor?.maskId).toBe(mask.id);
  });

  it("cancels masking mode when pressed again", () => {
    const { mask } = setup();
    API.setSelectedElements([mask]);

    pressMaskShortcut();
    pressMaskShortcut();

    expect(h.state.maskEditor).toBe(null);
  });

  it("does nothing for shapes that can't be masks", () => {
    const line = API.createElement({ type: "line" });
    API.setElements([line]);
    API.setSelectedElements([line]);

    pressMaskShortcut();

    expect(h.state.maskEditor).toBe(null);
  });

  it("does nothing for several unmasked elements, and doesn't group them", () => {
    const { mask, target } = setup();
    API.setSelectedElements([mask, target]);

    pressMaskShortcut();

    expect(h.state.maskEditor).toBe(null);
    expect(API.getElement(mask).groupIds).toEqual([]);
  });

  it("leaves Ctrl+G grouping working", () => {
    const { mask, target } = setup();
    API.setSelectedElements([mask, target]);

    Keyboard.withModifierKeys({ ctrl: true }, () => {
      Keyboard.keyPress(KEYS.G);
    });

    expect(API.getElement(mask).groupIds).toHaveLength(1);
  });
});

describe("applying a mask", () => {
  it("clips the picked element, selects the mask and keeps picking", () => {
    const { mask, target } = setup();
    API.setSelectedElements([mask]);
    pressMaskShortcut();

    applyMask(target);

    expect(API.getElement(target).maskIds).toEqual([mask.id]);
    expect(API.getElement(mask).maskEnabled).toBe(true);
    expect(h.state.maskEditor).toEqual({ maskId: mask.id, mode: "picking" });
    expect(h.state.selectedElementIds).toEqual({ [mask.id]: true });
  });

  it("clips several picked elements with one mask", () => {
    const { mask, target } = setup();
    const other = API.createElement({ type: "diamond" });
    API.setElements([...h.elements, other]);

    createMask(mask, target, other);

    expect(API.getElement(target).maskIds).toEqual([mask.id]);
    expect(API.getElement(other).maskIds).toEqual([mask.id]);
  });

  it("doesn't change the masked element's content", () => {
    const { mask, target } = setup();
    const before = [content(mask), content(target)];

    createMask(mask, target);

    expect([content(mask), content(target)]).toEqual(before);
  });

  it("refuses elements that can't be masked", () => {
    const { mask } = setup();
    const image = API.createElement({ type: "image" });
    API.setElements([...h.elements, image]);
    API.setSelectedElements([mask]);
    pressMaskShortcut();

    applyMask(image);

    expect(API.getElement(image).maskIds).toBeUndefined();
    expect(h.state.maskEditor?.mode).toBe("picking");
  });

  it("masks an already masked element with a second mask", () => {
    const { mask, target } = setup();
    createMask(mask, target);
    const otherMask = API.createElement({ type: "diamond" });
    API.setElements([...h.elements, otherMask]);

    createMask(otherMask, target);

    expect(API.getElement(target).maskIds).toEqual([mask.id, otherMask.id]);
  });

  it("doesn't mask an element twice with the same mask", () => {
    const { mask, target } = setup();
    API.setSelectedElements([mask]);
    pressMaskShortcut();

    applyMask(target);
    applyMask(target);

    expect(API.getElement(target).maskIds).toEqual([mask.id]);
  });

  it("is undoable", () => {
    const { mask, target } = setup();
    createMask(mask, target);

    Keyboard.undo();
    expect(API.getElement(target).maskIds).toBeFalsy();

    Keyboard.redo();
    expect(API.getElement(target).maskIds).toEqual([mask.id]);
  });
});

describe("removing and releasing masks", () => {
  it("removes the mask when the shortcut is pressed on it", () => {
    const { mask, target } = setup();
    createMask(mask, target);
    const before = [content(mask), content(target)];

    API.setSelectedElements([
      API.getElement(mask) as NonDeletedExcalidrawElement,
    ]);
    pressMaskShortcut();

    expect(API.getElement(target).maskIds).toBe(null);
    expect(h.state.maskEditor).toBe(null);
    expect([content(mask), content(target)]).toEqual(before);
  });

  it("removing one mask keeps the element's other masks", () => {
    const { mask, target } = setup();
    const otherMask = API.createElement({ type: "diamond" });
    API.setElements([...h.elements, otherMask]);
    createMask(mask, target);
    createMask(otherMask, target);

    API.setSelectedElements([
      API.getElement(mask) as NonDeletedExcalidrawElement,
    ]);
    pressMaskShortcut();

    expect(API.getElement(target).maskIds).toEqual([otherMask.id]);
  });

  it("releases masked elements from all their masks when only they are selected", () => {
    const { mask, target } = setup();
    const otherMask = API.createElement({ type: "diamond" });
    API.setElements([...h.elements, otherMask]);
    createMask(mask, target);
    createMask(otherMask, target);

    API.setSelectedElements([
      API.getElement(target) as NonDeletedExcalidrawElement,
    ]);
    pressMaskShortcut();

    expect(API.getElement(target).maskIds).toBe(null);
  });

  it("can undo removing a mask", () => {
    const { mask, target } = setup();
    createMask(mask, target);
    API.setSelectedElements([
      API.getElement(mask) as NonDeletedExcalidrawElement,
    ]);
    pressMaskShortcut();

    Keyboard.undo();

    expect(API.getElement(target).maskIds).toEqual([mask.id]);
  });
});

describe("mask options", () => {
  const openOptions = (mask: ExcalidrawElement) => {
    API.setSelectedElements([
      API.getElement(mask) as NonDeletedExcalidrawElement,
    ]);
    API.executeAction(actionEditMask);
  };

  it("opens for a mask", () => {
    const { mask, target } = setup();
    createMask(mask, target);

    openOptions(mask);

    expect(h.state.maskEditor).toEqual({ maskId: mask.id, mode: "editing" });
  });

  it("turns clipping off and on without losing the masked element", () => {
    const { mask, target } = setup();
    createMask(mask, target);
    const before = [content(mask), content(target)];
    openOptions(mask);

    API.executeAction(actionToggleMaskEnabled);
    expect(API.getElement(mask).maskEnabled).toBe(false);
    expect(API.getElement(target).maskIds).toEqual([mask.id]);

    API.executeAction(actionToggleMaskEnabled);
    expect(API.getElement(mask).maskEnabled).toBe(true);

    expect([content(mask), content(target)]).toEqual(before);
  });

  it("can undo turning clipping off", () => {
    const { mask, target } = setup();
    createMask(mask, target);
    openOptions(mask);
    API.executeAction(actionToggleMaskEnabled);

    Keyboard.undo();

    expect(API.getElement(mask).maskEnabled).toBe(true);
  });

  it("removes the mask and closes", () => {
    const { mask, target } = setup();
    createMask(mask, target);
    openOptions(mask);

    API.executeAction(actionRemoveMask);

    expect(API.getElement(target).maskIds).toBe(null);
    expect(h.state.maskEditor).toBe(null);
  });

  it("picks more elements for the mask", () => {
    const { mask, target } = setup();
    const other = API.createElement({ type: "diamond" });
    API.setElements([...h.elements, other]);
    createMask(mask, target);
    openOptions(mask);

    API.executeAction(actionAddToMask);
    expect(h.state.maskEditor).toEqual({ maskId: mask.id, mode: "picking" });
    applyMask(other);

    expect(API.getElement(other).maskIds).toEqual([mask.id]);
    expect(API.getElement(target).maskIds).toEqual([mask.id]);
  });
});
