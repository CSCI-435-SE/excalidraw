import { createStore, setMany, values } from "idb-keyval";

import { Fonts, restoreCustomFonts } from "@excalidraw/excalidraw";

import type { CustomFontData } from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS } from "../app_constants";

import type { UseStore } from "idb-keyval";

/**
 * Keeps every uploaded custom font (#140) in IndexedDB, so it stays in the
 * font picker across reloads for any drawing. Fonts can be up to 5 MB each,
 * too big for localStorage.
 */
export class CustomFontsStorage {
  /** ids already in IndexedDB, so saving on every change stays cheap */
  private readonly savedIds = new Set<number>();

  constructor(private readonly store: UseStore) {}

  /** Registers all saved fonts. Call before the scene's text is laid out. */
  async restore(): Promise<CustomFontData[]> {
    try {
      // stored data is still validated, it may predate a format change
      const fonts = restoreCustomFonts(await values(this.store));
      for (const font of fonts) {
        Fonts.registerCustomFont(font);
        this.savedIds.add(font.id);
      }
      return fonts;
    } catch (error) {
      console.error("Couldn't restore custom fonts", error);
      return [];
    }
  }

  /** Saves the given fonts that aren't in IndexedDB yet. */
  async saveNew(fonts: readonly CustomFontData[]): Promise<void> {
    const unsaved = fonts.filter((font) => !this.savedIds.has(font.id));
    if (!unsaved.length) {
      return;
    }

    // mark first, so concurrent change events don't write the same font twice
    unsaved.forEach((font) => this.savedIds.add(font.id));
    try {
      await setMany(
        unsaved.map((font) => [font.id, font]),
        this.store,
      );
    } catch (error) {
      unsaved.forEach((font) => this.savedIds.delete(font.id));
      console.error("Couldn't save custom fonts", error);
    }
  }
}

export const customFontsStorage = new CustomFontsStorage(
  createStore(
    `${STORAGE_KEYS.IDB_CUSTOM_FONTS}-db`,
    `${STORAGE_KEYS.IDB_CUSTOM_FONTS}-store`,
  ),
);
