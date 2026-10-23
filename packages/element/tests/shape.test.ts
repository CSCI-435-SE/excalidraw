import { applyDarkModeFilter, THEME } from "@excalidraw/common";

import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import { ShapeCache } from "../src/shape";

import type {
  ExcalidrawElement,
  ExcalidrawSelectionElement,
} from "../src/types";

// generic ("basic shape") element types that support a background fill —
// each must go through `generateRoughOptions`'s fill-options switch, which
// throws for any type it doesn't explicitly list (by design, to catch a
// forgotten case at dev time) rather than silently omitting the fill
const FILLABLE_GENERIC_TYPES = [
  "rectangle",
  "diamond",
  "triangle",
  "ellipse",
] as const;

describe("ShapeCache.generateElementShape", () => {
  const getShapeStroke = (
    shape: ReturnType<typeof ShapeCache.generateElementShape>,
  ) => {
    const drawable = Array.isArray(shape) ? shape[0] : shape;
    return drawable && typeof drawable !== "string"
      ? drawable.options.stroke
      : null;
  };

  it("preserves element stroke colors in dark mode", () => {
    const element = API.createElement({
      type: "rectangle",
      strokeColor: "#ffffff",
    }) as Exclude<ExcalidrawElement, ExcalidrawSelectionElement>;
    const shape = ShapeCache.generateElementShape(element, {
      isExporting: false,
      canvasBackgroundColor: "#000000",
      embedsValidationStatus: new Map(),
      theme: THEME.DARK,
    });

    expect(getShapeStroke(shape)).toBe("#ffffff");
  });

  it("preserves dark-mode color transforms for dark exports", () => {
    const element = API.createElement({
      type: "rectangle",
      strokeColor: "#ffffff",
    }) as Exclude<ExcalidrawElement, ExcalidrawSelectionElement>;
    const shape = ShapeCache.generateElementShape(element, {
      isExporting: true,
      canvasBackgroundColor: "#000000",
      embedsValidationStatus: new Map(),
      theme: THEME.DARK,
    });

    expect(getShapeStroke(shape)).toBe(applyDarkModeFilter("#ffffff"));
  });

  it.each(FILLABLE_GENERIC_TYPES)(
    "generates a %s shape without throwing",
    (type) => {
      const element = API.createElement({ type, width: 100, height: 80 });

      expect(() =>
        ShapeCache.generateElementShape(
          // FILLABLE_GENERIC_TYPES never includes "selection", but
          // `API.createElement`'s return type does since it's typed off
          // the whole ExcalidrawGenericElement union
          element as Exclude<ExcalidrawElement, ExcalidrawSelectionElement>,
          {
            isExporting: false,
            canvasBackgroundColor: "#ffffff",
            embedsValidationStatus: new Map(),
            theme: THEME.LIGHT,
          },
        ),
      ).not.toThrow();
    },
  );
});
