import React from "react";

import { KEYS, arrayToMap } from "@excalidraw/common";

import {
  CaptureUpdateAction,
  duplicateElements,
  getMaskedElements,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import {
  actionAddToMask,
  actionApplyMask,
  actionDuplicateSelection,
  actionEditMask,
} from "../actions";
import { Excalidraw } from "../index";

import { exportToSvg } from "../scene/export";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import {
  act,
  getCloneByOrigId,
  GlobalTestState,
  render,
  unmountComponent,
} from "./test-utils";

import type { Action } from "../actions/types";

const { h } = window;

const mouse = new Pointer("mouse");

/**
 * maskA: ellipse (0, 0)–(100, 100), clips `shared` and `onlyA`
 * maskB: rectangle (60, 0)–(160, 100), clips `shared`
 * shared: rectangle (40, 30)–(120, 70)
 * onlyA: diamond (10, 10)–(50, 50)
 * plain: unmasked rectangle (300, 300)–(350, 350)
 */
const setup = () => {
  const maskA = API.createElement({
    type: "ellipse",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  const maskB = API.createElement({
    type: "rectangle",
    x: 60,
    y: 0,
    width: 100,
    height: 100,
  });
  const shared = {
    ...API.createElement({
      type: "rectangle",
      x: 40,
      y: 30,
      width: 80,
      height: 40,
    }),
    maskIds: [maskA.id, maskB.id],
  };
  const onlyA = {
    ...API.createElement({
      type: "diamond",
      x: 10,
      y: 10,
      width: 40,
      height: 40,
    }),
    maskIds: [maskA.id],
  };
  const plain = API.createElement({
    type: "rectangle",
    x: 300,
    y: 300,
    width: 50,
    height: 50,
  });
  API.updateScene({
    elements: [maskA, maskB, shared, onlyA, plain],
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return { maskA, maskB, shared, onlyA, plain };
};

const group = (elements: ExcalidrawElement[]) => {
  API.setSelectedElements(elements as NonDeletedExcalidrawElement[]);
  Keyboard.withModifierKeys({ ctrl: true }, () => {
    Keyboard.keyPress(KEYS.G);
  });
};

const maskIdsOf = (element: ExcalidrawElement) =>
  API.getElement(element).maskIds;

const executeWithValue = (action: Action, value: unknown) => {
  act(() => {
    h.app.actionManager.executeAction(action, "api", value);
  });
};

/** each element's masks, by element id */
const maskLinks = () =>
  Object.fromEntries(
    h.elements
      .filter((el) => !el.isDeleted)
      .map((el) => [el.id, el.maskIds ?? null]),
  );

beforeEach(async () => {
  unmountComponent();
  mouse.reset();
  await render(<Excalidraw autoFocus={true} handleKeyboardGlobally={true} />);
  Object.assign(document, {
    elementFromPoint: () => GlobalTestState.canvas,
  });
});

describe("grouping masks with their elements", () => {
  it("keeps the relationships when grouping a mask with its elements", () => {
    const { maskA, maskB, shared, onlyA } = setup();
    const before = maskLinks();

    group([maskA, maskB, shared, onlyA]);

    const groupId = API.getElement(maskA).groupIds[0];
    expect(groupId).toBeDefined();
    for (const el of [maskA, maskB, shared, onlyA]) {
      expect(API.getElement(el).groupIds).toEqual([groupId]);
    }
    expect(maskLinks()).toEqual(before);
  });

  it("keeps each mask's own elements when several masks share a group", () => {
    const { maskA, maskB, shared, onlyA } = setup();

    group([maskA, maskB, shared, onlyA]);

    const elementsMap = arrayToMap(h.elements);
    expect(
      getMaskedElements(API.getElement(maskA), elementsMap).map((el) => el.id),
    ).toEqual([shared.id, onlyA.id]);
    expect(
      getMaskedElements(API.getElement(maskB), elementsMap).map((el) => el.id),
    ).toEqual([shared.id]);
  });

  it("keeps a mask's relationships inside a larger group with unmasked elements", () => {
    const { maskA, maskB, shared, onlyA, plain } = setup();
    const before = maskLinks();

    group([maskA, shared, onlyA]);
    group([maskA, maskB, shared, onlyA, plain]);

    expect(API.getElement(maskA).groupIds).toHaveLength(2);
    expect(API.getElement(plain).groupIds).toHaveLength(1);
    expect(maskLinks()).toEqual(before);
  });

  it("keeps the relationships when ungrouping", () => {
    const { maskA, maskB, shared, onlyA } = setup();
    const before = maskLinks();
    group([maskA, maskB, shared, onlyA]);

    Keyboard.withModifierKeys({ ctrl: true, shift: true }, () => {
      Keyboard.keyPress(KEYS.G);
    });

    expect(API.getElement(maskA).groupIds).toEqual([]);
    expect(maskLinks()).toEqual(before);
  });
});

describe("transforming grouped masks", () => {
  it("moves masks and their elements together, keeping the relationships", () => {
    const { maskA, maskB, shared, onlyA } = setup();
    const before = maskLinks();
    group([maskA, maskB, shared, onlyA]);

    mouse.downAt(130, 50);
    mouse.moveTo(230, 150);
    mouse.up();

    expect(API.getElement(maskA).x).toBe(100);
    expect(API.getElement(maskA).y).toBe(100);
    expect(API.getElement(shared).x).toBe(140);
    expect(API.getElement(shared).y).toBe(130);
    expect(maskLinks()).toEqual(before);
  });

  it("keeps the relationships when resizing and rotating the group", () => {
    const { maskA, maskB, shared, onlyA } = setup();
    const before = maskLinks();
    group([maskA, maskB, shared, onlyA]);
    const groupElements = [maskA, maskB, shared, onlyA].map(API.getElement);

    UI.resize(groupElements, "se", [50, 50]);
    expect(API.getElement(maskA).width).toBeGreaterThan(100);

    UI.rotate(groupElements.map(API.getElement), [100, 100]);
    expect(API.getElement(maskA).angle).not.toBe(0);
    expect(API.getElement(shared).angle).toBe(API.getElement(maskA).angle);

    expect(maskLinks()).toEqual(before);
  });

  it("clips the moved elements to the moved masks when exporting", async () => {
    const { maskA, maskB, shared, onlyA } = setup();
    group([maskA, maskB, shared, onlyA]);
    mouse.downAt(130, 50);
    mouse.moveTo(230, 150);
    mouse.up();

    const svg = await exportToSvg(
      h.elements as NonDeletedExcalidrawElement[],
      { exportBackground: false, viewBackgroundColor: "#ffffff" },
      null,
      { skipInliningFonts: true },
    );

    for (const mask of [maskA, maskB]) {
      const clipPath = svg.querySelector(
        `#mask-clipPath-${shared.id}-${mask.id}`,
      );
      expect(clipPath).not.toBe(null);
    }
    // the clips follow the masks, so their relative placement is unchanged
    const transform = (mask: ExcalidrawElement) =>
      svg
        .querySelector(`#mask-clipPath-${shared.id}-${mask.id} path`)!
        .getAttribute("transform")!;
    const centerX = (t: string) => Number(/translate\(([-\d.]+)/.exec(t)![1]);
    expect(centerX(transform(maskB)) - centerX(transform(maskA))).toBe(60);
  });

  it("undoes and redoes grouped moves without touching the relationships", () => {
    const { maskA, maskB, shared, onlyA } = setup();
    const before = maskLinks();
    group([maskA, maskB, shared, onlyA]);
    mouse.downAt(130, 50);
    mouse.moveTo(230, 150);
    mouse.up();

    Keyboard.undo();
    Keyboard.undo();
    expect(maskLinks()).toEqual(before);
    Keyboard.redo();
    Keyboard.redo();
    expect(maskLinks()).toEqual(before);
  });
});

describe("editing grouped masks", () => {
  it("opens a grouped mask's options inside its group", () => {
    const { maskA, maskB, shared, onlyA } = setup();
    group([maskA, maskB, shared, onlyA]);
    const groupId = API.getElement(maskA).groupIds[0];

    executeWithValue(actionEditMask, maskA.id);

    expect(h.state.maskEditor).toEqual({ maskId: maskA.id, mode: "editing" });
    expect(h.state.editingGroupId).toBe(groupId);
    expect(h.state.selectedElementIds).toEqual({ [maskA.id]: true });
  });

  it("adds grouped elements to a grouped mask", () => {
    const { maskA, maskB, shared, onlyA } = setup();
    group([maskA, maskB, shared, onlyA]);
    executeWithValue(actionEditMask, maskB.id);
    API.executeAction(actionAddToMask);

    executeWithValue(actionApplyMask, onlyA.id);

    expect(maskIdsOf(onlyA)).toEqual([maskA.id, maskB.id]);
    expect(h.state.editingGroupId).toBe(API.getElement(maskB).groupIds[0]);
  });
});

describe("duplicating grouped masks", () => {
  it("links a duplicated group's elements to the duplicated masks", () => {
    const { maskA, maskB, shared, onlyA } = setup();
    group([maskA, maskB, shared, onlyA]);

    API.executeAction(actionDuplicateSelection);

    const [maskACopy, maskBCopy, sharedCopy, onlyACopy] = [
      maskA,
      maskB,
      shared,
      onlyA,
    ].map((el) => getCloneByOrigId(el.id));

    expect(sharedCopy.maskIds).toEqual([maskACopy.id, maskBCopy.id]);
    expect(onlyACopy.maskIds).toEqual([maskACopy.id]);
    // the originals are untouched
    expect(maskIdsOf(shared)).toEqual([maskA.id, maskB.id]);
    expect(maskIdsOf(onlyA)).toEqual([maskA.id]);
  });

  it("keeps a lone duplicated element clipped by the original masks", () => {
    const { maskA, maskB, shared } = setup();
    API.setSelectedElements([
      API.getElement(shared) as NonDeletedExcalidrawElement,
    ]);

    API.executeAction(actionDuplicateSelection);

    expect(getCloneByOrigId(shared.id).maskIds).toEqual([maskA.id, maskB.id]);
  });

  it("drops masks that weren't copied along when pasting", () => {
    const { maskA, maskB, shared, onlyA } = setup();

    const { duplicatedElements } = duplicateElements({
      type: "everything",
      elements: [maskA, API.getElement(shared), API.getElement(onlyA)],
    });
    const [maskACopy, sharedCopy, onlyACopy] = duplicatedElements;

    expect(sharedCopy.maskIds).toEqual([maskACopy.id]);
    expect(onlyACopy.maskIds).toEqual([maskACopy.id]);
    expect(sharedCopy.maskIds).not.toContain(maskB.id);
  });
});
