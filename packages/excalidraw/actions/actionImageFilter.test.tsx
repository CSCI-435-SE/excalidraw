import { fireEvent, queryByTestId, queryByTitle } from "@testing-library/react";
import React from "react";

import { createImageFilter } from "@excalidraw/element";

import type { ExcalidrawImageElement, FileId } from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { API } from "../tests/helpers/api";
import { Keyboard } from "../tests/helpers/ui";
import { act, render, unmountComponent } from "../tests/test-utils";

import {
  actionCopyImageFilters,
  actionPasteImageFilters,
  actionToggleImageGrayscale,
} from "./index";

const { h } = window;

const GRAYSCALE = createImageFilter("grayscale");
const COLOR_SHIFT = createImageFilter("colorShift");

const createImage = (
  groupIds: string[] = [],
  filters: ExcalidrawImageElement["filters"] = [],
) =>
  API.createElement({
    type: "image",
    fileId: "file" as FileId,
    width: 100,
    height: 100,
    groupIds,
    filters,
  });

const queryButton = (title: string) => queryByTitle(document.body, title);
const queryTestId = (testId: string) => queryByTestId(document.body, testId);

const getImage = (image: ExcalidrawImageElement) =>
  API.getElement(image) as ExcalidrawImageElement;

const setSlider = (testId: string, value: number) =>
  fireEvent.change(queryTestId(testId)!, { target: { value } });

const selectOption = (testId: string, value: string) =>
  fireEvent.change(queryTestId(testId)!, { target: { value } });

/** renders with the image as part of the history baseline */
const renderWithImages = async (...images: ExcalidrawImageElement[]) => {
  unmountComponent();
  await render(
    <Excalidraw
      handleKeyboardGlobally={true}
      initialData={{ elements: images }}
    />,
  );
};

describe("actionToggleImageGrayscale", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  const toggleGrayscale = () =>
    act(() => {
      h.app.actionManager.executeAction(actionToggleImageGrayscale);
    });

  it("is not shown in the actions panel (replaced by the filters panel)", () => {
    const image = createImage();
    API.setElements([image]);
    API.setSelectedElements([image]);

    expect(queryButton("Apply grayscale")).toBe(null);
    expect(queryTestId("image-filters-panel")).not.toBe(null);
  });

  it("applies and removes grayscale, leaving other filters untouched", () => {
    const shifted = createImageFilter("colorShift", { hue: 0.2 });
    const image = createImage([], [shifted]);
    API.setElements([image]);
    API.setSelectedElements([image]);

    toggleGrayscale();
    expect(getImage(image).filters).toEqual([GRAYSCALE, shifted]);

    toggleGrayscale();
    expect(getImage(image).filters).toEqual([shifted]);
    expect(getImage(image).fileId).toBe(image.fileId);
  });

  it("supports undo and redo", async () => {
    const image = createImage();
    await renderWithImages(image);
    API.setSelectedElements([image]);

    toggleGrayscale();
    expect(getImage(image).filters).toEqual([GRAYSCALE]);

    Keyboard.undo();
    expect(getImage(image).filters).toEqual([]);

    Keyboard.redo();
    expect(getImage(image).filters).toEqual([GRAYSCALE]);
  });
});

describe("image filters panel visibility", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  const queryPanel = () => queryTestId("image-filters-panel");

  it("is not shown for non-image elements", () => {
    const rectangle = API.createElement({ type: "rectangle" });
    API.setElements([rectangle]);
    API.setSelectedElements([rectangle]);

    expect(queryPanel()).toBe(null);
  });

  it("is not shown when multiple images are selected", () => {
    const images = [createImage(), createImage()];
    API.setElements(images);
    API.setSelectedElements(images);

    expect(queryPanel()).toBe(null);
  });

  it("is not shown when the image is selected as part of a group", () => {
    const image = createImage(["group"]);
    const rectangle = API.createElement({
      type: "rectangle",
      groupIds: ["group"],
    });
    API.setElements([image, rectangle]);
    API.setSelectedElements([image, rectangle]);

    expect(queryPanel()).toBe(null);
  });

  it("is shown when a grouped image is selected on its own", () => {
    const image = createImage(["group"]);
    const rectangle = API.createElement({
      type: "rectangle",
      groupIds: ["group"],
    });
    API.setElements([image, rectangle]);
    API.setSelectedElements([image], "group");

    expect(queryPanel()).not.toBe(null);
  });

  it("is not shown while cropping", () => {
    const image = createImage();
    API.setElements([image]);
    API.setSelectedElements([image]);
    act(() => h.setState({ croppingElementId: image.id }));

    expect(queryPanel()).toBe(null);
  });
});

describe("image filters panel", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  it("adds filters, keeping them in canonical order", () => {
    const image = createImage();
    API.setElements([image]);
    API.setSelectedElements([image]);

    selectOption("image-filter-add", "colorShift");
    selectOption("image-filter-add", "grayscale");

    expect(getImage(image).filters).toEqual([GRAYSCALE, COLOR_SHIFT]);
    // every filter type applied, nothing left to add
    expect(queryTestId("image-filter-add")).toBe(null);
  });

  it("adjusts filter properties independently", () => {
    const image = createImage([], [GRAYSCALE, COLOR_SHIFT]);
    API.setElements([image]);
    API.setSelectedElements([image]);

    setSlider("image-filter-colorShift-hue", 0.25);
    setSlider("image-filter-grayscale-intensity", 0.4);

    expect(getImage(image).filters).toEqual([
      { type: "grayscale", intensity: 0.4 },
      { type: "colorShift", hue: 0.25, intensity: 1 },
    ]);
    // controls reflect the current values
    expect(queryTestId("image-filter-colorShift-hue")).toHaveValue("0.25");
    expect(queryTestId("image-filter-grayscale-intensity")).toHaveValue("0.4");
    expect(queryTestId("image-filter-colorShift-swatch")).not.toBe(null);
  });

  it("swaps a filter for another without touching the rest", () => {
    const image = createImage([], [{ type: "grayscale", intensity: 0.3 }]);
    API.setElements([image]);
    API.setSelectedElements([image]);
    setSlider("image-adjustment-contrast", 0.8);

    selectOption("image-filter-grayscale-type", "colorShift");

    expect(getImage(image).filters).toEqual([COLOR_SHIFT]);
    expect(getImage(image).adjustments?.contrast).toBe(0.8);
  });

  it("removes and resets a single filter", () => {
    const image = createImage(
      [],
      [
        { type: "grayscale", intensity: 0.3 },
        { type: "colorShift", hue: 0.1, intensity: 0.2 },
      ],
    );
    API.setElements([image]);
    API.setSelectedElements([image]);

    fireEvent.click(queryTestId("image-filter-colorShift-reset")!);
    expect(getImage(image).filters).toEqual([
      { type: "grayscale", intensity: 0.3 },
      COLOR_SHIFT,
    ]);

    fireEvent.click(queryTestId("image-filter-grayscale-remove")!);
    expect(getImage(image).filters).toEqual([COLOR_SHIFT]);
  });

  it("adjusts and resets exposure settings", () => {
    const image = createImage([], [GRAYSCALE]);
    API.setElements([image]);
    API.setSelectedElements([image]);

    setSlider("image-adjustment-brightness", 0.7);
    setSlider("image-adjustment-saturation", 0.2);
    expect(getImage(image).adjustments).toEqual({
      brightness: 0.7,
      contrast: 0.5,
      saturation: 0.2,
    });

    fireEvent.click(queryTestId("image-adjustments-reset")!);
    expect(getImage(image).adjustments).toBe(null);
    expect(getImage(image).filters).toEqual([GRAYSCALE]);
  });

  it("clamps out-of-range values", () => {
    const image = createImage([], [COLOR_SHIFT]);
    API.setElements([image]);
    API.setSelectedElements([image]);

    act(() => {
      h.app.actionManager.executeAction(
        h.app.actionManager.actions.changeImageFilters,
        "ui",
        { op: "update", type: "colorShift", props: { hue: 7 } },
      );
      h.app.actionManager.executeAction(
        h.app.actionManager.actions.changeImageFilters,
        "ui",
        { op: "updateAdjustments", adjustments: { brightness: Number.NaN } },
      );
    });

    expect(getImage(image).filters).toEqual([
      { type: "colorShift", hue: 1, intensity: 1 },
    ]);
    expect(getImage(image).adjustments).toBe(null);
  });

  it("keeps settings per element, even for images sharing a file", () => {
    const first = createImage();
    const second = createImage();
    API.setElements([first, second]);
    API.setSelectedElements([first]);

    selectOption("image-filter-add", "colorShift");
    setSlider("image-filter-colorShift-hue", 0.9);

    expect(getImage(first).filters).toEqual([
      { type: "colorShift", hue: 0.9, intensity: 1 },
    ]);
    expect(getImage(second).filters).toEqual([]);
    expect(getImage(second).adjustments).toBe(null);
  });

  it("supports undo and redo of each change", async () => {
    const image = createImage();
    await renderWithImages(image);
    API.setSelectedElements([image]);

    selectOption("image-filter-add", "grayscale");
    selectOption("image-filter-grayscale-type", "colorShift");
    setSlider("image-filter-colorShift-intensity", 0.5);
    setSlider("image-adjustment-brightness", 0.9);

    const halfShift = { type: "colorShift", hue: 0.5, intensity: 0.5 };
    expect(getImage(image).adjustments?.brightness).toBe(0.9);

    Keyboard.undo();
    expect(getImage(image).adjustments).toBe(null);
    expect(getImage(image).filters).toEqual([halfShift]);

    Keyboard.undo();
    expect(getImage(image).filters).toEqual([COLOR_SHIFT]);

    Keyboard.undo();
    expect(getImage(image).filters).toEqual([GRAYSCALE]);

    Keyboard.undo();
    expect(getImage(image).filters).toEqual([]);

    Keyboard.redo();
    Keyboard.redo();
    Keyboard.redo();
    expect(getImage(image).filters).toEqual([halfShift]);
  });

  it("keeps filters when the image is duplicated", () => {
    const image = createImage([], [GRAYSCALE]);
    API.setElements([image]);
    API.setSelectedElements([image]);

    act(() => {
      h.app.actionManager.executeAction(
        h.app.actionManager.actions.duplicateSelection,
      );
    });

    const images = h.elements.filter(
      (el): el is ExcalidrawImageElement => el.type === "image",
    );
    expect(images.length).toBe(2);
    expect(images.map((el) => el.filters)).toEqual([[GRAYSCALE], [GRAYSCALE]]);
  });
});

describe("copy & paste image filters", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  it("pastes filters and adjustments onto other images", () => {
    const adjustments = { brightness: 0.7, contrast: 0.3, saturation: 0.5 };
    const source = API.createElement({
      type: "image",
      fileId: "file" as FileId,
      filters: [GRAYSCALE, COLOR_SHIFT],
      adjustments,
    });
    const targets = [
      createImage([], [{ type: "grayscale", intensity: 0.1 }]),
      createImage(),
    ];
    API.setElements([source, ...targets]);

    API.setSelectedElements([source]);
    act(() => {
      h.app.actionManager.executeAction(actionCopyImageFilters);
    });
    expect(h.state.toast?.message).toBe("Copied image filters.");

    API.setSelectedElements(targets);
    act(() => {
      h.app.actionManager.executeAction(actionPasteImageFilters);
    });

    for (const target of targets) {
      expect(getImage(target).filters).toEqual([GRAYSCALE, COLOR_SHIFT]);
      expect(getImage(target).adjustments).toEqual(adjustments);
    }
  });

  it("copies from the panel buttons", () => {
    const source = createImage([], [COLOR_SHIFT]);
    const target = createImage();
    API.setElements([source, target]);

    API.setSelectedElements([source]);
    fireEvent.click(queryButton("Copy image filters")!);

    API.setSelectedElements([target]);
    fireEvent.click(queryButton("Paste image filters")!);

    expect(getImage(target).filters).toEqual([COLOR_SHIFT]);
  });
});
