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
