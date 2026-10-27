import React from "react";

import { CODES, KEYS } from "@excalidraw/common";

import { CaptureUpdateAction } from "@excalidraw/element";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import {
  act,
  fireEvent,
  GlobalTestState,
  render,
  screen,
  unmountComponent,
} from "./test-utils";

const { h } = window;

const mouse = new Pointer("mouse");

const MASKING_HINT = "Double-click elements to mask them";

const pressMaskShortcut = () => {
  fireEvent.keyDown(document, {
    key: KEYS.G,
    code: CODES.G,
    ctrlKey: true,
    altKey: true,
  });
};

/**
 * mask: filled ellipse at (0, 0)–(100, 100)
 * target: filled rectangle at (200, 0)–(300, 100)
 */
const setup = () => {
  const mask = API.createElement({
    type: "ellipse",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    backgroundColor: "#a5d8ff",
    fillStyle: "solid",
  });
  const target = API.createElement({
    type: "rectangle",
    x: 200,
    y: 0,
    width: 100,
    height: 100,
    backgroundColor: "#ffc9c9",
    fillStyle: "solid",
  });
  API.updateScene({
    elements: [mask, target],
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return { mask, target };
};

/** sets up the scene and enters masking mode with the ellipse as the mask */
const startMasking = () => {
  const elements = setup();
  API.setSelectedElements([elements.mask]);
  pressMaskShortcut();
  expect(h.state.maskEditor?.mode).toBe("picking");
  return elements;
};

beforeEach(async () => {
  unmountComponent();
  mouse.reset();
  await render(<Excalidraw autoFocus={true} handleKeyboardGlobally={true} />);
  Object.assign(document, {
    elementFromPoint: () => GlobalTestState.canvas,
  });
});

describe("picking the element to mask", () => {
  it("masks the double-clicked element", () => {
    const { mask, target } = startMasking();

    mouse.doubleClickAt(250, 50);

    expect(API.getElement(target).maskIds).toEqual([mask.id]);
    expect(h.state.maskEditor).toEqual({ maskId: mask.id, mode: "picking" });
    expect(h.state.selectedElementIds).toEqual({ [mask.id]: true });
  });

  it("keeps picking until double-clicking empty canvas", () => {
    const { mask, target } = startMasking();
    const other = API.createElement({
      type: "rectangle",
      x: 400,
      y: 0,
      width: 100,
      height: 100,
      backgroundColor: "#b2f2bb",
      fillStyle: "solid",
    });
    API.updateScene({
      elements: [...h.elements, other],
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    mouse.doubleClickAt(250, 50);
    mouse.doubleClickAt(450, 50);
    mouse.doubleClickAt(800, 800);

    expect(API.getElement(target).maskIds).toEqual([mask.id]);
    expect(API.getElement(other).maskIds).toEqual([mask.id]);
    expect(h.state.maskEditor).toBe(null);
  });

  it("doesn't open a text editor on the picked element", () => {
    startMasking();

    mouse.doubleClickAt(250, 50);

    expect(h.state.editingTextElement).toBe(null);
  });

  it("cancels when double-clicking empty canvas", () => {
    const { target } = startMasking();

    mouse.doubleClickAt(600, 600);

    expect(h.state.maskEditor).toBe(null);
    expect(API.getElement(target).maskIds).toBeUndefined();
    expect(h.state.editingTextElement).toBe(null);
  });

  it("ignores the mask itself and stays in masking mode", () => {
    const { mask } = startMasking();

    mouse.doubleClickAt(50, 50);

    expect(h.state.maskEditor).toEqual({ maskId: mask.id, mode: "picking" });
    expect(API.getElement(mask).maskIds).toBeUndefined();
  });

  it("ignores elements that can't be masked", () => {
    startMasking();
    const image = API.createElement({
      type: "image",
      x: 400,
      y: 0,
      width: 100,
      height: 100,
    });
    API.updateScene({
      elements: [...h.elements, image],
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    mouse.doubleClickAt(450, 50);

    expect(h.state.maskEditor?.mode).toBe("picking");
    expect(API.getElement(image).maskIds).toBeUndefined();
  });
});

describe("masking mode input", () => {
  it("doesn't select or move elements on click or drag", () => {
    const { mask, target } = startMasking();

    mouse.downAt(250, 50);
    mouse.moveTo(350, 150);
    mouse.upAt(350, 150);

    expect(API.getElement(target).x).toBe(200);
    expect(h.state.selectedElementIds).toEqual({ [mask.id]: true });
    expect(h.state.maskEditor?.mode).toBe("picking");
  });

  it("blocks other shortcuts", () => {
    startMasking();

    Keyboard.keyPress(KEYS.R);

    expect(h.state.activeTool.type).toBe("selection");
    expect(h.state.maskEditor?.mode).toBe("picking");
  });

  it("lets zoom shortcuts through", () => {
    startMasking();
    const zoom = h.state.zoom.value;

    fireEvent.keyDown(document, {
      key: "=",
      code: CODES.EQUAL,
      ctrlKey: true,
    });

    expect(h.state.zoom.value).toBeGreaterThan(zoom);
    expect(h.state.maskEditor?.mode).toBe("picking");
  });

  it("cancels on Escape", () => {
    startMasking();

    Keyboard.keyPress(KEYS.ESCAPE);

    expect(h.state.maskEditor).toBe(null);
  });

  it("ends when another tool is picked", () => {
    startMasking();

    act(() => {
      h.app.setActiveTool({ type: "rectangle" });
    });

    expect(h.state.maskEditor).toBe(null);
  });

  it("ends when the mask is deleted", () => {
    const { mask } = startMasking();

    API.updateScene({
      elements: h.elements.map((el) =>
        el.id === mask.id ? { ...el, isDeleted: true } : el,
      ),
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    expect(h.state.maskEditor).toBe(null);
  });
});

describe("masking mode bar", () => {
  it("is only shown while picking", () => {
    setup();
    expect(screen.queryByText(MASKING_HINT)).toBe(null);

    API.setSelectedElements([h.elements[0] as NonDeletedExcalidrawElement]);
    pressMaskShortcut();
    expect(screen.queryByText(MASKING_HINT)).not.toBe(null);

    Keyboard.keyPress(KEYS.ESCAPE);
    expect(screen.queryByText(MASKING_HINT)).toBe(null);
  });

  it("cancels masking with its Cancel button", () => {
    const { target } = startMasking();

    fireEvent.click(screen.getByTestId("masking-mode-cancel"));

    expect(h.state.maskEditor).toBe(null);
    expect(API.getElement(target).maskIds).toBeUndefined();
  });
});
