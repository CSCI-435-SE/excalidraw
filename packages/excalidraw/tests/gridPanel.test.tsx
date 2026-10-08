import { queryByTestId, queryByText } from "@testing-library/react";

import { CODES, KEYS } from "@excalidraw/common";

import { getShortcutFromShortcutName } from "../actions/shortcuts";
import { isGridPanelOpenAtom } from "../components/GridPanel";
import { editorJotaiStore } from "../editor-jotai";
import { Excalidraw, MainMenu } from "../index";

import { API } from "./helpers/api";
import { Keyboard, UI } from "./helpers/ui";
import { act, fireEvent, render } from "./test-utils";

const { h } = window;

const getGridPanel = () => document.querySelector(".GridPanel");

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

    it("should show the Ctrl+' shortcut next to Show grid", () => {
      const showGridRow = getSwitch("grid-panel-show-grid").closest(
        ".GridPanel__toggle",
      )!;
      const snapRow = getSwitch("grid-panel-snap-to-grid").closest(
        ".GridPanel__toggle",
      )!;

      expect(
        showGridRow.querySelector(".GridPanel__shortcut")?.textContent,
      ).toBe(getShortcutFromShortcutName("gridMode"));
      expect(snapRow.querySelector(".GridPanel__shortcut")).toBe(null);
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
