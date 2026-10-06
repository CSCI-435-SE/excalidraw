import type { TextHyperlink } from "./types";

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
