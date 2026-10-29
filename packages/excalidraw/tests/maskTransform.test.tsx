import React from "react";
import { vi } from "vitest";

import { arrayToMap, DEFAULT_EXPORT_PADDING } from "@excalidraw/common";

import {
  CaptureUpdateAction,
  getCommonBounds,
  getMaskOuterExtent,
  getMaskSvgPathData,
  getMaskSvgTransform,
} from "@excalidraw/element";

import type { Radians } from "@excalidraw/math";

import type { ExcalidrawMaskElement } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import {
  actionApplyMask,
  actionEditMask,
  actionMaskAll,
  actionMaskNone,
  actionToggleMask,
  actionToggleMaskMode,
} from "../actions";
import { getDefaultAppState } from "../appState";
import { restoreElements } from "../data/restore";
import { Excalidraw } from "../index";
import { getMaskTagLabel, getMaskTags } from "../renderer/maskClip";
import { exportToCanvas, exportToSvg } from "../scene/export";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import {
  act,
  fireEvent,
  GlobalTestState,
  render,
  screen,
  unmountComponent,
} from "./test-utils";

const { h } = window;

const mouse = new Pointer("mouse");

/**
 * mask: filled ellipse at (0, 0)–(100, 100)
 * target: filled rectangle at (50, 50)–(150, 150), clipped by the mask
 * other: unmasked rectangle at (300, 300)–(350, 350)
 */
const setup = (maskMode?: ExcalidrawElement["maskMode"]) => {
  const mask = {
    ...API.createElement({
      type: "ellipse",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      backgroundColor: "#a5d8ff",
      fillStyle: "solid",
    }),
    maskEnabled: true,
    ...(maskMode ? { maskMode } : {}),
  };
  const target = {
    ...API.createElement({
      type: "rectangle",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      backgroundColor: "#ffc9c9",
      fillStyle: "solid",
    }),
    maskIds: [mask.id],
  };
  const other = API.createElement({
    type: "rectangle",
    x: 300,
    y: 300,
    width: 50,
    height: 50,
  });
  API.updateScene({
    elements: [mask, target, other],
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return { mask, target, other };
};

/** opens the options of `mask` (selecting it) */
const openOptions = (mask: ExcalidrawElement) => {
  API.setSelectedElements([mask as NonDeletedExcalidrawElement]);
  act(() => {
    h.app.actionManager.executeAction(actionEditMask, "api", mask.id);
  });
  expect(h.state.maskEditor?.mode).toBe("editing");
};

const exportSvg = (elements: readonly ExcalidrawElement[]) =>
  exportToSvg(
    elements.filter((el) => !el.isDeleted) as NonDeletedExcalidrawElement[],
    { exportBackground: false, viewBackgroundColor: "#ffffff" },
    null,
    { skipInliningFonts: true },
  );

const getClipPath = (
  svg: SVGSVGElement,
  element: ExcalidrawElement,
  mask: ExcalidrawElement,
) => svg.querySelector(`#mask-clipPath-${element.id}-${mask.id} path`);

beforeEach(async () => {
  unmountComponent();
  mouse.reset();
  await render(<Excalidraw autoFocus={true} handleKeyboardGlobally={true} />);
  Object.assign(document, {
    elementFromPoint: () => GlobalTestState.canvas,
  });
});

describe("mask mode", () => {
  it("defaults to showing the inside", () => {
    const { mask } = setup();
    openOptions(mask);

    expect(API.getElement(mask).maskMode).toBeUndefined();
    expect(
      screen.getByTestId("mask-mode-inside").getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("switches to the outside without recreating the mask or its content", () => {
    const { mask, target } = setup();
    const targetBefore = API.getElement(target);
    openOptions(mask);

    fireEvent.click(screen.getByTestId("mask-mode-outside"));

    expect(API.getElement(mask).maskMode).toBe("outside");
    expect(API.getElement(mask).id).toBe(mask.id);
    expect(API.getElement(target)).toBe(targetBefore);
    expect(
      screen.getByTestId("mask-mode-outside").getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("does nothing when picking the mode that's already on", () => {
    const { mask } = setup();
    openOptions(mask);
    const version = API.getElement(mask).version;

    fireEvent.click(screen.getByTestId("mask-mode-inside"));

    expect(API.getElement(mask).version).toBe(version);
  });

  it("can undo and redo switching the mode", () => {
    const { mask } = setup();
    openOptions(mask);

    API.executeAction(actionToggleMaskMode);
    expect(API.getElement(mask).maskMode).toBe("outside");

    Keyboard.undo();
    expect(API.getElement(mask).maskMode ?? "inside").toBe("inside");
    Keyboard.redo();
    expect(API.getElement(mask).maskMode).toBe("outside");
  });

  it("is kept when restoring, and invalid values are dropped", () => {
    const outside = {
      ...API.createElement({ type: "ellipse" }),
      maskMode: "outside" as const,
    };
    const invalid = {
      ...API.createElement({ type: "ellipse" }),
      maskMode: "sideways",
    } as unknown as ExcalidrawElement;

    const [restoredOutside, restoredInvalid] = restoreElements(
      [outside, invalid],
      null,
    );

    expect(restoredOutside.maskMode).toBe("outside");
    expect("maskMode" in restoredInvalid).toBe(false);
  });
});

describe("mask mode export", () => {
  it("cuts the outline out of a surrounding rect in SVG", async () => {
    const { mask, target } = setup("outside");
    const svg = await exportSvg(h.elements);
    const path = getClipPath(svg, target, mask);

    expect(path?.getAttribute("clip-rule")).toBe("evenodd");
    // outer rect first, then the outline
    const d = path!.getAttribute("d")!;
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.startsWith("M-")).toBe(true);
    const outline = getMaskSvgPathData({
      ...mask,
      maskMode: "inside",
    } as ExcalidrawMaskElement);
    expect(d.endsWith(outline)).toBe(true);
  });

  it("uses the outline alone, with the default rule, for inside masks", async () => {
    const { mask, target } = setup("inside");
    const svg = await exportSvg(h.elements);
    const path = getClipPath(svg, target, mask);

    expect(path?.getAttribute("clip-rule")).toBe(null);
    expect(path?.getAttribute("d")).toBe(
      getMaskSvgPathData(mask as ExcalidrawMaskElement),
    );
  });

  it("makes the surrounding rect cover the whole masked element at any angle", () => {
    const far = API.createElement({
      type: "rectangle",
      x: 500,
      y: 500,
      width: 100,
      height: 100,
    });
    for (const angle of [0, Math.PI / 4, Math.PI / 3]) {
      const mask = API.createElement({
        type: "rectangle",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        angle: angle as Radians,
      }) as ExcalidrawMaskElement;
      const extent = getMaskOuterExtent(mask, far, arrayToMap([mask, far]));
      // the rect spans `extent` past the outline on every side, around the
      // mask's center, so it covers every point within `extent` of the center
      const farthestCorner = Math.hypot(600 - 5, 600 - 5);
      expect(extent).toBeGreaterThan(farthestCorner);
    }
  });

  it("clips the canvas with the even-odd rule for outside masks", async () => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    const clip = vi.spyOn(context, "clip");
    const { mask, target } = setup("outside");

    await exportToCanvas(
      [mask, target] as NonDeletedExcalidrawElement[],
      {
        ...getDefaultAppState(),
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

    expect(clip.mock.calls).toEqual([["evenodd"]]);
  });
});

describe("mask all / mask none", () => {
  it("masks every element that can be masked", () => {
    const { mask, target, other } = setup();
    const locked = API.createElement({ type: "rectangle", locked: true });
    const image = API.createElement({ type: "image" });
    const otherMask = API.createElement({ type: "diamond" });
    const otherMasked = {
      ...API.createElement({ type: "rectangle" }),
      maskIds: [otherMask.id],
    };
    API.updateScene({
      elements: [...h.elements, locked, image, otherMask, otherMasked],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    openOptions(mask);

    fireEvent.click(screen.getByTestId("mask-all"));

    expect(API.getElement(target).maskIds).toEqual([mask.id]);
    expect(API.getElement(other).maskIds).toEqual([mask.id]);
    expect(API.getElement(otherMasked).maskIds).toEqual([
      otherMask.id,
      mask.id,
    ]);
    expect(API.getElement(locked).maskIds).toBeUndefined();
    expect(API.getElement(image).maskIds).toBeUndefined();
    // other masks never become masked
    expect(API.getElement(otherMask).maskIds).toBeUndefined();
    expect(h.state.maskEditor?.mode).toBe("editing");
  });

  it("unmasks every element of the mask, keeping their other masks", () => {
    const { mask, target } = setup();
    const otherMask = API.createElement({ type: "diamond" });
    const both = {
      ...API.createElement({ type: "rectangle" }),
      maskIds: [mask.id, otherMask.id],
    };
    API.updateScene({
      elements: [...h.elements, otherMask, both],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    openOptions(mask);

    fireEvent.click(screen.getByTestId("mask-none"));

    expect(API.getElement(target).maskIds).toBe(null);
    expect(API.getElement(both).maskIds).toEqual([otherMask.id]);
    // the options stay open to pick again
    expect(h.state.maskEditor).toEqual({ maskId: mask.id, mode: "editing" });
  });

  it("works from the masking-mode bar", () => {
    const shape = API.createElement({ type: "ellipse" });
    const a = API.createElement({ type: "rectangle", x: 200 });
    const b = API.createElement({ type: "rectangle", x: 400 });
    API.updateScene({
      elements: [shape, a, b],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    API.setSelectedElements([shape]);
    API.executeAction(actionToggleMask);
    expect(h.state.maskEditor?.mode).toBe("picking");

    fireEvent.click(screen.getByTestId("masking-mode-all"));
    expect(API.getElement(a).maskIds).toEqual([shape.id]);
    expect(API.getElement(b).maskIds).toEqual([shape.id]);
    expect(API.getElement(shape).maskEnabled).toBe(true);
    expect(h.state.maskEditor?.mode).toBe("picking");

    fireEvent.click(screen.getByTestId("masking-mode-none"));
    expect(API.getElement(a).maskIds).toBe(null);
    expect(API.getElement(b).maskIds).toBe(null);
    expect(h.state.maskEditor?.mode).toBe("picking");
  });

  it("can undo mask all", () => {
    const { mask, other } = setup();
    openOptions(mask);

    API.executeAction(actionMaskAll);
    expect(API.getElement(other).maskIds).toEqual([mask.id]);

    Keyboard.undo();
    expect(API.getElement(other).maskIds).toBeUndefined();
  });

  it("does nothing without an open mask editor", () => {
    const { other } = setup();

    API.executeAction(actionMaskAll);
    API.executeAction(actionMaskNone);

    expect(API.getElement(other).maskIds).toBeUndefined();
  });
});

describe("multiple masks", () => {
  it("clips an element by three masks with mixed modes", async () => {
    const masks = [
      API.createElement({ type: "ellipse" }),
      { ...API.createElement({ type: "rectangle" }), maskMode: "outside" },
      API.createElement({ type: "triangle" }),
    ] as ExcalidrawElement[];
    const masked = {
      ...API.createElement({ type: "rectangle" }),
      maskIds: masks.map((mask) => mask.id),
    };
    const svg = await exportSvg([...masks, masked]);

    let parent: Element | null = svg;
    for (const mask of masks) {
      parent = parent!.querySelector(
        `g[clip-path="url(#mask-clipPath-${masked.id}-${mask.id})"]`,
      );
      expect(parent).not.toBe(null);
    }
    expect(parent!.querySelector(`[data-id="${masked.id}"]`)).not.toBe(null);
    expect(getClipPath(svg, masked, masks[1])?.getAttribute("clip-rule")).toBe(
      "evenodd",
    );
  });
});

describe("transforming a mask on its own", () => {
  it("keeps the relationship and follows the mask through every transformation", async () => {
    const { mask, target } = setup();
    const targetBefore = API.getElement(target);
    /** the export's clip follows the mask's current geometry */
    const expectClipToFollowMask = async () => {
      const elements = h.elements.filter(
        (el) => !el.isDeleted,
      ) as NonDeletedExcalidrawElement[];
      const [minX, minY] = getCommonBounds(elements);
      const path = getClipPath(await exportSvg(elements), target, mask);
      expect(path?.getAttribute("transform")).toBe(
        getMaskSvgTransform(
          API.getElement(mask) as ExcalidrawMaskElement,
          -minX + DEFAULT_EXPORT_PADDING,
          -minY + DEFAULT_EXPORT_PADDING,
        ),
      );
      return path!;
    };

    // move: drag the mask by its fill, away from the target
    mouse.downAt(20, 50);
    mouse.moveTo(-80, -50);
    mouse.up();
    expect(API.getElement(mask).x).toBe(-100);
    expect(API.getElement(mask).y).toBe(-100);
    await expectClipToFollowMask();

    // resize
    UI.resize(API.getElement(mask), "se", [50, 50]);
    expect(API.getElement(mask).width).toBe(150);
    await expectClipToFollowMask();

    // rotate
    UI.rotate(API.getElement(mask), [100, 100]);
    expect(API.getElement(mask).angle).not.toBe(0);
    await expectClipToFollowMask();

    // change the mode
    openOptions(mask);
    API.executeAction(actionToggleMaskMode);
    const path = await expectClipToFollowMask();
    expect(path.getAttribute("clip-rule")).toBe("evenodd");

    // and move again in the new mode, by the mask's (filled) center
    const { x, y } = API.getElement(mask);
    mouse.downAt(-25, -25);
    mouse.moveTo(-5, -5);
    mouse.up();
    expect(API.getElement(mask).x).toBe(x + 20);
    expect(API.getElement(mask).y).toBe(y + 20);
    await expectClipToFollowMask();

    // the content is untouched and still linked
    expect(API.getElement(target)).toBe(targetBefore);
    expect(API.getElement(target).maskIds).toEqual([mask.id]);
  });
});

describe("parent/child tags", () => {
  /** [element id, label] per tag */
  const tagsFor = (
    selected: ExcalidrawElement[],
    maskEditor: { maskId: string } | null = null,
  ) =>
    getMaskTags(
      {
        selectedElementIds: Object.fromEntries(
          selected.map((el) => [el.id, true as const]),
        ),
        maskEditor,
      },
      arrayToMap(h.elements),
    ).map((tag) => [tag.element.id, getMaskTagLabel(tag)]);

  /**
   * mask1: ellipse, clips a and b
   * mask2: diamond, clips b and c
   * other: unmasked
   */
  const setupTwoMasks = () => {
    const mask1 = API.createElement({ type: "ellipse" });
    const mask2 = API.createElement({ type: "diamond" });
    const a = {
      ...API.createElement({ type: "rectangle" }),
      maskIds: [mask1.id],
    };
    const b = {
      ...API.createElement({ type: "rectangle" }),
      maskIds: [mask1.id, mask2.id],
    };
    const c = {
      ...API.createElement({ type: "rectangle" }),
      maskIds: [mask2.id],
    };
    const other = API.createElement({ type: "rectangle" });
    API.updateScene({
      elements: [mask1, mask2, a, b, c, other],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    return { mask1, mask2, a, b, c, other };
  };

  it("names a selected mask and numbers its elements", () => {
    const { mask, target } = setup();

    expect(tagsFor([mask])).toEqual([
      [mask.id, "Mask 1"],
      [target.id, "Mask 1 Child 1"],
    ]);
  });

  it("tags the masks of a selected masked element", () => {
    const { mask, target } = setup();

    expect(tagsFor([target])).toEqual([
      [mask.id, "Mask 1"],
      [target.id, "Mask 1 Child 1"],
    ]);
  });

  it("numbers masks in scene order, whichever is selected", () => {
    const { mask1, mask2, b, c } = setupTwoMasks();

    // mask2 stays "Mask 2" though it's the only one selected; b is its first
    // child and mask1's second
    expect(tagsFor([mask2])).toEqual([
      [mask1.id, "Mask 1"],
      [mask2.id, "Mask 2"],
      [b.id, "Mask 1 Child 2"],
      [b.id, "Mask 2 Child 1"],
      [c.id, "Mask 2 Child 2"],
    ]);
  });

  it("gives an element with several masks one tag per mask", () => {
    const { mask1, mask2, a, b, c } = setupTwoMasks();

    expect(tagsFor([mask1])).toEqual([
      [mask1.id, "Mask 1"],
      // shown so b's second tag can be traced, without its other children
      [mask2.id, "Mask 2"],
      [a.id, "Mask 1 Child 1"],
      [b.id, "Mask 1 Child 2"],
      [b.id, "Mask 2 Child 1"],
    ]);
    expect(tagsFor([mask1]).map(([id]) => id)).not.toContain(c.id);
  });

  it("renumbers when a mask goes away", () => {
    const { mask1, mask2, b, c } = setupTwoMasks();
    API.updateScene({
      elements: h.elements.map((el) =>
        el.id === mask1.id ? { ...el, isDeleted: true } : el,
      ),
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    expect(tagsFor([mask2])).toEqual([
      [mask2.id, "Mask 1"],
      [b.id, "Mask 1 Child 1"],
      [c.id, "Mask 1 Child 2"],
    ]);
  });

  it("names the mask being picked for, even before it has elements", () => {
    const { mask1 } = setupTwoMasks();
    const shape = API.createElement({ type: "triangle" });
    API.updateScene({
      elements: [shape, ...h.elements],
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    expect(tagsFor([], { maskId: shape.id })).toEqual([[shape.id, "Mask 1"]]);
    // the new mask shifts the numbers of the masks after it
    expect(tagsFor([mask1], { maskId: shape.id })[0]).toEqual([
      shape.id,
      "Mask 1",
    ]);
    expect(tagsFor([mask1], { maskId: shape.id })).toContainEqual([
      mask1.id,
      "Mask 2",
    ]);
  });

  it("shows no tags for unrelated selections", () => {
    const { other } = setup();

    expect(tagsFor([other])).toEqual([]);
    expect(tagsFor([])).toEqual([]);
  });

  it("marks outside masks", () => {
    const { mask } = setup("outside");

    expect(tagsFor([mask])[0]).toEqual([mask.id, "Mask 1 (outside)"]);
  });
});

describe("mask mode while picking", () => {
  it("can be set before any element is picked, and is kept", () => {
    const shape = API.createElement({ type: "ellipse" });
    const target = API.createElement({ type: "rectangle", x: 200 });
    API.updateScene({
      elements: [shape, target],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    API.setSelectedElements([shape]);
    API.executeAction(actionToggleMask);
    expect(h.state.maskEditor?.mode).toBe("picking");

    fireEvent.click(screen.getByTestId("mask-mode-outside"));
    expect(API.getElement(shape).maskMode).toBe("outside");
    expect(
      screen.getByTestId("mask-mode-outside").getAttribute("aria-checked"),
    ).toBe("true");
    expect(h.state.maskEditor?.mode).toBe("picking");

    act(() => {
      h.app.actionManager.executeAction(actionApplyMask, "api", target.id);
    });
    expect(API.getElement(target).maskIds).toEqual([shape.id]);
    expect(API.getElement(shape).maskMode).toBe("outside");
  });
});

describe("rotated outside masks", () => {
  it("rotates the cut-out with the mask", async () => {
    const { mask, target } = setup("outside");
    API.updateElement(mask, { angle: (Math.PI / 4) as Radians });
    const svg = await exportSvg(h.elements);

    expect(getClipPath(svg, target, mask)?.getAttribute("transform")).toContain(
      "rotate(45)",
    );
  });
});
