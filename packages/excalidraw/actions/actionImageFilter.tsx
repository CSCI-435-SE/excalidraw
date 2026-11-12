import {
  createImageFilter,
  getDefaultImageAdjustments,
  IMAGE_ADJUSTMENT_DEFS,
  isImageElement,
  newElementWith,
  normalizeImageAdjustments,
  normalizeImageFilters,
} from "@excalidraw/element";

import { CaptureUpdateAction } from "@excalidraw/element";

import type {
  ExcalidrawImageElement,
  ImageAdjustments,
  ImageFilterType,
} from "@excalidraw/element/types";

import { IconButton } from "../components/IconButton";
import { ImageFiltersPanel } from "../components/ImageFiltersPanel";
import { clipboard, copyIcon, grayscaleIcon } from "../components/icons";
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

const hasFilter = (
  element: ExcalidrawImageElement | null,
  type: ImageFilterType,
) => !!element?.filters.some((filter) => filter.type === type);

type ImageFilterSettings = Pick<
  ExcalidrawImageElement,
  "filters" | "adjustments"
>;

export type ImageFiltersUpdate =
  | { op: "add"; type: ImageFilterType }
  | { op: "remove"; type: ImageFilterType }
  | { op: "swap"; type: ImageFilterType; newType: ImageFilterType }
  | {
      op: "update";
      type: ImageFilterType;
      props: Partial<Record<string, number>>;
    }
  | { op: "reset"; type: ImageFilterType }
  | { op: "updateAdjustments"; adjustments: Partial<ImageAdjustments> }
  | { op: "resetAdjustments" };

/**
 * Applies a single filter change, leaving every other filter and adjustment
 * untouched. Values are sanitized, and the result is in canonical order.
 */
export const applyImageFiltersUpdate = (
  settings: ImageFilterSettings,
  update: ImageFiltersUpdate,
): ImageFilterSettings => {
  const { filters, adjustments } = settings;

  switch (update.op) {
    case "add":
      return {
        adjustments,
        filters: normalizeImageFilters([
          ...filters,
          createImageFilter(update.type),
        ]),
      };
    case "remove":
      return {
        adjustments,
        filters: filters.filter((filter) => filter.type !== update.type),
      };
    case "swap":
      if (
        !filters.some((filter) => filter.type === update.type) ||
        filters.some((filter) => filter.type === update.newType)
      ) {
        return settings;
      }
      return {
        adjustments,
        filters: normalizeImageFilters(
          filters.map((filter) =>
            filter.type === update.type
              ? createImageFilter(update.newType)
              : filter,
          ),
        ),
      };
    case "update":
    case "reset":
      return {
        adjustments,
        filters: filters.map((filter) =>
          filter.type === update.type
            ? createImageFilter(
                filter.type,
                update.op === "update" ? { ...filter, ...update.props } : {},
              )
            : filter,
        ),
      };
    case "updateAdjustments": {
      const next = { ...(adjustments ?? getDefaultImageAdjustments()) };
      for (const [name, value] of Object.entries(update.adjustments)) {
        if (name in IMAGE_ADJUSTMENT_DEFS) {
          next[name as keyof ImageAdjustments] = value;
        }
      }
      return { filters, adjustments: normalizeImageAdjustments(next) };
    }
    case "resetAdjustments":
      return { filters, adjustments: null };
  }
  return settings;
};

export const actionChangeImageFilters = register<ImageFiltersUpdate>({
  name: "changeImageFilters",
  label: "labels.imageFilters.title",
  trackEvent: false,
  perform(elements, appState, update, app) {
    const image = getSelectedImage(appState, app);
    if (!image || !update) {
      return false;
    }

    return {
      elements: elements.map((el) =>
        el.id === image.id
          ? newElementWith(image, applyImageFiltersUpdate(image, update))
          : el,
      ),
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  predicate: (elements, appState, _, app) =>
    !appState.croppingElementId && !!getSelectedImage(appState, app),
  PanelComponent: ({ appState, updateData, app }) => {
    const image = getSelectedImage(appState, app);
    if (!image) {
      return null;
    }
    return <ImageFiltersPanel element={image} onChange={updateData} />;
  },
});

export const actionToggleImageGrayscale = register({
  name: "toggleImageGrayscale",
  label: (elements, appState, app) =>
    hasFilter(getSelectedImage(appState, app), "grayscale")
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

    const update: ImageFiltersUpdate = {
      op: hasFilter(image, "grayscale") ? "remove" : "add",
      type: "grayscale",
    };

    return {
      elements: elements.map((el) =>
        el.id === image.id
          ? newElementWith(image, applyImageFiltersUpdate(image, update))
          : el,
      ),
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  predicate: (elements, appState, _, app) =>
    !appState.croppingElementId && !!getSelectedImage(appState, app),
  PanelComponent: ({ appState, updateData, app }) => {
    const checked = hasFilter(getSelectedImage(appState, app), "grayscale");
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

// exported only for tests
export let copiedImageFilters: ImageFilterSettings | null = null;

export const actionCopyImageFilters = register({
  name: "copyImageFilters",
  label: "labels.imageFilters.copy",
  icon: copyIcon,
  trackEvent: { category: "element" },
  keywords: ["image", "filter"],
  perform(elements, appState, _, app) {
    const image = getSelectedImage(appState, app);
    if (!image) {
      return false;
    }
    copiedImageFilters = {
      filters: image.filters,
      adjustments: image.adjustments,
    };
    return {
      appState: {
        ...appState,
        toast: { message: t("toast.copyImageFilters") },
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  predicate: (elements, appState, _, app) =>
    !appState.croppingElementId && !!getSelectedImage(appState, app),
  PanelComponent: ({ updateData }) => (
    <IconButton
      type="button"
      icon={copyIcon}
      title={t("labels.imageFilters.copy")}
      aria-label={t("labels.imageFilters.copy")}
      onClick={() => updateData(null)}
    />
  ),
});

export const actionPasteImageFilters = register({
  name: "pasteImageFilters",
  label: "labels.imageFilters.paste",
  icon: clipboard,
  trackEvent: { category: "element" },
  keywords: ["image", "filter"],
  perform(elements, appState, _, app) {
    const copied = copiedImageFilters;
    const images = app.scene
      .getSelectedElements(appState)
      .filter(isImageElement);
    if (!copied || !images.length) {
      return false;
    }
    const imageIds = new Set(images.map((image) => image.id));

    // settings replace the target's wholesale, so pasting onto several
    // images with different filters is predictable
    return {
      elements: elements.map((el) =>
        imageIds.has(el.id) && isImageElement(el)
          ? newElementWith(el, {
              filters: normalizeImageFilters(copied.filters),
              adjustments: normalizeImageAdjustments(copied.adjustments),
            })
          : el,
      ),
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  predicate: (elements, appState, _, app) =>
    !appState.croppingElementId &&
    app.scene.getSelectedElements(appState).some(isImageElement),
  PanelComponent: ({ updateData }) => (
    <IconButton
      type="button"
      icon={clipboard}
      title={t("labels.imageFilters.paste")}
      aria-label={t("labels.imageFilters.paste")}
      disabled={!copiedImageFilters}
      onClick={() => updateData(null)}
    />
  ),
});
