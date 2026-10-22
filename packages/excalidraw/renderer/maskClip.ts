import { SVG_NS } from "@excalidraw/common";
import {
  clipToMask,
  getActiveMaskElement,
  getBoundTextElement,
  getMaskSvgPathData,
  getMaskSvgTransform,
  renderElement,
} from "@excalidraw/element";

import type {
  ElementsMap,
  NonDeletedExcalidrawElement,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";

import type { RoughCanvas } from "roughjs/bin/canvas";

import type {
  RenderableElementsMap,
  StaticCanvasRenderConfig,
} from "../scene/types";
import type { StaticCanvasAppState } from "../types";

/** opacity of the masked-out content previewed while the mask is selected */
export const MASK_PREVIEW_OPACITY = 0.2;

/**
 * Clips the context to the element's mask, if it has an enabled one.
 * While the mask is selected, the masked-out parts are first drawn faintly
 * so the user can see what the mask is hiding.
 */
export const applyMaskClip = (
  element: NonDeletedExcalidrawElement,
  elementsMap: RenderableElementsMap,
  allElementsMap: NonDeletedSceneElementsMap,
  rc: RoughCanvas,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
  appState: StaticCanvasAppState,
) => {
  const mask = getActiveMaskElement(element, allElementsMap);
  if (!mask) {
    return;
  }

  if (!renderConfig.isExporting && appState.selectedElementIds[mask.id]) {
    const boundTextElement = getBoundTextElement(element, elementsMap);
    for (const el of boundTextElement
      ? [element, boundTextElement]
      : [element]) {
      renderElement(
        el,
        elementsMap,
        allElementsMap,
        rc,
        context,
        renderConfig,
        appState,
        MASK_PREVIEW_OPACITY,
      );
    }
  }

  clipToMask(context, mask, appState.scrollX, appState.scrollY);
};

/**
 * If the element has an enabled mask, appends a `<g>` clipped to the mask's
 * outline to `svgRoot` and returns it, so the element can be rendered into it.
 */
export const createSvgMaskGroup = (
  element: NonDeletedExcalidrawElement,
  elementsMap: ElementsMap,
  svgRoot: SVGElement,
  offsetX: number,
  offsetY: number,
) => {
  const mask = getActiveMaskElement(element, elementsMap);
  if (!mask) {
    return null;
  }

  const doc = svgRoot.ownerDocument;
  const clipPath = doc.createElementNS(SVG_NS, "clipPath");
  clipPath.id = `mask-clipPath-${element.id}`;
  clipPath.setAttribute("clipPathUnits", "userSpaceOnUse");
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", getMaskSvgPathData(mask));
  path.setAttribute("transform", getMaskSvgTransform(mask, offsetX, offsetY));
  clipPath.appendChild(path);
  (svgRoot.querySelector("defs") || svgRoot).appendChild(clipPath);

  const g = doc.createElementNS(SVG_NS, "g");
  g.setAttribute("clip-path", `url(#${clipPath.id})`);
  svgRoot.appendChild(g);
  return g;
};
