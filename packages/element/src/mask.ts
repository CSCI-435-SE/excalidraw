import { getCornerRadius } from "./utils";
import {
  getDiamondPoints,
  getElementBounds,
  getTrianglePoints,
} from "./bounds";

import type {
  ElementsMap,
  ExcalidrawDiamondElement,
  ExcalidrawElement,
  ExcalidrawEllipseElement,
  ExcalidrawRectangleElement,
  ExcalidrawTriangleElement,
  MaskMode,
  NonDeletedExcalidrawElement,
} from "./types";

export type ExcalidrawMaskElement =
  | ExcalidrawRectangleElement
  | ExcalidrawDiamondElement
  | ExcalidrawEllipseElement
  | ExcalidrawTriangleElement;

const MASK_TYPES = new Set<ExcalidrawElement["type"]>([
  "rectangle",
  "diamond",
  "ellipse",
  "triangle",
]);

// images are left to #72, embeds can't be clipped by the canvas at all
const MASKABLE_TYPES = new Set<ExcalidrawElement["type"]>([
  "rectangle",
  "diamond",
  "ellipse",
  "triangle",
  "line",
  "arrow",
  "freedraw",
  "text",
]);

/** whether the element's type can act as a mask */
export const isMaskType = (
  element: ExcalidrawElement | null | undefined,
): element is ExcalidrawMaskElement =>
  !!element && MASK_TYPES.has(element.type);

/** ids of the masks linked to `element`, including missing/deleted ones */
export const getMaskIds = (element: ExcalidrawElement): readonly string[] =>
  element.maskIds ?? [];

export const isMaskedBy = (
  element: ExcalidrawElement,
  maskId: ExcalidrawElement["id"],
) => getMaskIds(element).includes(maskId);

/** the mask shapes clipping `element` that (still) exist */
export const getMaskElements = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
): ExcalidrawMaskElement[] => {
  const masks: ExcalidrawMaskElement[] = [];
  for (const maskId of getMaskIds(element)) {
    const mask = elementsMap.get(maskId);
    if (mask && !mask.isDeleted && isMaskType(mask)) {
      masks.push(mask);
    }
  }
  return masks;
};

/** the elements clipped by `mask` */
export const getMaskedElements = (
  mask: ExcalidrawElement,
  elementsMap: ElementsMap,
): NonDeletedExcalidrawElement[] => {
  const masked: NonDeletedExcalidrawElement[] = [];
  for (const element of elementsMap.values()) {
    if (!element.isDeleted && isMaskedBy(element, mask.id)) {
      masked.push(element as NonDeletedExcalidrawElement);
    }
  }
  return masked;
};

/** whether `element` is clipped by at least one existing mask */
export const isMaskedElement = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
) => getMaskElements(element, elementsMap).length > 0;

export const isMaskElement = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
) => {
  if (!isMaskType(element)) {
    return false;
  }
  for (const el of elementsMap.values()) {
    if (!el.isDeleted && isMaskedBy(el, element.id)) {
      return true;
    }
  }
  return false;
};

export const isMaskEnabled = (mask: ExcalidrawElement) =>
  mask.maskEnabled !== false;

/** whether the mask's elements show inside or outside its outline */
export const getMaskMode = (mask: ExcalidrawElement): MaskMode =>
  mask.maskMode ?? "inside";

/** extra room around the masked element, e.g. for strokes and bound text */
const OUTER_EXTENT_PADDING = 50;

/**
 * How far the outer edge of an outside-mode clip must extend past the mask's
 * outline (in the mask's local coordinates) to cover all of `element`,
 * whatever the mask's rotation.
 */
export const getMaskOuterExtent = (
  mask: ExcalidrawMaskElement,
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
) => {
  const [x1, y1, x2, y2] = getElementBounds(element, elementsMap);
  const cx = mask.x + mask.width / 2;
  const cy = mask.y + mask.height / 2;
  const dx = Math.max(Math.abs(x1 - cx), Math.abs(x2 - cx));
  const dy = Math.max(Math.abs(y1 - cy), Math.abs(y2 - cy));
  return Math.hypot(dx, dy) + OUTER_EXTENT_PADDING;
};

/** the enabled masks that should clip `element` when rendering */
export const getActiveMaskElements = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
) => getMaskElements(element, elementsMap).filter(isMaskEnabled);

/**
 * whether `element` can become (or keep taking elements as) a mask. Masked
 * elements can't be masks, so masks never chain.
 */
export const canBecomeMask = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
) =>
  isMaskType(element) &&
  !element.locked &&
  !isMaskedElement(element, elementsMap);

/** whether `element` can be clipped by `mask` */
export const canBeMasked = (
  element: ExcalidrawElement,
  mask: ExcalidrawElement,
  elementsMap: ElementsMap,
) =>
  element.id !== mask.id &&
  !element.isDeleted &&
  !element.locked &&
  MASKABLE_TYPES.has(element.type) &&
  // bound text is clipped together with its container
  !(element.type === "text" && element.containerId) &&
  !isMaskedBy(element, mask.id) &&
  // masks never chain
  !isMaskElement(element, elementsMap) &&
  !isMaskedElement(mask, elementsMap);

type MaskOutline =
  | { type: "rect"; width: number; height: number; radius: number }
  | { type: "ellipse"; width: number; height: number }
  | { type: "polygon"; points: [number, number][] };

/** the mask's outline in its local (unrotated, top-left origin) coordinates */
export const getMaskOutline = (mask: ExcalidrawMaskElement): MaskOutline => {
  const { width, height } = mask;
  switch (mask.type) {
    case "rectangle":
      return {
        type: "rect",
        width,
        height,
        radius: getCornerRadius(Math.min(width, height), mask),
      };
    case "ellipse":
      return { type: "ellipse", width, height };
    case "diamond": {
      const [tx, ty, rx, ry, bx, by, lx, ly] = getDiamondPoints(mask);
      return {
        type: "polygon",
        points: [
          [tx, ty],
          [rx, ry],
          [bx, by],
          [lx, ly],
        ],
      };
    }
    case "triangle": {
      const [tx, ty, rx, ry, lx, ly] = getTrianglePoints(mask);
      return {
        type: "polygon",
        points: [
          [tx, ty],
          [rx, ry],
          [lx, ly],
        ],
      };
    }
  }
};

/**
 * Clips the context to the mask's outline, or, for an outside-mode mask, to
 * everything within `outerExtent` of the outline except the outline. The
 * context is expected to be in scene coordinates offset by
 * (`offsetX`, `offsetY`), e.g. the scroll.
 */
export const clipToMask = (
  context: CanvasRenderingContext2D,
  mask: ExcalidrawMaskElement,
  offsetX: number,
  offsetY: number,
  outerExtent: number = 0,
) => {
  const cx = mask.x + mask.width / 2 + offsetX;
  const cy = mask.y + mask.height / 2 + offsetY;
  const isOutside = getMaskMode(mask) === "outside";

  context.translate(cx, cy);
  context.rotate(mask.angle);
  context.translate(-mask.width / 2, -mask.height / 2);

  context.beginPath();
  if (isOutside) {
    // with the even-odd rule, the outline cuts a hole into this rect
    context.rect(
      -outerExtent,
      -outerExtent,
      mask.width + outerExtent * 2,
      mask.height + outerExtent * 2,
    );
  }
  const outline = getMaskOutline(mask);
  if (outline.type === "rect") {
    if (outline.radius && context.roundRect) {
      context.roundRect(0, 0, outline.width, outline.height, outline.radius);
    } else {
      context.rect(0, 0, outline.width, outline.height);
    }
  } else if (outline.type === "ellipse") {
    context.ellipse(
      outline.width / 2,
      outline.height / 2,
      outline.width / 2,
      outline.height / 2,
      0,
      0,
      Math.PI * 2,
    );
  } else {
    outline.points.forEach(([x, y], index) =>
      index ? context.lineTo(x, y) : context.moveTo(x, y),
    );
    context.closePath();
  }
  context.clip(isOutside ? "evenodd" : "nonzero");

  context.translate(mask.width / 2, mask.height / 2);
  context.rotate(-mask.angle);
  context.translate(-cx, -cy);
};

/** SVG path data of the mask's outline, in its local coordinates */
const getMaskOutlineSvgPathData = (mask: ExcalidrawMaskElement) => {
  const outline = getMaskOutline(mask);
  if (outline.type === "rect") {
    const { width: w, height: h } = outline;
    const r = Math.min(outline.radius, w / 2, h / 2);
    if (!r) {
      return `M0 0H${w}V${h}H0Z`;
    }
    return (
      `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}` +
      `A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}` +
      `V${r}A${r} ${r} 0 0 1 ${r} 0Z`
    );
  }
  if (outline.type === "ellipse") {
    const rx = outline.width / 2;
    const ry = outline.height / 2;
    return (
      `M0 ${ry}A${rx} ${ry} 0 1 0 ${outline.width} ${ry}` +
      `A${rx} ${ry} 0 1 0 0 ${ry}Z`
    );
  }
  return `${outline.points
    .map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`)
    .join("")}Z`;
};

/**
 * SVG path data to clip the mask's elements with, in its local coordinates.
 * For an outside-mode mask, the outline is preceded by a rect `outerExtent`
 * past it, to be clipped with `clip-rule="evenodd"`.
 */
export const getMaskSvgPathData = (
  mask: ExcalidrawMaskElement,
  outerExtent: number = 0,
) => {
  if (getMaskMode(mask) === "outside") {
    const e = outerExtent;
    return `M${-e} ${-e}H${mask.width + e}V${
      mask.height + e
    }H${-e}Z${getMaskOutlineSvgPathData(mask)}`;
  }
  return getMaskOutlineSvgPathData(mask);
};

/** SVG transform placing the mask's local outline into scene coordinates */
export const getMaskSvgTransform = (
  mask: ExcalidrawMaskElement,
  offsetX: number,
  offsetY: number,
) => {
  const cx = mask.x + mask.width / 2 + offsetX;
  const cy = mask.y + mask.height / 2 + offsetY;
  const degrees = (180 * mask.angle) / Math.PI;
  return `translate(${cx} ${cy}) rotate(${degrees}) translate(${
    -mask.width / 2
  } ${-mask.height / 2})`;
};
