export interface UnicodeBlock {
  name: string;
  start: number;
  end: number;
}

export const MAX_CODE_POINT = 0x10ffff;

/**
 * Commonly used Unicode blocks (names as defined by the Unicode standard).
 *
 * The last entry spans every code point, so that any character can be browsed.
 *
 * @see https://www.unicode.org/Public/UCD/latest/ucd/Blocks.txt
 */
export const UNICODE_BLOCKS: readonly UnicodeBlock[] = [
  { name: "Basic Latin", start: 0x0020, end: 0x007e },
  { name: "Latin-1 Supplement", start: 0x00a0, end: 0x00ff },
  { name: "Latin Extended-A", start: 0x0100, end: 0x017f },
  { name: "Latin Extended-B", start: 0x0180, end: 0x024f },
  { name: "IPA Extensions", start: 0x0250, end: 0x02af },
  { name: "Spacing Modifier Letters", start: 0x02b0, end: 0x02ff },
  { name: "Combining Diacritical Marks", start: 0x0300, end: 0x036f },
  { name: "Greek and Coptic", start: 0x0370, end: 0x03ff },
  { name: "Cyrillic", start: 0x0400, end: 0x04ff },
  { name: "Armenian", start: 0x0530, end: 0x058f },
  { name: "Hebrew", start: 0x0590, end: 0x05ff },
  { name: "Arabic", start: 0x0600, end: 0x06ff },
  { name: "Devanagari", start: 0x0900, end: 0x097f },
  { name: "Thai", start: 0x0e00, end: 0x0e7f },
  { name: "Georgian", start: 0x10a0, end: 0x10ff },
  { name: "Hangul Jamo", start: 0x1100, end: 0x11ff },
  { name: "General Punctuation", start: 0x2000, end: 0x206f },
  { name: "Superscripts and Subscripts", start: 0x2070, end: 0x209f },
  { name: "Currency Symbols", start: 0x20a0, end: 0x20cf },
  { name: "Letterlike Symbols", start: 0x2100, end: 0x214f },
  { name: "Number Forms", start: 0x2150, end: 0x218f },
  { name: "Arrows", start: 0x2190, end: 0x21ff },
  { name: "Mathematical Operators", start: 0x2200, end: 0x22ff },
  { name: "Miscellaneous Technical", start: 0x2300, end: 0x23ff },
  { name: "Enclosed Alphanumerics", start: 0x2460, end: 0x24ff },
  { name: "Box Drawing", start: 0x2500, end: 0x257f },
  { name: "Block Elements", start: 0x2580, end: 0x259f },
  { name: "Geometric Shapes", start: 0x25a0, end: 0x25ff },
  { name: "Miscellaneous Symbols", start: 0x2600, end: 0x26ff },
  { name: "Dingbats", start: 0x2700, end: 0x27bf },
  { name: "Supplemental Arrows-A", start: 0x27f0, end: 0x27ff },
  { name: "Braille Patterns", start: 0x2800, end: 0x28ff },
  { name: "Supplemental Arrows-B", start: 0x2900, end: 0x297f },
  {
    name: "Miscellaneous Mathematical Symbols-B",
    start: 0x2980,
    end: 0x29ff,
  },
  { name: "Supplemental Mathematical Operators", start: 0x2a00, end: 0x2aff },
  { name: "Miscellaneous Symbols and Arrows", start: 0x2b00, end: 0x2bff },
  { name: "CJK Symbols and Punctuation", start: 0x3000, end: 0x303f },
  { name: "Hiragana", start: 0x3040, end: 0x309f },
  { name: "Katakana", start: 0x30a0, end: 0x30ff },
  { name: "CJK Unified Ideographs", start: 0x4e00, end: 0x9fff },
  { name: "Hangul Syllables", start: 0xac00, end: 0xd7af },
  { name: "Halfwidth and Fullwidth Forms", start: 0xff00, end: 0xffef },
  { name: "Mathematical Alphanumeric Symbols", start: 0x1d400, end: 0x1d7ff },
  {
    name: "Miscellaneous Symbols and Pictographs",
    start: 0x1f300,
    end: 0x1f5ff,
  },
  { name: "Emoticons", start: 0x1f600, end: 0x1f64f },
  { name: "Transport and Map Symbols", start: 0x1f680, end: 0x1f6ff },
  {
    name: "Supplemental Symbols and Pictographs",
    start: 0x1f900,
    end: 0x1f9ff,
  },
  {
    name: "Symbols and Pictographs Extended-A",
    start: 0x1fa70,
    end: 0x1faff,
  },
  { name: "All characters", start: 0x0020, end: MAX_CODE_POINT },
];
