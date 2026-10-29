import { SVG_NS } from "@excalidraw/common";
import {
  clipToMask,
  getActiveMaskElements,
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
 * Clips the context to the element's enabled masks (their intersection).
 * While one of the masks is selected, the masked-out parts are first drawn
 * faintly so the user can see what the masks are hiding.
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
  const masks = getActiveMaskElements(element, allElementsMap);
  if (!masks.length) {
    return;
  }

  if (
    !renderConfig.isExporting &&
    masks.some((mask) => appState.selectedElementIds[mask.id])
  ) {
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

  // successive clips intersect
  for (const mask of masks) {
    clipToMask(context, mask, appState.scrollX, appState.scrollY);
  }
};

/**
 * If the element has enabled masks, appends one `<g>` per mask, each nested
 * in the previous and clipped to that mask's outline, to `svgRoot` and
 * returns the innermost, so the element can be rendered into it.
 */
export const createSvgMaskGroup = (
  element: NonDeletedExcalidrawElement,
  elementsMap: ElementsMap,
  svgRoot: SVGElement,
  offsetX: number,
  offsetY: number,
) => {
  const masks = getActiveMaskElements(element, elementsMap);
  if (!masks.length) {
    return null;
  }

  const doc = svgRoot.ownerDocument;
  const defs = svgRoot.querySelector("defs") || svgRoot;
  let parent: SVGElement = svgRoot;
  for (const mask of masks) {
    const clipPath = doc.createElementNS(SVG_NS, "clipPath");
    clipPath.id = `mask-clipPath-${element.id}-${mask.id}`;
    clipPath.setAttribute("clipPathUnits", "userSpaceOnUse");
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("d", getMaskSvgPathData(mask));
    path.setAttribute("transform", getMaskSvgTransform(mask, offsetX, offsetY));
    clipPath.appendChild(path);
    defs.appendChild(clipPath);

    const g = doc.createElementNS(SVG_NS, "g");
    g.setAttribute("clip-path", `url(#${clipPath.id})`);
    parent.appendChild(g);
    parent = g;
  }
  return parent;
};
