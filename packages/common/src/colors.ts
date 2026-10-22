import tinycolor from "tinycolor2";

import { clamp } from "@excalidraw/math";
import { degreesToRadians } from "@excalidraw/math";

import type { Degrees } from "@excalidraw/math";

// ---------------------------------------------------------------------------
// Dark mode color transformation
// ---------------------------------------------------------------------------

// Browser-only cache to avoid memory leaks on server
const DARK_MODE_COLORS_CACHE: Map<string, string> | null =
  typeof window !== "undefined" ? new Map() : null;

function cssHueRotate(
  red: number,
  green: number,
  blue: number,
  degrees: Degrees,
): { r: number; g: number; b: number } {
  // normalize
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;

  // Convert degrees to radians
  const a = degreesToRadians(degrees);

  const c = Math.cos(a);
  const s = Math.sin(a);

  // rotation matrix
  const matrix = [
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072,
  ];

  // transform
  const newR = r * matrix[0] + g * matrix[1] + b * matrix[2];
  const newG = r * matrix[3] + g * matrix[4] + b * matrix[5];
  const newB = r * matrix[6] + g * matrix[7] + b * matrix[8];

  // clamp the values to [0, 1] range and convert back to [0, 255]
  return {
    r: Math.round(Math.max(0, Math.min(1, newR)) * 255),
    g: Math.round(Math.max(0, Math.min(1, newG)) * 255),
    b: Math.round(Math.max(0, Math.min(1, newB)) * 255),
  };
}

const cssInvert = (
  r: number,
  g: number,
  b: number,
  percent: number,
): { r: number; g: number; b: number } => {
  const p = clamp(percent, 0, 100) / 100;

  // Function to invert a single color component
  const invertComponent = (color: number): number => {
    // Apply the invert formula
    const inverted = color * (1 - p) + (255 - color) * p;
    // Round to the nearest integer and clamp to [0, 255]
    return Math.round(clamp(inverted, 0, 255));
  };

  // Calculate the inverted RGB components
  const invertedR = invertComponent(r);
  const invertedG = invertComponent(g);
  const invertedB = invertComponent(b);

  return { r: invertedR, g: invertedG, b: invertedB };
};

export const applyDarkModeFilter = (color: string, enable = true): string => {
  if (!enable) {
    return color;
  }

  const cached = DARK_MODE_COLORS_CACHE?.get(color);
  if (cached) {
    return cached;
  }

  const tc = tinycolor(color);
  const alpha = tc.getAlpha();

  // order of operations matters
  // (corresponds to "filter: invert(invertPercent) hue-rotate(hueDegrees)" in css)
  const rgb = tc.toRgb();
  const inverted = cssInvert(rgb.r, rgb.g, rgb.b, 93);
  const rotated = cssHueRotate(
    inverted.r,
    inverted.g,
    inverted.b,
    180 as Degrees,
  );

  const result = rgbToHex(rotated.r, rotated.g, rotated.b, alpha);

  if (DARK_MODE_COLORS_CACHE) {
    DARK_MODE_COLORS_CACHE.set(color, result);
  }

  return result;
};

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

// FIXME can't put to utils.ts rn because of circular dependency
const pick = <R extends Record<string, any>, K extends readonly (keyof R)[]>(
  source: R,
  keys: K,
) => {
  return keys.reduce((acc, key: K[number]) => {
    if (key in source) {
      acc[key] = source[key];
    }
    return acc;
  }, {} as Pick<R, K[number]>) as Pick<R, K[number]>;
};

export type ColorTuple = readonly [string, string, string, string, string];

// used general type instead of specific type (ColorPalette) to support custom colors
export type ColorPaletteCustom = { [key: string]: ColorTuple | string };
export type ColorShadesIndexes = [number, number, number, number, number];

export const MAX_CUSTOM_COLORS_USED_IN_CANVAS = 5;
export const COLORS_PER_ROW = 5;

export const DEFAULT_CHART_COLOR_INDEX = 4;

export const DEFAULT_ELEMENT_STROKE_COLOR_INDEX = 4;
export const DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX = 1;

export const COLOR_PALETTE = {
  transparent: "transparent",
  black: "#1e1e1e",
  white: "#ffffff",
  // open-color from https://github.com/yeun/open-color/blob/master/open-color.js
  // corresponds to indexes [0,2,4,6,8] (weights: 50, 200, 400, 600, 800)
  gray: ["#f8f9fa", "#e9ecef", "#ced4da", "#868e96", "#343a40"],
  red: ["#fff5f5", "#ffc9c9", "#ff8787", "#fa5252", "#e03131"],
  pink: ["#fff0f6", "#fcc2d7", "#f783ac", "#e64980", "#c2255c"],
  grape: ["#f8f0fc", "#eebefa", "#da77f2", "#be4bdb", "#9c36b5"],
  violet: ["#f3f0ff", "#d0bfff", "#9775fa", "#7950f2", "#6741d9"],
  blue: ["#e7f5ff", "#a5d8ff", "#4dabf7", "#228be6", "#1971c2"],
  cyan: ["#e3fafc", "#99e9f2", "#3bc9db", "#15aabf", "#0c8599"],
  teal: ["#e6fcf5", "#96f2d7", "#38d9a9", "#12b886", "#099268"],
  green: ["#ebfbee", "#b2f2bb", "#69db7c", "#40c057", "#2f9e44"],
  yellow: ["#fff9db", "#ffec99", "#ffd43b", "#fab005", "#f08c00"],
  orange: ["#fff4e6", "#ffd8a8", "#ffa94d", "#fd7e14", "#e8590c"],
  // radix bronze shades [3,5,7,9,11]
  bronze: ["#f8f1ee", "#eaddd7", "#d2bab0", "#a18072", "#846358"],
} as const;

export type ColorPalette = typeof COLOR_PALETTE;
export type ColorPickerColor = keyof typeof COLOR_PALETTE;

const COMMON_ELEMENT_SHADES = pick(COLOR_PALETTE, [
  "cyan",
  "blue",
  "violet",
  "grape",
  "pink",
  "green",
  "teal",
  "yellow",
  "orange",
  "red",
]);

// quick picks defaults
// -----------------------------------------------------------------------------

// ORDER matters for positioning in quick picker
export const DEFAULT_ELEMENT_STROKE_PICKS = [
  COLOR_PALETTE.black,
  COLOR_PALETTE.red[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.green[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.blue[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.yellow[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
] as ColorTuple;

// ORDER matters for positioning in quick picker
export const DEFAULT_ELEMENT_BACKGROUND_PICKS = [
  COLOR_PALETTE.transparent,
  COLOR_PALETTE.red[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
  COLOR_PALETTE.green[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
  COLOR_PALETTE.blue[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
  COLOR_PALETTE.yellow[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
] as ColorTuple;

// ORDER matters for positioning in quick picker
export const DEFAULT_CANVAS_BACKGROUND_PICKS = [
  COLOR_PALETTE.white,
  // radix slate2
  "#f8f9fa",
  // radix blue2
  "#f5faff",
  // radix yellow2
  "#fffce8",
  // radix bronze2
  "#fdf8f6",
] as ColorTuple;

// palette defaults
// -----------------------------------------------------------------------------

export const DEFAULT_ELEMENT_STROKE_COLOR_PALETTE = {
  // 1st row
  transparent: COLOR_PALETTE.transparent,
  white: COLOR_PALETTE.white,
  gray: COLOR_PALETTE.gray,
  black: COLOR_PALETTE.black,
  bronze: COLOR_PALETTE.bronze,
  // rest
  ...COMMON_ELEMENT_SHADES,
} as const;

// ORDER matters for positioning in pallete (5x3 grid)s
export const DEFAULT_ELEMENT_BACKGROUND_COLOR_PALETTE = {
  transparent: COLOR_PALETTE.transparent,
  white: COLOR_PALETTE.white,
  gray: COLOR_PALETTE.gray,
  black: COLOR_PALETTE.black,
  bronze: COLOR_PALETTE.bronze,

  ...COMMON_ELEMENT_SHADES,
} as const;

// color palette helpers
// -----------------------------------------------------------------------------

// !!!MUST BE WITHOUT GRAY, TRANSPARENT AND BLACK!!!
export const getAllColorsSpecificShade = (index: 0 | 1 | 2 | 3 | 4) => [
  // 2nd row
  COLOR_PALETTE.cyan[index],
  COLOR_PALETTE.blue[index],
  COLOR_PALETTE.violet[index],
  COLOR_PALETTE.grape[index],
  COLOR_PALETTE.pink[index],

  // 3rd row
  COLOR_PALETTE.green[index],
  COLOR_PALETTE.teal[index],
  COLOR_PALETTE.yellow[index],
  COLOR_PALETTE.orange[index],
  COLOR_PALETTE.red[index],
];

// -----------------------------------------------------------------------------
// other helpers
// -----------------------------------------------------------------------------

export const rgbToHex = (r: number, g: number, b: number, a?: number) => {
  // (1 << 24) adds 0x1000000 to ensure the hex string is always 7 chars,
  // then slice(1) removes the leading "1" to get exactly 6 hex digits
  // e.g. rgb(0,0,0) -> 0x1000000 -> "1000000" -> "000000"
  const hex6 = `#${((1 << 24) + (r << 16) + (g << 8) + b)
    .toString(16)
    .slice(1)}`;
  if (a !== undefined && a < 1) {
    // convert alpha from 0-1 float to 0-255 int, then to 2-digit hex
    // e.g. 0.5 -> 128 -> "80"
    const alphaHex = Math.round(a * 255)
      .toString(16)
      .padStart(2, "0");
    return `${hex6}${alphaHex}`;
  }
  return hex6;
};

/**
 * @returns #RRGGBB or #RRGGBBAA based on color containing non-opaque alpha,
 *  null if not valid color
 */
export const colorToHex = (color: string): string | null => {
  const tc = tinycolor(color);
  if (!tc.isValid()) {
    return null;
  }
  const { r, g, b, a } = tc.toRgb();
  return rgbToHex(r, g, b, a);
};

export const isTransparent = (color: string) => {
  return tinycolor(color).getAlpha() === 0;
};

// -----------------------------------------------------------------------------
// OKLCH helpers (https://bottosson.github.io/posts/oklab/)
// -----------------------------------------------------------------------------

export type Oklch = { l: number; c: number; h: number };

/** max chroma shown on gradient color wheel (roughly sRGB gamut boundary) */
export const OKLCH_MAX_CHROMA = 0.37;

const OKLCH_GAMUT_EPSILON = 0.0001;

const srgbToLinear = (value: number) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

const linearToSrgb = (value: number) =>
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

const oklchToLinearRgb = ({ l, c, h }: Oklch): [number, number, number] => {
  const hueRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hueRad);
  const b = c * Math.sin(hueRad);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
};

const isInSrgbGamut = (rgb: [number, number, number]) =>
  rgb.every(
    (value) =>
      value >= -OKLCH_GAMUT_EPSILON && value <= 1 + OKLCH_GAMUT_EPSILON,
  );

/** @returns OKLCH (l 0-1, c 0-~0.37, h 0-360) or null if invalid color */
export const colorToOklch = (color: string): Oklch | null => {
  const tc = tinycolor(color);
  if (!tc.isValid()) {
    return null;
  }
  const { r, g, b } = tc.toRgb();
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);

  const l_ = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m_ = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s_ = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );

  const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.hypot(a, bb);
  // achromatic colors have no meaningful hue
  const h = c < OKLCH_GAMUT_EPSILON ? 0 : (Math.atan2(bb, a) * 180) / Math.PI;

  return { l, c, h: (h + 360) % 360 };
};

/**
 * Converts OKLCH to #RRGGBB. Out-of-gamut colors are mapped into sRGB by
 * reducing chroma while keeping lightness and hue.
 */
export const oklchToHex = (oklch: Oklch): string => {
  const l = Math.min(1, Math.max(0, oklch.l));
  const c = Math.max(0, oklch.c);
  let rgb = oklchToLinearRgb({ l, c, h: oklch.h });

  if (!isInSrgbGamut(rgb)) {
    rgb = oklchToLinearRgb({
      l,
      c: getMaxSrgbChroma(l, oklch.h, c),
      h: oklch.h,
    });
  }

  const [r, g, b] = rgb.map((value) =>
    Math.round(Math.min(1, Math.max(0, linearToSrgb(value))) * 255),
  );
  return rgbToHex(r, g, b);
};

/** highest chroma (up to `upper`) that is still in sRGB at given l and h */
const getMaxSrgbChroma = (l: number, h: number, upper = OKLCH_MAX_CHROMA) => {
  let low = 0;
  let high = upper;
  for (let i = 0; i < 16; i++) {
    const c = (low + high) / 2;
    if (isInSrgbGamut(oklchToLinearRgb({ l, c, h }))) {
      low = c;
    } else {
      high = c;
    }
  }
  return low;
};

const oklchCuspCache = new Map<number, { l: number; c: number }>();

/**
 * The most saturated color sRGB can show for a hue. The sRGB gamut's upper
 * edge runs (roughly straight) from white down to this cusp.
 */
export const getOklchCusp = (hue: number): { l: number; c: number } => {
  const key = Math.round((((hue % 360) + 360) % 360) * 2) / 2;
  const cached = oklchCuspCache.get(key);
  if (cached) {
    return cached;
  }
  // max chroma is unimodal in lightness, so ternary search for its peak
  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i++) {
    const l1 = low + (high - low) / 3;
    const l2 = high - (high - low) / 3;
    if (getMaxSrgbChroma(l1, key) < getMaxSrgbChroma(l2, key)) {
      low = l1;
    } else {
      high = l2;
    }
  }
  const l = (low + high) / 2;
  const cusp = { l, c: getMaxSrgbChroma(l, key) };
  oklchCuspCache.set(key, cusp);
  return cusp;
};

// -----------------------------------------------------------------------------
// color contract helpers
// -----------------------------------------------------------------------------

export const COLOR_OUTLINE_CONTRAST_THRESHOLD = 240;

const calculateContrast = (r: number, g: number, b: number): number => {
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq;
};

// YIQ algo, inspiration from https://stackoverflow.com/a/11868398
export const isColorDark = (color: string, threshold = 160): boolean => {
  // no color ("") -> assume it default to black
  if (!color) {
    return true;
  }

  if (isTransparent(color)) {
    return false;
  }

  const tc = tinycolor(color);
  if (!tc.isValid()) {
    // invalid color -> assume it defaults to black
    return true;
  }

  const { r, g, b } = tc.toRgb();
  return calculateContrast(r, g, b) < threshold;
};

// -----------------------------------------------------------------------------
// normalization
// -----------------------------------------------------------------------------

/**
 * tries to keep the input color as-is if it's valid, making minimal adjustments
 * (trimming whitespace or adding `#` to hex colors)
 */
export const normalizeInputColor = (color: string): string | null => {
  color = color.trim();
  if (isTransparent(color)) {
    return color;
  }

  const tc = tinycolor(color);
  if (tc.isValid()) {
    // testing for `#` first fixes a bug on Electron (more specfically, an
    // Obsidian popout window), where a hex color without `#` is considered valid
    if (["hex", "hex8"].includes(tc.getFormat()) && !color.startsWith("#")) {
      return `#${color}`;
    }
    return color;
  }

  return null;
};
