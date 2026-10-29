import { getCornerRadius } from "./utils";
import { getDiamondPoints, getTrianglePoints } from "./bounds";

import type {
  ElementsMap,
  ExcalidrawDiamondElement,
  ExcalidrawElement,
  ExcalidrawEllipseElement,
  ExcalidrawRectangleElement,
  ExcalidrawTriangleElement,
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
 * Clips the context to the mask's outline. The context is expected to be in
 * scene coordinates offset by (`offsetX`, `offsetY`), e.g. the scroll.
 */
export const clipToMask = (
  context: CanvasRenderingContext2D,
  mask: ExcalidrawMaskElement,
  offsetX: number,
  offsetY: number,
) => {
  const cx = mask.x + mask.width / 2 + offsetX;
  const cy = mask.y + mask.height / 2 + offsetY;

  context.translate(cx, cy);
  context.rotate(mask.angle);
  context.translate(-mask.width / 2, -mask.height / 2);

  context.beginPath();
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
  context.clip();

  context.translate(mask.width / 2, mask.height / 2);
  context.rotate(-mask.angle);
  context.translate(-cx, -cy);
};

/** SVG path data of the mask's outline, in its local coordinates */
export const getMaskSvgPathData = (mask: ExcalidrawMaskElement) => {
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
