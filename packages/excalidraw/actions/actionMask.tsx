import {
  canBeMasked,
  canBecomeMask,
  getMaskedElement,
  getMaskElement,
  isMaskElement,
  isMaskEnabled,
  newElementWith,
  CaptureUpdateAction,
} from "@excalidraw/element";
import { arrayToMap, CODES, KEYS } from "@excalidraw/common";

import type { ElementsMap, ExcalidrawElement } from "@excalidraw/element/types";

import { DEFAULT_CATEGORIES } from "../components/CommandPalette/CommandPalette";
import { MaskIcon } from "../components/icons";

import { register } from "./register";

import type { AppClassProperties, AppState } from "../types";

type MaskActionType = "start" | "remove" | "release";

/**
 * What the mask shortcut/button does for the current selection:
 * - `start`: a single shape that can become a mask → enter masking mode
 * - `remove`: a single mask shape → remove its mask
 * - `release`: only masked elements → release them from their masks
 */
export const getMaskActionType = (
  selectedElements: readonly ExcalidrawElement[],
  elementsMap: ElementsMap,
): MaskActionType | null => {
  if (!selectedElements.length) {
    return null;
  }
  if (selectedElements.length === 1) {
    const [element] = selectedElements;
    if (isMaskElement(element, elementsMap)) {
      return "remove";
    }
    if (canBecomeMask(element, elementsMap)) {
      return "start";
    }
  }
  if (selectedElements.every((el) => getMaskElement(el, elementsMap))) {
    return "release";
  }
  return null;
};

/** the mask the open mask editor belongs to, if it still exists */
export const getEditedMask = (
  elements: readonly ExcalidrawElement[],
  appState: Readonly<Pick<AppState, "maskEditor">>,
) => {
  if (!appState.maskEditor) {
    return null;
  }
  const mask = elements.find((el) => el.id === appState.maskEditor!.maskId);
  return mask && !mask.isDeleted ? mask : null;
};

/** clears the elements' masks so they render unmasked again */
const unmaskElements = (
  elements: readonly ExcalidrawElement[],
  ids: ReadonlySet<string>,
) =>
  elements.map((el) =>
    ids.has(el.id) && el.maskId ? newElementWith(el, { maskId: null }) : el,
  );

const exitedAppState = (appState: Readonly<AppState>): AppState => ({
  ...appState,
  maskEditor: null,
});

export const actionToggleMask = register({
  name: "toggleMask",
  label: "labels.mask.toggle",
  icon: MaskIcon,
  category: DEFAULT_CATEGORIES.elements,
  keywords: ["mask", "clip", "clipping"],
  trackEvent: { category: "element" },
  predicate: (elements, appState, _, app) =>
    appState.maskEditor?.mode === "picking" ||
    !!getMaskActionType(
      app.scene.getSelectedElements(appState),
      app.scene.getNonDeletedElementsMap(),
    ),
  perform: (elements, appState, _, app: AppClassProperties) => {
    // pressing it again while picking cancels masking mode
    if (appState.maskEditor?.mode === "picking") {
      return {
        appState: exitedAppState(appState),
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    const elementsMap = app.scene.getNonDeletedElementsMap();
    const selectedElements = app.scene.getSelectedElements(appState);

    switch (getMaskActionType(selectedElements, elementsMap)) {
      case "start":
        return {
          appState: {
            ...appState,
            maskEditor: { maskId: selectedElements[0].id, mode: "picking" },
          },
          captureUpdate: CaptureUpdateAction.EVENTUALLY,
        };
      case "remove": {
        const masked = getMaskedElement(selectedElements[0], elementsMap);
        return {
          elements: unmaskElements(
            elements,
            new Set(masked ? [masked.id] : []),
          ),
          appState: exitedAppState(appState),
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        };
      }
      case "release":
        return {
          elements: unmaskElements(
            elements,
            new Set(selectedElements.map((el) => el.id)),
          ),
          appState,
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        };
      default:
        return false;
    }
  },
  keyTest: (event) =>
    event[KEYS.CTRL_OR_CMD] &&
    event.altKey &&
    !event.shiftKey &&
    // `event.key` is a special character with Alt held on some layouts
    event.code === CODES.G,
});

/** masking mode: clips the element with id `value` to the mask being picked */
export const actionApplyMask = register<ExcalidrawElement["id"]>({
  name: "applyMask",
  label: "labels.mask.toggle",
  trackEvent: false,
  predicate: (elements, appState) => appState.maskEditor?.mode === "picking",
  perform: (elements, appState, value) => {
    const mask = getEditedMask(elements, appState);
    const elementsMap = arrayToMap(elements);
    const target = value ? elementsMap.get(value) : undefined;
    if (
      appState.maskEditor?.mode !== "picking" ||
      !mask ||
      !target ||
      !canBeMasked(target, mask, elementsMap)
    ) {
      return false;
    }
    return {
      elements: elements.map((el) =>
        el.id === target.id
          ? newElementWith(el, { maskId: mask.id })
          : el.id === mask.id
          ? newElementWith(el, { maskEnabled: true })
          : el,
      ),
      appState: {
        ...exitedAppState(appState),
        selectedElementIds: { [mask.id]: true },
        selectedGroupIds: {},
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});

export const actionCancelMasking = register({
  name: "cancelMasking",
  label: "buttons.cancel",
  trackEvent: false,
  predicate: (elements, appState) => appState.maskEditor?.mode === "picking",
  perform: (elements, appState) => ({
    appState: exitedAppState(appState),
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  }),
});

/**
 * Opens the options of the mask with id `value` (double-clicking a mask
 * shape), or of the selected mask, and selects it.
 */
export const actionEditMask = register<ExcalidrawElement["id"] | null>({
  name: "editMask",
  label: "labels.mask.edit",
  trackEvent: false,
  predicate: (elements, appState, _, app) => {
    const selectedElements = app.scene.getSelectedElements(appState);
    return (
      selectedElements.length === 1 &&
      isMaskElement(selectedElements[0], app.scene.getNonDeletedElementsMap())
    );
  },
  perform: (elements, appState, value, app: AppClassProperties) => {
    const elementsMap = app.scene.getNonDeletedElementsMap();
    const mask = value
      ? elementsMap.get(value)
      : app.scene.getSelectedElements(appState)[0];
    if (!mask || !isMaskElement(mask, elementsMap)) {
      return false;
    }
    return {
      appState: {
        ...appState,
        selectedElementIds: { [mask.id]: true },
        selectedGroupIds: {},
        editingGroupId: null,
        maskEditor: { maskId: mask.id, mode: "editing" },
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
});

export const actionCloseMaskEditor = register({
  name: "closeMaskEditor",
  label: "buttons.close",
  trackEvent: false,
  predicate: (elements, appState) => appState.maskEditor?.mode === "editing",
  perform: (elements, appState) => ({
    appState: exitedAppState(appState),
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  }),
});

/** turns the edited mask's clipping on or off, keeping the masked element */
export const actionToggleMaskEnabled = register({
  name: "toggleMaskEnabled",
  label: "labels.mask.enabled",
  trackEvent: false,
  predicate: (elements, appState) => !!getEditedMask(elements, appState),
  perform: (elements, appState) => {
    const mask = getEditedMask(elements, appState);
    if (!mask) {
      return false;
    }
    return {
      elements: elements.map((el) =>
        el.id === mask.id
          ? newElementWith(el, { maskEnabled: !isMaskEnabled(mask) })
          : el,
      ),
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});

/** removes the edited mask, restoring its element's unmasked appearance */
export const actionRemoveMask = register({
  name: "removeMask",
  label: "labels.mask.remove",
  trackEvent: false,
  predicate: (elements, appState) => !!getEditedMask(elements, appState),
  perform: (elements, appState) => {
    const mask = getEditedMask(elements, appState);
    if (!mask) {
      return false;
    }
    const ids = new Set<string>();
    for (const el of elements) {
      if (el.maskId === mask.id) {
        ids.add(el.id);
      }
    }
    return {
      elements: unmaskElements(elements, ids),
      appState: exitedAppState(appState),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});
