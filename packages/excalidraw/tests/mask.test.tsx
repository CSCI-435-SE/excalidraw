import { vi } from "vitest";

import { arrayToMap } from "@excalidraw/common";

import {
  canBeMasked,
  canBecomeMask,
  getActiveMaskElements,
  getMaskedElements,
  getMaskElements,
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
import { restoreElements } from "../data/restore";
import { exportToCanvas, exportToSvg } from "../scene/export";

import { API } from "./helpers/api";

const createMasked = (
  masks: ExcalidrawElement | ExcalidrawElement[],
  type: "rectangle" | "freedraw" | "text" = "rectangle",
) =>
  ({
    ...API.createElement({ type, x: 50, y: 50, width: 100, height: 100 }),
    maskIds: (Array.isArray(masks) ? masks : [masks]).map((mask) => mask.id),
  } as NonDeletedExcalidrawElement);

const ids = (elements: readonly ExcalidrawElement[]) =>
  elements.map((element) => element.id);

describe("mask lookup", () => {
  it("finds the mask of a masked element", () => {
    const mask = API.createElement({ type: "ellipse" });
    const masked = createMasked(mask);
    const elementsMap = arrayToMap([mask, masked]);

    expect(ids(getMaskElements(masked, elementsMap))).toEqual([mask.id]);
    expect(ids(getActiveMaskElements(masked, elementsMap))).toEqual([mask.id]);
    expect(isMaskElement(mask, elementsMap)).toBe(true);
    expect(isMaskElement(masked, elementsMap)).toBe(false);
  });

  it("finds every element of a mask, and every mask of an element", () => {
    const maskA = API.createElement({ type: "ellipse" });
    const maskB = API.createElement({ type: "rectangle" });
    const shared = createMasked([maskA, maskB]);
    const onlyA = createMasked(maskA);
    const elementsMap = arrayToMap([maskA, maskB, shared, onlyA]);

    expect(ids(getMaskElements(shared, elementsMap))).toEqual([
      maskA.id,
      maskB.id,
    ]);
    expect(ids(getMaskedElements(maskA, elementsMap))).toEqual([
      shared.id,
      onlyA.id,
    ]);
    expect(ids(getMaskedElements(maskB, elementsMap))).toEqual([shared.id]);
  });

  it("ignores a disabled mask when rendering, but keeps the relationship", () => {
    const mask = {
      ...API.createElement({ type: "diamond" }),
      maskEnabled: false,
    };
    const other = API.createElement({ type: "ellipse" });
    const masked = createMasked([mask, other]);
    const elementsMap = arrayToMap([mask, other, masked]);

    expect(ids(getMaskElements(masked, elementsMap))).toEqual([
      mask.id,
      other.id,
    ]);
    expect(ids(getActiveMaskElements(masked, elementsMap))).toEqual([other.id]);
  });

  it("ignores a deleted or missing mask", () => {
    const mask = API.createElement({ type: "rectangle", isDeleted: true });
    const masked = createMasked(mask);

    expect(getMaskElements(masked, arrayToMap([mask, masked]))).toEqual([]);
    expect(getMaskElements(masked, arrayToMap([masked]))).toEqual([]);
  });

  it("only treats basic shapes as masks", () => {
    const line = API.createElement({ type: "line" });
    const masked = createMasked(line);

    expect(getMaskElements(masked, arrayToMap([line, masked]))).toEqual([]);
  });
});

describe("mask persistence", () => {
  it("migrates the legacy single maskId", () => {
    const mask = API.createElement({ type: "ellipse" });
    const legacy = {
      ...API.createElement({ type: "rectangle" }),
      maskId: mask.id,
    } as unknown as ExcalidrawElement;

    const [, restored] = restoreElements([mask, legacy], null);

    expect(restored.maskIds).toEqual([mask.id]);
    expect("maskId" in restored).toBe(false);
  });

  it("keeps several masks, without duplicates", () => {
    const masked = {
      ...API.createElement({ type: "rectangle" }),
      maskIds: ["a", "b", "a"],
    };

    const [restored] = restoreElements([masked], null);

    expect(restored.maskIds).toEqual(["a", "b"]);
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

  it("lets masks take more elements, but doesn't let masked elements become masks", () => {
    const mask = API.createElement({ type: "rectangle" });
    const masked = createMasked(mask);
    const elementsMap = arrayToMap([mask, masked]);

    expect(canBecomeMask(mask, elementsMap)).toBe(true);
    expect(canBecomeMask(masked, elementsMap)).toBe(false);
  });

  it("lets shapes, lines, arrows, freedraw, text and images be masked", () => {
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
      "image",
    ] as const) {
      const element = API.createElement({ type });
      expect(canBeMasked(element, mask, arrayToMap([mask, element]))).toBe(
        true,
      );
    }
  });

  it("doesn't let frames or embeds be masked", () => {
    const mask = API.createElement({ type: "rectangle" });
    for (const type of ["frame", "embeddable"] as const) {
      const element = API.createElement({ type });
      expect(canBeMasked(element, mask, arrayToMap([mask, element]))).toBe(
        false,
      );
    }
  });

  it("doesn't let the mask itself or other masks be masked", () => {
    const mask = API.createElement({ type: "rectangle" });
    const otherMask = API.createElement({ type: "ellipse" });
    const otherMasked = createMasked(otherMask);
    const elementsMap = arrayToMap([mask, otherMask, otherMasked]);

    expect(canBeMasked(mask, mask, elementsMap)).toBe(false);
    expect(canBeMasked(otherMask, mask, elementsMap)).toBe(false);
  });

  it("lets an element be masked by several masks, once each", () => {
    const mask = API.createElement({ type: "rectangle" });
    const otherMask = API.createElement({ type: "ellipse" });
    const masked = createMasked(otherMask);
    const elementsMap = arrayToMap([mask, otherMask, masked]);

    expect(canBeMasked(masked, mask, elementsMap)).toBe(true);
    expect(canBeMasked(masked, otherMask, elementsMap)).toBe(false);
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

  it("clips an element with several masks to each of them", async () => {
    const maskA = API.createElement({ type: "ellipse" });
    const maskB = API.createElement({ type: "rectangle" });

    expect(
      await exportClipCalls([maskA, maskB, createMasked([maskA, maskB])]),
    ).toBe(2);
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
    const clipPathId = `mask-clipPath-${masked.id}-${mask.id}`;

    const clipPath = svg.querySelector(`#${clipPathId}`);
    expect(clipPath?.querySelector("path")?.getAttribute("d")).toBe(
      "M51 0L100 50L0 50Z",
    );

    const group = svg.querySelector(`g[clip-path="url(#${clipPathId})"]`);
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
      .querySelector(`#mask-clipPath-${masked.id}-${mask.id} path`)
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

    expect(svg.querySelector(`[id^="mask-clipPath-${masked.id}"]`)).toBe(null);
  });

  it("nests one clipped group per mask, intersecting them", async () => {
    const maskA = API.createElement({ type: "ellipse" });
    const maskB = API.createElement({ type: "rectangle" });
    const masked = createMasked([maskA, maskB]);
    const svg = await exportSvg([maskA, maskB, masked]);

    const outer = svg.querySelector(
      `g[clip-path="url(#mask-clipPath-${masked.id}-${maskA.id})"]`,
    );
    const inner = outer?.querySelector(
      `g[clip-path="url(#mask-clipPath-${masked.id}-${maskB.id})"]`,
    );
    expect(inner?.querySelector(`[data-id="${masked.id}"]`)).not.toBe(null);
  });
});
