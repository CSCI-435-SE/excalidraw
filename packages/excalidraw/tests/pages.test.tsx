import React from "react";
import {
  act,
  configure,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";

import {
  CANVAS_SEARCH_TAB,
  DEFAULT_SIDEBAR,
  KEYS,
  LIBRARY_SIDEBAR_TAB,
} from "@excalidraw/common";

import { CaptureUpdateAction } from "@excalidraw/element";

import "@excalidraw/utils/test-utils";

import {
  cleanAppStateForExport,
  clearAppStateForDatabase,
  clearAppStateForLocalStorage,
  getDefaultAppState,
} from "../appState";
import { activeConfirmDialogAtom } from "../components/ActiveConfirmDialog";
import { PAGES_SIDEBAR_TAB } from "../components/DefaultSidebar";
import { editorJotaiStore } from "../editor-jotai";
import { DefaultSidebar, Excalidraw, Sidebar } from "../index";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { render, unmountComponent } from "./test-utils";

import type { DrawingPage } from "../pages";

const { h } = window;

configure({ asyncUtilTimeout: 5000 });

// page state and actions are private on App; the UI for deletion comes later
type PageInternals = {
  pages: readonly DrawingPage[];
  activePageId: string;
  createPage: () => void;
  deletePages: (pageIds: readonly string[]) => void;
};
const pageInternals = () => h.app as unknown as PageInternals;
const liveIds = () =>
  window.h.elements
    .filter((element) => !element.isDeleted)
    .map((element) => element.id);

const getConfirmDialog = () =>
  within(document.querySelector<HTMLElement>(".confirm-dialog")!);

describe("pages", () => {
  beforeEach(() => {
    unmountComponent();
    localStorage.clear();
    // the confirm dialog atom lives in a store shared by all editors,
    // so a dialog left open by one test would leak into the next one
    editorJotaiStore.set(activeConfirmDialogAtom, null);
  });

  it("creates pages and restores their elements, settings, and viewport", async () => {
    const { getByRole, container } = await render(
      <Excalidraw initialData={{ elements: [] }}>
        <DefaultSidebar>
          <DefaultSidebar.TabTriggers>
            <Sidebar.TabTrigger tab="custom">Custom</Sidebar.TabTrigger>
          </DefaultSidebar.TabTriggers>
          <Sidebar.Tab tab="custom">Custom sidebar content</Sidebar.Tab>
        </DefaultSidebar>
      </Excalidraw>,
    );
    const element = API.createElement({ type: "rectangle", id: "page-one" });

    API.updateScene({ elements: [element] });
    API.setAppState({
      viewBackgroundColor: "#123456",
      scrollX: 23,
      scrollY: -11,
    });

    fireEvent.click(getByRole("button", { name: "Pages" }));
    expect(getByRole("button", { name: "Page 1" })).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Add page" }));

    await waitFor(() => {
      expect(h.elements).toHaveLength(0);
    });
    expect(h.state.viewBackgroundColor).not.toBe("#123456");
    expect(h.state.scrollX).toBe(0);
    expect(h.state.scrollY).toBe(0);
    API.updateScene({
      elements: [API.createElement({ type: "ellipse", id: "page-two" })],
    });

    fireEvent.click(getByRole("button", { name: "Page 1" }));
    await waitFor(() => {
      expect(h.elements).toHaveLength(1);
    });
    expect(h.elements[0].id).toBe("page-one");
    expect(h.state.viewBackgroundColor).toBe("#123456");
    expect(h.state.scrollX).toBe(23);
    expect(h.state.scrollY).toBe(-11);
    await waitFor(
      () => {
        expect(
          container.querySelector("img.page-navigation__preview"),
        ).not.toBeNull();
      },
      { timeout: 5000 },
    );

    fireEvent.click(getByRole("button", { name: "Page 2" }));
    await waitFor(() => {
      expect(h.elements).toHaveLength(1);
    });
    expect(h.elements[0].id).toBe("page-two");
  });

  /** renders an editor whose pages contain the elements with the given ids
   * (one element per page); the last page is left active */
  const renderWithPages = async (ids: string[]) => {
    const result = await render(
      <Excalidraw initialData={{ elements: [] }} handleKeyboardGlobally />,
    );
    const { getByRole } = result;

    API.updateScene({
      elements: [API.createElement({ type: "rectangle", id: ids[0] })],
    });
    fireEvent.click(getByRole("button", { name: "Pages" }));

    for (const id of ids.slice(1)) {
      fireEvent.click(getByRole("button", { name: "Add page" }));
      await waitFor(() => expect(window.h.elements).toHaveLength(0));
      API.updateScene({
        elements: [API.createElement({ type: "ellipse", id })],
      });
    }
    return result;
  };

  describe("clearing mode", () => {
    const renderWithThreePages = () =>
      renderWithPages(["page-one", "page-two", "page-three"]);

    it("only shows clearing options while in clearing mode", async () => {
      const { getByRole, queryByRole } = await renderWithThreePages();

      expect(queryByRole("button", { name: "Clear" })).toBeNull();
      expect(queryByRole("button", { name: "Exit clearing mode" })).toBeNull();

      fireEvent.click(getByRole("button", { name: "Enter clearing mode" }));

      expect(window.h.state.pageClearingSelection).toEqual([]);
      expect(getByRole("button", { name: "Clear" })).toBeTruthy();
      expect(getByRole("button", { name: "Select all pages" })).toBeTruthy();
      expect(queryByRole("button", { name: "Enter clearing mode" })).toBeNull();
      expect(queryByRole("button", { name: "Add page" })).toBeNull();
      // the page the user is on is indicated
      expect(
        getByRole("checkbox", { name: "Page 3" }).getAttribute("aria-current"),
      ).toBe("page");
      expect(
        getByRole("checkbox", { name: "Page 1" }).getAttribute("aria-current"),
      ).toBeNull();
      // nothing selected yet → nothing to clear
      expect(
        (getByRole("button", { name: "Clear" }) as HTMLButtonElement).disabled,
      ).toBe(true);

      // closing the sidebar does not exit clearing mode
      API.setAppState({ openSidebar: null });
      expect(window.h.state.pageClearingSelection).toEqual([]);
      fireEvent.click(getByRole("button", { name: "Pages" }));
      expect(getByRole("button", { name: "Exit clearing mode" })).toBeTruthy();

      fireEvent.click(getByRole("button", { name: "Exit clearing mode" }));

      expect(window.h.state.pageClearingSelection).toBeNull();
      expect(queryByRole("button", { name: "Clear" })).toBeNull();
      expect(queryByRole("checkbox", { name: "Page 1" })).toBeNull();
      expect(getByRole("button", { name: "Enter clearing mode" })).toBeTruthy();
    });

    it("docks the pages sidebar while in clearing mode", async () => {
      const { getByRole, container } = await renderWithThreePages();
      API.setAppState({ defaultSidebarDockedPreference: false });

      fireEvent.click(getByRole("button", { name: "Enter clearing mode" }));

      await waitFor(() => {
        expect(
          container.querySelector(".default-sidebar.sidebar--docked"),
        ).not.toBeNull();
      });
    });

    it("selects pages, confirms, and clears only the selected pages", async () => {
      const { getByRole } = await renderWithThreePages();

      fireEvent.click(getByRole("button", { name: "Enter clearing mode" }));
      // selecting a page does not navigate away from the current page
      fireEvent.click(getByRole("checkbox", { name: "Page 1" }));
      expect(liveIds()).toEqual(["page-three"]);
      expect(
        getByRole("checkbox", { name: "Page 1" }).getAttribute("aria-checked"),
      ).toBe("true");
      expect(
        getByRole("checkbox", { name: "Page 2" }).getAttribute("aria-checked"),
      ).toBe("false");

      // toggling a page twice leaves it unselected
      fireEvent.click(getByRole("checkbox", { name: "Page 2" }));
      fireEvent.click(getByRole("checkbox", { name: "Page 2" }));
      expect(window.h.state.pageClearingSelection).toHaveLength(1);

      // cancelling the confirmation clears nothing
      fireEvent.click(getByRole("button", { name: "Clear" }));
      fireEvent.click(
        getConfirmDialog().getByRole("button", { name: "Cancel" }),
      );
      expect(document.querySelector(".confirm-dialog")).toBeNull();
      expect(window.h.state.pageClearingSelection).toHaveLength(1);

      // confirming clears the selected page
      fireEvent.click(getByRole("button", { name: "Clear" }));
      fireEvent.click(
        getConfirmDialog().getByRole("button", { name: "Clear" }),
      );

      // still in clearing mode, with the selection reset
      expect(window.h.state.pageClearingSelection).toEqual([]);
      expect(liveIds()).toEqual(["page-three"]);

      fireEvent.click(getByRole("button", { name: "Exit clearing mode" }));
      fireEvent.click(getByRole("button", { name: "Page 1" }));
      await waitFor(() => expect(liveIds()).toEqual([]));
      fireEvent.click(getByRole("button", { name: "Page 2" }));
      await waitFor(() => expect(liveIds()).toEqual(["page-two"]));
      // cleared pages are kept
      expect(getByRole("button", { name: "Page 3" })).toBeTruthy();
    });

    it("selects all pages and clears them, including the current one", async () => {
      const { getByRole } = await renderWithThreePages();

      fireEvent.click(getByRole("button", { name: "Enter clearing mode" }));
      fireEvent.click(getByRole("button", { name: "Select all pages" }));
      for (const name of ["Page 1", "Page 2", "Page 3"]) {
        expect(
          getByRole("checkbox", { name }).getAttribute("aria-checked"),
        ).toBe("true");
      }

      fireEvent.click(getByRole("button", { name: "Deselect all pages" }));
      expect(window.h.state.pageClearingSelection).toEqual([]);
      fireEvent.click(getByRole("button", { name: "Select all pages" }));

      fireEvent.click(getByRole("button", { name: "Clear" }));
      fireEvent.click(
        getConfirmDialog().getByRole("button", { name: "Clear" }),
      );

      expect(liveIds()).toEqual([]);
      fireEvent.click(getByRole("button", { name: "Exit clearing mode" }));
      for (const name of ["Page 1", "Page 2"]) {
        fireEvent.click(getByRole("button", { name }));
        await waitFor(() => expect(liveIds()).toEqual([]));
      }
    });

    it("is scoped to a single drawing", async () => {
      const { container } = await render(
        <>
          <div data-testid="first">
            <Excalidraw initialData={{ elements: [] }} />
          </div>
          <div data-testid="second">
            <Excalidraw initialData={{ elements: [] }} />
          </div>
        </>,
      );
      const first = within(
        container.querySelector<HTMLElement>('[data-testid="first"]')!,
      );
      const second = within(
        container.querySelector<HTMLElement>('[data-testid="second"]')!,
      );

      fireEvent.click(first.getByRole("button", { name: "Pages" }));
      fireEvent.click(second.getByRole("button", { name: "Pages" }));

      // entering in one drawing does not enter in the other
      fireEvent.click(
        first.getByRole("button", { name: "Enter clearing mode" }),
      );
      expect(
        first.getByRole("button", { name: "Exit clearing mode" }),
      ).toBeTruthy();
      expect(
        second.queryByRole("button", { name: "Exit clearing mode" }),
      ).toBeNull();

      // exiting in one drawing does not exit in the other
      fireEvent.click(
        second.getByRole("button", { name: "Enter clearing mode" }),
      );
      fireEvent.click(
        first.getByRole("button", { name: "Exit clearing mode" }),
      );
      expect(
        first.queryByRole("button", { name: "Exit clearing mode" }),
      ).toBeNull();
      expect(
        second.getByRole("button", { name: "Exit clearing mode" }),
      ).toBeTruthy();
    });
  });

  describe("clear canvas", () => {
    const openClearCanvasDialog = () => {
      Keyboard.withModifierKeys({ ctrl: true }, () => {
        Keyboard.keyDown(KEYS.DELETE);
      });
      return getConfirmDialog();
    };

    it("can clear only the current page", async () => {
      const { getByRole } = await renderWithPages(["page-one", "page-two"]);

      fireEvent.click(
        openClearCanvasDialog().getByRole("button", {
          name: "Clear this canvas only",
        }),
      );

      await waitFor(() => expect(liveIds()).toEqual([]));
      fireEvent.click(getByRole("button", { name: "Pages" }));
      fireEvent.click(getByRole("button", { name: "Page 1" }));
      await waitFor(() => expect(liveIds()).toEqual(["page-one"]));
    });

    it("can clear the current page and all other pages", async () => {
      const { getByRole } = await renderWithPages(["page-one", "page-two"]);

      fireEvent.click(
        openClearCanvasDialog().getByRole("button", {
          name: "Clear canvas and all pages",
        }),
      );

      await waitFor(() => expect(liveIds()).toEqual([]));
      fireEvent.click(getByRole("button", { name: "Pages" }));
      // pages are kept, but empty
      expect(getByRole("button", { name: "Page 2" })).toBeTruthy();
      fireEvent.click(getByRole("button", { name: "Page 1" }));
      await waitFor(() => expect(window.h.elements).toHaveLength(0));
    });

    it("keeps the single confirm option when there is only one page", async () => {
      await render(
        <Excalidraw
          initialData={{
            elements: [API.createElement({ type: "rectangle" })],
          }}
          handleKeyboardGlobally
        />,
      );

      const dialog = openClearCanvasDialog();
      expect(
        dialog.queryByRole("button", { name: "Clear this canvas only" }),
      ).toBeNull();
      expect(dialog.getByRole("button", { name: "Confirm" })).toBeTruthy();
    });
  });

  describe("clearing mode details", () => {
    const renderWithThreePages = () =>
      renderWithPages(["page-one", "page-two", "page-three"]);

    it("indicates the current page and the selected pages only while clearing", async () => {
      const { getByRole, queryByText, container } =
        await renderWithThreePages();

      expect(queryByText("Clearing mode: select pages to clear")).toBeNull();
      expect(container.querySelector(".page-navigation__checkbox")).toBeNull();
      expect(queryByText("Current")).toBeNull();

      fireEvent.click(getByRole("button", { name: "Enter clearing mode" }));

      expect(
        queryByText("Clearing mode: select pages to clear"),
      ).not.toBeNull();
      // entering clearing mode doesn't ask for confirmation by itself
      expect(document.querySelector(".confirm-dialog")).toBeNull();

      const page1 = getByRole("checkbox", { name: "Page 1" });
      const page2 = getByRole("checkbox", { name: "Page 2" });
      const page3 = getByRole("checkbox", { name: "Page 3" });

      // only the current page is marked as current
      expect(within(page3).getByText("Current")).toBeTruthy();
      expect(within(page1).queryByText("Current")).toBeNull();
      expect(page3.classList).toContain("page-navigation__item--current");
      expect(page1.classList).not.toContain("page-navigation__item--current");

      fireEvent.click(page1);

      const checkbox1 = page1.querySelector(".page-navigation__checkbox")!;
      const checkbox2 = page2.querySelector(".page-navigation__checkbox")!;
      expect(checkbox1.classList).toContain(
        "page-navigation__checkbox--checked",
      );
      expect(checkbox1.textContent).toBe("✓");
      expect(checkbox2.classList).not.toContain(
        "page-navigation__checkbox--checked",
      );
      expect(checkbox2.textContent).toBe("");
      expect(page1.classList).toContain("page-navigation__item--selected");
      expect(page2.classList).not.toContain("page-navigation__item--selected");
    });

    it("shows how many pages will be cleared and closes after confirming", async () => {
      const { getByRole } = await renderWithThreePages();

      fireEvent.click(getByRole("button", { name: "Enter clearing mode" }));
      fireEvent.click(getByRole("checkbox", { name: "Page 1" }));
      fireEvent.click(getByRole("checkbox", { name: "Page 2" }));
      fireEvent.click(getByRole("button", { name: "Clear" }));

      expect(document.querySelector(".confirm-dialog")!.textContent).toContain(
        "remove all elements from 2 selected page(s)",
      );

      API.setAppState({ openMenu: "canvas" });
      fireEvent.click(
        getConfirmDialog().getByRole("button", { name: "Clear" }),
      );

      expect(document.querySelector(".confirm-dialog")).toBeNull();
      expect(window.h.state.openMenu).toBeNull();
    });

    it("drops a pending confirmation when clearing mode is closed", async () => {
      const { getByRole } = await renderWithThreePages();

      fireEvent.click(getByRole("button", { name: "Enter clearing mode" }));
      fireEvent.click(getByRole("checkbox", { name: "Page 1" }));
      fireEvent.click(getByRole("button", { name: "Clear" }));
      expect(document.querySelector(".confirm-dialog")).not.toBeNull();

      API.setAppState({ pageClearingSelection: null });
      await waitFor(() =>
        expect(document.querySelector(".confirm-dialog")).toBeNull(),
      );

      fireEvent.click(getByRole("button", { name: "Enter clearing mode" }));
      expect(document.querySelector(".confirm-dialog")).toBeNull();
    });

    it("clears only the current page when it is the only one selected", async () => {
      const { getByRole } = await renderWithThreePages();
      API.setAppState({ selectedElementIds: { "page-three": true } });

      fireEvent.click(getByRole("button", { name: "Enter clearing mode" }));
      fireEvent.click(getByRole("checkbox", { name: "Page 3" }));
      fireEvent.click(getByRole("button", { name: "Clear" }));
      fireEvent.click(
        getConfirmDialog().getByRole("button", { name: "Clear" }),
      );

      expect(liveIds()).toEqual([]);
      // the cleared elements don't stay selected
      expect(window.h.state.selectedElementIds).toEqual({});

      fireEvent.click(getByRole("button", { name: "Exit clearing mode" }));
      fireEvent.click(getByRole("button", { name: "Page 1" }));
      await waitFor(() => expect(liveIds()).toEqual(["page-one"]));
      fireEvent.click(getByRole("button", { name: "Page 2" }));
      await waitFor(() => expect(liveIds()).toEqual(["page-two"]));
    });

    it("refreshes the previews of cleared pages that aren't open", async () => {
      const { getByRole } = await renderWithThreePages();
      const page1Preview = () =>
        getByRole("button", { name: "Page 1" }).querySelector(
          "img.page-navigation__preview",
        );

      await waitFor(() => expect(page1Preview()).not.toBeNull(), {
        timeout: 5000,
      });

      act(() => {
        window.h.app.clearPages([window.h.app.getPageIds()[0]]);
      });

      await waitFor(() => expect(page1Preview()).toBeNull());
      expect(liveIds()).toEqual(["page-three"]);
    });

    it("never stores clearing mode with the drawing", () => {
      const appState = {
        ...getDefaultAppState(),
        pageClearingSelection: ["page-one"],
      };

      expect(clearAppStateForLocalStorage(appState)).not.toHaveProperty(
        "pageClearingSelection",
      );
      expect(cleanAppStateForExport(appState)).not.toHaveProperty(
        "pageClearingSelection",
      );
      expect(clearAppStateForDatabase(appState)).not.toHaveProperty(
        "pageClearingSelection",
      );
    });
  });

  describe("sidebar docking", () => {
    const isDocked = (container: HTMLElement) =>
      container
        .querySelector(".default-sidebar")!
        .classList.contains("sidebar--docked");

    const renderUndocked = async () => {
      const result = await render(
        <Excalidraw initialData={{ elements: [] }} />,
      );
      API.setAppState({ defaultSidebarDockedPreference: false });
      return result;
    };

    it("doesn't dock the pages sidebar outside clearing mode", async () => {
      const { container } = await renderUndocked();

      API.setAppState({
        openSidebar: { name: DEFAULT_SIDEBAR.name, tab: PAGES_SIDEBAR_TAB },
      });

      await waitFor(() =>
        expect(container.querySelector(".default-sidebar")).not.toBeNull(),
      );
      expect(isDocked(container)).toBe(false);
    });

    it("doesn't dock other sidebar tabs during clearing mode", async () => {
      const { container } = await renderUndocked();

      API.setAppState({
        pageClearingSelection: [],
        openSidebar: { name: DEFAULT_SIDEBAR.name, tab: LIBRARY_SIDEBAR_TAB },
      });

      await waitFor(() =>
        expect(container.querySelector(".default-sidebar")).not.toBeNull(),
      );
      expect(isDocked(container)).toBe(false);
    });

    it("still docks the search sidebar", async () => {
      const { container } = await renderUndocked();

      API.setAppState({
        openSidebar: { name: DEFAULT_SIDEBAR.name, tab: CANVAS_SEARCH_TAB },
      });

      await waitFor(() => expect(isDocked(container)).toBe(true));
    });
  });

  describe("clear canvas dialog", () => {
    const openClearCanvasDialog = () => {
      Keyboard.withModifierKeys({ ctrl: true }, () => {
        Keyboard.keyDown(KEYS.DELETE);
      });
      return getConfirmDialog();
    };

    it("closes after clearing only the current page", async () => {
      await renderWithPages(["page-one", "page-two"]);

      fireEvent.click(
        openClearCanvasDialog().getByRole("button", {
          name: "Clear this canvas only",
        }),
      );

      expect(document.querySelector(".confirm-dialog")).toBeNull();
    });

    it("clears the current page and all other pages in one undo step", async () => {
      await renderWithPages(["page-one", "page-two"]);
      // add an element in its own history step, so undo can bring it back
      API.updateScene({
        elements: [
          ...window.h.elements,
          API.createElement({ type: "rectangle", id: "page-two-extra" }),
        ],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });

      fireEvent.click(
        openClearCanvasDialog().getByRole("button", {
          name: "Clear canvas and all pages",
        }),
      );

      expect(document.querySelector(".confirm-dialog")).toBeNull();
      await waitFor(() => expect(liveIds()).toEqual([]));

      // a single undo reverts the whole clear of the current page
      // (`page-two` itself was added outside history, so undo can't restore it)
      Keyboard.undo();
      await waitFor(() => expect(liveIds()).toEqual(["page-two-extra"]));
    });

    it("keeps everything when cancelled", async () => {
      await renderWithPages(["page-one", "page-two"]);

      fireEvent.click(
        openClearCanvasDialog().getByRole("button", { name: "Cancel" }),
      );

      expect(document.querySelector(".confirm-dialog")).toBeNull();
      expect(liveIds()).toEqual(["page-two"]);
    });
  });
});

describe("page deletion", () => {
  let firstPageId: string;
  let secondPageId: string;

  // page 1 holds "one" with a custom background, page 2 (active) holds "two"
  beforeEach(async () => {
    unmountComponent();
    localStorage.clear();
    await render(<Excalidraw initialData={{ elements: [] }} />);
    API.updateScene({
      elements: [API.createElement({ type: "rectangle", id: "one" })],
    });
    API.setAppState({ viewBackgroundColor: "#123456" });
    firstPageId = pageInternals().activePageId;
    act(() => pageInternals().createPage());
    secondPageId = pageInternals().activePageId;
    API.updateScene({
      elements: [API.createElement({ type: "ellipse", id: "two" })],
    });
  });

  it("deletes an inactive page and stays on the current page", () => {
    act(() => pageInternals().deletePages([firstPageId]));

    expect(pageInternals().pages.map((page) => page.id)).toEqual([
      secondPageId,
    ]);
    expect(pageInternals().activePageId).toBe(secondPageId);
    expect(h.elements.map((element) => element.id)).toEqual(["two"]);
  });

  it("switches to the previous page when the active page is deleted", () => {
    act(() => pageInternals().deletePages([secondPageId]));

    expect(pageInternals().pages.map((page) => page.id)).toEqual([firstPageId]);
    expect(pageInternals().activePageId).toBe(firstPageId);
    expect(h.elements.map((element) => element.id)).toEqual(["one"]);
    expect(h.state.viewBackgroundColor).toBe("#123456");
  });

  it("replaces all pages with one blank page when every page is deleted", () => {
    act(() => pageInternals().deletePages([firstPageId, secondPageId]));

    const { pages, activePageId } = pageInternals();
    expect(pages).toHaveLength(1);
    expect(activePageId).toBe(pages[0].id);
    expect([firstPageId, secondPageId]).not.toContain(activePageId);
    expect(h.elements).toEqual([]);
    expect(h.state.viewBackgroundColor).not.toBe("#123456");
  });

  it("does nothing in view mode", () => {
    API.setAppState({ viewModeEnabled: true });
    act(() => pageInternals().deletePages([firstPageId]));

    expect(pageInternals().pages.map((page) => page.id)).toEqual([
      firstPageId,
      secondPageId,
    ]);
  });
});

describe("deleting mode", () => {
  let queries: Awaited<ReturnType<typeof render>>;
  let pageIds: string[];

  const pageIdsNow = () => pageInternals().pages.map((page) => page.id);
  const button = (name: string) => queries.getByRole("button", { name });
  const checkPage = (name: string) =>
    fireEvent.click(queries.getByRole("checkbox", { name }));
  const enterDeletingMode = () =>
    fireEvent.click(button("Enter deleting mode"));

  // three pages, page 3 active, pages sidebar open
  beforeEach(async () => {
    unmountComponent();
    localStorage.clear();
    queries = await render(<Excalidraw initialData={{ elements: [] }} />);
    fireEvent.click(button("Pages"));
    fireEvent.click(button("Add page"));
    fireEvent.click(button("Add page"));
    pageIds = pageIdsNow();
  });

  it("shows deleting options only while in deleting mode", () => {
    expect(
      queries.queryByText("Deleting mode: select pages to delete"),
    ).toBeNull();
    enterDeletingMode();

    expect(
      queries.getByText("Deleting mode: select pages to delete"),
    ).toBeTruthy();
    expect(queries.getAllByRole("checkbox")).toHaveLength(3);
    expect(button("Delete")).toHaveProperty("disabled", true);
    expect(queries.queryByRole("button", { name: "Add page" })).toBeNull();
    expect(queries.queryByRole("button", { name: "Clear" })).toBeNull();

    fireEvent.click(button("Exit deleting mode"));
    expect(
      queries.queryByText("Deleting mode: select pages to delete"),
    ).toBeNull();
    expect(button("Enter deleting mode")).toBeTruthy();
  });

  it("deletes the selected pages after confirming and stays in deleting mode", () => {
    enterDeletingMode();
    checkPage("Page 1");
    checkPage("Page 2");
    fireEvent.click(button("Delete"));
    expect(
      getConfirmDialog().getByText(/This will delete Page 1, Page 2 and/),
    ).toBeTruthy();

    fireEvent.click(getConfirmDialog().getByRole("button", { name: "Delete" }));

    expect(pageIdsNow()).toEqual([pageIds[2]]);
    expect(pageInternals().activePageId).toBe(pageIds[2]);
    expect(
      queries.getByText("Deleting mode: select pages to delete"),
    ).toBeTruthy();
    expect(
      queries
        .getByRole("checkbox", { name: "Page 1" })
        .getAttribute("aria-checked"),
    ).toBe("false");

    // a second deletion in a row must not trip over the first one's pages
    checkPage("Page 1");
    fireEvent.click(button("Delete"));
    fireEvent.click(getConfirmDialog().getByRole("button", { name: "Delete" }));
    expect(pageIdsNow()).toHaveLength(1);
    expect(pageIds).not.toContain(pageIdsNow()[0]);
  });

  it("moves to the previous page when the current page is deleted", () => {
    enterDeletingMode();
    checkPage("Page 3");
    fireEvent.click(button("Delete"));
    fireEvent.click(getConfirmDialog().getByRole("button", { name: "Delete" }));

    expect(pageIdsNow()).toEqual([pageIds[0], pageIds[1]]);
    expect(pageInternals().activePageId).toBe(pageIds[1]);
  });

  it("deletes every page and leaves one new blank page", () => {
    enterDeletingMode();
    fireEvent.click(button("Select all pages"));
    fireEvent.click(button("Delete"));
    expect(
      getConfirmDialog().getByText(/A new blank page will be created/),
    ).toBeTruthy();

    fireEvent.click(getConfirmDialog().getByRole("button", { name: "Delete" }));

    const remaining = pageIdsNow();
    expect(remaining).toHaveLength(1);
    expect(pageIds).not.toContain(remaining[0]);
    expect(h.elements).toEqual([]);
  });

  it("keeps every page when the confirmation is cancelled", () => {
    enterDeletingMode();
    checkPage("Page 1");
    fireEvent.click(button("Delete"));
    fireEvent.click(getConfirmDialog().getByRole("button", { name: "Cancel" }));

    expect(document.querySelector(".confirm-dialog")).toBeNull();
    expect(pageIdsNow()).toEqual(pageIds);
  });

  it("clearing mode still clears after deleting mode was used", () => {
    enterDeletingMode();
    fireEvent.click(button("Exit deleting mode"));
    fireEvent.click(button("Enter clearing mode"));

    expect(
      queries.getByText("Clearing mode: select pages to clear"),
    ).toBeTruthy();
    checkPage("Page 1");
    fireEvent.click(button("Clear"));
    expect(document.querySelector(".confirm-dialog")?.textContent).toMatch(
      /remove all elements/,
    );
  });

  it("can't be entered and doesn't delete in view mode", () => {
    API.setAppState({ viewModeEnabled: true });
    expect(button("Enter deleting mode")).toHaveProperty("disabled", true);

    API.setAppState({ viewModeEnabled: false });
    enterDeletingMode();
    checkPage("Page 1");
    API.setAppState({ viewModeEnabled: true });
    expect(button("Delete")).toHaveProperty("disabled", true);
  });
});

describe("deleting mode keeps the rest of the drawing intact", () => {
  let queries: Awaited<ReturnType<typeof render>>;

  const elementIds = () => h.elements.map((element) => element.id);
  const button = (name: string) => queries.getByRole("button", { name });
  const addUndoableElement = (
    type: "rectangle" | "ellipse" | "diamond",
    id: string,
  ) =>
    API.updateScene({
      elements: [API.createElement({ type, id })],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  const deletePagesNamed = (...names: string[]) => {
    fireEvent.click(button("Enter deleting mode"));
    for (const name of names) {
      fireEvent.click(queries.getByRole("checkbox", { name }));
    }
    fireEvent.click(button("Delete"));
    fireEvent.click(getConfirmDialog().getByRole("button", { name: "Delete" }));
    fireEvent.click(button("Exit deleting mode"));
  };

  // page 1: "one", page 2: "two", page 3 (active): "three", each undoable
  beforeEach(async () => {
    unmountComponent();
    localStorage.clear();
    // so Ctrl+Z reaches the editor in tests
    queries = await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        initialData={{ elements: [] }}
      />,
    );
    fireEvent.click(button("Pages"));
    addUndoableElement("rectangle", "one");
    fireEvent.click(button("Add page"));
    addUndoableElement("ellipse", "two");
    fireEvent.click(button("Add page"));
    addUndoableElement("diamond", "three");
  });

  it("keeps every other page's elements when a middle page is deleted", () => {
    deletePagesNamed("Page 2");

    // still on the old page 3, now listed second
    expect(elementIds()).toEqual(["three"]);
    expect(queries.queryByRole("button", { name: "Page 3" })).toBeNull();

    fireEvent.click(button("Page 1"));
    expect(elementIds()).toEqual(["one"]);
    fireEvent.click(button("Page 2"));
    expect(elementIds()).toEqual(["three"]);
  });

  it("keeps undo history when a page other than the current one is deleted", () => {
    deletePagesNamed("Page 1");

    expect(h.history.isUndoStackEmpty).toBe(false);
    Keyboard.undo();
    expect(h.elements.filter((element) => !element.isDeleted)).toEqual([]);
  });

  it("does not let undo replay the deleted page's edits on the next page", () => {
    deletePagesNamed("Page 3");

    expect(elementIds()).toEqual(["two"]);
    expect(h.history.isUndoStackEmpty).toBe(true);
    Keyboard.undo();
    expect(elementIds()).toEqual(["two"]);
    expect(h.elements[0].isDeleted).toBe(false);
  });
});

describe("all but current", () => {
  let queries: Awaited<ReturnType<typeof render>>;

  const button = (name: string) => queries.getByRole("button", { name });
  const checkedPages = () =>
    queries
      .getAllByRole("checkbox")
      .filter((box) => box.getAttribute("aria-checked") === "true")
      .map((box) => box.getAttribute("aria-label"));

  // three pages, page 3 active, pages sidebar open
  beforeEach(async () => {
    unmountComponent();
    localStorage.clear();
    queries = await render(<Excalidraw initialData={{ elements: [] }} />);
    fireEvent.click(button("Pages"));
    fireEvent.click(button("Add page"));
    fireEvent.click(button("Add page"));
  });

  it.each(["Enter clearing mode", "Enter deleting mode"])(
    "selects every page except the current one (%s)",
    (enterMode) => {
      fireEvent.click(button(enterMode));
      // the current page is ticked first and must end up unticked
      fireEvent.click(queries.getByRole("checkbox", { name: "Page 3" }));
      fireEvent.click(button("All but current"));

      expect(checkedPages()).toEqual(["Page 1", "Page 2"]);
    },
  );

  it("replaces an existing selection that included the current page", () => {
    fireEvent.click(button("Enter deleting mode"));
    fireEvent.click(button("Select all pages"));
    fireEvent.click(button("All but current"));

    expect(checkedPages()).toEqual(["Page 1", "Page 2"]);
  });

  it("deletes all but the current page", () => {
    const [, , currentPage] = pageInternals().pages;
    fireEvent.click(button("Enter deleting mode"));
    fireEvent.click(button("All but current"));
    fireEvent.click(button("Delete"));
    fireEvent.click(getConfirmDialog().getByRole("button", { name: "Delete" }));

    expect(pageInternals().pages.map((page) => page.id)).toEqual([
      currentPage.id,
    ]);
    expect(button("All but current")).toHaveProperty("disabled", true);
  });

  it("clears all but the current page", () => {
    API.updateScene({
      elements: [API.createElement({ type: "rectangle", id: "current" })],
    });
    fireEvent.click(button("Enter clearing mode"));
    fireEvent.click(button("All but current"));
    fireEvent.click(button("Clear"));
    fireEvent.click(getConfirmDialog().getByRole("button", { name: "Clear" }));

    expect(liveIds()).toEqual(["current"]);
    expect(pageInternals().pages).toHaveLength(3);
  });
});
