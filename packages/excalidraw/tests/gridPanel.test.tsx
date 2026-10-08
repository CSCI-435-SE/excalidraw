import { queryByTestId, queryByText } from "@testing-library/react";

import {
  applyDarkModeFilter,
  CODES,
  COLOR_PALETTE,
  DEFAULT_GRID_OPACITY,
  DEFAULT_GRID_SCALE,
  DEFAULT_GRID_SIZE,
  KEYS,
  MAX_GRID_SCALE,
  MIN_GRID_SCALE,
  THEME,
} from "@excalidraw/common";

import { actionChangeGridColor, actionChangeGridScale } from "../actions";
import { getShortcutFromShortcutName } from "../actions/shortcuts";
import { isGridPanelOpenAtom } from "../components/GridPanel";
import { editorJotaiStore } from "../editor-jotai";
import { Excalidraw, MainMenu } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { act, fireEvent, render } from "./test-utils";

import type { AppState } from "../types";

const { h } = window;

const getGridPanel = () => document.querySelector(".GridPanel");

const getSlider = (testId: string) =>
  document.querySelector<HTMLInputElement>(`input[data-testid="${testId}"]`)!;

const getGridColorTrigger = () =>
  document.querySelector<HTMLElement>('[data-openpopup="gridColor"]')!;

const getExtraToolsTrigger = () =>
  document.querySelector<HTMLElement>(".App-toolbar__extra-tools-trigger")!;

const openExtraToolsMenu = () => {
  fireEvent.click(getExtraToolsTrigger());
  return document.querySelector<HTMLElement>(
    ".App-toolbar__extra-tools-dropdown",
  )!;
};

const pickGridFromExtraTools = () => {
  const menu = openExtraToolsMenu();
  fireEvent.click(queryByTestId(menu, "toolbar-grid")!);
};

const getSwitch = (name: string) =>
  document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;

const stubResizeObserver = () => {
  // radix popovers (e.g. the background color picker) need ResizeObserver
  (global as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
};

beforeEach(() => {
  // the editor jotai store is module-level, so reset the panel between tests
  editorJotaiStore.set(isGridPanelOpenAtom, false);
});

describe("grid panel", () => {
  describe("extra tools menu item", () => {
    beforeEach(async () => {
      await render(<Excalidraw handleKeyboardGlobally={true} />);
    });

    it("should be the first item in More tools, with a G shortcut", () => {
      const menu = openExtraToolsMenu();
      const items = menu.querySelectorAll(".dropdown-menu-item");
      const gridItem = queryByTestId(menu, "toolbar-grid")!;

      expect(items[0]).toBe(gridItem);
      expect(gridItem.textContent).toContain("Grid");
      expect(
        gridItem.querySelector(".dropdown-menu-item__shortcut")?.textContent,
      ).toBe("G");
    });

    it("should open the panel without turning the grid on", () => {
      expect(getGridPanel()).toBe(null);

      pickGridFromExtraTools();

      expect(getGridPanel()).not.toBe(null);
      expect(h.state.gridModeEnabled).toBe(false);
      expect(h.state.gridSnapEnabled).toBe(false);
    });

    it("should switch to the selection tool and clear the selection", () => {
      const rectangle = API.createElement({ type: "rectangle" });
      API.setElements([rectangle]);
      API.setSelectedElements([rectangle]);
      UI.clickTool("rectangle");
      expect(h.state.activeTool.type).toBe("rectangle");

      pickGridFromExtraTools();

      expect(h.state.activeTool.type).toBe("selection");
      expect(h.state.selectedElementIds).toEqual({});
      expect(getGridPanel()).not.toBe(null);
    });

    it("should highlight More tools while the panel is open", () => {
      expect(getExtraToolsTrigger()).not.toHaveClass(
        "App-toolbar__extra-tools-trigger--selected",
      );

      pickGridFromExtraTools();
      expect(getExtraToolsTrigger()).toHaveClass(
        "App-toolbar__extra-tools-trigger--selected",
      );

      Keyboard.keyPress(KEYS.ESCAPE);
      expect(getExtraToolsTrigger()).not.toHaveClass(
        "App-toolbar__extra-tools-trigger--selected",
      );
    });
  });

  describe("panel", () => {
    beforeEach(async () => {
      await render(<Excalidraw handleKeyboardGlobally={true} />);
      pickGridFromExtraTools();
    });

    it("should toggle grid visibility from the Show grid switch", () => {
      const showGrid = getSwitch("grid-panel-show-grid");
      expect(showGrid.checked).toBe(false);

      fireEvent.click(showGrid);
      expect(h.state.gridModeEnabled).toBe(true);
      expect(h.state.gridSnapEnabled).toBe(false);
      expect(getSwitch("grid-panel-show-grid").checked).toBe(true);

      fireEvent.click(getSwitch("grid-panel-show-grid"));
      expect(h.state.gridModeEnabled).toBe(false);
    });

    it("should toggle grid snapping from the Snap to grid switch", () => {
      const snapToGrid = getSwitch("grid-panel-snap-to-grid");
      expect(snapToGrid.checked).toBe(false);

      fireEvent.click(snapToGrid);
      expect(h.state.gridSnapEnabled).toBe(true);
      expect(h.state.gridModeEnabled).toBe(false);
      expect(getSwitch("grid-panel-snap-to-grid").checked).toBe(true);

      fireEvent.click(getSwitch("grid-panel-snap-to-grid"));
      expect(h.state.gridSnapEnabled).toBe(false);
    });

    it("should reflect grid state changed elsewhere", () => {
      API.setAppState({ gridModeEnabled: true, gridSnapEnabled: true });

      expect(getSwitch("grid-panel-show-grid").checked).toBe(true);
      expect(getSwitch("grid-panel-snap-to-grid").checked).toBe(true);
    });

    it("should show the Ctrl+' and Ctrl+; shortcuts next to the switches", () => {
      const showGridRow = getSwitch("grid-panel-show-grid").closest(
        ".GridPanel__toggle",
      )!;
      const snapRow = getSwitch("grid-panel-snap-to-grid").closest(
        ".GridPanel__toggle",
      )!;

      expect(
        showGridRow.querySelector(".GridPanel__shortcut")?.textContent,
      ).toBe(getShortcutFromShortcutName("gridMode"));
      expect(getShortcutFromShortcutName("gridSnapMode")).toContain(";");
      expect(snapRow.querySelector(".GridPanel__shortcut")?.textContent).toBe(
        getShortcutFromShortcutName("gridSnapMode"),
      );
    });

    it("should update the Snap to grid switch when using Ctrl+;", () => {
      Keyboard.withModifierKeys({ ctrl: true }, () => {
        Keyboard.codeDown(CODES.SEMICOLON);
      });

      expect(h.state.gridSnapEnabled).toBe(true);
      expect(h.state.gridModeEnabled).toBe(false);
      expect(getSwitch("grid-panel-snap-to-grid").checked).toBe(true);

      Keyboard.withModifierKeys({ ctrl: true }, () => {
        Keyboard.codeDown(CODES.SEMICOLON);
      });
      expect(h.state.gridSnapEnabled).toBe(false);
    });

    it("should update the Show grid switch when using Ctrl+'", () => {
      Keyboard.withModifierKeys({ ctrl: true }, () => {
        Keyboard.codeDown(CODES.QUOTE);
      });

      expect(h.state.gridModeEnabled).toBe(true);
      expect(getSwitch("grid-panel-show-grid").checked).toBe(true);
      expect(getGridPanel()).not.toBe(null);
    });

    it("should stay open after toggling a switch", () => {
      fireEvent.click(getSwitch("grid-panel-show-grid"));
      fireEvent.click(getSwitch("grid-panel-snap-to-grid"));
      expect(getGridPanel()).not.toBe(null);
    });

    it("should close on Escape", () => {
      Keyboard.keyPress(KEYS.ESCAPE);
      expect(getGridPanel()).toBe(null);
    });

    it("should close when switching to another tool", () => {
      UI.clickTool("rectangle");
      expect(getGridPanel()).toBe(null);

      // and stay closed when coming back to the selection tool
      UI.clickTool("selection");
      expect(getGridPanel()).toBe(null);
    });

    it("should close when an element gets selected", () => {
      const rectangle = API.createElement({ type: "rectangle" });
      API.setElements([rectangle]);
      act(() => {
        API.setSelectedElements([rectangle]);
      });
      expect(getGridPanel()).toBe(null);

      // and stay closed after deselecting
      API.setAppState({ selectedElementIds: {} });
      expect(getGridPanel()).toBe(null);
    });

    it("should be hidden in view mode", () => {
      API.setAppState({ viewModeEnabled: true });
      expect(getGridPanel()).toBe(null);
    });
  });

  describe("G shortcut", () => {
    beforeEach(async () => {
      stubResizeObserver();
      await render(<Excalidraw handleKeyboardGlobally={true} />);
    });

    it("should toggle the panel with the selection tool and nothing selected", () => {
      Keyboard.keyPress(KEYS.G);
      expect(getGridPanel()).not.toBe(null);
      expect(h.state.gridModeEnabled).toBe(false);

      Keyboard.keyPress(KEYS.G);
      expect(getGridPanel()).toBe(null);
    });

    it("should keep opening the background picker for fillable tools", () => {
      UI.clickTool("rectangle");

      Keyboard.keyPress(KEYS.G);

      expect(getGridPanel()).toBe(null);
      expect(h.state.openPopup).toBe("elementBackground");
      expect(h.state.activeTool.type).toBe("rectangle");
    });

    it("should keep opening the background picker for selected fillable elements", () => {
      const rectangle = API.createElement({ type: "rectangle" });
      API.setElements([rectangle]);
      act(() => {
        API.setSelectedElements([rectangle]);
      });

      Keyboard.keyPress(KEYS.G);

      expect(getGridPanel()).toBe(null);
      expect(h.state.openPopup).toBe("elementBackground");
      expect(h.state.selectedElementIds).toEqual({ [rectangle.id]: true });
    });

    it.each([
      ["Shift", { shift: true }],
      ["Alt", { alt: true }],
      ["Ctrl", { ctrl: true }],
      ["Ctrl+Shift", { ctrl: true, shift: true }],
    ])("should not open the panel with %s held", (_, modifiers) => {
      Keyboard.withModifierKeys(modifiers, () => {
        Keyboard.keyPress(KEYS.G);
      });
      expect(getGridPanel()).toBe(null);
    });

    it("should still group elements with Ctrl+G", () => {
      const rect1 = API.createElement({ type: "rectangle", x: 0 });
      const rect2 = API.createElement({ type: "rectangle", x: 100 });
      API.setElements([rect1, rect2]);
      act(() => {
        API.setSelectedElements([rect1, rect2]);
      });

      Keyboard.withModifierKeys({ ctrl: true }, () => {
        Keyboard.keyPress(KEYS.G);
      });

      expect(getGridPanel()).toBe(null);
      expect(h.elements[0].groupIds).toHaveLength(1);
      expect(h.elements[0].groupIds).toEqual(h.elements[1].groupIds);
    });

    it("should not open the panel in view mode", () => {
      API.setAppState({ viewModeEnabled: true });
      Keyboard.keyPress(KEYS.G);
      expect(getGridPanel()).toBe(null);
    });
  });

  describe("gridModeEnabled prop", () => {
    beforeEach(async () => {
      await render(
        <Excalidraw gridModeEnabled={true} handleKeyboardGlobally={true} />,
      );
    });

    it("should hide the Grid item in More tools", () => {
      const menu = openExtraToolsMenu();
      expect(queryByTestId(menu, "toolbar-grid")).toBe(null);
      // the rest of the menu still renders
      expect(queryByTestId(menu, "toolbar-frame")).not.toBe(null);
    });

    it("should ignore the G shortcut", () => {
      const gridModeEnabled = h.state.gridModeEnabled;
      Keyboard.keyPress(KEYS.G);
      expect(getGridPanel()).toBe(null);
      expect(h.state.gridModeEnabled).toBe(gridModeEnabled);
    });
  });

  describe("appearance settings", () => {
    beforeEach(async () => {
      stubResizeObserver();
      await render(<Excalidraw handleKeyboardGlobally={true} />);
      pickGridFromExtraTools();
    });

    describe("grid size", () => {
      it("should scale the grid from the slider and the presets", () => {
        expect(h.state.gridScale).toBe(DEFAULT_GRID_SCALE);

        fireEvent.change(getSlider("grid-scale"), { target: { value: "3" } });
        expect(h.state.gridScale).toBe(3);

        UI.clickOnTestId("grid-scale-0.5");
        expect(h.state.gridScale).toBe(0.5);
        expect(getSlider("grid-scale").value).toBe("0.5");

        // the base spacing is left alone, the scale multiplies it
        expect(h.state.gridSize).toBe(DEFAULT_GRID_SIZE);
      });

      it("should offer presets from 0.25× to 8×", () => {
        for (const preset of ["0.25", "0.5", "1", "2", "4", "8"]) {
          expect(queryByTestId(document.body, `grid-scale-${preset}`)).not.toBe(
            null,
          );
        }
      });

      it("should not select 0.25× when a slider drag is released on the label", () => {
        fireEvent.change(getSlider("grid-scale"), { target: { value: "3" } });

        // releasing a drag outside the input clicks the wrapping <label>,
        // which would otherwise activate its first control (the 0.25× preset)
        fireEvent.click(getSlider("grid-scale").closest("label")!);

        expect(h.state.gridScale).toBe(3);
      });

      it("should clamp and round values coming from the action", () => {
        act(() => {
          h.app.actionManager.executeAction(actionChangeGridScale, "api", 100);
        });
        expect(h.state.gridScale).toBe(MAX_GRID_SCALE);

        act(() => {
          h.app.actionManager.executeAction(actionChangeGridScale, "api", 0);
        });
        expect(h.state.gridScale).toBe(MIN_GRID_SCALE);

        act(() => {
          h.app.actionManager.executeAction(
            actionChangeGridScale,
            "api",
            1.234,
          );
        });
        expect(h.state.gridScale).toBe(1.23);
      });

      it("should not create undo steps", () => {
        API.setElements([]);
        UI.createElement("rectangle", { x: 300, y: 300, size: 50 });
        // drawing selects the element, which closes the panel
        API.setAppState({ selectedElementIds: {} });
        pickGridFromExtraTools();

        fireEvent.change(getSlider("grid-scale"), { target: { value: "2" } });
        Keyboard.undo();

        // the undo removed the rectangle, not the grid change
        expect(h.elements.every((element) => element.isDeleted)).toBe(true);
        expect(h.state.gridScale).toBe(2);
      });
    });

    describe("snap distance", () => {
      it("should follow the grid size while linked", () => {
        expect(getSwitch("grid-panel-link-snap").checked).toBe(true);
        // no separate snap slider while linked
        expect(queryByTestId(document.body, "grid-snap-scale")).toBe(null);

        API.setAppState({ gridSnapEnabled: true });
        fireEvent.change(getSlider("grid-scale"), { target: { value: "2" } });

        expect(h.app.getEffectiveGridSize()).toBe(DEFAULT_GRID_SIZE * 2);
      });

      it("should start from the current grid size when unlinking", () => {
        API.setAppState({ gridSnapEnabled: true });
        fireEvent.change(getSlider("grid-scale"), { target: { value: "2" } });

        fireEvent.click(getSwitch("grid-panel-link-snap"));

        expect(h.state.gridSnapLinked).toBe(false);
        expect(h.state.gridSnapScale).toBe(2);
        expect(getSlider("grid-snap-scale").value).toBe("2");
        // the snap distance didn't jump
        expect(h.app.getEffectiveGridSize()).toBe(DEFAULT_GRID_SIZE * 2);
      });

      it("should snap independently of the grid size once unlinked", () => {
        API.setAppState({ gridSnapEnabled: true });
        fireEvent.click(getSwitch("grid-panel-link-snap"));
        fireEvent.change(getSlider("grid-snap-scale"), {
          target: { value: "0.5" },
        });
        fireEvent.change(getSlider("grid-scale"), { target: { value: "4" } });

        expect(h.state.gridScale).toBe(4);
        expect(h.state.gridSnapScale).toBe(0.5);
        expect(h.app.getEffectiveGridSize()).toBe(DEFAULT_GRID_SIZE / 2);

        // re-linking follows the grid size again
        fireEvent.click(getSwitch("grid-panel-link-snap"));
        expect(queryByTestId(document.body, "grid-snap-scale")).toBe(null);
        expect(h.app.getEffectiveGridSize()).toBe(DEFAULT_GRID_SIZE * 4);
      });

      it.each([
        // [description, setup, expected x, expected width]
        ["the base grid", () => {}, 20, 40],
        [
          "a 2× grid while linked",
          () => {
            fireEvent.change(getSlider("grid-scale"), {
              target: { value: "2" },
            });
          },
          0,
          80,
        ],
        [
          "a 0.5× snap distance while unlinked",
          () => {
            fireEvent.change(getSlider("grid-scale"), {
              target: { value: "2" },
            });
            fireEvent.click(getSwitch("grid-panel-link-snap"));
            fireEvent.change(getSlider("grid-snap-scale"), {
              target: { value: "0.5" },
            });
          },
          10,
          50,
        ],
      ])(
        "should snap drawn elements to %s",
        (_, setup, expectedX, expectedWidth) => {
          API.setAppState({ gridSnapEnabled: true });
          setup();

          // from (13, 13) to (63, 63)
          const rectangle = UI.createElement("rectangle", {
            x: 13,
            y: 13,
            size: 50,
          });

          expect(rectangle.x).toBe(expectedX);
          expect(rectangle.width).toBe(expectedWidth);
        },
      );
    });

    describe("color", () => {
      it("should change the grid color from the picker", () => {
        fireEvent.click(getGridColorTrigger());
        expect(h.state.openPopup).toBe("gridColor");

        const red = COLOR_PALETTE.red[1];
        fireEvent.click(queryByTestId(document.body, `color-top-pick-${red}`)!);

        expect(h.state.gridColor).toBe(red);
        expect(getGridPanel()).not.toBe(null);
      });

      it("should list the drawing's stroke colors as custom colors", () => {
        API.setElements([
          API.createElement({
            type: "rectangle",
            strokeColor: "#123456",
            backgroundColor: "#654321",
          }),
        ]);

        fireEvent.click(getGridColorTrigger());
        const popup = document.querySelector(".color-picker-content")!;

        // grid lines are strokes, so background colors aren't offered
        const strokeSwatch = popup.querySelector<HTMLElement>(
          'button[title="#123456"]',
        );
        expect(strokeSwatch).not.toBe(null);
        expect(popup.querySelector('button[title="#654321"]')).toBe(null);

        fireEvent.click(strokeSwatch!);
        expect(h.state.gridColor).toBe("#123456");
      });

      it("should only change the grid color and popup state", () => {
        const before = h.state;
        act(() => {
          h.app.actionManager.executeAction(actionChangeGridColor, "api", {
            gridColor: "#e03131",
            // anything else the picker might pass is ignored
            currentItemStrokeColor: "#000000",
          } as any);
        });

        expect(h.state.gridColor).toBe("#e03131");
        expect(h.state.currentItemStrokeColor).toBe(
          before.currentItemStrokeColor,
        );
      });
    });

    describe("opacity", () => {
      it("should hide the grid at 0% and show it again when raised", () => {
        fireEvent.click(getSwitch("grid-panel-show-grid"));
        expect(h.state.gridModeEnabled).toBe(true);

        fireEvent.change(getSlider("grid-opacity"), { target: { value: "0" } });
        expect(h.state.gridOpacity).toBe(0);
        expect(h.state.gridModeEnabled).toBe(false);
        expect(getSwitch("grid-panel-show-grid").checked).toBe(false);

        fireEvent.change(getSlider("grid-opacity"), {
          target: { value: "40" },
        });
        expect(h.state.gridOpacity).toBe(40);
        expect(h.state.gridModeEnabled).toBe(true);
        expect(getSwitch("grid-panel-show-grid").checked).toBe(true);
      });

      it("should not turn the grid on when changing a non-zero opacity", () => {
        expect(h.state.gridModeEnabled).toBe(false);

        fireEvent.change(getSlider("grid-opacity"), {
          target: { value: "40" },
        });

        expect(h.state.gridOpacity).toBe(40);
        expect(h.state.gridModeEnabled).toBe(false);
      });

      it("should restore 100% when turning the grid on from 0%", () => {
        fireEvent.click(getSwitch("grid-panel-show-grid"));
        fireEvent.change(getSlider("grid-opacity"), { target: { value: "0" } });

        fireEvent.click(getSwitch("grid-panel-show-grid"));

        expect(h.state.gridModeEnabled).toBe(true);
        expect(h.state.gridOpacity).toBe(DEFAULT_GRID_OPACITY);
      });

      it("should keep the opacity when turning the grid off and on", () => {
        fireEvent.click(getSwitch("grid-panel-show-grid"));
        fireEvent.change(getSlider("grid-opacity"), {
          target: { value: "60" },
        });

        fireEvent.click(getSwitch("grid-panel-show-grid"));
        expect(h.state.gridModeEnabled).toBe(false);
        expect(h.state.gridOpacity).toBe(60);

        fireEvent.click(getSwitch("grid-panel-show-grid"));
        expect(h.state.gridOpacity).toBe(60);
      });
    });

    describe("layer", () => {
      it("should switch between behind and above elements", () => {
        expect(h.state.gridLayer).toBe("below");

        UI.clickOnTestId("grid-layer-above");
        expect(h.state.gridLayer).toBe("above");

        UI.clickOnTestId("grid-layer-below");
        expect(h.state.gridLayer).toBe("below");
      });
    });
  });

  describe("rendering", () => {
    const getStaticContext = () =>
      document
        .querySelector<HTMLCanvasElement>("canvas.static")!
        .getContext("2d") as CanvasRenderingContext2D & {
        __getEvents: () => { type: string; props: any }[];
        __clearEvents: () => void;
      };

    /** draw calls made by the static canvas while applying `appState` */
    const renderWith = <K extends keyof AppState>(
      appState: Pick<AppState, K>,
    ) => {
      const context = getStaticContext();
      context.__clearEvents();
      act(() => {
        API.setAppState(appState);
      });
      return context.__getEvents();
    };

    const getStrokeStyles = (events: { type: string; props: any }[]) =>
      new Set(
        events
          .filter((event) => event.type === "strokeStyle")
          .map((event) => event.props.value),
      );

    /** canvas mock normalizes colors, so compare against what it stores */
    const normalizeColor = (color: string) => {
      const context = document.createElement("canvas").getContext("2d")!;
      context.strokeStyle = color;
      return context.strokeStyle;
    };

    beforeEach(async () => {
      await render(<Excalidraw handleKeyboardGlobally={true} />);
      // jsdom has no layout, so give the canvas a viewport to draw into
      API.setAppState({ width: 200, height: 200, gridModeEnabled: true });
      API.setElements([
        API.createElement({
          type: "rectangle",
          x: 40,
          y: 40,
          width: 60,
          height: 60,
        }),
      ]);
    });

    it("should space grid lines by the base size times the grid scale", () => {
      const getVerticalLineGaps = (events: { type: string; props: any }[]) => {
        const xs = events
          .filter(
            (event, index) =>
              event.type === "moveTo" &&
              events[index + 1]?.type === "lineTo" &&
              events[index + 1].props.x === event.props.x,
          )
          .map((event) => event.props.x);
        return new Set(xs.slice(1).map((x, index) => x - xs[index]));
      };

      expect(getVerticalLineGaps(renderWith({ gridScale: 2 }))).toEqual(
        new Set([DEFAULT_GRID_SIZE * 2]),
      );
      expect(getVerticalLineGaps(renderWith({ gridScale: 1 }))).toEqual(
        new Set([DEFAULT_GRID_SIZE]),
      );
    });

    // each of these changes only one setting, so they also check that
    // StaticCanvas redraws when that setting changes
    it("should redraw with the grid opacity", () => {
      const events = renderWith({ gridOpacity: 40 });

      expect(
        events.some(
          (event) => event.type === "globalAlpha" && event.props.value === 0.4,
        ),
      ).toBe(true);
    });

    it("should keep the two-tone lines for the default color", () => {
      const events = renderWith({ gridOpacity: 50 });

      expect(getStrokeStyles(events)).toEqual(
        new Set([normalizeColor("#dddddd"), normalizeColor("#e5e5e5")]),
      );
    });

    it("should draw all lines in a custom color, filtered in dark mode", () => {
      expect(getStrokeStyles(renderWith({ gridColor: "#e03131" }))).toEqual(
        new Set([normalizeColor("#e03131")]),
      );

      expect(getStrokeStyles(renderWith({ theme: THEME.DARK }))).toEqual(
        new Set([normalizeColor(applyDarkModeFilter("#e03131"))]),
      );
    });

    it("should draw the grid behind or above the elements", () => {
      const getOrder = (events: { type: string }[]) => {
        const elementIndex = events.findIndex(
          (event) => event.type === "drawImage",
        );
        const gridIndex = events.findIndex((event) => event.type === "stroke");
        expect(elementIndex).not.toBe(-1);
        expect(gridIndex).not.toBe(-1);
        return gridIndex < elementIndex ? "below" : "above";
      };

      expect(getOrder(renderWith({ gridLayer: "above" }))).toBe("above");
      expect(getOrder(renderWith({ gridLayer: "below" }))).toBe("below");
    });

    it("should not draw the grid while it is off", () => {
      const events = renderWith({ gridModeEnabled: false, gridOpacity: 50 });
      expect(events.some((event) => event.type === "stroke")).toBe(false);
    });
  });

  describe("clicking the grid", () => {
    const mouse = new Pointer("mouse");

    beforeEach(async () => {
      await render(<Excalidraw handleKeyboardGlobally={true} />);
      API.setAppState({ gridModeEnabled: true, gridLayer: "above" });
    });

    it("should select nothing when clicking on grid lines", () => {
      const rectangle = API.createElement({
        type: "rectangle",
        x: 300,
        y: 300,
        width: 60,
        height: 60,
      });
      API.setElements([rectangle]);

      // (100, 100) is where two grid lines cross, away from the rectangle
      mouse.reset();
      mouse.clickAt(100, 100);

      expect(h.state.selectedElementIds).toEqual({});
      expect(h.elements).toEqual([rectangle]);
    });

    it("should select the element under a grid line drawn above it", () => {
      const rectangle = API.createElement({
        type: "rectangle",
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        backgroundColor: "#ffc9c9",
        fillStyle: "solid",
      });
      API.setElements([rectangle]);

      // (140, 140) is a grid line crossing inside the rectangle
      mouse.reset();
      mouse.clickAt(140, 140);

      expect(h.state.selectedElementIds).toEqual({ [rectangle.id]: true });
    });
  });
});

describe("Preferences menu", () => {
  const openPreferences = (container: HTMLElement) => {
    fireEvent.click(container.querySelector(".dropdown-menu-button")!);
    const trigger = queryByText(
      document.querySelector(".dropdown-menu") as HTMLElement,
      "Preferences",
    )!.closest("[role='menuitem']")!;
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    return document.querySelector<HTMLElement>(
      ".excalidraw-main-menu-preferences-submenu",
    )!;
  };

  it("should no longer list the grid toggles by default", async () => {
    const { container } = await render(
      <Excalidraw>
        <MainMenu>
          <MainMenu.DefaultItems.Preferences />
        </MainMenu>
      </Excalidraw>,
    );
    const submenu = openPreferences(container);

    expect(submenu).not.toBe(null);
    // sanity check that the submenu contents rendered
    expect(queryByText(submenu, "Zen mode")).not.toBe(null);
    expect(queryByText(submenu, "Toggle grid")).toBe(null);
    expect(queryByText(submenu, "Snap to grid")).toBe(null);
  });
});
