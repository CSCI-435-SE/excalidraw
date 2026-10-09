import React from "react";

import { pointFrom } from "@excalidraw/math";
import {
  getSizeFromPoints,
  PATH_PLAYBACK_HOLD_MS,
  reseed,
} from "@excalidraw/common";

import type {
  ExcalidrawPathElement,
  ExcalidrawRectangleElement,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";

import { act, render } from "./test-utils";
import { Pointer } from "./helpers/ui";
import { API } from "./helpers/api";

const { h } = window;
const mouse = new Pointer("mouse");

const getRect = (id: string) =>
  h.elements.find((el) => el.id === id) as ExcalidrawRectangleElement;

beforeEach(async () => {
  localStorage.clear();
  reseed(7);
  mouse.reset();
  await render(<Excalidraw handleKeyboardGlobally={true} />);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("press-and-hold path playback", () => {
  it("doesn't drag the target along with the pointer once playback starts", () => {
    const rectangle = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      backgroundColor: "#000000",
    });
    const points = [pointFrom(0, 0), pointFrom(100, 0)];
    const path = API.createElement({
      type: "path",
      x: 300,
      y: 300,
      ...getSizeFromPoints(points),
      points: points as ExcalidrawPathElement["points"],
      targetElementId: rectangle.id,
    });
    API.setElements([rectangle, path]);

    // isolate the pointer handling from the animation itself
    const start = vi
      .spyOn(h.app.pathPlayback, "start")
      .mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    mouse.downAt(50, 50);
    act(() => {
      vi.advanceTimersByTime(PATH_PLAYBACK_HOLD_MS);
    });
    expect(start).toHaveBeenCalledTimes(1);

    mouse.moveTo(150, 150);
    mouse.upAt(150, 150);

    expect(getRect(rectangle.id).x).toBe(0);
    expect(getRect(rectangle.id).y).toBe(0);
  });
});
