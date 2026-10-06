import { COLOR_PALETTE, getFontString } from "@excalidraw/common";

import { pointFrom, pointRotateRads } from "@excalidraw/math";

import type { GlobalPoint, Radians } from "@excalidraw/math";

import { getElementAbsoluteCoords } from "./bounds";
import { getContainerElement, getTextElementAngle } from "./textElement";
import { getLineHeightInPx, getLineWidth } from "./textMeasurements";

import type {
  ElementsMap,
  ExcalidrawTextElement,
  TextHyperlink,
} from "./types";

export const TEXT_HYPERLINK_COLOR = COLOR_PALETTE.blue[4];

export const getTextHyperlinkColor = (
  hyperlink: TextHyperlink,
  element: ExcalidrawTextElement,
) =>
  hyperlink.color === "inherit" ? element.strokeColor : TEXT_HYPERLINK_COLOR;

type TextChange = {
  /** offset in both texts at which the change starts */
  start: number;
  removedLength: number;
  inserted: string;
};

const isWhitespace = (char: string | undefined) => !!char && /\s/.test(char);

/** maps an offset in the old text to the new text after removing a range */
const shiftForRemoval = (
  offset: number,
  start: number,
  removedLength: number,
) => (offset <= start ? offset : Math.max(start, offset - removedLength));

/**
 * Finds the single contiguous change (removal + insertion) between two texts.
 *
 * Diffing alone is ambiguous when the edited characters match their
 * neighbours (e.g. typing "a" next to another "a"), so the caret position
 * after the edit, if supplied, is used to anchor the change.
 */
export const getTextChange = (
  oldText: string,
  newText: string,
  caret?: number,
): TextChange | null => {
  if (oldText === newText) {
    return null;
  }

  const minLength = Math.min(oldText.length, newText.length);

  let maxPrefix = minLength;
  if (caret !== undefined) {
    const insertedLength = Math.max(0, newText.length - oldText.length);
    maxPrefix = Math.min(maxPrefix, Math.max(0, caret - insertedLength));
  }

  let prefix = 0;
  while (prefix < maxPrefix && oldText[prefix] === newText[prefix]) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < minLength - prefix &&
    oldText[oldText.length - 1 - suffix] ===
      newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }

  return {
    start: prefix,
    removedLength: oldText.length - prefix - suffix,
    inserted: newText.slice(prefix, newText.length - suffix),
  };
};

/**
 * Updates hyperlink ranges after the text was edited.
 *
 * - removed characters shrink the hyperlinks they belonged to, and
 *   hyperlinks that end up empty are dropped
 * - text inserted inside a hyperlink extends it
 * - text inserted at a hyperlink's edge extends it unless the character
 *   touching the hyperlink is whitespace
 * - when inserting between two adjacent hyperlinks, the left one wins
 * - hyperlinks after the change are shifted
 */
export const updateTextHyperlinks = (
  oldText: string,
  newText: string,
  textHyperlinks: readonly TextHyperlink[],
  caret?: number,
): readonly TextHyperlink[] => {
  if (!textHyperlinks.length) {
    return textHyperlinks;
  }

  const change = getTextChange(oldText, newText, caret);
  if (!change) {
    return textHyperlinks;
  }

  const { start: at, removedLength, inserted } = change;

  const shrunk = textHyperlinks
    .map((link) => ({
      ...link,
      start: shiftForRemoval(link.start, at, removedLength),
      end: shiftForRemoval(link.end, at, removedLength),
    }))
    .filter((link) => link.end > link.start);

  if (!inserted) {
    return shrunk;
  }

  const insertedLength = inserted.length;
  const extendsAtEnd = !isWhitespace(inserted[0]);
  const extendsAtStart = !isWhitespace(inserted[insertedLength - 1]);
  const leftHyperlinkExtends =
    extendsAtEnd && shrunk.some((link) => link.end === at);

  return shrunk.map((link) => {
    if (link.start < at && at < link.end) {
      return { ...link, end: link.end + insertedLength };
    }
    if (link.end === at && extendsAtEnd) {
      return { ...link, end: link.end + insertedLength };
    }
    if (link.start === at && extendsAtStart && !leftHyperlinkExtends) {
      return { ...link, end: link.end + insertedLength };
    }
    if (link.start >= at) {
      return {
        ...link,
        start: link.start + insertedLength,
        end: link.end + insertedLength,
      };
    }
    return link;
  });
};

/**
 * Replaces the selection with `displayText` and turns it into a hyperlink.
 *
 * Unlike regular typing, adjacent hyperlinks never extend over the inserted
 * text, and a hyperlink the selection is inside of is split around it.
 */
export const insertTextHyperlink = ({
  text,
  textHyperlinks,
  selectionStart,
  selectionEnd,
  displayText,
  url,
  color,
}: {
  text: string;
  textHyperlinks: readonly TextHyperlink[];
  selectionStart: number;
  selectionEnd: number;
  displayText: string;
  url: string;
  color: TextHyperlink["color"];
}): { text: string; textHyperlinks: TextHyperlink[] } => {
  const at = selectionStart;
  const removedLength = selectionEnd - selectionStart;
  const insertedLength = displayText.length;

  const nextHyperlinks: TextHyperlink[] = [];

  for (const link of textHyperlinks) {
    const start = shiftForRemoval(link.start, at, removedLength);
    const end = shiftForRemoval(link.end, at, removedLength);

    if (end <= start) {
      continue;
    }

    if (end <= at) {
      nextHyperlinks.push({ ...link, start, end });
    } else if (start >= at) {
      nextHyperlinks.push({
        ...link,
        start: start + insertedLength,
        end: end + insertedLength,
      });
    } else {
      nextHyperlinks.push({ ...link, start, end: at });
      nextHyperlinks.push({
        ...link,
        start: at + insertedLength,
        end: end + insertedLength,
      });
    }
  }

  if (insertedLength) {
    nextHyperlinks.push({ start: at, end: at + insertedLength, url, color });
  }

  nextHyperlinks.sort((a, b) => a.start - b.start);

  return {
    text:
      text.slice(0, selectionStart) + displayText + text.slice(selectionEnd),
    textHyperlinks: nextHyperlinks,
  };
};

/** a run of text on a single rendered line, either plain or hyperlinked */
export type TextHyperlinkSegment = {
  text: string;
  /** x offset from the text element's left edge */
  x: number;
  width: number;
  hyperlink: TextHyperlink | null;
};

/**
 * Finds the offset of each rendered (wrapped) line in `originalText`.
 *
 * Wrapping only inserts line breaks and trims whitespace at wrap boundaries,
 * so each rendered line is a slice of the original text, in order.
 */
const getRenderedLineOffsets = (
  lines: readonly string[],
  originalText: string,
) => {
  const offsets: number[] = [];
  let cursor = 0;

  for (const line of lines) {
    const offset = originalText.indexOf(line, cursor);
    if (offset === -1) {
      return null;
    }
    offsets.push(offset);
    cursor = offset + line.length;
  }

  return offsets;
};

/**
 * Splits each rendered line of a text element into plain and hyperlinked
 * segments, positioned according to the element's text alignment.
 *
 * Returns `null` if the element has no hyperlinks, or if its rendered text
 * can't be mapped back to `originalText` (in which case hyperlinks are not
 * rendered rather than rendered in the wrong place).
 */
export const getTextHyperlinkLineSegments = (
  element: ExcalidrawTextElement,
): TextHyperlinkSegment[][] | null => {
  if (!element.textHyperlinks?.length) {
    return null;
  }

  const lines = element.text.replace(/\r\n?/g, "\n").split("\n");
  const offsets = getRenderedLineOffsets(lines, element.originalText);
  if (!offsets) {
    return null;
  }

  const font = getFontString(element);
  const hyperlinks = [...element.textHyperlinks].sort(
    (a, b) => a.start - b.start,
  );

  return lines.map((line, index) => {
    const lineStart = offsets[index];
    const lineEnd = lineStart + line.length;
    const lineWidth = getLineWidth(line, font);
    const lineX =
      element.textAlign === "center"
        ? (element.width - lineWidth) / 2
        : element.textAlign === "right"
        ? element.width - lineWidth
        : 0;

    const getX = (offset: number) =>
      lineX + (offset > 0 ? getLineWidth(line.slice(0, offset), font) : 0);

    const segments: TextHyperlinkSegment[] = [];
    const pushSegment = (
      start: number,
      end: number,
      hyperlink: TextHyperlink | null,
    ) => {
      const x = getX(start);
      segments.push({
        text: line.slice(start, end),
        x,
        width: getX(end) - x,
        hyperlink,
      });
    };

    let cursor = 0;
    for (const hyperlink of hyperlinks) {
      const start = Math.max(hyperlink.start, lineStart) - lineStart;
      const end = Math.min(hyperlink.end, lineEnd) - lineStart;
      if (end <= start || start < cursor) {
        continue;
      }
      if (start > cursor) {
        pushSegment(cursor, start, null);
      }
      pushSegment(start, end, hyperlink);
      cursor = end;
    }
    if (cursor < line.length || !segments.length) {
      pushSegment(cursor, line.length, null);
    }

    return segments;
  });
};

/**
 * Returns the hyperlink rendered under the given scene point, if any.
 */
export const getTextHyperlinkAtPoint = (
  element: ExcalidrawTextElement,
  point: GlobalPoint,
  elementsMap: ElementsMap,
): TextHyperlink | null => {
  const lineSegments = getTextHyperlinkLineSegments(element);
  if (!lineSegments) {
    return null;
  }

  const [x1, y1, , , cx, cy] = getElementAbsoluteCoords(element, elementsMap);
  const angle = getTextElementAngle(
    element,
    getContainerElement(element, elementsMap),
  );

  // undo the element's rotation so we can work in its local coordinates
  const [x, y] = pointRotateRads(
    point,
    pointFrom<GlobalPoint>(cx, cy),
    -angle as Radians,
  );
  const localX = x - x1;
  const localY = y - y1;

  const lineHeightPx = getLineHeightInPx(element.fontSize, element.lineHeight);
  const segments = lineSegments[Math.floor(localY / lineHeightPx)];
  if (!segments) {
    return null;
  }

  return (
    segments.find(
      (segment) =>
        segment.hyperlink &&
        localX >= segment.x &&
        localX <= segment.x + segment.width,
    )?.hyperlink ?? null
  );
};
