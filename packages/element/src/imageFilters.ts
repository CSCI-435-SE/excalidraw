import { clamp } from "@excalidraw/math";

import type {
  ExcalidrawImageElement,
  ImageAdjustments,
  ImageFilterEntry,
  ImageFilterType,
} from "./types";

/**
 * Image filters and exposure adjustments are applied at render time only,
 * the underlying image file is never modified. Every property is described
 * by a definition (range + default) so that the UI, restore and renderers
 * all agree on the same bounds.
 */

export type ImageFilterPropDef = {
  min: number;
  max: number;
  step: number;
  default: number;
};

export type ImageFilterProps<T extends ImageFilterType = ImageFilterType> =
  T extends ImageFilterType
    ? Omit<Extract<ImageFilterEntry, { type: T }>, "type">
    : never;

/** prop names across all filters (distributive over the filter types) */
export type ImageFilterPropName<T extends ImageFilterType = ImageFilterType> =
  T extends ImageFilterType ? keyof ImageFilterProps<T> & string : never;

const UNIT_RANGE = { min: 0, max: 1, step: 0.01 } as const;

export const IMAGE_FILTER_DEFS: {
  [T in ImageFilterType]: {
    props: Record<ImageFilterPropName<T>, ImageFilterPropDef>;
  };
} = {
  grayscale: {
    props: {
      intensity: { ...UNIT_RANGE, default: 1 },
    },
  },
  colorShift: {
    props: {
      // fraction of a full hue rotation (0..1 -> 0..360deg)
      hue: { ...UNIT_RANGE, default: 0.5 },
      intensity: { ...UNIT_RANGE, default: 1 },
    },
  },
};

/** order in which filters are listed in the UI and applied when rendering */
export const IMAGE_FILTER_ORDER: readonly ImageFilterType[] = [
  "grayscale",
  "colorShift",
];

// neutral value (0.5) maps to CSS `100%`, the full range to `0%..200%`
export const IMAGE_ADJUSTMENT_DEFS: Record<
  keyof ImageAdjustments,
  ImageFilterPropDef
> = {
  brightness: { ...UNIT_RANGE, default: 0.5 },
  contrast: { ...UNIT_RANGE, default: 0.5 },
  saturation: { ...UNIT_RANGE, default: 0.5 },
};

export const IMAGE_ADJUSTMENT_ORDER: readonly (keyof ImageAdjustments)[] = [
  "brightness",
  "contrast",
  "saturation",
];

export const isImageFilterType = (type: unknown): type is ImageFilterType =>
  typeof type === "string" && IMAGE_FILTER_ORDER.includes(type as any);

/** falls back to the default for invalid values, then clamps to the range */
export const clampImageFilterValue = (
  def: ImageFilterPropDef,
  value: unknown,
): number =>
  typeof value === "number" && Number.isFinite(value)
    ? clamp(value, def.min, def.max)
    : def.default;

const getDefaultProps = <T extends ImageFilterType>(type: T) =>
  Object.fromEntries(
    Object.entries<ImageFilterPropDef>(IMAGE_FILTER_DEFS[type].props).map(
      ([name, def]) => [name, def.default],
    ),
  ) as ImageFilterProps<T>;

export const createImageFilter = <T extends ImageFilterType>(
  type: T,
  props: Partial<Record<string, unknown>> = {},
): Extract<ImageFilterEntry, { type: T }> => {
  const defs: Record<string, ImageFilterPropDef> =
    IMAGE_FILTER_DEFS[type].props;
  const entry: Record<string, unknown> = { type, ...getDefaultProps(type) };
  for (const [name, def] of Object.entries(defs)) {
    if (name in props) {
      entry[name] = clampImageFilterValue(def, props[name]);
    }
  }
  return entry as Extract<ImageFilterEntry, { type: T }>;
};

/**
 * Drops unknown/duplicate filters, sanitizes their values and sorts them into
 * canonical order. Safe to call on untrusted (e.g. restored) data.
 */
export const normalizeImageFilters = (filters: unknown): ImageFilterEntry[] => {
  if (!Array.isArray(filters)) {
    return [];
  }
  const byType = new Map<ImageFilterType, ImageFilterEntry>();
  for (const filter of filters) {
    if (
      filter &&
      typeof filter === "object" &&
      isImageFilterType(filter.type) &&
      !byType.has(filter.type)
    ) {
      byType.set(filter.type, createImageFilter(filter.type, filter));
    }
  }
  return IMAGE_FILTER_ORDER.flatMap((type) => byType.get(type) ?? []);
};

export const getDefaultImageAdjustments = (): ImageAdjustments => ({
  brightness: IMAGE_ADJUSTMENT_DEFS.brightness.default,
  contrast: IMAGE_ADJUSTMENT_DEFS.contrast.default,
  saturation: IMAGE_ADJUSTMENT_DEFS.saturation.default,
});

/** sanitizes adjustments, returning `null` when they're all at defaults */
export const normalizeImageAdjustments = (
  adjustments: unknown,
): ImageAdjustments | null => {
  if (!adjustments || typeof adjustments !== "object") {
    return null;
  }
  const normalized = Object.fromEntries(
    IMAGE_ADJUSTMENT_ORDER.map((name) => [
      name,
      clampImageFilterValue(
        IMAGE_ADJUSTMENT_DEFS[name],
        (adjustments as Record<string, unknown>)[name],
      ),
    ]),
  ) as ImageAdjustments;

  return IMAGE_ADJUSTMENT_ORDER.every(
    (name) => normalized[name] === IMAGE_ADJUSTMENT_DEFS[name].default,
  )
    ? null
    : normalized;
};

// -----------------------------------------------------------------------------
// rendering
// -----------------------------------------------------------------------------

type RGB = [number, number, number];
type Matrix3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** a single render step, as a CSS filter and an equivalent per-pixel op */
type ImageFilterOp = {
  css: string;
  apply: (rgb: RGB) => void;
};

const round = (value: number) => Math.round(value * 100) / 100;

const clampChannel = (value: number) => clamp(value, 0, 255);

const applyMatrix = (m: Matrix3) => (rgb: RGB) => {
  const [r, g, b] = rgb;
  rgb[0] = clampChannel(m[0] * r + m[1] * g + m[2] * b);
  rgb[1] = clampChannel(m[3] * r + m[4] * g + m[5] * b);
  rgb[2] = clampChannel(m[6] * r + m[7] * g + m[8] * b);
};

const applyLinear = (slope: number, intercept: number) => (rgb: RGB) => {
  for (let i = 0; i < 3; i++) {
    rgb[i] = clampChannel(rgb[i] * slope + intercept);
  }
};

// matrices from the W3C Filter Effects spec, matching the CSS filters
const grayscaleMatrix = (amount: number): Matrix3 => {
  const a = 1 - amount;
  return [
    0.2126 + 0.7874 * a,
    0.7152 - 0.7152 * a,
    0.0722 - 0.0722 * a,
    0.2126 - 0.2126 * a,
    0.7152 + 0.2848 * a,
    0.0722 - 0.0722 * a,
    0.2126 - 0.2126 * a,
    0.7152 - 0.7152 * a,
    0.0722 + 0.9278 * a,
  ];
};

const saturateMatrix = (s: number): Matrix3 => [
  0.213 + 0.787 * s,
  0.715 - 0.715 * s,
  0.072 - 0.072 * s,
  0.213 - 0.213 * s,
  0.715 + 0.285 * s,
  0.072 - 0.072 * s,
  0.213 - 0.213 * s,
  0.715 - 0.715 * s,
  0.072 + 0.928 * s,
];

const hueRotateMatrix = (degrees: number): Matrix3 => {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    0.213 + cos * 0.787 - sin * 0.213,
    0.715 - cos * 0.715 - sin * 0.715,
    0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143,
    0.715 + cos * 0.285 + sin * 0.14,
    0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787,
    0.715 - cos * 0.715 + sin * 0.715,
    0.072 + cos * 0.928 + sin * 0.072,
  ];
};

const sepiaMatrix = (amount: number): Matrix3 => {
  const a = 1 - amount;
  return [
    0.393 + 0.607 * a,
    0.769 - 0.769 * a,
    0.189 - 0.189 * a,
    0.349 - 0.349 * a,
    0.686 + 0.314 * a,
    0.168 - 0.168 * a,
    0.272 - 0.272 * a,
    0.534 - 0.534 * a,
    0.131 + 0.869 * a,
  ];
};

/** approximate hue (deg) that `sepia()` tints gray pixels toward */
const SEPIA_HUE = 38;

const hueRotateOp = (degrees: number): ImageFilterOp => ({
  css: `hue-rotate(${degrees}deg)`,
  apply: applyMatrix(hueRotateMatrix(degrees)),
});

/**
 * @param isOverGrayscale whether a grayscale filter was applied before, in
 * which case hue rotation alone would have no visible effect, so the color
 * shift tints the gray image toward the target hue instead
 */
const getFilterOps = (
  filter: ImageFilterEntry,
  isOverGrayscale: boolean,
): ImageFilterOp[] => {
  switch (filter.type) {
    case "grayscale": {
      const amount = round(filter.intensity);
      return amount > 0
        ? [
            {
              css: `grayscale(${round(amount * 100)}%)`,
              apply: applyMatrix(grayscaleMatrix(amount)),
            },
          ]
        : [];
    }
    case "colorShift": {
      if (isOverGrayscale) {
        const amount = round(filter.intensity);
        if (amount <= 0) {
          return [];
        }
        const saturation = round(1 + 2 * amount);
        return [
          {
            css: `sepia(${round(amount * 100)}%)`,
            apply: applyMatrix(sepiaMatrix(amount)),
          },
          hueRotateOp(round((filter.hue * 360 - SEPIA_HUE + 360) % 360)),
          {
            css: `saturate(${round(saturation * 100)}%)`,
            apply: applyMatrix(saturateMatrix(saturation)),
          },
        ];
      }
      const degrees = round(filter.hue * filter.intensity * 360);
      return degrees % 360 !== 0 ? [hueRotateOp(degrees)] : [];
    }
  }
  return [];
};

const getAdjustmentOps = (adjustments: ImageAdjustments): ImageFilterOp[] => {
  const ops: ImageFilterOp[] = [];
  const toFactor = (name: keyof ImageAdjustments) =>
    round(
      clampImageFilterValue(IMAGE_ADJUSTMENT_DEFS[name], adjustments[name]) * 2,
    );

  const brightness = toFactor("brightness");
  if (brightness !== 1) {
    ops.push({
      css: `brightness(${round(brightness * 100)}%)`,
      apply: applyLinear(brightness, 0),
    });
  }
  const contrast = toFactor("contrast");
  if (contrast !== 1) {
    ops.push({
      css: `contrast(${round(contrast * 100)}%)`,
      apply: applyLinear(contrast, 255 * (0.5 - 0.5 * contrast)),
    });
  }
  const saturation = toFactor("saturation");
  if (saturation !== 1) {
    ops.push({
      css: `saturate(${round(saturation * 100)}%)`,
      apply: applyMatrix(saturateMatrix(saturation)),
    });
  }
  return ops;
};

const getImageFilterOps = (
  element: Pick<ExcalidrawImageElement, "filters" | "adjustments">,
): ImageFilterOp[] => {
  const ops: ImageFilterOp[] = [];
  let isOverGrayscale = false;
  // grayscale is the base layer, every following filter applies on top of it
  for (const filter of normalizeImageFilters(element.filters)) {
    const filterOps = getFilterOps(filter, isOverGrayscale);
    if (filter.type === "grayscale" && filterOps.length) {
      isOverGrayscale = true;
    }
    ops.push(...filterOps);
  }
  if (element.adjustments) {
    ops.push(...getAdjustmentOps(element.adjustments));
  }
  return ops;
};

/**
 * CSS filter functions (in application order) for the element's filters and
 * adjustments. Empty when the image renders with its original appearance.
 */
export const getImageFilterCSS = (
  element: Pick<ExcalidrawImageElement, "filters" | "adjustments">,
): string[] => getImageFilterOps(element).map((op) => op.css);

export const hasImageFilters = (
  element: Pick<ExcalidrawImageElement, "filters" | "adjustments">,
) => getImageFilterOps(element).length > 0;

/**
 * Applies the element's filters to RGBA pixel data in place, for browsers
 * without canvas `filter` support (Safari).
 */
export const applyImageFiltersToPixels = (
  data: Uint8ClampedArray,
  element: Pick<ExcalidrawImageElement, "filters" | "adjustments">,
) => {
  const ops = getImageFilterOps(element);
  if (!ops.length) {
    return;
  }
  const rgb: RGB = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    rgb[0] = data[i];
    rgb[1] = data[i + 1];
    rgb[2] = data[i + 2];
    for (const op of ops) {
      op.apply(rgb);
    }
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
  }
};
