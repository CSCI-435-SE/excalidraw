import React from "react";

import { pointFrom } from "@excalidraw/math";
import { reseed } from "@excalidraw/common";

import type { ExcalidrawPathElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";

import { act, render, fireEvent } from "./test-utils";
import { UI } from "./helpers/ui";
import { API } from "./helpers/api";

const { h } = window;

beforeEach(() => {
  localStorage.clear();
  reseed(7);
});

describe("path tool", () => {
  it("picks a target on first click, then draws and finalizes a multi-point path", async () => {
    const { container } = await render(<Excalidraw />);

    const canvas = container.querySelector("canvas.interactive")!;

    // draw a target rectangle
    const rectangle = UI.createElement("rectangle", {
      x: 20,
      y: 20,
      width: 100,
      height: 100,
    });

    expect(h.elements.length).toEqual(1);

    // activate the path tool
    act(() => {
      h.app.setActiveTool({ type: "path" });
    });
    expect(h.state.activeTool.type).toEqual("path");

    // first click picks the target — no element created yet
    fireEvent.pointerDown(canvas, { clientX: 60, clientY: 60 });
    fireEvent.pointerUp(canvas, { clientX: 60, clientY: 60 });

    expect(h.elements.length).toEqual(1);
    expect(h.state.pendingPathTarget).toEqual({
      elementId: rectangle.id,
      groupId: null,
    });

    // second click places the first path point
    fireEvent.pointerDown(canvas, { clientX: 200, clientY: 200 });
    fireEvent.pointerUp(canvas, { clientX: 200, clientY: 200 });

    expect(h.state.pendingPathTarget).toBeNull();
    expect(h.state.multiElement).not.toBeNull();
    expect(h.state.multiElement?.type).toEqual("path");

    // move away, then click to commit the second point
    fireEvent.pointerMove(canvas, { clientX: 250, clientY: 260 });
    fireEvent.pointerDown(canvas, { clientX: 250, clientY: 260 });
    fireEvent.pointerUp(canvas);

    // move away, then click to commit the third point
    fireEvent.pointerMove(canvas, { clientX: 300, clientY: 340 });
    fireEvent.pointerDown(canvas, { clientX: 300, clientY: 340 });
    fireEvent.pointerUp(canvas);

    // clicking back on the last committed point finalizes the path
    fireEvent.pointerDown(canvas, { clientX: 300, clientY: 340 });
    fireEvent.pointerUp(canvas);

    expect(h.state.multiElement).toBeNull();
    expect(h.elements.length).toEqual(2);

    const path = h.elements.find(
      (el) => el.type === "path",
    ) as ExcalidrawPathElement;

    expect(path).toBeDefined();
    expect(path.targetElementId).toEqual(rectangle.id);
    expect(path.targetGroupId).toBeNull();
    expect(path.points.length).toBeGreaterThanOrEqual(3);

    // the target is snapped so it's visually coincident with the path's
    // start at rest, not just mid-animation
    const updatedRectangle = h.elements.find((el) => el.id === rectangle.id)!;
    const [pathStartLocalX, pathStartLocalY] = path.points[0];
    expect(updatedRectangle.x + updatedRectangle.width / 2).toBeCloseTo(
      path.x + pathStartLocalX,
    );
    expect(updatedRectangle.y + updatedRectangle.height / 2).toBeCloseTo(
      path.y + pathStartLocalY,
    );

    // a path is not re-editable after confirm, unlike line/arrow
    expect(h.state.selectedLinearElement).toBeNull();

    act(() => {
      h.setState({
        selectedElementIds: { [path.id]: true },
      });
    });
    fireEvent.doubleClick(canvas, { clientX: 300, clientY: 340 });
    expect(h.state.selectedLinearElement).toBeNull();
  });
});

describe("path and its target are snapped together while dragging either one", () => {
  const setupSnappedPair = () => {
    // rectangle centered at (50, 50); path starting exactly there, so they
    // begin already snapped together, matching the post-confirm resting state
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
      x: 50,
      y: 50,
      points: [pointFrom(0, 0), pointFrom(100, 0)],
      targetElementId: rectangle.id,
    });
    API.setElements([rectangle, path]);
    return { rectangle, path };
  };

  it("dragging the target also drags the path", async () => {
    const { container } = await render(<Excalidraw />);
    const canvas = container.querySelector("canvas.interactive")!;
    const { rectangle, path } = setupSnappedPair();

    API.setSelectedElements([rectangle]);

    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50 });
    fireEvent.pointerMove(canvas, { clientX: 150, clientY: 150 });
    fireEvent.pointerUp(canvas);

    const updatedRectangle = h.elements.find((el) => el.id === rectangle.id)!;
    const updatedPath = h.elements.find((el) => el.id === path.id)!;

    expect([updatedRectangle.x, updatedRectangle.y]).toEqual([100, 100]);
    expect([updatedPath.x, updatedPath.y]).toEqual([150, 150]);
  });

  it("dragging the path also drags its target", async () => {
    const { container } = await render(<Excalidraw />);
    const canvas = container.querySelector("canvas.interactive")!;
    const { rectangle, path } = setupSnappedPair();

    API.setSelectedElements([path]);

    // click on the path's drawn line (its start point) to drag it
    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50 });
    fireEvent.pointerMove(canvas, { clientX: 150, clientY: 150 });
    fireEvent.pointerUp(canvas);

    const updatedRectangle = h.elements.find((el) => el.id === rectangle.id)!;
    const updatedPath = h.elements.find((el) => el.id === path.id)!;

    expect([updatedPath.x, updatedPath.y]).toEqual([150, 150]);
    expect([updatedRectangle.x, updatedRectangle.y]).toEqual([100, 100]);
  });
});
