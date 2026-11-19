import React from "react";
import { act, configure, fireEvent, waitFor } from "@testing-library/react";

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
