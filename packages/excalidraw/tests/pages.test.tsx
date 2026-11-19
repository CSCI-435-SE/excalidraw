import React from "react";
import {
  act,
  configure,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";

import { KEYS } from "@excalidraw/common";

import "@excalidraw/utils/test-utils";

import { DefaultSidebar, Excalidraw, Sidebar } from "../index";

import { API } from "./helpers/api";
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

describe("page selection", () => {
  const ctrlClick = { [KEYS.CTRL_OR_CMD]: true };
  let queries: Awaited<ReturnType<typeof render>>;

  // two pages, page 2 active, pages sidebar open
  beforeEach(async () => {
    unmountComponent();
    localStorage.clear();
    queries = await render(<Excalidraw initialData={{ elements: [] }} />);
    fireEvent.click(queries.getByRole("button", { name: "Pages" }));
    fireEvent.click(queries.getByRole("button", { name: "Add page" }));
  });

  it("ctrl/cmd+click toggles a page's selection without switching to it", () => {
    const { getByRole, queryByRole } = queries;
    const activePageId = pageInternals().activePageId;

    fireEvent.click(getByRole("button", { name: "Page 1" }), ctrlClick);
    expect(getByRole("button", { name: "Page 1, selected" })).toBeTruthy();
    expect(pageInternals().activePageId).toBe(activePageId);

    fireEvent.click(
      getByRole("button", { name: "Page 1, selected" }),
      ctrlClick,
    );
    expect(getByRole("button", { name: "Page 1" })).toBeTruthy();
    expect(queryByRole("button", { name: /^Page d+, selected$/ })).toBeNull();
  });

  it("selects several pages, including the active one", () => {
    const { getByRole } = queries;

    fireEvent.click(getByRole("button", { name: "Page 1" }), ctrlClick);
    fireEvent.click(getByRole("button", { name: "Page 2" }), ctrlClick);

    expect(getByRole("button", { name: "Page 1, selected" })).toBeTruthy();
    expect(getByRole("button", { name: "Page 2, selected" })).toBeTruthy();
  });

  it("select all selects every page", () => {
    const { getByRole } = queries;

    fireEvent.click(getByRole("button", { name: "Select all" }));

    expect(getByRole("button", { name: "Page 1, selected" })).toBeTruthy();
    expect(getByRole("button", { name: "Page 2, selected" })).toBeTruthy();
  });

  it("a plain click switches page and clears the selection", () => {
    const { getByRole, queryByRole } = queries;
    const [firstPage] = pageInternals().pages;

    fireEvent.click(getByRole("button", { name: "Select all" }));
    fireEvent.click(getByRole("button", { name: "Page 1, selected" }));

    expect(pageInternals().activePageId).toBe(firstPage.id);
    expect(queryByRole("button", { name: /^Page d+, selected$/ })).toBeNull();
  });

  it("forgets the selection of a page once it is deleted", () => {
    const { getByRole, queryByRole } = queries;
    const [firstPage] = pageInternals().pages;

    fireEvent.click(getByRole("button", { name: "Page 1" }), ctrlClick);
    act(() => pageInternals().deletePages([firstPage.id]));

    // the remaining page is now "Page 1" and must not inherit the selection
    expect(getByRole("button", { name: "Page 1" })).toBeTruthy();
    expect(queryByRole("button", { name: /^Page d+, selected$/ })).toBeNull();
  });
});

describe("page deletion UI", () => {
  const ctrlClick = { [KEYS.CTRL_OR_CMD]: true };
  let queries: Awaited<ReturnType<typeof render>>;
  let pageIds: string[];

  const pageIdsNow = () => pageInternals().pages.map((page) => page.id);
  const dialog = () => within(queries.getByRole("dialog"));

  // three pages, page 3 active, pages sidebar open
  beforeEach(async () => {
    unmountComponent();
    localStorage.clear();
    queries = await render(<Excalidraw initialData={{ elements: [] }} />);
    fireEvent.click(queries.getByRole("button", { name: "Pages" }));
    fireEvent.click(queries.getByRole("button", { name: "Add page" }));
    fireEvent.click(queries.getByRole("button", { name: "Add page" }));
    pageIds = pageIdsNow();
  });

  it("deletes the current page after confirming", () => {
    fireEvent.click(queries.getByRole("button", { name: "Delete page" }));
    expect(dialog().getByText(/This will delete Page 3 and/)).toBeTruthy();

    fireEvent.click(dialog().getByRole("button", { name: "Delete" }));

    expect(queries.queryByRole("dialog")).toBeNull();
    expect(pageIdsNow()).toEqual([pageIds[0], pageIds[1]]);
    expect(pageInternals().activePageId).toBe(pageIds[1]);
    expect(queries.queryByRole("button", { name: "Page 3" })).toBeNull();
  });

  it("keeps every page when the dialog is cancelled", () => {
    fireEvent.click(queries.getByRole("button", { name: "Delete page" }));
    fireEvent.click(dialog().getByRole("button", { name: "Cancel" }));

    expect(queries.queryByRole("dialog")).toBeNull();
    expect(pageIdsNow()).toEqual(pageIds);
  });

  it("deletes the selected pages and clears the selection", () => {
    fireEvent.click(queries.getByRole("button", { name: "Page 1" }), ctrlClick);
    fireEvent.click(queries.getByRole("button", { name: "Page 2" }), ctrlClick);
    fireEvent.click(
      queries.getByRole("button", { name: "Delete selected (2)" }),
    );
    expect(
      dialog().getByText(/This will delete Page 1, Page 2 and/),
    ).toBeTruthy();

    fireEvent.click(dialog().getByRole("button", { name: "Delete" }));

    expect(pageIdsNow()).toEqual([pageIds[2]]);
    expect(pageInternals().activePageId).toBe(pageIds[2]);
    expect(queries.getByRole("button", { name: "Delete page" })).toBeTruthy();
  });

  it("deletes all pages and leaves one new blank page", () => {
    fireEvent.click(queries.getByRole("button", { name: "Delete all" }));
    expect(dialog().getByText(/A new blank page will be created/)).toBeTruthy();

    fireEvent.click(dialog().getByRole("button", { name: "Delete" }));

    const remaining = pageIdsNow();
    expect(remaining).toHaveLength(1);
    expect(pageIds).not.toContain(remaining[0]);
    expect(h.elements).toEqual([]);
  });

  it("deletes all but the current page", () => {
    fireEvent.click(
      queries.getByRole("button", { name: "Delete all but current" }),
    );
    expect(dialog().queryByText(/A new blank page/)).toBeNull();

    fireEvent.click(dialog().getByRole("button", { name: "Delete" }));

    expect(pageIdsNow()).toEqual([pageIds[2]]);
    expect(
      queries.getByRole("button", { name: "Delete all but current" }),
    ).toHaveProperty("disabled", true);
  });

  it("disables every delete button in view mode", () => {
    API.setAppState({ viewModeEnabled: true });

    for (const name of [
      "Delete page",
      "Delete all",
      "Delete all but current",
    ]) {
      expect(queries.getByRole("button", { name })).toHaveProperty(
        "disabled",
        true,
      );
    }
  });
});

describe("page range deletion", () => {
  let queries: Awaited<ReturnType<typeof render>>;
  let pageIds: string[];

  const pageIdsNow = () => pageInternals().pages.map((page) => page.id);
  const rangeInput = () =>
    queries.getByRole("textbox", { name: "Delete pages by number" });
  const rangeButton = () =>
    queries.getByRole("button", { name: "Delete pages" });
  const typeRange = (value: string) =>
    fireEvent.change(rangeInput(), { target: { value } });

  // three pages, page 3 active, pages sidebar open
  beforeEach(async () => {
    unmountComponent();
    localStorage.clear();
    queries = await render(<Excalidraw initialData={{ elements: [] }} />);
    fireEvent.click(queries.getByRole("button", { name: "Pages" }));
    fireEvent.click(queries.getByRole("button", { name: "Add page" }));
    fireEvent.click(queries.getByRole("button", { name: "Add page" }));
    pageIds = pageIdsNow();
  });

  it("deletes the pages in a valid range after confirming", () => {
    typeRange("1-2");
    expect(queries.queryByRole("alert")).toBeNull();
    fireEvent.click(rangeButton());

    const dialog = within(queries.getByRole("dialog"));
    expect(
      dialog.getByText(/This will delete Page 1, Page 2 and/),
    ).toBeTruthy();
    fireEvent.click(dialog.getByRole("button", { name: "Delete" }));

    expect(pageIdsNow()).toEqual([pageIds[2]]);
    expect(rangeInput()).toHaveProperty("value", "");
  });

  it("accepts a mixed list of pages and ranges", () => {
    typeRange("3, 1");
    fireEvent.click(rangeButton());

    const dialog = within(queries.getByRole("dialog"));
    expect(
      dialog.getByText(/This will delete Page 1, Page 3 and/),
    ).toBeTruthy();
    fireEvent.click(dialog.getByRole("button", { name: "Delete" }));

    expect(pageIdsNow()).toEqual([pageIds[1]]);
  });

  it("submits with the Enter key", () => {
    typeRange("2");
    fireEvent.submit(rangeInput());

    const dialog = within(queries.getByRole("dialog"));
    expect(dialog.getByText(/This will delete Page 2 and/)).toBeTruthy();
  });

  it.each(["4", "0", "3-1", "abc", "1,,2"])(
    "rejects %j with an error and a disabled button",
    (value) => {
      typeRange(value);

      expect(queries.getByRole("alert").textContent).toBe(
        "Enter page numbers from 1 to 3, like 2-4, 7",
      );
      expect(rangeInput().getAttribute("aria-invalid")).toBe("true");
      expect(rangeButton()).toHaveProperty("disabled", true);

      fireEvent.submit(rangeInput());
      expect(queries.queryByRole("dialog")).toBeNull();
    },
  );

  it("disables the button without an error while the field is empty", () => {
    expect(rangeButton()).toHaveProperty("disabled", true);
    expect(queries.queryByRole("alert")).toBeNull();
  });

  it("disables the field and button in view mode", () => {
    typeRange("1");
    API.setAppState({ viewModeEnabled: true });

    expect(rangeInput()).toHaveProperty("disabled", true);
    expect(rangeButton()).toHaveProperty("disabled", true);
    fireEvent.submit(rangeInput());
    expect(queries.queryByRole("dialog")).toBeNull();
  });
});
