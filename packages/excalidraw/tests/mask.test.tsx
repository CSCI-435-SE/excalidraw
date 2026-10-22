import { vi } from "vitest";

import { arrayToMap } from "@excalidraw/common";

import {
  canBeMasked,
  canBecomeMask,
  getActiveMaskElement,
  getMaskElement,
  getMaskSvgPathData,
  isMaskElement,
} from "@excalidraw/element";

import type { Radians } from "@excalidraw/math";

import type { ExcalidrawMaskElement } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { getDefaultAppState } from "../appState";
import { exportToCanvas, exportToSvg } from "../scene/export";

import { API } from "./helpers/api";

const createMasked = (
  mask: ExcalidrawElement,
  type: "rectangle" | "freedraw" | "text" = "rectangle",
) =>
  ({
    ...API.createElement({ type, x: 50, y: 50, width: 100, height: 100 }),
    maskId: mask.id,
  } as NonDeletedExcalidrawElement);

describe("mask lookup", () => {
  it("finds the mask of a masked element", () => {
    const mask = API.createElement({ type: "ellipse" });
    const masked = createMasked(mask);
    const elementsMap = arrayToMap([mask, masked]);

    expect(getMaskElement(masked, elementsMap)?.id).toBe(mask.id);
    expect(getActiveMaskElement(masked, elementsMap)?.id).toBe(mask.id);
    expect(isMaskElement(mask, elementsMap)).toBe(true);
    expect(isMaskElement(masked, elementsMap)).toBe(false);
  });

  it("ignores a disabled mask when rendering, but keeps the relationship", () => {
    const mask = {
      ...API.createElement({ type: "diamond" }),
      maskEnabled: false,
    };
    const masked = createMasked(mask);
    const elementsMap = arrayToMap([mask, masked]);

    expect(getMaskElement(masked, elementsMap)?.id).toBe(mask.id);
    expect(getActiveMaskElement(masked, elementsMap)).toBe(null);
  });

  it("ignores a deleted or missing mask", () => {
    const mask = API.createElement({ type: "rectangle", isDeleted: true });
    const masked = createMasked(mask);

    expect(getMaskElement(masked, arrayToMap([mask, masked]))).toBe(null);
    expect(getMaskElement(masked, arrayToMap([masked]))).toBe(null);
  });

  it("only treats basic shapes as masks", () => {
    const line = API.createElement({ type: "line" });
    const masked = createMasked(line);

    expect(getMaskElement(masked, arrayToMap([line, masked]))).toBe(null);
  });
});

describe("mask eligibility", () => {
  it("lets basic shapes become masks", () => {
    for (const type of [
      "rectangle",
      "diamond",
      "ellipse",
      "triangle",
    ] as const) {
      const element = API.createElement({ type });
      expect(canBecomeMask(element, arrayToMap([element]))).toBe(true);
    }
    for (const type of ["line", "arrow", "freedraw", "text"] as const) {
      const element = API.createElement({ type });
      expect(canBecomeMask(element, arrayToMap([element]))).toBe(false);
    }
  });

  it("doesn't let masks or masked elements become masks", () => {
    const mask = API.createElement({ type: "rectangle" });
    const masked = createMasked(mask);
    const elementsMap = arrayToMap([mask, masked]);

    expect(canBecomeMask(mask, elementsMap)).toBe(false);
    expect(canBecomeMask(masked, elementsMap)).toBe(false);
  });

  it("lets shapes, lines, arrows, freedraw and text be masked", () => {
    const mask = API.createElement({ type: "rectangle" });
    for (const type of [
      "rectangle",
      "diamond",
      "ellipse",
      "triangle",
      "line",
      "arrow",
      "freedraw",
      "text",
    ] as const) {
      const element = API.createElement({ type });
      expect(canBeMasked(element, mask, arrayToMap([mask, element]))).toBe(
        true,
      );
    }
  });

  it("doesn't let images, frames or embeds be masked", () => {
    const mask = API.createElement({ type: "rectangle" });
    for (const type of ["image", "frame", "embeddable"] as const) {
      const element = API.createElement({ type });
      expect(canBeMasked(element, mask, arrayToMap([mask, element]))).toBe(
        false,
      );
    }
  });

  it("doesn't let the mask itself, other masks or masked elements be masked", () => {
    const mask = API.createElement({ type: "rectangle" });
    const otherMask = API.createElement({ type: "ellipse" });
    const otherMasked = createMasked(otherMask);
    const elementsMap = arrayToMap([mask, otherMask, otherMasked]);

    expect(canBeMasked(mask, mask, elementsMap)).toBe(false);
    expect(canBeMasked(otherMask, mask, elementsMap)).toBe(false);
    expect(canBeMasked(otherMasked, mask, elementsMap)).toBe(false);
  });

  it("doesn't let locked elements or bound text be masked", () => {
    const mask = API.createElement({ type: "rectangle" });
    const locked = API.createElement({ type: "ellipse", locked: true });
    const boundText = API.createElement({
      type: "text",
      containerId: "container",
    });
    const elementsMap = arrayToMap([mask, locked, boundText]);

    expect(canBeMasked(locked, mask, elementsMap)).toBe(false);
    expect(canBeMasked(boundText, mask, elementsMap)).toBe(false);
  });
});

const outline = (element: ExcalidrawElement) =>
  getMaskSvgPathData(element as ExcalidrawMaskElement);

describe("mask outline", () => {
  it("traces each basic shape", () => {
    expect(
      outline(
        API.createElement({
          type: "rectangle",
          width: 100,
          height: 50,
          roundness: null,
        }),
      ),
    ).toBe("M0 0H100V50H0Z");
    expect(
      outline(API.createElement({ type: "triangle", width: 100, height: 50 })),
    ).toBe("M51 0L100 50L0 50Z");
    expect(
      outline(API.createElement({ type: "diamond", width: 100, height: 50 })),
    ).toBe("M51 0L100 26L51 50L0 26Z");
    expect(
      outline(API.createElement({ type: "ellipse", width: 100, height: 50 })),
    ).toBe("M0 25A50 25 0 1 0 100 25A50 25 0 1 0 0 25Z");
  });

  it("rounds a rounded rectangle's corners", () => {
    const path = outline(
      API.createElement({
        type: "rectangle",
        width: 100,
        height: 100,
        roundness: { type: 3 },
      }),
    );
    expect(path).toContain("A");
  });
});

describe("mask PNG export", () => {
  const exportClipCalls = async (elements: NonDeletedExcalidrawElement[]) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    const clip = vi.spyOn(context, "clip");

    await exportToCanvas(
      elements,
      {
        ...getDefaultAppState(),
        // layout fields, unused by export
        width: 0,
        height: 0,
        offsetTop: 0,
        offsetLeft: 0,
        exportScale: 1,
      },
      {},
      { exportBackground: false, viewBackgroundColor: "#ffffff" },
      (width, height) => {
        canvas.width = width;
        canvas.height = height;
        return { canvas, scale: 1 };
      },
    );
    return clip.mock.calls.length;
  };

  it("clips a masked element to its mask", async () => {
    const mask = API.createElement({
      type: "ellipse",
      width: 100,
      height: 100,
    });
    for (const type of ["rectangle", "freedraw", "text"] as const) {
      expect(await exportClipCalls([mask, createMasked(mask, type)])).toBe(1);
    }
  });

  it("doesn't clip when the mask is disabled or gone", async () => {
    const mask = API.createElement({ type: "ellipse" });
    const disabled = { ...mask, maskEnabled: false };

    expect(await exportClipCalls([disabled, createMasked(disabled)])).toBe(0);
    expect(await exportClipCalls([createMasked(mask)])).toBe(0);
  });

  it("doesn't clip unmasked elements", async () => {
    const mask = API.createElement({ type: "ellipse" });
    const other = API.createElement({ type: "rectangle" });

    expect(await exportClipCalls([mask, createMasked(mask), other])).toBe(1);
  });
});

describe("mask SVG export", () => {
  const exportSvg = (elements: NonDeletedExcalidrawElement[]) =>
    exportToSvg(
      elements,
      { exportBackground: false, viewBackgroundColor: "#ffffff" },
      null,
      { skipInliningFonts: true },
    );

  it("wraps a masked element in a group clipped to its mask", async () => {
    const mask = API.createElement({
      type: "triangle",
      width: 100,
      height: 50,
    });
    const masked = createMasked(mask);
    const svg = await exportSvg([mask, masked]);

    const clipPath = svg.querySelector(`#mask-clipPath-${masked.id}`);
    expect(clipPath?.querySelector("path")?.getAttribute("d")).toBe(
      "M51 0L100 50L0 50Z",
    );

    const group = svg.querySelector(
      `g[clip-path="url(#mask-clipPath-${masked.id})"]`,
    );
    expect(group?.querySelector(`[data-id="${masked.id}"]`)).not.toBe(null);
    // the mask itself is rendered normally, outside the clipped group
    expect(group?.querySelector(`[data-id="${mask.id}"]`)).toBe(null);
    expect(svg.querySelector(`[data-id="${mask.id}"]`)).not.toBe(null);
  });

  it("follows the mask's rotation", async () => {
    const mask = API.createElement({
      type: "rectangle",
      width: 100,
      height: 50,
      angle: (Math.PI / 2) as Radians,
    });
    const masked = createMasked(mask);
    const svg = await exportSvg([mask, masked]);

    const transform = svg
      .querySelector(`#mask-clipPath-${masked.id} path`)
      ?.getAttribute("transform");
    expect(transform).toContain("rotate(90)");
  });

  it("doesn't clip when the mask is disabled", async () => {
    const mask = {
      ...API.createElement({ type: "ellipse" }),
      maskEnabled: false,
    };
    const masked = createMasked(mask);
    const svg = await exportSvg([mask, masked]);

    expect(svg.querySelector(`#mask-clipPath-${masked.id}`)).toBe(null);
  });
});
