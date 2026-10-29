import { SVG_NS } from "@excalidraw/common";
import {
  clipToMask,
  getActiveMaskElements,
  getBoundTextElement,
  getMaskIds,
  getMaskMode,
  getMaskOuterExtent,
  getMaskSvgPathData,
  getMaskSvgTransform,
  isMaskType,
  renderElement,
} from "@excalidraw/element";

import type {
  ElementsMap,
  NonDeletedExcalidrawElement,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";

import { t } from "../i18n";

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
    clipToMask(
      context,
      mask,
      appState.scrollX,
      appState.scrollY,
      getMaskOuterExtent(mask, element, allElementsMap),
    );
  }
};

export type MaskTag =
  | {
      kind: "mask";
      element: NonDeletedExcalidrawElement;
      /** "Mask <maskNumber>" */
      maskNumber: number;
      isOutside: boolean;
    }
  | {
      kind: "child";
      element: NonDeletedExcalidrawElement;
      /** "Mask <maskNumber> Child <childNumber>" */
      maskNumber: number;
      childNumber: number;
    };

/**
 * The parent/child tags to show on the canvas.
 *
 * Masks are numbered in scene order ("Mask 1", "Mask 2", …), and each mask's
 * elements in scene order too ("Mask 1 Child 1", …), so the numbers shift as
 * masks and links come and go.
 *
 * The masks shown are those selected, being edited/picked for, or clipping a
 * selected element. Each of their elements gets one tag per mask clipping
 * it, and those other masks get their own tag so the names can be traced.
 */
export const getMaskTags = (
  appState: Pick<StaticCanvasAppState, "selectedElementIds"> & {
    maskEditor: { maskId: string } | null;
  },
  elementsMap: ElementsMap,
): MaskTag[] => {
  // one pass instead of a scene scan per selected element
  const childrenByMask = new Map<string, NonDeletedExcalidrawElement[]>();
  for (const element of elementsMap.values()) {
    if (element.isDeleted) {
      continue;
    }
    for (const maskId of getMaskIds(element)) {
      const children = childrenByMask.get(maskId);
      if (children) {
        children.push(element as NonDeletedExcalidrawElement);
      } else {
        childrenByMask.set(maskId, [element as NonDeletedExcalidrawElement]);
      }
    }
  }
  if (!childrenByMask.size && !appState.maskEditor) {
    return [];
  }

  const maskIds = new Set<string>();
  if (appState.maskEditor) {
    maskIds.add(appState.maskEditor.maskId);
  }
  for (const id of Object.keys(appState.selectedElementIds)) {
    const element = elementsMap.get(id);
    if (!element || element.isDeleted) {
      continue;
    }
    if (childrenByMask.has(element.id)) {
      maskIds.add(element.id);
    }
    for (const maskId of getMaskIds(element)) {
      maskIds.add(maskId);
    }
  }

  // number every mask in the scene, so names don't depend on the selection
  const maskNumbers = new Map<string, number>();
  for (const element of elementsMap.values()) {
    if (
      !element.isDeleted &&
      isMaskType(element) &&
      (childrenByMask.has(element.id) ||
        element.id === appState.maskEditor?.maskId)
    ) {
      maskNumbers.set(element.id, maskNumbers.size + 1);
    }
  }

  const children = new Set<NonDeletedExcalidrawElement>();
  for (const maskId of maskIds) {
    if (maskNumbers.has(maskId)) {
      for (const child of childrenByMask.get(maskId) ?? []) {
        children.add(child);
      }
    }
  }

  const taggedMaskIds = new Set<string>();
  const childTags: MaskTag[] = [];
  for (const child of children) {
    // one tag per mask, in mask order
    const parentIds = getMaskIds(child)
      .filter((maskId) => maskNumbers.has(maskId))
      .sort((a, b) => maskNumbers.get(a)! - maskNumbers.get(b)!);
    for (const maskId of parentIds) {
      taggedMaskIds.add(maskId);
      childTags.push({
        kind: "child",
        element: child,
        maskNumber: maskNumbers.get(maskId)!,
        childNumber: childrenByMask.get(maskId)!.indexOf(child) + 1,
      });
    }
  }
  for (const maskId of maskIds) {
    if (maskNumbers.has(maskId)) {
      taggedMaskIds.add(maskId);
    }
  }

  const maskTags: MaskTag[] = [];
  for (const [maskId, maskNumber] of maskNumbers) {
    if (taggedMaskIds.has(maskId)) {
      const mask = elementsMap.get(maskId)!;
      maskTags.push({
        kind: "mask",
        element: mask as NonDeletedExcalidrawElement,
        maskNumber,
        isOutside: getMaskMode(mask) === "outside",
      });
    }
  }
  return [...maskTags, ...childTags];
};

export const getMaskTagLabel = (tag: MaskTag) => {
  if (tag.kind === "mask") {
    return t(
      tag.isOutside ? "labels.mask.tagMaskOutside" : "labels.mask.tagMask",
      { mask: tag.maskNumber },
    );
  }
  return t("labels.mask.tagChild", {
    mask: tag.maskNumber,
    child: tag.childNumber,
  });
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
    path.setAttribute(
      "d",
      getMaskSvgPathData(mask, getMaskOuterExtent(mask, element, elementsMap)),
    );
    path.setAttribute("transform", getMaskSvgTransform(mask, offsetX, offsetY));
    if (getMaskMode(mask) === "outside") {
      path.setAttribute("clip-rule", "evenodd");
    }
    clipPath.appendChild(path);
    defs.appendChild(clipPath);

    const g = doc.createElementNS(SVG_NS, "g");
    g.setAttribute("clip-path", `url(#${clipPath.id})`);
    parent.appendChild(g);
    parent = g;
  }
  return parent;
};
