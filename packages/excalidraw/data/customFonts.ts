import {
  CUSTOM_FONT_FAMILY_ID_START,
  CUSTOM_FONT_MIME_TYPES,
} from "@excalidraw/common";

import type { ValueOf } from "@excalidraw/common/utility-types";

import { blobToArrayBuffer, getDataURL, getNameWithoutExtension } from "./blob";

import type { CustomFontData } from "../types";

/** Largest font file users can upload (#140). */
export const CUSTOM_FONT_MAX_SIZE_BYTES = 5 * 1024 * 1024;

/** Name used when the file name is empty after stripping the extension. */
export const CUSTOM_FONT_DEFAULT_NAME = "Custom font";

// first 4 bytes of every WOFF / WOFF2 file
// https://www.w3.org/TR/WOFF/#WOFFHeader, https://www.w3.org/TR/WOFF2/#woff20Header
const WOFF_SIGNATURE = 0x774f4646; // "wOFF"
const WOFF2_SIGNATURE = 0x774f4632; // "wOF2"

export type CustomFontErrorCode =
  | "tooLarge"
  | "unsupportedType"
  | "invalidFont";

export class CustomFontError extends Error {
  public readonly code: CustomFontErrorCode;

  constructor(code: CustomFontErrorCode, message: string) {
    super(message);
    this.name = "CustomFontError";
    this.code = code;
  }
}

/**
 * Font data read from an uploaded file, before the user has named it and
 * acknowledged its license in the upload dialog.
 */
export type CustomFontCandidate = Omit<CustomFontData, "licenseAcknowledged">;

/**
 * Detects WOFF / WOFF2 from the file's signature rather than its extension or
 * reported MIME type, which browsers fill in inconsistently for fonts.
 */
export const detectCustomFontMimeType = (
  bytes: Uint8Array,
): ValueOf<typeof CUSTOM_FONT_MIME_TYPES> | null => {
  if (bytes.length < 4) {
    return null;
  }

  const signature = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(0);

  switch (signature) {
    case WOFF_SIGNATURE:
      return CUSTOM_FONT_MIME_TYPES.woff;
    case WOFF2_SIGNATURE:
      return CUSTOM_FONT_MIME_TYPES.woff2;
    default:
      return null;
  }
};

/**
 * Derives the `fontFamily` id from the font's bytes (djb2 hash, unsigned
 * 32-bit), so the same font gets the same id in every scene.
 */
export const getCustomFontFamilyId = (bytes: Uint8Array): number => {
  let hash = 5381;
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash << 5) + hash + bytes[i]) | 0;
  }
  return CUSTOM_FONT_FAMILY_ID_START + (hash >>> 0);
};

/**
 * Reads and validates an uploaded font file.
 *
 * @throws {CustomFontError} `tooLarge` above {@link CUSTOM_FONT_MAX_SIZE_BYTES},
 * `unsupportedType` when it isn't WOFF/WOFF2, `invalidFont` when the browser
 * can't load it.
 */
export const loadCustomFontFile = async (
  file: File,
): Promise<CustomFontCandidate> => {
  if (file.size > CUSTOM_FONT_MAX_SIZE_BYTES) {
    throw new CustomFontError(
      "tooLarge",
      `Font file is ${file.size} bytes, the limit is ${CUSTOM_FONT_MAX_SIZE_BYTES}`,
    );
  }

  const bytes = new Uint8Array(await blobToArrayBuffer(file));

  const mimeType = detectCustomFontMimeType(bytes);
  if (!mimeType) {
    throw new CustomFontError(
      "unsupportedType",
      "Only WOFF and WOFF2 font files are supported",
    );
  }

  try {
    // let the browser parse it, so corrupt files are rejected up front
    await new FontFace("excalidraw-custom-font-validation", bytes).load();
  } catch (error) {
    throw new CustomFontError(
      "invalidFont",
      `Font file couldn't be loaded: ${error}`,
    );
  }

  return {
    id: getCustomFontFamilyId(bytes),
    name: getNameWithoutExtension(file.name).trim() || CUSTOM_FONT_DEFAULT_NAME,
    mimeType,
    // built from the detected type, as `file.type` is often empty for fonts
    dataURL: await getDataURL(new Blob([bytes], { type: mimeType })),
    created: Date.now(),
  };
};
