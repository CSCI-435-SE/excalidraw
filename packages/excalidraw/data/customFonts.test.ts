import { isCustomFontFamily } from "@excalidraw/common";

import {
  CUSTOM_FONT_MAX_SIZE_BYTES,
  CustomFontError,
  detectCustomFontMimeType,
  getCustomFontFamilyId,
  loadCustomFontFile,
} from "./customFonts";

// "wOF2" / "wOFF" signatures followed by a few header bytes
const WOFF2_BYTES = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0]);
const WOFF_BYTES = new Uint8Array([0x77, 0x4f, 0x46, 0x46, 0, 1, 0, 0]);
// TrueType (0x00010000) and OpenType ("OTTO") signatures
const TTF_BYTES = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0, 1, 0, 0]);
const OTF_BYTES = new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 0, 1, 0, 0]);

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const makeFile = (bytes: Uint8Array<ArrayBuffer>, name: string, type = "") =>
  new File([bytes], name, { type });

describe("custom font file handling (#140)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("detectCustomFontMimeType()", () => {
    it("detects WOFF2 and WOFF from the file signature", () => {
      expect(detectCustomFontMimeType(WOFF2_BYTES)).toBe("font/woff2");
      expect(detectCustomFontMimeType(WOFF_BYTES)).toBe("font/woff");
    });

    it("rejects TTF, OTF and other files", () => {
      expect(detectCustomFontMimeType(TTF_BYTES)).toBeNull();
      expect(detectCustomFontMimeType(OTF_BYTES)).toBeNull();
      expect(
        detectCustomFontMimeType(new TextEncoder().encode("hello world")),
      ).toBeNull();
    });

    it("rejects inputs shorter than the 4-byte signature", () => {
      expect(detectCustomFontMimeType(new Uint8Array([]))).toBeNull();
      expect(
        detectCustomFontMimeType(new Uint8Array([0x77, 0x4f, 0x46])),
      ).toBeNull();
    });

    it("reads the signature from the start of a subarray view", () => {
      const buffer = new Uint8Array([0xff, 0xff, ...WOFF2_BYTES]);
      expect(detectCustomFontMimeType(buffer.subarray(2))).toBe("font/woff2");
    });
  });

  describe("getCustomFontFamilyId()", () => {
    it("matches hand-computed djb2 values offset by the custom range", () => {
      // djb2: h = 5381; h = h * 33 + byte
      expect(getCustomFontFamilyId(new Uint8Array([]))).toBe(2000 + 5381);
      expect(getCustomFontFamilyId(new Uint8Array([1]))).toBe(
        2000 + 5381 * 33 + 1,
      );
      expect(getCustomFontFamilyId(new Uint8Array([1, 2]))).toBe(
        2000 + (5381 * 33 + 1) * 33 + 2,
      );
    });

    it("gives the same id for the same bytes and different ids otherwise", () => {
      expect(getCustomFontFamilyId(WOFF2_BYTES)).toBe(
        getCustomFontFamilyId(new Uint8Array(WOFF2_BYTES)),
      );
      expect(getCustomFontFamilyId(WOFF2_BYTES)).not.toBe(
        getCustomFontFamilyId(WOFF_BYTES),
      );
    });

    it("always lands in the custom font range, even for large inputs", () => {
      const large = new Uint8Array(100_000).fill(0xff);
      const id = getCustomFontFamilyId(large);

      expect(isCustomFontFamily(id)).toBe(true);
      expect(id).toBeLessThanOrEqual(2000 + 0xffffffff);
    });
  });

  describe("loadCustomFontFile()", () => {
    it("returns the font data for a valid WOFF2 file", async () => {
      vi.spyOn(Date, "now").mockReturnValue(1234);

      const font = await loadCustomFontFile(
        makeFile(WOFF2_BYTES, "My Font.woff2"),
      );

      expect(font).toEqual({
        id: expect.any(Number),
        name: "My Font",
        mimeType: "font/woff2",
        dataURL: `data:font/woff2;base64,${toBase64(WOFF2_BYTES)}`,
        created: 1234,
      });
      expect(isCustomFontFamily(font.id)).toBe(true);
    });

    it("accepts WOFF files", async () => {
      const font = await loadCustomFontFile(makeFile(WOFF_BYTES, "a.woff"));

      expect(font.mimeType).toBe("font/woff");
      expect(font.dataURL).toBe(
        `data:font/woff;base64,${toBase64(WOFF_BYTES)}`,
      );
    });

    it("trusts the file signature over the extension and reported type", async () => {
      const font = await loadCustomFontFile(
        makeFile(WOFF2_BYTES, "renamed.txt", "text/plain"),
      );

      expect(font.mimeType).toBe("font/woff2");
    });

    it("gives the same id to the same font uploaded under different names", async () => {
      const a = await loadCustomFontFile(makeFile(WOFF2_BYTES, "a.woff2"));
      const b = await loadCustomFontFile(makeFile(WOFF2_BYTES, "b.woff2"));

      expect(a.id).toBe(b.id);
    });

    it("trims the name and falls back to a default when it's empty", async () => {
      const spaced = await loadCustomFontFile(
        makeFile(WOFF2_BYTES, "  Spaced Out  .woff2"),
      );
      const empty = await loadCustomFontFile(makeFile(WOFF2_BYTES, ".woff2"));

      expect(spaced.name).toBe("Spaced Out");
      expect(empty.name).toBe("Custom font");
    });

    it("accepts a file exactly at the 5 MB limit", async () => {
      const bytes = new Uint8Array(5 * 1024 * 1024);
      bytes.set(WOFF2_BYTES);

      await expect(
        loadCustomFontFile(makeFile(bytes, "big.woff2")),
      ).resolves.toMatchObject({ mimeType: "font/woff2" });
    });

    it("rejects files over 5 MB with a tooLarge error", async () => {
      const bytes = new Uint8Array(5 * 1024 * 1024 + 1);
      bytes.set(WOFF2_BYTES);

      const error = await loadCustomFontFile(makeFile(bytes, "huge.woff2"))
        .then(() => null)
        .catch((e) => e);

      expect(CUSTOM_FONT_MAX_SIZE_BYTES).toBe(5 * 1024 * 1024);
      expect(error).toBeInstanceOf(CustomFontError);
      expect(error.code).toBe("tooLarge");
    });

    it("rejects TTF and OTF files with an unsupportedType error", async () => {
      for (const [bytes, name] of [
        [TTF_BYTES, "font.ttf"],
        [OTF_BYTES, "font.otf"],
      ] as const) {
        await expect(
          loadCustomFontFile(makeFile(bytes, name)),
        ).rejects.toMatchObject({ code: "unsupportedType" });
      }
    });

    it("rejects files the browser can't load with an invalidFont error", async () => {
      const loadSpy = vi
        .spyOn(window.FontFace.prototype, "load")
        .mockRejectedValueOnce(new Error("OTS parsing error"));

      await expect(
        loadCustomFontFile(makeFile(WOFF2_BYTES, "corrupt.woff2")),
      ).rejects.toMatchObject({ code: "invalidFont" });
      expect(loadSpy).toHaveBeenCalledTimes(1);
    });

    it("doesn't try to parse files that fail the size or type checks", async () => {
      const loadSpy = vi.spyOn(window.FontFace.prototype, "load");

      await expect(
        loadCustomFontFile(makeFile(TTF_BYTES, "font.ttf")),
      ).rejects.toBeInstanceOf(CustomFontError);
      expect(loadSpy).not.toHaveBeenCalled();
    });
  });
});
