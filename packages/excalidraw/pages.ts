import type { ExcalidrawElement } from "@excalidraw/element/types";

import { getDefaultAppState } from "./appState";

import type { AppState } from "./types";

export type PageSettings = Pick<
  AppState,
  | "viewBackgroundColor"
  | "scrollX"
  | "scrollY"
  | "zoom"
  | "gridSize"
  | "gridStep"
  | "gridScale"
  | "gridSnapLinked"
  | "gridSnapScale"
  | "gridColor"
  | "gridOpacity"
  | "gridLayer"
  | "gridModeEnabled"
  | "gridSnapEnabled"
  | "frameRendering"
>;

export type DrawingPage = Readonly<{
  id: string;
  elements: readonly ExcalidrawElement[];
  settings: PageSettings;
}>;

export const getPageSettings = (appState: PageSettings): PageSettings => ({
  viewBackgroundColor: appState.viewBackgroundColor,
  scrollX: appState.scrollX,
  scrollY: appState.scrollY,
  zoom: appState.zoom,
  gridSize: appState.gridSize,
  gridStep: appState.gridStep,
  gridScale: appState.gridScale,
  gridSnapLinked: appState.gridSnapLinked,
  gridSnapScale: appState.gridSnapScale,
  gridColor: appState.gridColor,
  gridOpacity: appState.gridOpacity,
  gridLayer: appState.gridLayer,
  gridModeEnabled: appState.gridModeEnabled,
  gridSnapEnabled: appState.gridSnapEnabled,
  frameRendering: appState.frameRendering,
});

export const createPage = (id: string): DrawingPage => ({
  id,
  elements: [],
  settings: getPageSettings(getDefaultAppState()),
});

/**
 * Removes the given pages. If the active page is removed, the closest
 * surviving page before it becomes active (or the first one after it).
 * Removing every page leaves a single fresh blank page.
 */
export const deletePages = (
  pages: readonly DrawingPage[],
  pageIds: readonly string[],
  activePageId: string,
  generateId: () => string,
): { pages: readonly DrawingPage[]; activePageId: string } => {
  const toDelete = new Set(pageIds);
  if (!toDelete.size) {
    throw new Error("No pages selected for deletion");
  }
  for (const id of toDelete) {
    if (!pages.some((page) => page.id === id)) {
      throw new Error(`Cannot delete unknown page ${id}`);
    }
  }
  const activeIndex = pages.findIndex((page) => page.id === activePageId);
  if (activeIndex === -1) {
    throw new Error(`Active page ${activePageId} does not exist`);
  }

  const remaining = pages.filter((page) => !toDelete.has(page.id));
  if (!remaining.length) {
    const page = createPage(generateId());
    return { pages: [page], activePageId: page.id };
  }
  if (!toDelete.has(activePageId)) {
    return { pages: remaining, activePageId };
  }
  const previous = pages
    .slice(0, activeIndex)
    .reverse()
    .find((page) => !toDelete.has(page.id));
  // no survivor before the active page => remaining[0] is the first after it
  return { pages: remaining, activePageId: (previous ?? remaining[0]).id };
};

/**
 * Parses 1-based page positions like "2-4, 7" into page ids (in page order).
 * Returns null for anything invalid: empty input, non-numbers, zero,
 * out-of-range positions, or reversed ranges like "4-2".
 */
export const parsePageRange = (
  input: string,
  pages: readonly DrawingPage[],
): string[] | null => {
  const tokens = input.split(",").map((token) => token.trim());
  const positions = new Set<number>();
  for (const token of tokens) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);
    if (!match) {
      return null;
    }
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (start < 1 || end > pages.length || start > end) {
      return null;
    }
    for (let position = start; position <= end; position++) {
      positions.add(position);
    }
  }
  return pages
    .filter((_, index) => positions.has(index + 1))
    .map((page) => page.id);
};
