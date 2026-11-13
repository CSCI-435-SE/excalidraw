import { isImageElement, newElementWith } from "@excalidraw/element";

import { CaptureUpdateAction } from "@excalidraw/element";

import type { ExcalidrawImageElement } from "@excalidraw/element/types";

import { IconButton } from "../components/IconButton";
import { blurIcon, grayscaleIcon, invertIcon } from "../components/icons";
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

const isInverted = (element: ExcalidrawImageElement | null) =>
  element?.filter === "invert";

export const actionToggleImageInvert = register({
  name: "toggleImageInvert",
  label: (elements, appState, app) =>
    isInverted(getSelectedImage(appState, app))
      ? "labels.removeInvert"
      : "labels.applyInvert",
  icon: invertIcon,
  trackEvent: { category: "element" },
  keywords: ["image", "filter", "invert", "inversion"],
  perform(elements, appState, _, app) {
    const image = getSelectedImage(appState, app);
    if (!image) {
      return false;
    }

    const filter = isInverted(image) ? null : "invert";

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
    const checked = isInverted(getSelectedImage(appState, app));
    const label = t(checked ? "labels.removeInvert" : "labels.applyInvert");

    return (
      <IconButton
        type="toggle"
        icon={invertIcon}
        title={label}
        aria-label={label}
        onSelect={() => updateData(null)}
        checked={checked}
      />
    );
  },
});

const isBlurred = (element: ExcalidrawImageElement | null) =>
  element?.filter === "blur";

export const actionToggleImageBlur = register({
  name: "toggleImageBlur",
  label: (elements, appState, app) =>
    isBlurred(getSelectedImage(appState, app))
      ? "labels.removeBlur"
      : "labels.applyBlur",
  icon: blurIcon,
  trackEvent: { category: "element" },
  keywords: ["image", "filter", "blur", "soften"],
  perform(elements, appState, _, app) {
    const image = getSelectedImage(appState, app);
    if (!image) {
      return false;
    }

    const filter = isBlurred(image) ? null : "blur";

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
    const checked = isBlurred(getSelectedImage(appState, app));
    const label = t(checked ? "labels.removeBlur" : "labels.applyBlur");

    return (
      <IconButton
        type="toggle"
        icon={blurIcon}
        title={label}
        aria-label={label}
        onSelect={() => updateData(null)}
        checked={checked}
      />
    );
  },
});
