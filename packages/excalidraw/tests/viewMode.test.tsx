import React from "react";

import { CURSOR_TYPE, KEYS } from "@excalidraw/common";

import { act } from "@testing-library/react";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { render, GlobalTestState, fireEvent } from "./test-utils";
const mouse = new Pointer("mouse");
const touch = new Pointer("touch");
const pen = new Pointer("pen");
const pointerTypes = [mouse, touch, pen];

describe("view mode", () => {
  beforeEach(async () => {
    await render(<Excalidraw />);
  });

  it("after switching to view mode – cursor type should be pointer", async () => {
    API.setAppState({ viewModeEnabled: true });
    expect(GlobalTestState.interactiveCanvas.style.cursor).toBe(
      CURSOR_TYPE.GRAB,
    );
  });

  it("after switching to view mode, moving, clicking, and pressing space key – cursor type should be pointer", async () => {
    API.setAppState({ viewModeEnabled: true });

    pointerTypes.forEach((pointerType) => {
      const pointer = pointerType;
      pointer.reset();
      pointer.move(100, 100);
      pointer.click();
      Keyboard.keyPress(KEYS.SPACE);
      expect(GlobalTestState.interactiveCanvas.style.cursor).toBe(
        CURSOR_TYPE.GRAB,
      );
    });
  });

  it("cursor should stay as grabbing type when hovering over canvas elements", async () => {
    // create a rectangle, then hover over it – cursor should be
    // move type for mouse and grab for touch & pen
    // then switch to view-mode and cursor should be grabbing type
    UI.createElement("rectangle", { size: 100 });

    pointerTypes.forEach((pointerType) => {
      const pointer = pointerType;

      pointer.moveTo(50, 50);
      // eslint-disable-next-line dot-notation
      if (pointerType["pointerType"] === "mouse") {
        expect(GlobalTestState.interactiveCanvas.style.cursor).toBe(
          CURSOR_TYPE.MOVE,
        );
      } else {
        expect(GlobalTestState.interactiveCanvas.style.cursor).toBe(
          CURSOR_TYPE.GRAB,
        );
      }

      API.setAppState({ viewModeEnabled: true });
      expect(GlobalTestState.interactiveCanvas.style.cursor).toBe(
        CURSOR_TYPE.GRAB,
      );
    });
  });

  describe("keyboard panning in view mode (#8)", () => {
    beforeEach(() => {
      vi.useFakeTimers({
        toFake: [
          "requestAnimationFrame",
          "cancelAnimationFrame",
          "setTimeout",
          "setInterval",
        ],
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("pans canvas using arrow keys when viewModeEnabled is true", async () => {
      await render(<Excalidraw />);

      act(() => {
        window.h.app.setState({
          viewModeEnabled: true,
          scrollX: 0,
          scrollY: 0,
        });
      });

      fireEvent.keyDown(GlobalTestState.interactiveCanvas, {
        key: KEYS.ARROW_RIGHT,
        code: "ArrowRight",
      });

      await act(async () => {
        vi.advanceTimersByTime(16); // Frame 1: registers key and schedules rAF
        vi.advanceTimersByTime(16); // Frame 2: executes updateKeyboardPan and mutates scrollX
      });

      expect(window.h.app.state.scrollX).not.toBe(0);

      fireEvent.keyUp(GlobalTestState.interactiveCanvas, {
        key: KEYS.ARROW_RIGHT,
        code: "ArrowRight",
      });
    });

    it("pans faster when holding Shift", async () => {
      await render(<Excalidraw />);

      act(() => {
        window.h.app.setState({
          viewModeEnabled: true,
          scrollX: 0,
          scrollY: 0,
        });
      });

      // Normal speed
      fireEvent.keyDown(GlobalTestState.interactiveCanvas, {
        key: KEYS.ARROW_RIGHT,
        code: "ArrowRight",
      });

      await act(async () => {
        vi.advanceTimersByTime(16);
        vi.advanceTimersByTime(16);
      });

      const normalDelta = Math.abs(window.h.app.state.scrollX);

      fireEvent.keyUp(GlobalTestState.interactiveCanvas, {
        key: KEYS.ARROW_RIGHT,
        code: "ArrowRight",
      });

      // Reset scroll
      act(() => {
        window.h.app.setState({ scrollX: 0, scrollY: 0 });
      });

      // Boosted speed with Shift modifier
      fireEvent.keyDown(GlobalTestState.interactiveCanvas, {
        key: "Shift",
        code: "ShiftLeft",
        shiftKey: true,
      });
      fireEvent.keyDown(GlobalTestState.interactiveCanvas, {
        key: KEYS.ARROW_RIGHT,
        code: "ArrowRight",
        shiftKey: true,
      });

      await act(async () => {
        vi.advanceTimersByTime(16);
        vi.advanceTimersByTime(16);
      });

      const shiftDelta = Math.abs(window.h.app.state.scrollX);

      fireEvent.keyUp(GlobalTestState.interactiveCanvas, {
        key: KEYS.ARROW_RIGHT,
        code: "ArrowRight",
      });
      fireEvent.keyUp(GlobalTestState.interactiveCanvas, {
        key: "Shift",
        code: "ShiftLeft",
      });

      expect(shiftDelta).toBeGreaterThan(normalDelta);
    });

    it("does not pan canvas when typing inside an input field", async () => {
      await render(<Excalidraw />);

      act(() => {
        window.h.app.setState({
          viewModeEnabled: true,
          scrollX: 0,
          scrollY: 0,
        });
      });

      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      fireEvent.keyDown(input, {
        key: KEYS.ARROW_RIGHT,
        code: "ArrowRight",
      });

      await act(async () => {
        vi.advanceTimersByTime(16);
        vi.advanceTimersByTime(16);
      });

      expect(window.h.app.state.scrollX).toBe(0);

      document.body.removeChild(input);
    });
  });
});
