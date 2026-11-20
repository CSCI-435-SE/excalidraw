import type { ExcalidrawElement } from "@excalidraw/element/types";

import { getDefaultAppState } from "./appState";
import { t } from "./i18n";

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
  name: string;
  description: string;
  showThumbnail: boolean;
  elements: readonly ExcalidrawElement[];
  settings: PageSettings;
}>;

export const PAGE_NAME_MAX_LENGTH = 50;
export const PAGE_DESCRIPTION_MAX_LENGTH = 350;

export type PageGridSettings = Pick<
  PageSettings,
  "gridModeEnabled" | "gridSnapEnabled" | "gridSize"
>;

export type PageInfoPatch = {
  name: string;
  description: string;
  showThumbnail: boolean;
  grid: PageGridSettings;
};

export type PageInfoValidation = {
  nameError?: "empty" | "duplicate" | "tooLong";
  descriptionError?: "tooLong";
};

const normalizePageName = (name: string) => name.trim().toLocaleLowerCase();

/**
 * Returns `${baseName} N` using the smallest N >= 1 whose name isn't already
 * taken (case-insensitively) by another page.
 */
export const getNextDefaultPageName = (
  pages: readonly Pick<DrawingPage, "name">[],
  baseName: string,
): string => {
  const taken = new Set(pages.map((page) => normalizePageName(page.name)));
  let index = 1;
  while (taken.has(normalizePageName(`${baseName} ${index}`))) {
    index++;
  }
  return `${baseName} ${index}`;
};

export const validatePageInfo = (
  info: { name: string; description: string },
  pages: readonly Pick<DrawingPage, "id" | "name">[],
  pageId: string,
): PageInfoValidation => {
  const result: PageInfoValidation = {};
  const trimmedName = info.name.trim();

  if (!trimmedName) {
    result.nameError = "empty";
  } else if (trimmedName.length > PAGE_NAME_MAX_LENGTH) {
    result.nameError = "tooLong";
  } else if (
    pages.some(
      (page) =>
        page.id !== pageId &&
        normalizePageName(page.name) === normalizePageName(trimmedName),
    )
  ) {
    result.nameError = "duplicate";
  }

  if (info.description.length > PAGE_DESCRIPTION_MAX_LENGTH) {
    result.descriptionError = "tooLong";
  }

  return result;
};

export const isPageInfoValid = (validation: PageInfoValidation) =>
  !validation.nameError && !validation.descriptionError;

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

export const createPage = (id: string, name: string): DrawingPage => ({
  id,
  name,
  description: "",
  showThumbnail: true,
  elements: [],
  settings: getPageSettings(getDefaultAppState()),
});

/** The label shown for a page: its user-editable name (#160). */
export const getPageLabel = (page: DrawingPage) => page.name;

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
    const page = createPage(
      generateId(),
      getNextDefaultPageName([], t("labels.page")),
    );
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
