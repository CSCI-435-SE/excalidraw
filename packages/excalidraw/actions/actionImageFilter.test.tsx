import { fireEvent, queryByTitle } from "@testing-library/react";
import React from "react";

import type { FileId } from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { API } from "../tests/helpers/api";
import { Keyboard } from "../tests/helpers/ui";
import { act, render, unmountComponent } from "../tests/test-utils";

const { h } = window;

const APPLY = "Apply grayscale";
const REMOVE = "Remove grayscale";

const createImage = (groupIds: string[] = []) =>
  API.createElement({
    type: "image",
    fileId: "file" as FileId,
    width: 100,
    height: 100,
    groupIds,
  });

const queryButton = (title: string) => queryByTitle(document.body, title);

describe("actionToggleImageGrayscale", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  it("applies and removes grayscale from the selected image", () => {
    const image = createImage();
    API.setElements([image]);
    API.setSelectedElements([image]);

    expect(queryButton(APPLY)).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(queryButton(APPLY)!);
    expect(API.getElement(image).filter).toBe("grayscale");
    expect(queryButton(REMOVE)).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(queryButton(REMOVE)!);
    expect(API.getElement(image).filter).toBe(null);
    expect(queryButton(APPLY)).not.toBe(null);
  });

  it("keeps the image's file reference when toggling", () => {
    const image = createImage();
    API.setElements([image]);
    API.setSelectedElements([image]);

    fireEvent.click(queryButton(APPLY)!);
    fireEvent.click(queryButton(REMOVE)!);

    expect(API.getElement(image).fileId).toBe(image.fileId);
  });

  it("supports undo and redo", async () => {
    // load through initialData so the image is part of the history baseline
    const image = createImage();
    unmountComponent();
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        initialData={{ elements: [image] }}
      />,
    );
    API.setSelectedElements([image]);

    fireEvent.click(queryButton(APPLY)!);
    expect(API.getElement(image).filter).toBe("grayscale");

    Keyboard.undo();
    expect(API.getElement(image).filter).toBe(null);

    Keyboard.redo();
    expect(API.getElement(image).filter).toBe("grayscale");
  });

  it("is not shown for non-image elements", () => {
    const rectangle = API.createElement({ type: "rectangle" });
    API.setElements([rectangle]);
    API.setSelectedElements([rectangle]);

    expect(queryButton(APPLY)).toBe(null);
  });

  it("is not shown when multiple elements are selected", () => {
    const images = [createImage(), createImage()];
    API.setElements(images);
    API.setSelectedElements(images);

    expect(queryButton(APPLY)).toBe(null);
  });

  it("is not shown when the image is selected as part of a group", () => {
    const image = createImage(["group"]);
    const rectangle = API.createElement({
      type: "rectangle",
      groupIds: ["group"],
    });
    API.setElements([image, rectangle]);
    API.setSelectedElements([image, rectangle]);

    expect(queryButton(APPLY)).toBe(null);
  });

  it("is shown when a grouped image is selected on its own", () => {
    const image = createImage(["group"]);
    const rectangle = API.createElement({
      type: "rectangle",
      groupIds: ["group"],
    });
    API.setElements([image, rectangle]);
    API.setSelectedElements([image], "group");

    expect(queryButton(APPLY)).not.toBe(null);
  });

  it("is not shown while cropping", () => {
    const image = createImage();
    API.setElements([image]);
    API.setSelectedElements([image]);
    act(() => h.setState({ croppingElementId: image.id }));

    expect(queryButton(APPLY)).toBe(null);
  });
});
