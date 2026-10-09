import React from "react";

import { pointFrom } from "@excalidraw/math";
import { getSizeFromPoints, KEYS, reseed } from "@excalidraw/common";
import {
  getPathGlobalSamplePoints,
  getPathsTargetingElement,
} from "@excalidraw/element";

import type {
  ExcalidrawPathElement,
  ExcalidrawRectangleElement,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";

import { act, fireEvent, queryByTestId, render } from "./test-utils";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { API } from "./helpers/api";

const { h } = window;
const mouse = new Pointer("mouse");

/** lets the deferred commit in App.componentDidUpdate run */
const flushDeferred = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

const getPath = (id: string) =>
  h.elements.find((el) => el.id === id) as ExcalidrawPathElement;
const getRect = (id: string) =>
  h.elements.find((el) => el.id === id) as ExcalidrawRectangleElement;

/**
 * rectangle centered at (50, 50), path from (300, 300) → (400, 300) — kept
 * apart on purpose so pointer hits are unambiguous and the commit-time snap
 * (rectangle center → path start) is observable
 */
const setup = (points = [pointFrom(0, 0), pointFrom(100, 0)]) => {
  const rectangle = API.createElement({
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    backgroundColor: "#000000",
  });
  const path = API.createElement({
    type: "path",
    x: 300,
    y: 300,
    // size derived from the points, as for any real path
    ...getSizeFromPoints(points),
    points: points as ExcalidrawPathElement["points"],
    targetElementId: rectangle.id,
  });
  API.setElements([rectangle, path]);
  return { rectangle, path };
};

const enterEditViaContextMenu = (x: number, y: number) => {
  mouse.rightClickAt(x, y);
  const item = queryByTestId(UI.queryContextMenu()!, "editMotionPath");
  expect(item).not.toBeNull();
  fireEvent.click(item!);
};

beforeEach(async () => {
  localStorage.clear();
  reseed(7);
  mouse.reset();
  await render(<Excalidraw handleKeyboardGlobally={true} />);
});

describe("entering motion path edit mode", () => {
  it("offers 'Edit motion path' when right-clicking the path, not its element", () => {
    setup();

    mouse.rightClickAt(50, 50);
    expect(queryByTestId(UI.queryContextMenu()!, "editMotionPath")).toBeNull();

    mouse.rightClickAt(350, 300);
    expect(
      queryByTestId(UI.queryContextMenu()!, "editMotionPath"),
    ).not.toBeNull();
  });

  it("enters point editing with a snapshot and shows the small toolbar", () => {
    const { path } = setup();

    enterEditViaContextMenu(350, 300);

    expect(h.state.motionPathEditor?.pathId).toEqual(path.id);
    expect(h.state.selectedLinearElement?.elementId).toEqual(path.id);
    expect(h.state.selectedLinearElement?.isEditing).toBe(true);
    expect(
      document.querySelector('[data-testid="motion-path-edit-toolbar"]'),
    ).not.toBeNull();
  });

  it("can also be entered by double-clicking the path", () => {
    const { path } = setup();

    API.setSelectedElements([path]);
    mouse.doubleClickAt(350, 300);

    expect(h.state.motionPathEditor?.pathId).toEqual(path.id);
  });

  it("hints how to edit the path in the properties panel until editing starts", () => {
    const { rectangle, path } = setup();
    const queryHint = () =>
      document.querySelector('[data-testid="motion-path-hint"]');

    API.setSelectedElements([rectangle]);
    expect(queryHint()).toBeNull();

    API.setSelectedElements([path]);
    expect(queryHint()).not.toBeNull();

    enterEditViaContextMenu(350, 300);
    expect(queryHint()).toBeNull();
  });
});

describe("editing the path's points", () => {
  it("moves a point on the same path element (no duplicates)", () => {
    const { path } = setup();
    enterEditViaContextMenu(350, 300);

    mouse.downAt(400, 300);
    mouse.moveTo(400, 400);
    mouse.upAt(400, 400);

    expect(h.elements.length).toEqual(2);
    const updated = getPath(path.id);
    expect(updated.points).toEqual([pointFrom(0, 0), pointFrom(100, 100)]);
    expect(h.state.motionPathEditor?.pathId).toEqual(path.id);
  });

  it("adds a point by dragging a segment midpoint", () => {
    const { path } = setup();
    enterEditViaContextMenu(350, 300);

    mouse.downAt(350, 300);
    mouse.moveTo(350, 360);
    mouse.upAt(350, 360);

    expect(h.elements.length).toEqual(2);
    expect(getPath(path.id).points).toHaveLength(3);
  });

  it("deletes a selected point but never drops below two", () => {
    const { path } = setup([
      pointFrom(0, 0),
      pointFrom(50, 50),
      pointFrom(100, 0),
    ]);
    enterEditViaContextMenu(300, 300);

    // select the middle point at (350, 350) and delete it
    mouse.clickAt(350, 350);
    expect(h.state.selectedLinearElement?.selectedPointsIndices).toEqual([1]);
    Keyboard.keyPress(KEYS.DELETE);
    expect(getPath(path.id).points).toHaveLength(2);

    // the remaining two points can't be removed
    mouse.clickAt(400, 300);
    expect(h.state.selectedLinearElement?.selectedPointsIndices).toEqual([1]);
    Keyboard.keyPress(KEYS.DELETE);
    expect(getPath(path.id).points).toHaveLength(2);
    expect(getPath(path.id).isDeleted).toBe(false);
  });

  it("toggles the path between straight and curved from the toolbar", () => {
    const { path } = setup([
      pointFrom(0, 0),
      pointFrom(50, 50),
      pointFrom(100, 0),
    ]);
    enterEditViaContextMenu(300, 300);

    UI.clickOnTestId("motion-path-curve");
    expect(getPath(path.id).roundness).not.toBeNull();

    UI.clickOnTestId("motion-path-curve");
    expect(getPath(path.id).roundness).toBeNull();
  });
});

describe("testing the edited path", () => {
  it("the Test animation button plays the edited path", () => {
    const { path } = setup();
    enterEditViaContextMenu(350, 300);

    UI.clickOnTestId("motion-path-test");

    expect(h.app.pathPlayback.isPlaying(getPath(path.id))).toBe(true);
    h.app.pathPlayback.cancel(getPath(path.id));
  });
});

describe("confirming and rejecting", () => {
  // NOTE: expectations below are literal values, never the `path` fixture
  // object — scene edits mutate elements in place, so comparing against the
  // fixture would compare the edited path with itself

  it("Delete with no point selected rejects the whole session", () => {
    const { path, rectangle } = setup();
    enterEditViaContextMenu(350, 300);

    mouse.downAt(400, 300);
    mouse.moveTo(400, 400);
    mouse.upAt(400, 400);
    UI.clickOnTestId("motion-path-curve");
    expect(getPath(path.id).points).toEqual([
      pointFrom(0, 0),
      pointFrom(100, 100),
    ]);

    act(() => {
      h.setState({
        selectedLinearElement: {
          ...h.state.selectedLinearElement!,
          selectedPointsIndices: null,
        },
      });
    });
    Keyboard.keyPress(KEYS.DELETE);

    const rejected = getPath(path.id);
    expect(rejected.isDeleted).toBe(false);
    expect(rejected.points).toEqual([pointFrom(0, 0), pointFrom(100, 0)]);
    expect([rejected.x, rejected.y]).toEqual([300, 300]);
    expect(rejected.roundness).toBeNull();
    expect([getRect(rectangle.id).x, getRect(rectangle.id).y]).toEqual([0, 0]);
    expect(h.state.motionPathEditor).toBeNull();
  });

  it("the Reject button restores the path's points", () => {
    const { path } = setup();
    enterEditViaContextMenu(350, 300);

    mouse.downAt(400, 300);
    mouse.moveTo(400, 400);
    mouse.upAt(400, 400);
    expect(getPath(path.id).points).toEqual([
      pointFrom(0, 0),
      pointFrom(100, 100),
    ]);

    UI.clickOnTestId("motion-path-reject");

    expect(getPath(path.id).points).toEqual([
      pointFrom(0, 0),
      pointFrom(100, 0),
    ]);
    expect(h.state.motionPathEditor).toBeNull();
  });

  it("the Reject button undoes resize, rotation, moves and element snaps", () => {
    const { path, rectangle } = setup([
      pointFrom(0, 0),
      pointFrom(50, 50),
      pointFrom(100, 0),
    ]);
    enterEditViaContextMenu(300, 300);

    UI.resize(getPath(path.id), "se", [100, 50]);
    UI.rotate(getPath(path.id), [100, 100]);
    expect(getPath(path.id).angle).not.toEqual(0);
    // the element was snapped onto the transformed path along the way
    expect([getRect(rectangle.id).x, getRect(rectangle.id).y]).not.toEqual([
      0, 0,
    ]);

    UI.clickOnTestId("motion-path-reject");

    const rejected = getPath(path.id);
    expect(rejected.angle).toEqual(0);
    expect([rejected.x, rejected.y]).toEqual([300, 300]);
    expect([rejected.width, rejected.height]).toEqual([100, 50]);
    expect(rejected.points).toEqual([
      pointFrom(0, 0),
      pointFrom(50, 50),
      pointFrom(100, 0),
    ]);
    expect([getRect(rectangle.id).x, getRect(rectangle.id).y]).toEqual([0, 0]);
  });

  it("clicking off confirms and snaps the element onto the new start", async () => {
    const { path, rectangle } = setup();
    enterEditViaContextMenu(350, 300);

    // drag the start point from (300, 300) to (200, 400)
    mouse.downAt(300, 300);
    mouse.moveTo(200, 400);
    mouse.upAt(200, 400);

    // element stays put while editing
    expect([getRect(rectangle.id).x, getRect(rectangle.id).y]).toEqual([0, 0]);

    mouse.clickAt(700, 700);
    await flushDeferred();

    expect(h.state.motionPathEditor).toBeNull();
    const updated = getPath(path.id);
    expect([updated.x, updated.y]).toEqual([200, 400]);
    // rectangle (100x100) now centered on the new start point
    expect([getRect(rectangle.id).x, getRect(rectangle.id).y]).toEqual([
      150, 350,
    ]);
    expect(h.elements.filter((el) => el.type === "path")).toHaveLength(1);
  });

  it("Escape confirms the session", async () => {
    setup();
    enterEditViaContextMenu(350, 300);

    Keyboard.keyPress(KEYS.ESCAPE);
    await flushDeferred();

    expect(h.state.motionPathEditor).toBeNull();
    expect(h.state.selectedLinearElement).toBeNull();
  });
});

describe("transforming the path", () => {
  it("resizing the path rescales its points", () => {
    const { path } = setup([
      pointFrom(0, 0),
      pointFrom(50, 50),
      pointFrom(100, 0),
    ]);
    API.setSelectedElements([path]);

    UI.resize(getPath(path.id), "se", [100, 50]);

    const updated = getPath(path.id);
    expect(updated.points[2][0]).toBeCloseTo(200);
    expect(updated.points[1][1]).toBeCloseTo(100);
  });

  it("resizing during an edit session keeps the session open", async () => {
    const { path } = setup([
      pointFrom(0, 0),
      pointFrom(50, 50),
      pointFrom(100, 0),
    ]);
    enterEditViaContextMenu(300, 300);

    UI.resize(getPath(path.id), "se", [100, 50]);
    await flushDeferred();

    expect(getPath(path.id).points[2][0]).toBeCloseTo(200);
    expect(h.state.motionPathEditor?.pathId).toEqual(path.id);
    expect(h.state.selectedLinearElement?.isEditing).toBe(true);
  });

  it("rotating the path updates its angle", () => {
    const { path } = setup([
      pointFrom(0, 0),
      pointFrom(50, 50),
      pointFrom(100, 0),
    ]);
    API.setSelectedElements([path]);

    UI.rotate(getPath(path.id), [100, 100]);

    expect(getPath(path.id).angle).not.toEqual(0);
  });
});

describe("transforms keep the element snapped to the path's start", () => {
  const expectRectCenteredOnPathStart = (rectId: string, pathId: string) => {
    const rect = getRect(rectId);
    const [start] = getPathGlobalSamplePoints(
      getPath(pathId),
      h.app.scene.getNonDeletedElementsMap(),
    );
    expect(rect.x + rect.width / 2).toBeCloseTo(start[0]);
    expect(rect.y + rect.height / 2).toBeCloseTo(start[1]);
  };

  it("after resizing the path", () => {
    const { path, rectangle } = setup([
      pointFrom(0, 0),
      pointFrom(50, 50),
      pointFrom(100, 0),
    ]);
    API.setSelectedElements([path]);

    UI.resize(getPath(path.id), "nw", [-50, -50]);

    expectRectCenteredOnPathStart(rectangle.id, path.id);
  });

  it("after rotating the path", () => {
    const { path, rectangle } = setup([
      pointFrom(0, 0),
      pointFrom(50, 50),
      pointFrom(100, 0),
    ]);
    API.setSelectedElements([path]);

    UI.rotate(getPath(path.id), [100, 100]);

    expect(getPath(path.id).angle).not.toEqual(0);
    expectRectCenteredOnPathStart(rectangle.id, path.id);
  });

  it("after resizing the element", () => {
    const { path, rectangle } = setup();
    API.setSelectedElements([rectangle]);

    UI.resize(getRect(rectangle.id), "se", [50, 50]);

    expect(getRect(rectangle.id).width).toBeGreaterThan(100);
    expectRectCenteredOnPathStart(rectangle.id, path.id);
  });
});

describe("editing the element keeps its motion path", () => {
  it("survives resizing and rotating the element", () => {
    const { rectangle, path } = setup();
    API.setSelectedElements([rectangle]);

    UI.resize(getRect(rectangle.id), "se", [50, 50]);
    UI.rotate(getRect(rectangle.id), [50, 0]);

    const updatedRect = getRect(rectangle.id);
    expect(updatedRect.width).toBeGreaterThan(100);
    expect(updatedRect.angle).not.toEqual(0);
    expect(
      getPathsTargetingElement(updatedRect, h.elements).map((p) => p.id),
    ).toEqual([path.id]);
    expect(getPath(path.id).targetElementId).toEqual(rectangle.id);
  });
});
