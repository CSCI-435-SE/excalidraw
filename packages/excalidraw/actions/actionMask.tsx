import {
  canBeMasked,
  canBecomeMask,
  getMaskIds,
  getMaskMode,
  isMaskedBy,
  isMaskedElement,
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
  if (selectedElements.every((el) => isMaskedElement(el, elementsMap))) {
    return "release";
  }
  return null;
};

/**
 * the mask's innermost group, so that selecting the mask on its own inside a
 * group edits that group rather than leaving the selection inconsistent
 */
const getMaskSelectionState = (mask: ExcalidrawElement) => ({
  selectedElementIds: { [mask.id]: true as const },
  selectedGroupIds: {},
  editingGroupId: mask.groupIds[0] ?? null,
});

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

/**
 * Unlinks the elements accepted by `shouldUnmask` from the mask `maskId`,
 * or from all their masks if no `maskId` is given.
 */
const removeMaskLinks = (
  elements: readonly ExcalidrawElement[],
  shouldUnmask: (element: ExcalidrawElement) => boolean,
  maskId?: ExcalidrawElement["id"],
) =>
  elements.map((el) => {
    const maskIds = getMaskIds(el);
    if (!maskIds.length || !shouldUnmask(el)) {
      return el;
    }
    if (maskId === undefined) {
      return newElementWith(el, { maskIds: null });
    }
    if (!maskIds.includes(maskId)) {
      return el;
    }
    const remaining = maskIds.filter((id) => id !== maskId);
    return newElementWith(el, { maskIds: remaining.length ? remaining : null });
  });

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
        const mask = selectedElements[0];
        return {
          elements: removeMaskLinks(elements, () => true, mask.id),
          appState: exitedAppState(appState),
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        };
      }
      case "release": {
        const ids = new Set(selectedElements.map((el) => el.id));
        return {
          elements: removeMaskLinks(elements, (el) => ids.has(el.id)),
          appState,
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        };
      }
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

/**
 * masking mode: clips the element with id `value` to the mask being picked.
 * Masking mode stays on so several elements can be picked in a row.
 */
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
    // only the first pick turns clipping on, later picks keep the mask's state
    const isFirstPick = !isMaskElement(mask, elementsMap);
    return {
      elements: elements.map((el) =>
        el.id === target.id
          ? newElementWith(el, { maskIds: [...getMaskIds(el), mask.id] })
          : el.id === mask.id && isFirstPick
          ? newElementWith(el, { maskEnabled: true })
          : el,
      ),
      appState: {
        ...appState,
        ...getMaskSelectionState(mask),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});

/** mask options: picks more elements for the edited mask */
export const actionAddToMask = register({
  name: "addToMask",
  label: "labels.mask.add",
  trackEvent: false,
  predicate: (elements, appState) => appState.maskEditor?.mode === "editing",
  perform: (elements, appState) => {
    const mask = getEditedMask(elements, appState);
    if (!mask) {
      return false;
    }
    return {
      appState: {
        ...appState,
        maskEditor: { maskId: mask.id, mode: "picking" },
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
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
        ...getMaskSelectionState(mask),
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

/**
 * switches whether the edited mask shows its elements inside or outside its
 * outline, without touching the elements
 */
export const actionToggleMaskMode = register({
  name: "toggleMaskMode",
  label: "labels.mask.showOutside",
  trackEvent: false,
  predicate: (elements, appState) => !!getEditedMask(elements, appState),
  perform: (elements, appState) => {
    const mask = getEditedMask(elements, appState);
    if (!mask) {
      return false;
    }
    const maskMode = getMaskMode(mask) === "inside" ? "outside" : "inside";
    return {
      elements: elements.map((el) =>
        el.id === mask.id ? newElementWith(el, { maskMode }) : el,
      ),
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});

/**
 * Mask all: clips every element on the canvas that can be masked to the
 * edited mask. Masking mode or the options stay open.
 */
export const actionMaskAll = register({
  name: "maskAll",
  label: "labels.mask.all",
  trackEvent: false,
  predicate: (elements, appState) => !!getEditedMask(elements, appState),
  perform: (elements, appState) => {
    const mask = getEditedMask(elements, appState);
    if (!mask) {
      return false;
    }
    const elementsMap = arrayToMap(elements);
    const targets = new Set(
      elements
        .filter((el) => canBeMasked(el, mask, elementsMap))
        .map((el) => el.id),
    );
    if (!targets.size) {
      return false;
    }
    // like picking, only the first element turns clipping on
    const isFirstPick = !isMaskElement(mask, elementsMap);
    return {
      elements: elements.map((el) =>
        targets.has(el.id)
          ? newElementWith(el, { maskIds: [...getMaskIds(el), mask.id] })
          : el.id === mask.id && isFirstPick
          ? newElementWith(el, { maskEnabled: true })
          : el,
      ),
      appState: {
        ...appState,
        ...getMaskSelectionState(mask),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});

/**
 * Mask none: unlinks every element from the edited mask, like removing it,
 * but keeps masking mode or the options open to pick again
 */
export const actionMaskNone = register({
  name: "maskNone",
  label: "labels.mask.none",
  trackEvent: false,
  predicate: (elements, appState) => !!getEditedMask(elements, appState),
  perform: (elements, appState) => {
    const mask = getEditedMask(elements, appState);
    if (!mask) {
      return false;
    }
    return {
      elements: removeMaskLinks(
        elements,
        (el) => isMaskedBy(el, mask.id),
        mask.id,
      ),
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});

/**
 * removes the edited mask from all its elements; their other masks still
 * clip them
 */
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
    return {
      elements: removeMaskLinks(
        elements,
        (el) => isMaskedBy(el, mask.id),
        mask.id,
      ),
      appState: exitedAppState(appState),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});
