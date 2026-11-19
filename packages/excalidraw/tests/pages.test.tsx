import React from "react";
import { configure, fireEvent, waitFor, within } from "@testing-library/react";

import { KEYS } from "@excalidraw/common";

import "@excalidraw/utils/test-utils";

import { DefaultSidebar, Excalidraw, Sidebar } from "../index";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { render, unmountComponent } from "./test-utils";

const { h } = window;

configure({ asyncUtilTimeout: 5000 });

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
});
