import { ORIG_ID } from "@excalidraw/common";

import { degreesToRadians, normalizeRadians } from "@excalidraw/math";

import type { Degrees, Radians } from "@excalidraw/math";

import { Excalidraw } from "../index";
import { API } from "../tests/helpers/api";
import {
  act,
  assertElements,
  getCloneByOrigId,
  render,
} from "../tests/test-utils";

import { actionDuplicateRotated } from "./actionDuplicateRotated";

const { h } = window;

const doubled = (angleDegrees: number) =>
  normalizeRadians((2 * degreesToRadians(angleDegrees as Degrees)) as Radians);

describe("actionDuplicateRotated", () => {
  beforeEach(async () => {
    await render(<Excalidraw />);
  });

  it("duplicates the selected element immediately, without requiring extra input", () => {
    const rectangle = API.createElement({ type: "rectangle" });

    API.setElements([rectangle]);
    API.setSelectedElements([rectangle]);

    act(() => {
      h.app.actionManager.executeAction(actionDuplicateRotated);
    });

    expect(h.elements.length).toBe(2);
    expect(h.state.openDialog).toBe(null);
  });

  it("sets the duplicate's angle to double the original element's angle", () => {
    const originalAngle = degreesToRadians(30 as Degrees);
    const rectangle = API.createElement({
      type: "rectangle",
      angle: originalAngle,
    });

    API.setElements([rectangle]);
    API.setSelectedElements([rectangle]);

    act(() => {
      h.app.actionManager.executeAction(actionDuplicateRotated);
    });

    assertElements(h.elements, [
      { id: rectangle.id, angle: originalAngle },
      {
        [ORIG_ID]: rectangle.id,
        angle: doubled(30),
        selected: true,
      },
    ]);
  });

  it("leaves the duplicate unrotated when the original has a zero angle", () => {
    const rectangle = API.createElement({ type: "rectangle", angle: 0 });

    API.setElements([rectangle]);
    API.setSelectedElements([rectangle]);

    act(() => {
      h.app.actionManager.executeAction(actionDuplicateRotated);
    });

    const duplicate = getCloneByOrigId(rectangle.id);
    expect(duplicate.angle).toBe(0);
  });

  it("normalizes the doubled angle so it wraps around 360 degrees", () => {
    const originalAngle = degreesToRadians(200 as Degrees);
    const rectangle = API.createElement({
      type: "rectangle",
      angle: originalAngle,
    });

    API.setElements([rectangle]);
    API.setSelectedElements([rectangle]);

    act(() => {
      h.app.actionManager.executeAction(actionDuplicateRotated);
    });

    const duplicate = getCloneByOrigId(rectangle.id);
    expect(duplicate.angle).toBeCloseTo(doubled(200));
    expect(duplicate.angle).toBeCloseTo(degreesToRadians(40 as Degrees));
  });

  it("doubles each selected element's angle independently", () => {
    const rect1 = API.createElement({
      type: "rectangle",
      angle: degreesToRadians(10 as Degrees),
    });
    const rect2 = API.createElement({
      type: "ellipse",
      angle: degreesToRadians(45 as Degrees),
    });

    API.setElements([rect1, rect2]);
    API.setSelectedElements([rect1, rect2]);

    act(() => {
      h.app.actionManager.executeAction(actionDuplicateRotated);
    });

    assertElements(h.elements, [
      { id: rect1.id, angle: degreesToRadians(10 as Degrees) },
      {
        [ORIG_ID]: rect1.id,
        angle: doubled(10),
        selected: true,
      },
      { id: rect2.id, angle: degreesToRadians(45 as Degrees) },
      {
        [ORIG_ID]: rect2.id,
        angle: doubled(45),
        selected: true,
      },
    ]);
  });

  it("keeps frame membership when duplicating a rotated element inside a frame", () => {
    const frame = API.createElement({ type: "frame" });
    const rectangle = API.createElement({
      type: "rectangle",
      frameId: frame.id,
      angle: degreesToRadians(15 as Degrees),
    });

    API.setElements([frame, rectangle]);
    API.setSelectedElements([rectangle]);

    act(() => {
      h.app.actionManager.executeAction(actionDuplicateRotated);
    });

    assertElements(h.elements, [
      { id: frame.id },
      {
        id: rectangle.id,
        frameId: frame.id,
        angle: degreesToRadians(15 as Degrees),
      },
      {
        [ORIG_ID]: rectangle.id,
        frameId: frame.id,
        angle: doubled(15),
        selected: true,
      },
    ]);
  });
});
