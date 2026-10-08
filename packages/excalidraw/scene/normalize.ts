import {
  MAX_GRID_SCALE,
  MAX_ZOOM,
  MIN_GRID_SCALE,
  MIN_ZOOM,
} from "@excalidraw/common";

import { clamp, round } from "@excalidraw/math";

import type { NormalizedZoomValue } from "../types";

export const getNormalizedZoom = (zoom: number): NormalizedZoomValue => {
  return clamp(round(zoom, 6), MIN_ZOOM, MAX_ZOOM) as NormalizedZoomValue;
};

export const getNormalizedGridSize = (gridStep: number) => {
  return clamp(Math.round(gridStep), 1, 100);
};

export const getNormalizedGridStep = (gridStep: number) => {
  return clamp(Math.round(gridStep), 1, 100);
};

export const getNormalizedGridScale = (gridScale: number) => {
  return clamp(round(gridScale, 2), MIN_GRID_SCALE, MAX_GRID_SCALE);
};

export const getNormalizedGridOpacity = (gridOpacity: number) => {
  return clamp(Math.round(gridOpacity), 0, 100);
};
