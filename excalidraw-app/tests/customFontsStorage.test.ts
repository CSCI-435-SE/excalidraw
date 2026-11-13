import { createStore, setMany, values } from "idb-keyval";

import { Fonts } from "@excalidraw/excalidraw";

import type { CustomFontData, DataURL } from "@excalidraw/excalidraw/types";

import { CustomFontsStorage } from "../data/customFontsStorage";

// pass-through mocks, so writes can be counted and reads made to fail
vi.mock("idb-keyval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("idb-keyval")>();
  return {
    ...actual,
    setMany: vi.fn(actual.setMany),
    values: vi.fn(actual.values),
  };
});

const fontA: CustomFontData = {
  id: 2007,
  name: "Font A",
  mimeType: "font/woff2",
  dataURL: "data:font/woff2;base64,d09GMgABAAAAAA==" as DataURL,
  licenseAcknowledged: true,
  created: 1,
};

const fontB: CustomFontData = {
  id: 2042,
  name: "Font B",
  mimeType: "font/woff",
  dataURL: "data:font/woff;base64,d09GRgABAAAAAA==" as DataURL,
  licenseAcknowledged: true,
  created: 2,
};

let dbCount = 0;

describe("CustomFontsStorage (#140)", () => {
  // a fresh database per test (fake-indexeddb is loaded in setupTests.ts)
  let store: ReturnType<typeof createStore>;

  /** a new storage over the same database, i.e. after a page reload */
  const reload = () => {
    Fonts.unregisterCustomFont(fontA.id);
    Fonts.unregisterCustomFont(fontB.id);
    return new CustomFontsStorage(store);
  };

  beforeAll(() => {
    // the jsdom `document.fonts` mock from setupTests.ts has no `delete`
    Object.assign(window.document.fonts, { delete: vi.fn() });
  });

  beforeEach(() => {
    store = createStore(`custom-fonts-test-${++dbCount}`, "store");
    vi.mocked(setMany).mockClear();
  });

  afterEach(() => {
    Fonts.unregisterCustomFont(fontA.id);
    Fonts.unregisterCustomFont(fontB.id);
    vi.restoreAllMocks();
  });

  it("restores nothing when no font was ever saved", async () => {
    expect(await reload().restore()).toEqual([]);
    expect(Fonts.getCustomFonts()).toEqual([]);
  });

  it("brings every saved font back into the picker after a reload", async () => {
    await reload().saveNew([fontA, fontB]);

    const restored = await reload().restore();

    expect(restored).toHaveLength(2);
    expect(restored).toEqual(expect.arrayContaining([fontA, fontB]));
    expect(Fonts.getCustomFonts()).toEqual(
      expect.arrayContaining([fontA, fontB]),
    );
    expect(Fonts.registered.get(fontA.id)?.metadata.custom).toEqual({
      name: "Font A",
    });
  });

  it("writes each font only once, however often the scene changes", async () => {
    const storage = reload();

    await storage.saveNew([fontA]);
    await storage.saveNew([fontA]);
    await storage.saveNew([fontA, fontB]);

    expect(setMany).toHaveBeenCalledTimes(2);
    expect(vi.mocked(setMany).mock.calls[0][0]).toEqual([[fontA.id, fontA]]);
    expect(vi.mocked(setMany).mock.calls[1][0]).toEqual([[fontB.id, fontB]]);
  });

  it("doesn't rewrite fonts it restored from storage", async () => {
    await reload().saveNew([fontA]);
    vi.mocked(setMany).mockClear();

    const storage = reload();
    await storage.restore();
    await storage.saveNew(Fonts.getCustomFonts());

    expect(setMany).not.toHaveBeenCalled();
  });

  it("skips invalid stored entries", async () => {
    await setMany(
      [
        [fontA.id, fontA],
        [5, { ...fontB, id: 5 }],
        ["junk", "not a font"],
      ],
      store,
    );

    expect(await reload().restore()).toEqual([fontA]);
  });

  it("starts without custom fonts if IndexedDB can't be read", async () => {
    vi.mocked(values).mockRejectedValueOnce(new Error("blocked"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await reload().restore()).toEqual([]);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("retries a font whose save failed on the next change", async () => {
    vi.mocked(setMany).mockRejectedValueOnce(new Error("quota"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const storage = reload();

    await storage.saveNew([fontA]);
    await storage.saveNew([fontA]);

    expect(setMany).toHaveBeenCalledTimes(2);
    expect(await reload().restore()).toEqual([fontA]);
  });
});
