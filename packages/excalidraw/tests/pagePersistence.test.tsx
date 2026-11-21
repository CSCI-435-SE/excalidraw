import React from "react";
import { act, configure, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import "@excalidraw/utils/test-utils";

import {
  CaptureUpdateAction,
  CREATOR_ID_KEY,
  newElementWith,
} from "@excalidraw/element";

import { actionZoomIn } from "../actions/actionCanvas";
import { actionSaveFileToDisk } from "../actions/actionExport";
import { getDefaultAppState } from "../appState";
import { saveAsJSON } from "../data";
import { loadFromBlob } from "../data/blob";
import { serializeAsJSON } from "../data/json";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { render, unmountComponent } from "./test-utils";

import type { DrawingPage } from "../pages";
import type { JSONExportData } from "../data/json";

vi.mock("../data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data")>()),
  saveAsJSON: vi.fn(async ({ data }) => ({
    fileHandle: null,
    data: await data,
  })),
}));

const { h } = window;

configure({ asyncUtilTimeout: 5000 });

type PageInternals = {
  pages: readonly DrawingPage[];
  activePageId: string;
  getPagesForPersistence: () => readonly DrawingPage[];
};

const pageInternals = () => h.app as unknown as PageInternals;

const addSecondPage = async (
  getByRole: (role: string, options: { name: string }) => HTMLElement,
  elementId: string,
) => {
  fireEvent.click(getByRole("button", { name: "Pages" }));
  fireEvent.click(getByRole("button", { name: "Add page" }));
  await waitFor(() => expect(h.elements).toHaveLength(0));
  API.updateScene({
    elements: [API.createElement({ type: "ellipse", id: elementId })],
  });
};

describe("page persistence", () => {
  beforeEach(() => {
    unmountComponent();
    localStorage.clear();
    vi.mocked(saveAsJSON).mockClear();
  });

  it("round-trips both pages and the active page through a drawing file", async () => {
    const { getByRole } = await render(
      <Excalidraw initialData={{ elements: [] }} />,
    );
    API.updateScene({
      elements: [API.createElement({ type: "rectangle", id: "page-one" })],
    });
    await addSecondPage(getByRole, "page-two");

    const document = pageInternals();
    const appState = {
      ...h.state,
      pages: document.getPagesForPersistence(),
      activePageId: document.activePageId,
    };
    const serialized = serializeAsJSON(h.elements, appState, {}, "local");
    const restored = await loadFromBlob(new Blob([serialized]), null, null);

    expect(
      restored.appState.pages?.map((page) => page.elements.map(({ id }) => id)),
    ).toEqual([["page-one"], ["page-two"]]);
    expect(restored.appState.activePageId).toBe(document.activePageId);
  });

  it("keeps new drawings after an ordinary action following scene restore", async () => {
    await render(<Excalidraw initialData={{ elements: [] }} />);
    const persistedElement = API.createElement({
      type: "rectangle",
      id: "persisted",
    });
    API.updateScene({ elements: [persistedElement] });
    const document = pageInternals();
    const pages = document.getPagesForPersistence();

    act(() => {
      h.app.syncActionResult({
        elements: [persistedElement],
        appState: {
          ...h.state,
          pages,
          activePageId: document.activePageId,
        },
        loadedScene: true,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    });
    const newElement = API.createElement({ type: "ellipse", id: "new-shape" });
    API.updateScene({ elements: [persistedElement, newElement] });
    const zoomBefore = h.state.zoom.value;

    act(() => h.app.actionManager.executeAction(actionZoomIn));

    expect(h.elements.map(({ id }) => id)).toContain("new-shape");
    expect(h.state.zoom.value).toBeGreaterThan(zoomBefore);
    expect(Object.hasOwn(h.state, "pages")).toBe(false);
    expect(Object.hasOwn(h.state, "activePageId")).toBe(false);
  });

  it("replaces existing pages when loading a legacy single-page file", async () => {
    const { getByRole } = await render(
      <Excalidraw initialData={{ elements: [] }} />,
    );
    API.updateScene({
      elements: [API.createElement({ type: "rectangle", id: "old-one" })],
    });
    await addSecondPage(getByRole, "old-two");

    const loadedElement = API.createElement({
      type: "diamond",
      id: "loaded-file-element",
    });
    act(() => {
      h.app.syncActionResult({
        elements: [loadedElement],
        appState: getDefaultAppState(),
        loadedScene: true,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    });

    expect(pageInternals().pages).toHaveLength(1);
    expect(h.elements.map(({ id }) => id)).toEqual(["loaded-file-element"]);
  });

  it("ignores malformed persisted pages and keeps only valid page records", async () => {
    await render(<Excalidraw initialData={{ elements: [] }} />);
    const validElement = API.createElement({
      type: "diamond",
      id: "valid-page-element",
    });

    act(() => {
      h.app.syncActionResult({
        elements: [validElement],
        appState: {
          ...getDefaultAppState(),
          pages: [
            {
              id: "valid-page",
              name: "Valid",
              elements: [validElement],
              settings: {},
            },
            {
              id: 42,
              name: "Malformed",
              elements: [],
              settings: {},
            },
          ] as any,
          activePageId: "valid-page",
        },
        loadedScene: true,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    });

    expect(pageInternals().pages).toHaveLength(1);
    expect(pageInternals().pages[0].id).toBe("valid-page");
    expect(pageInternals().activePageId).toBe("valid-page");
  });

  it("omits hidden collaborator elements from saved page data", async () => {
    let exportData: JSONExportData | undefined;
    await render(
      <Excalidraw
        initialData={{ elements: [] }}
        onExport={(_type, data) => {
          exportData = data;
        }}
      />,
    );
    const hiddenElement = newElementWith(
      API.createElement({ type: "rectangle", id: "hidden-element" }),
      { customData: { [CREATOR_ID_KEY]: "hidden-peer" } },
    );
    API.updateScene({ elements: [hiddenElement] });
    API.setAppState({ hiddenCollaboratorIds: new Set(["hidden-peer"]) });

    act(() => h.app.actionManager.executeAction(actionSaveFileToDisk));
    await waitFor(() => expect(exportData).toBeDefined());

    expect(exportData).toBeDefined();
    const saved = JSON.parse(
      serializeAsJSON(
        exportData!.elements,
        exportData!.appState,
        exportData!.files,
        "local",
      ),
    );
    expect(saved.elements.map(({ id }: { id: string }) => id)).not.toContain(
      "hidden-element",
    );
    expect(
      saved.appState.pages.flatMap((page: DrawingPage) =>
        page.elements.map(({ id }) => id),
      ),
    ).not.toContain("hidden-element");
    expect(vi.mocked(saveAsJSON)).toHaveBeenCalledTimes(1);
  });
});
