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
