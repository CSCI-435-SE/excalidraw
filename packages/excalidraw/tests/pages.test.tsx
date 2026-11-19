import React from "react";
import { configure, fireEvent, waitFor, within } from "@testing-library/react";

import "@excalidraw/utils/test-utils";

import { DefaultSidebar, Excalidraw, Sidebar } from "../index";
import {
  PAGE_DESCRIPTION_MAX_LENGTH,
  PAGE_NAME_MAX_LENGTH,
  getNextDefaultPageName,
  validatePageInfo,
} from "../pages";

import { API } from "./helpers/api";
import { render, unmountComponent } from "./test-utils";

const { h } = window;

configure({ asyncUtilTimeout: 5000 });

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

describe("page info helpers", () => {
  it("generates the next free default page name", () => {
    expect(getNextDefaultPageName([], "Page")).toBe("Page 1");
    expect(
      getNextDefaultPageName([{ name: "Page 1" }, { name: "page 2" }], "Page"),
    ).toBe("Page 3");
    expect(getNextDefaultPageName([{ name: "Page 2" }], "Page")).toBe("Page 1");
  });

  it("validates page names and descriptions", () => {
    const pages = [
      { id: "a", name: "Intro" },
      { id: "b", name: "Details" },
    ];
    expect(
      validatePageInfo({ name: "   ", description: "" }, pages, "a"),
    ).toEqual({ nameError: "empty" });
    expect(
      validatePageInfo({ name: " details ", description: "" }, pages, "a"),
    ).toEqual({ nameError: "duplicate" });
    // a page may keep its own name
    expect(
      validatePageInfo({ name: "Intro", description: "" }, pages, "a"),
    ).toEqual({});
    expect(
      validatePageInfo(
        { name: "x".repeat(PAGE_NAME_MAX_LENGTH + 1), description: "" },
        pages,
        "a",
      ),
    ).toEqual({ nameError: "tooLong" });
    expect(
      validatePageInfo(
        {
          name: "Intro",
          description: "x".repeat(PAGE_DESCRIPTION_MAX_LENGTH),
        },
        pages,
        "a",
      ),
    ).toEqual({});
    expect(
      validatePageInfo(
        {
          name: "Intro",
          description: "x".repeat(PAGE_DESCRIPTION_MAX_LENGTH + 1),
        },
        pages,
        "a",
      ),
    ).toEqual({ descriptionError: "tooLong" });
  });
});

describe("page info menu", () => {
  beforeEach(() => {
    unmountComponent();
    localStorage.clear();
  });

  const renderWithPages = async () => {
    const result = await render(
      <Excalidraw initialData={{ elements: [] }} handleKeyboardGlobally>
        <DefaultSidebar>
          <DefaultSidebar.TabTriggers>
            <Sidebar.TabTrigger tab="custom">Custom</Sidebar.TabTrigger>
          </DefaultSidebar.TabTriggers>
          <Sidebar.Tab tab="custom">Custom sidebar content</Sidebar.Tab>
        </DefaultSidebar>
      </Excalidraw>,
    );
    fireEvent.click(result.getByRole("button", { name: "Pages" }));
    fireEvent.click(result.getByRole("button", { name: "Add page" }));
    // back to page 1 so page 2 is inactive
    fireEvent.click(result.getByRole("button", { name: "Page 1" }));
    await waitFor(() => {
      expect(
        result
          .getByRole("button", { name: "Page 1" })
          .getAttribute("aria-pressed"),
      ).toBe("true");
    });
    return result;
  };

  const getDialog = () =>
    document.querySelector<HTMLElement>(".PageInfoDialog");

  const clickDialogButton = (name: string) =>
    fireEvent.click(within(getDialog()!).getByRole("button", { name }));

  const getNameInput = () =>
    getDialog()!.querySelector<HTMLInputElement>(".ExcTextField input")!;

  const getDescriptionInput = () =>
    getDialog()!.querySelector<HTMLTextAreaElement>("textarea")!;

  it("opens the menu for a right-clicked inactive page without switching pages", async () => {
    const { getByRole } = await renderWithPages();
    const elementsBefore = h.elements;

    fireEvent.contextMenu(getByRole("button", { name: "Page 2" }));

    expect(h.state.openDialog).toEqual({
      name: "pageInfo",
      pageId: expect.any(String),
    });
    expect(getDialog()).not.toBeNull();
    expect(getDialog()!.textContent).toContain("Page 2");
    expect(
      getByRole("button", { name: "Page 1" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(h.elements).toBe(elementsBefore);
  });

  it("renames a page and shows its description on hover", async () => {
    const { getByRole, queryByRole } = await renderWithPages();

    fireEvent.contextMenu(getByRole("button", { name: "Page 2" }));
    clickDialogButton("Edit");
    fireEvent.change(getNameInput(), { target: { value: "  Roadmap  " } });
    fireEvent.change(getDescriptionInput(), {
      target: { value: "Q3 planning notes" },
    });
    clickDialogButton("Save");

    expect(getDialog()).toBeNull();
    expect(queryByRole("button", { name: "Page 2" })).toBeNull();
    const tab = getByRole("button", { name: "Roadmap" });

    fireEvent.pointerEnter(tab.closest(".excalidraw-tooltip-wrapper")!);
    expect(
      document.querySelector(".excalidraw-tooltip--visible")?.textContent,
    ).toBe("Q3 planning notes");

    // pages without a description don't get a tooltip
    expect(
      getByRole("button", { name: "Page 1" }).closest(
        ".excalidraw-tooltip-wrapper",
      ),
    ).toBeNull();
  });

  it("cancel discards unsaved changes", async () => {
    const { getByRole } = await renderWithPages();

    fireEvent.contextMenu(getByRole("button", { name: "Page 2" }));
    clickDialogButton("Edit");
    fireEvent.change(getNameInput(), { target: { value: "Discarded" } });
    clickDialogButton("Cancel");

    // back in view mode with the saved values
    expect(getDialog()!.textContent).toContain("Page 2");
    expect(getDialog()!.textContent).not.toContain("Discarded");
    clickDialogButton("Close");

    expect(getDialog()).toBeNull();
    expect(getByRole("button", { name: "Page 2" })).toBeTruthy();
  });

  it("blocks saving invalid names and overly long descriptions", async () => {
    const { getByRole } = await renderWithPages();

    fireEvent.contextMenu(getByRole("button", { name: "Page 2" }));
    clickDialogButton("Edit");
    const saveButton = () =>
      within(getDialog()!).getByRole("button", {
        name: "Save",
      }) as HTMLButtonElement;

    fireEvent.change(getNameInput(), { target: { value: "   " } });
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(getNameInput(), { target: { value: "page 1" } });
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(getNameInput(), { target: { value: "Valid" } });
    expect(saveButton().disabled).toBe(false);

    fireEvent.change(getDescriptionInput(), {
      target: { value: "x".repeat(PAGE_DESCRIPTION_MAX_LENGTH + 1) },
    });
    expect(saveButton().disabled).toBe(true);
  });

  it("keeps grid settings per page", async () => {
    const { getByRole } = await renderWithPages();
    expect(h.state.gridModeEnabled).toBe(false);

    fireEvent.contextMenu(getByRole("button", { name: "Page 2" }));
    clickDialogButton("Edit");
    fireEvent.click(
      getDialog()!.querySelector<HTMLInputElement>(
        'input[name="page-info-grid-mode"]',
      )!,
    );
    clickDialogButton("Save");

    // the active page (and global state) is untouched
    expect(h.state.gridModeEnabled).toBe(false);

    fireEvent.click(getByRole("button", { name: "Page 2" }));
    await waitFor(() => {
      expect(h.state.gridModeEnabled).toBe(true);
    });

    fireEvent.click(getByRole("button", { name: "Page 1" }));
    await waitFor(() => {
      expect(h.state.gridModeEnabled).toBe(false);
    });
  });

  it("updates the active page's grid immediately", async () => {
    const { getByRole } = await renderWithPages();

    fireEvent.contextMenu(getByRole("button", { name: "Page 1" }));
    clickDialogButton("Edit");
    fireEvent.click(
      getDialog()!.querySelector<HTMLInputElement>(
        'input[name="page-info-grid-mode"]',
      )!,
    );
    clickDialogButton("Save");

    expect(h.state.gridModeEnabled).toBe(true);
  });

  it("hides a page's thumbnail", async () => {
    const { getByRole } = await renderWithPages();

    fireEvent.contextMenu(getByRole("button", { name: "Page 2" }));
    clickDialogButton("Edit");
    fireEvent.click(within(getDialog()!).getByText("Show thumbnail"));
    clickDialogButton("Save");

    const tab = getByRole("button", { name: "Page 2" });
    expect(tab.querySelector(".page-navigation__preview")).toBeNull();
    expect(
      getByRole("button", { name: "Page 1" }).querySelector(
        ".page-navigation__preview",
      ),
    ).not.toBeNull();
  });

  it("opens with keyboard shortcuts", async () => {
    const { getByRole } = await renderWithPages();

    // F2 on a focused (inactive) tab
    const pageTwoTab = getByRole("button", { name: "Page 2" });
    fireEvent.keyDown(pageTwoTab, { key: "F2" });
    expect(getDialog()!.textContent).toContain("Page 2");
    clickDialogButton("Close");
    expect(getDialog()).toBeNull();

    // Alt+Shift+I targets the active page
    fireEvent.keyDown(document, {
      key: "I",
      code: "KeyI",
      altKey: true,
      shiftKey: true,
    });
    expect(getDialog()!.textContent).toContain("Page 1");
  });
});
