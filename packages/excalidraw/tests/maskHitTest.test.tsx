import React from "react";

import { CaptureUpdateAction } from "@excalidraw/element";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
import { GlobalTestState, render, unmountComponent } from "./test-utils";

const { h } = window;

const mouse = new Pointer("mouse");

const createMask = (x: number, y: number, maskEnabled = true) => ({
  ...API.createElement({
    type: "ellipse",
    x,
    y,
    width: 100,
    height: 100,
    backgroundColor: "#a5d8ff",
    fillStyle: "solid",
  }),
  maskEnabled,
});

/**
 * mask: filled ellipse at (0, 0)–(100, 100)
 * target: filled rectangle at (50, 50)–(150, 150), clipped by the mask, so
 * its bottom-right corner (e.g. (140, 140)) is hidden
 */
const setup = (maskEnabled = true) => {
  const mask = createMask(0, 0, maskEnabled);
  const target = {
    ...API.createElement({
      type: "rectangle",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      backgroundColor: "#ffc9c9",
      fillStyle: "solid",
    }),
    maskIds: [mask.id],
  };
  API.updateScene({
    elements: [mask, target],
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return { mask, target };
};

/** the element clicks and hovers would hit (private, hence the cast) */
const elementAt = (x: number, y: number) =>
  (h.app as any).getElementAtPosition(x, y)?.id;

beforeEach(async () => {
  unmountComponent();
  mouse.reset();
  await render(<Excalidraw autoFocus={true} handleKeyboardGlobally={true} />);
  Object.assign(document, {
    elementFromPoint: () => GlobalTestState.canvas,
  });
});

describe("clicking a masked element", () => {
  it("selects it where it's visible", () => {
    const { target } = setup();

    mouse.clickAt(75, 75);

    expect(h.state.selectedElementIds).toEqual({ [target.id]: true });
  });

  it("ignores the parts the mask hides", () => {
    setup();

    mouse.clickAt(140, 140);

    expect(h.state.selectedElementIds).toEqual({});
  });

  it("can be clicked anywhere while clipping is off", () => {
    const { target } = setup(false);

    mouse.clickAt(140, 140);

    expect(h.state.selectedElementIds).toEqual({ [target.id]: true });
  });

  it("only counts the overlap of several masks", () => {
    const first = createMask(0, 0);
    const second = createMask(50, 50);
    // covers both masks; only their overlap around (75, 75) shows
    const target = {
      ...API.createElement({
        type: "rectangle",
        x: 0,
        y: 0,
        width: 150,
        height: 150,
        backgroundColor: "#ffc9c9",
        fillStyle: "solid",
      }),
      maskIds: [first.id, second.id],
    };
    API.updateScene({
      elements: [first, second, target],
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    expect(elementAt(75, 75)).toBe(target.id);
    // inside the first mask only
    expect(elementAt(30, 30)).not.toBe(target.id);
  });
});

describe("clicking the previewed hidden parts", () => {
  it("selects the element through them while the mask is selected", () => {
    const { mask, target } = setup();
    API.setSelectedElements([mask]);

    mouse.clickAt(140, 140);

    expect(h.state.selectedElementIds).toEqual({ [target.id]: true });
  });

  it("keeps them hittable while the element or its mask is selected", () => {
    const { mask, target } = setup();

    expect(elementAt(140, 140)).toBe(undefined);

    API.setSelectedElements([target]);
    expect(elementAt(140, 140)).toBe(target.id);

    API.setSelectedElements([mask]);
    expect(elementAt(140, 140)).toBe(target.id);
  });
});
