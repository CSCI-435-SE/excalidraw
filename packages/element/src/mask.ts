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

/** the mask shape clipping `element`, if it (still) exists */
export const getMaskElement = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
): ExcalidrawMaskElement | null => {
  if (!element.maskId) {
    return null;
  }
  const mask = elementsMap.get(element.maskId);
  return mask && !mask.isDeleted && isMaskType(mask) ? mask : null;
};

/** the element clipped by `mask`, if any */
export const getMaskedElement = (
  mask: ExcalidrawElement,
  elementsMap: ElementsMap,
): NonDeletedExcalidrawElement | null => {
  for (const element of elementsMap.values()) {
    if (element.maskId === mask.id && !element.isDeleted) {
      return element as NonDeletedExcalidrawElement;
    }
  }
  return null;
};

export const isMaskElement = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
) => isMaskType(element) && !!getMaskedElement(element, elementsMap);

export const isMaskEnabled = (mask: ExcalidrawElement) =>
  mask.maskEnabled !== false;

/** the enabled mask that should clip `element` when rendering */
export const getActiveMaskElement = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
) => {
  const mask = getMaskElement(element, elementsMap);
  return mask && isMaskEnabled(mask) ? mask : null;
};

/** whether `element` can become a mask's parent shape */
export const canBecomeMask = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
) =>
  isMaskType(element) &&
  !element.locked &&
  !getMaskElement(element, elementsMap) &&
  !isMaskElement(element, elementsMap);

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
  !getMaskElement(element, elementsMap) &&
  !isMaskElement(element, elementsMap);

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
