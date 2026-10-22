import React from "react";

import { queryByTestId } from "@testing-library/react";

import { CaptureUpdateAction } from "@excalidraw/element";

import { actionApplyMask } from "../actions";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { act, fireEvent, render, unmountComponent } from "./test-utils";

const { h } = window;

const openExtraToolsMenu = () => {
  fireEvent.click(
    document.querySelector<HTMLElement>(".App-toolbar__extra-tools-trigger")!,
  );
  return document.querySelector<HTMLElement>(
    ".App-toolbar__extra-tools-dropdown",
  )!;
};

const getMaskItem = () =>
  queryByTestId(openExtraToolsMenu(), "toolbar-mask") as HTMLButtonElement;

const setup = () => {
  const mask = API.createElement({ type: "ellipse" });
  const target = API.createElement({ type: "rectangle", x: 50, y: 50 });
  API.updateScene({
    elements: [mask, target],
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return { mask, target };
};

beforeEach(async () => {
  unmountComponent();
  await render(<Excalidraw handleKeyboardGlobally={true} />);
});

describe("Mask item in More tools", () => {
  it("sits directly under the Frame tool", () => {
    const menu = openExtraToolsMenu();
    const frameItem = queryByTestId(menu, "toolbar-frame")!;

    expect(frameItem.nextElementSibling).toBe(
      queryByTestId(menu, "toolbar-mask"),
    );
  });

  it("shows the shortcut", () => {
    expect(getMaskItem().textContent).toMatch(/Ctrl\+Alt\+G/);
  });

  it("is disabled when nothing it can act on is selected", () => {
    setup();
    expect(getMaskItem().disabled).toBe(true);
  });

  it("enters masking mode for a selected basic shape", () => {
    const { mask } = setup();
    API.setSelectedElements([mask]);

    const item = getMaskItem();
    expect(item.disabled).toBe(false);
    fireEvent.click(item);

    expect(h.state.maskEditor).toEqual({ maskId: mask.id, mode: "picking" });
  });

  it("removes the mask when a mask is selected", () => {
    const { mask, target } = setup();
    API.setSelectedElements([mask]);
    fireEvent.click(getMaskItem());
    act(() => {
      h.app.actionManager.executeAction(actionApplyMask, "api", target.id);
    });
    expect(API.getElement(target).maskId).toBe(mask.id);

    fireEvent.click(getMaskItem());

    expect(API.getElement(target).maskId).toBe(null);
  });
});
