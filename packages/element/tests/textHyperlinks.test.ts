import { getFontString } from "@excalidraw/common";

import { newTextElement } from "../src/newElement";
import {
  getTextChange,
  getTextHyperlinkLineSegments,
  insertTextHyperlink,
  updateTextHyperlinks,
} from "../src/textHyperlinks";
import { getLineWidth } from "../src/textMeasurements";

import type { ExcalidrawTextElement, TextHyperlink } from "../src/types";

const link = (
  start: number,
  end: number,
  url = "https://excalidraw.com",
): TextHyperlink => ({ start, end, url, color: "link" });

/** returns the substrings covered by each hyperlink */
const linkedText = (text: string, links: readonly TextHyperlink[]) =>
  links.map((link) => text.slice(link.start, link.end));

/** simulates typing `inserted` at `at`, replacing `removedLength` chars */
const edit = (
  text: string,
  links: readonly TextHyperlink[],
  at: number,
  inserted: string,
  removedLength = 0,
) => {
  const nextText =
    text.slice(0, at) + inserted + text.slice(at + removedLength);
  const nextLinks = updateTextHyperlinks(
    text,
    nextText,
    links,
    at + inserted.length,
  );
  return { text: nextText, links: nextLinks };
};

describe("getTextChange", () => {
  it("returns null for identical texts", () => {
    expect(getTextChange("abc", "abc")).toBe(null);
  });

  it("detects an insertion", () => {
    expect(getTextChange("abc", "abXc")).toEqual({
      start: 2,
      removedLength: 0,
      inserted: "X",
    });
  });

  it("detects a removal", () => {
    expect(getTextChange("abcd", "ad")).toEqual({
      start: 1,
      removedLength: 2,
      inserted: "",
    });
  });

  it("detects a replacement", () => {
    expect(getTextChange("abcd", "aXYd")).toEqual({
      start: 1,
      removedLength: 2,
      inserted: "XY",
    });
  });

  it("uses the caret to resolve ambiguous insertions", () => {
    // typing "a" at index 1 of "aa" — without the caret the diff would
    // place the insertion at the end
    expect(getTextChange("aa", "aaa", 2)).toEqual({
      start: 1,
      removedLength: 0,
      inserted: "a",
    });
  });
});

describe("updateTextHyperlinks", () => {
  // "visit Google today"
  //        ^-----^ hyperlink [6, 12)
  const text = "visit Google today";
  const links = [link(6, 12)];

  it("returns the same hyperlinks when there are none", () => {
    const empty: TextHyperlink[] = [];
    expect(updateTextHyperlinks("a", "ab", empty)).toBe(empty);
  });

  it("extends the hyperlink when typing inside it", () => {
    const res = edit(text, links, 8, "X");
    expect(linkedText(res.text, res.links)).toEqual(["GoXogle"]);
  });

  it("extends the hyperlink when typing a space inside it", () => {
    const res = edit(text, links, 8, " ");
    expect(linkedText(res.text, res.links)).toEqual(["Go ogle"]);
  });

  it("extends the hyperlink when pasting a block of text inside it", () => {
    const res = edit(text, links, 8, "foo bar");
    expect(linkedText(res.text, res.links)).toEqual(["Gofoo barogle"]);
  });

  it("extends the hyperlink when typing a non-space at its end", () => {
    const res = edit(text, links, 12, "s");
    expect(linkedText(res.text, res.links)).toEqual(["Googles"]);
  });

  it("extends the hyperlink when typing a non-space at its start", () => {
    const res = edit(text, links, 6, "@");
    expect(linkedText(res.text, res.links)).toEqual(["@Google"]);
  });

  it("does not extend the hyperlink when typing a space at its end", () => {
    const res = edit(text, links, 12, " ");
    expect(linkedText(res.text, res.links)).toEqual(["Google"]);
  });

  it("does not extend the hyperlink when typing a space at its start", () => {
    const res = edit(text, links, 6, " ");
    expect(linkedText(res.text, res.links)).toEqual(["Google"]);
  });

  it("extends the hyperlink at its end when the paste starts with a non-space", () => {
    const res = edit(text, links, 12, "foo bar");
    expect(linkedText(res.text, res.links)).toEqual(["Googlefoo bar"]);
  });

  it("does not extend the hyperlink at its end when the paste starts with a space", () => {
    const res = edit(text, links, 12, " foo");
    expect(linkedText(res.text, res.links)).toEqual(["Google"]);
  });

  it("does not extend the hyperlink when typing away from it", () => {
    const res = edit(text, links, 15, "X");
    expect(linkedText(res.text, res.links)).toEqual(["Google"]);
  });

  it("shifts the hyperlink when typing before it", () => {
    const res = edit(text, links, 0, "please ");
    expect(res.links).toEqual([link(13, 19)]);
    expect(linkedText(res.text, res.links)).toEqual(["Google"]);
  });

  it("shifts the hyperlink when deleting before it", () => {
    const res = edit(text, links, 0, "", 6);
    expect(res.links).toEqual([link(0, 6)]);
  });

  it("shrinks the hyperlink when deleting characters inside it", () => {
    const res = edit(text, links, 8, "", 2);
    expect(linkedText(res.text, res.links)).toEqual(["Gole"]);
  });

  it("shrinks the hyperlink when a deletion overlaps its edge", () => {
    const res = edit(text, links, 3, "", 5);
    expect(res.text).toBe("visogle today");
    expect(linkedText(res.text, res.links)).toEqual(["ogle"]);
  });

  it("drops the hyperlink when all of its characters are deleted", () => {
    const res = edit(text, links, 6, "", 6);
    expect(res.links).toEqual([]);
  });

  it("extends the hyperlink when replacing a selection inside it", () => {
    const res = edit(text, links, 7, "XYZ", 3);
    expect(linkedText(res.text, res.links)).toEqual(["GXYZle"]);
  });

  it("drops the hyperlink when replacing all of its characters", () => {
    const res = edit(text, links, 6, "Bing", 6);
    expect(res.links).toEqual([]);
  });

  it("extends the left hyperlink when typing between adjacent hyperlinks", () => {
    // "foobar" with "foo" and "bar" linked separately
    const res = edit(
      "foobar",
      [link(0, 3, "https://a.com"), link(3, 6, "https://b.com")],
      3,
      "X",
    );
    expect(linkedText(res.text, res.links)).toEqual(["fooX", "bar"]);
  });

  it("does not extend either hyperlink when typing a space between adjacent hyperlinks", () => {
    const res = edit(
      "foobar",
      [link(0, 3, "https://a.com"), link(3, 6, "https://b.com")],
      3,
      " ",
    );
    expect(linkedText(res.text, res.links)).toEqual(["foo", "bar"]);
  });

  it("extends the hyperlink when pressing enter inside it", () => {
    const res = edit(text, links, 9, "\n");
    expect(linkedText(res.text, res.links)).toEqual(["Goo\ngle"]);
  });

  it("updates every hyperlink in the text", () => {
    // "a b c" with all three letters linked
    const res = edit("a b c", [link(0, 1), link(2, 3), link(4, 5)], 2, "XX");
    expect(linkedText(res.text, res.links)).toEqual(["a", "XXb", "c"]);
  });
});

describe("insertTextHyperlink", () => {
  it("inserts a hyperlink at the caret", () => {
    const res = insertTextHyperlink({
      text: "visit  today",
      textHyperlinks: [],
      selectionStart: 6,
      selectionEnd: 6,
      displayText: "Google",
      url: "https://google.com",
      color: "link",
    });
    expect(res.text).toBe("visit Google today");
    expect(res.textHyperlinks).toEqual([
      { start: 6, end: 12, url: "https://google.com", color: "link" },
    ]);
  });

  it("replaces the selection with the display text", () => {
    const res = insertTextHyperlink({
      text: "visit google today",
      textHyperlinks: [],
      selectionStart: 6,
      selectionEnd: 12,
      displayText: "Google",
      url: "https://google.com",
      color: "inherit",
    });
    expect(res.text).toBe("visit Google today");
    expect(res.textHyperlinks).toEqual([
      { start: 6, end: 12, url: "https://google.com", color: "inherit" },
    ]);
  });

  it("does not extend an adjacent hyperlink over the inserted text", () => {
    const res = insertTextHyperlink({
      text: "foo",
      textHyperlinks: [link(0, 3, "https://a.com")],
      selectionStart: 3,
      selectionEnd: 3,
      displayText: "bar",
      url: "https://b.com",
      color: "link",
    });
    expect(res.text).toBe("foobar");
    expect(res.textHyperlinks).toEqual([
      link(0, 3, "https://a.com"),
      link(3, 6, "https://b.com"),
    ]);
  });

  it("splits a hyperlink when inserting inside it", () => {
    const res = insertTextHyperlink({
      text: "abcdef",
      textHyperlinks: [link(0, 6, "https://a.com")],
      selectionStart: 3,
      selectionEnd: 3,
      displayText: "X",
      url: "https://b.com",
      color: "link",
    });
    expect(res.text).toBe("abcXdef");
    expect(res.textHyperlinks).toEqual([
      link(0, 3, "https://a.com"),
      link(3, 4, "https://b.com"),
      link(4, 7, "https://a.com"),
    ]);
  });

  it("replaces hyperlinks that were fully selected", () => {
    const res = insertTextHyperlink({
      text: "a foo b",
      textHyperlinks: [link(2, 5, "https://a.com")],
      selectionStart: 2,
      selectionEnd: 5,
      displayText: "bar",
      url: "https://b.com",
      color: "link",
    });
    expect(res.text).toBe("a bar b");
    expect(res.textHyperlinks).toEqual([link(2, 5, "https://b.com")]);
  });

  it("shifts hyperlinks after the insertion", () => {
    const res = insertTextHyperlink({
      text: "x foo",
      textHyperlinks: [link(2, 5, "https://a.com")],
      selectionStart: 0,
      selectionEnd: 0,
      displayText: "new ",
      url: "https://b.com",
      color: "link",
    });
    expect(res.text).toBe("new x foo");
    expect(res.textHyperlinks).toEqual([
      link(0, 4, "https://b.com"),
      link(6, 9, "https://a.com"),
    ]);
  });
});

describe("getTextHyperlinkLineSegments", () => {
  const createTextElement = (
    opts: Partial<ExcalidrawTextElement> & { originalText: string },
  ): ExcalidrawTextElement => ({
    ...newTextElement({ text: opts.originalText, x: 0, y: 0 }),
    ...opts,
  });

  const widthOf = (element: ExcalidrawTextElement, text: string) =>
    getLineWidth(text, getFontString(element));

  /** strips positions to make assertions on the segment layout readable */
  const segmentTexts = (
    segments: ReturnType<typeof getTextHyperlinkLineSegments>,
  ) =>
    segments?.map((line) =>
      line.map((segment) => [segment.text, !!segment.hyperlink]),
    );

  it("returns null when there are no hyperlinks", () => {
    const element = createTextElement({ originalText: "visit Google" });
    expect(getTextHyperlinkLineSegments(element)).toBe(null);
  });

  it("splits a line into plain and hyperlinked segments", () => {
    const element = createTextElement({
      originalText: "visit Google today",
      textHyperlinks: [link(6, 12)],
    });
    const segments = getTextHyperlinkLineSegments(element)!;

    expect(segmentTexts(segments)).toEqual([
      [
        ["visit ", false],
        ["Google", true],
        [" today", false],
      ],
    ]);

    const [, hyperlinkSegment] = segments[0];
    expect(hyperlinkSegment.x).toBe(widthOf(element, "visit "));
    expect(hyperlinkSegment.width).toBe(
      widthOf(element, "visit Google") - widthOf(element, "visit "),
    );
  });

  it("maps hyperlinks onto wrapped lines", () => {
    const element = createTextElement({
      originalText: "visit Google today",
      // wrapping trims the spaces at the line breaks
      text: "visit\nGoogle\ntoday",
      textHyperlinks: [link(6, 12)],
    });

    expect(segmentTexts(getTextHyperlinkLineSegments(element))).toEqual([
      [["visit", false]],
      [["Google", true]],
      [["today", false]],
    ]);
  });

  it("splits a hyperlink spanning multiple lines", () => {
    const element = createTextElement({
      originalText: "foo bar",
      text: "foo\nbar",
      textHyperlinks: [link(1, 6)],
    });

    expect(segmentTexts(getTextHyperlinkLineSegments(element))).toEqual([
      [
        ["f", false],
        ["oo", true],
      ],
      [
        ["ba", true],
        ["r", false],
      ],
    ]);
  });

  it("offsets segments according to text alignment", () => {
    const element = createTextElement({
      originalText: "abc",
      textHyperlinks: [link(0, 3)],
      textAlign: "center",
      width: 1000,
    });
    const [[segment]] = getTextHyperlinkLineSegments(element)!;
    expect(segment.x).toBe((1000 - widthOf(element, "abc")) / 2);

    const rightAligned = { ...element, textAlign: "right" as const };
    const [[rightSegment]] = getTextHyperlinkLineSegments(rightAligned)!;
    expect(rightSegment.x).toBe(1000 - widthOf(element, "abc"));
  });

  it("ignores hyperlinks that are out of range", () => {
    const element = createTextElement({
      originalText: "abc",
      textHyperlinks: [link(1, 50)],
    });

    expect(segmentTexts(getTextHyperlinkLineSegments(element))).toEqual([
      [
        ["a", false],
        ["bc", true],
      ],
    ]);
  });

  it("returns null when the rendered text doesn't match the original text", () => {
    const element = createTextElement({
      originalText: "abc",
      text: "xyz",
      textHyperlinks: [link(0, 3)],
    });

    expect(getTextHyperlinkLineSegments(element)).toBe(null);
  });
});
