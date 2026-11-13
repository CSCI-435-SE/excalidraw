import { restoreCustomFonts } from "./restore";

const WOFF2_URL = "data:font/woff2;base64,d09GMgABAAAAAA==";

const valid = {
  id: 2007,
  name: "My Font",
  mimeType: "font/woff2",
  dataURL: WOFF2_URL,
  licenseAcknowledged: true,
  created: 1234,
};

describe("restoreCustomFonts() (#140)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps a valid font as it is", () => {
    expect(restoreCustomFonts([valid])).toEqual([valid]);
  });

  it("accepts WOFF fonts", () => {
    const woff = {
      ...valid,
      mimeType: "font/woff",
      dataURL: "data:font/woff;base64,d09GRg==",
    };
    expect(restoreCustomFonts([woff])).toEqual([woff]);
  });

  it("returns nothing for missing or non-array input", () => {
    for (const input of [undefined, null, {}, "fonts", 42, { 0: valid }]) {
      expect(restoreCustomFonts(input)).toEqual([]);
    }
  });

  it("drops entries that aren't objects", () => {
    expect(restoreCustomFonts([null, "font", 2007, valid])).toEqual([valid]);
  });

  it.each([
    ["a built-in font id", { id: 5 }],
    ["an id just below the custom range", { id: 1999 }],
    ["a non-integer id", { id: 2007.5 }],
    ["a string id", { id: "2007" }],
    ["a missing name", { name: undefined }],
    ["a blank name", { name: "   " }],
    ["a non-string name", { name: 42 }],
    ["a TTF mime type", { mimeType: "font/ttf" }],
    ["a missing mime type", { mimeType: undefined }],
    [
      "a data URL that doesn't match the mime type",
      { dataURL: "data:font/woff;base64,d09GRg==" },
    ],
    ["a non-data URL", { dataURL: "https://example.com/font.woff2" }],
    ["a missing data URL", { dataURL: undefined }],
  ])("drops a font with %s", (_, override) => {
    expect(restoreCustomFonts([{ ...valid, ...override }])).toEqual([]);
  });

  it("keeps only the first font for a duplicate id", () => {
    expect(
      restoreCustomFonts([valid, { ...valid, name: "Duplicate" }]),
    ).toEqual([valid]);
  });

  it("trims the name", () => {
    expect(restoreCustomFonts([{ ...valid, name: "  Padded  " }])[0].name).toBe(
      "Padded",
    );
  });

  it("only treats an explicit true as an acknowledged license", () => {
    for (const licenseAcknowledged of [undefined, "true", 1, false]) {
      expect(
        restoreCustomFonts([{ ...valid, licenseAcknowledged }])[0]
          .licenseAcknowledged,
      ).toBe(false);
    }
  });

  it("fills in a missing upload time with the current time", () => {
    vi.spyOn(Date, "now").mockReturnValue(9999);

    expect(
      restoreCustomFonts([{ ...valid, created: undefined }])[0].created,
    ).toBe(9999);
  });

  describe("size limit", () => {
    // a 5 MB (5,242,880 byte) font is ceil(5242880 / 3) * 4 = 6,990,508
    // base64 characters long
    const base64OfLength = (length: number) =>
      `data:font/woff2;base64,${"A".repeat(length)}`;

    it("accepts a font at the 5 MB upload limit", () => {
      expect(
        restoreCustomFonts([{ ...valid, dataURL: base64OfLength(6_990_508) }]),
      ).toHaveLength(1);
    });

    it("drops a font over the 5 MB upload limit", () => {
      // 4 more characters = 3 more bytes than the limit allows
      expect(
        restoreCustomFonts([{ ...valid, dataURL: base64OfLength(6_990_512) }]),
      ).toEqual([]);
    });
  });
});
