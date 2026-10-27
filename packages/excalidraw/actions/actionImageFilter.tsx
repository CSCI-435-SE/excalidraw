import { isImageElement, newElementWith } from "@excalidraw/element";

import { CaptureUpdateAction } from "@excalidraw/element";

import type { ExcalidrawImageElement } from "@excalidraw/element/types";

import { IconButton } from "../components/IconButton";
import { grayscaleIcon } from "../components/icons";
import { t } from "../i18n";

import { register } from "./register";

import type { AppClassProperties, AppState } from "../types";

const getSelectedImage = (
  appState: Pick<AppState, "selectedElementIds">,
  app: AppClassProperties,
) => {
  const selectedElements = app.scene.getSelectedElements(appState);
  return selectedElements.length === 1 && isImageElement(selectedElements[0])
    ? selectedElements[0]
    : null;
};

const isGrayscale = (element: ExcalidrawImageElement | null) =>
  element?.filter === "grayscale";

export const actionToggleImageGrayscale = register({
  name: "toggleImageGrayscale",
  label: (elements, appState, app) =>
    isGrayscale(getSelectedImage(appState, app))
      ? "labels.removeGrayscale"
      : "labels.applyGrayscale",
  icon: grayscaleIcon,
  trackEvent: { category: "element" },
  keywords: ["image", "filter", "grayscale"],
  perform(elements, appState, _, app) {
    const image = getSelectedImage(appState, app);
    if (!image) {
      return false;
    }

    const filter = isGrayscale(image) ? null : "grayscale";

    return {
      elements: elements.map((el) =>
        el.id === image.id ? newElementWith(image, { filter }) : el,
      ),
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  predicate: (elements, appState, _, app) =>
    !appState.croppingElementId && !!getSelectedImage(appState, app),
  PanelComponent: ({ appState, updateData, app }) => {
    const checked = isGrayscale(getSelectedImage(appState, app));
    const label = t(
      checked ? "labels.removeGrayscale" : "labels.applyGrayscale",
    );

    return (
      <IconButton
        type="toggle"
        icon={grayscaleIcon}
        title={label}
        aria-label={label}
        onSelect={() => updateData(null)}
        checked={checked}
      />
    );
  },
});
