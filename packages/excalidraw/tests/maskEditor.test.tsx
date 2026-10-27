import React from "react";

import { CODES, KEYS } from "@excalidraw/common";

import { CaptureUpdateAction } from "@excalidraw/element";

import { actionApplyMask, actionCancelMasking } from "../actions";
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

const getTextarea = () =>
  document.querySelector<HTMLTextAreaElement>(
    ".excalidraw-textEditorContainer > textarea",
  );

const getToolbar = () => screen.queryByTestId("mask-edit-toolbar");

/**
 * mask: filled ellipse at (0, 0)–(100, 100), clipping
 * target: filled rectangle at (50, 50)–(150, 150)
 */
const setupMask = () => {
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
    x: 50,
    y: 50,
    width: 100,
    height: 100,
    backgroundColor: "#ffc9c9",
    fillStyle: "solid",
  });
  API.updateScene({
    elements: [mask, target],
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  API.setSelectedElements([mask]);
  fireEvent.keyDown(document, {
    key: KEYS.G,
    code: CODES.G,
    ctrlKey: true,
    altKey: true,
  });
  act(() => {
    h.app.actionManager.executeAction(actionApplyMask, "api", target.id);
  });
  API.executeAction(actionCancelMasking);
  expect(API.getElement(target).maskIds).toEqual([mask.id]);
  return { mask, target };
};

/** double-click the mask, close its text editor, double-click it again */
const openOptions = () => {
  mouse.doubleClickAt(20, 50);
  const textarea = getTextarea();
  expect(textarea).not.toBe(null);
  Keyboard.exitTextEditor(textarea!);
  mouse.doubleClickAt(20, 50);
  expect(h.state.maskEditor?.mode).toBe("editing");
};

beforeEach(async () => {
  unmountComponent();
  mouse.reset();
  await render(<Excalidraw autoFocus={true} handleKeyboardGlobally={true} />);
  Object.assign(document, {
    elementFromPoint: () => GlobalTestState.canvas,
  });
});

describe("opening the mask options", () => {
  it("edits the mask's text on the first double-click", () => {
    setupMask();

    mouse.doubleClickAt(20, 50);

    expect(getTextarea()).not.toBe(null);
    expect(h.state.maskEditor).toBe(null);
  });

  it("opens the options on the next double-click", () => {
    const { mask } = setupMask();

    openOptions();

    expect(h.state.maskEditor).toEqual({ maskId: mask.id, mode: "editing" });
    expect(getToolbar()).not.toBe(null);
    expect(getTextarea()).toBe(null);
  });

  it("enters a grouped mask's group first, then edits as usual", () => {
    const { mask, target } = setupMask();
    API.setSelectedElements([mask, target]);
    Keyboard.withModifierKeys({ ctrl: true }, () => {
      Keyboard.keyPress(KEYS.G);
    });
    const groupId = API.getElement(mask).groupIds[0];
    mouse.reset();
    mouse.clickAt(20, 50);
    expect(h.state.selectedGroupIds).toEqual({ [groupId]: true });

    mouse.doubleClickAt(20, 50);
    expect(h.state.editingGroupId).toBe(groupId);
    expect(getTextarea()).toBe(null);

    openOptions();

    expect(h.state.maskEditor).toEqual({ maskId: mask.id, mode: "editing" });
    expect(h.state.editingGroupId).toBe(groupId);
    expect(API.getElement(target).maskIds).toEqual([mask.id]);
  });

  it("keeps double-click inside the text box for selecting words", () => {
    setupMask();
    mouse.doubleClickAt(20, 50);
    const textarea = getTextarea()!;

    fireEvent.doubleClick(textarea);

    expect(getTextarea()).toBe(textarea);
    expect(h.state.maskEditor).toBe(null);
  });

  it("never opens for shapes that aren't masks", () => {
    setupMask();
    const shape = API.createElement({
      type: "rectangle",
      x: 300,
      y: 0,
      width: 100,
      height: 100,
      backgroundColor: "#b2f2bb",
      fillStyle: "solid",
    });
    API.updateScene({
      elements: [...h.elements, shape],
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    mouse.doubleClickAt(350, 50);
    Keyboard.exitTextEditor(getTextarea()!);
    mouse.doubleClickAt(350, 50);

    expect(h.state.maskEditor).toBe(null);
    expect(getTextarea()).not.toBe(null);
  });
});

describe("mask options", () => {
  it("turns clipping off and on with the switch", () => {
    const { mask, target } = setupMask();
    openOptions();
    const toggle = () =>
      fireEvent.click(
        document.querySelector<HTMLInputElement>('input[name="mask-enabled"]')!,
      );

    toggle();
    expect(API.getElement(mask).maskEnabled).toBe(false);
    expect(API.getElement(target).maskIds).toEqual([mask.id]);

    toggle();
    expect(API.getElement(mask).maskEnabled).toBe(true);
  });

  it("removes the mask and closes", () => {
    const { target } = setupMask();
    openOptions();

    fireEvent.click(screen.getByTestId("mask-remove"));

    expect(API.getElement(target).maskIds).toBe(null);
    expect(h.state.maskEditor).toBe(null);
    expect(getToolbar()).toBe(null);
  });

  it("closes on Escape", () => {
    setupMask();
    openOptions();

    Keyboard.keyPress(KEYS.ESCAPE);

    expect(h.state.maskEditor).toBe(null);
    expect(getToolbar()).toBe(null);
  });

  it("closes when the mask is deselected", () => {
    setupMask();
    openOptions();

    API.setSelectedElements([]);

    expect(h.state.maskEditor).toBe(null);
  });
});
