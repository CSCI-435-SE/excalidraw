import { DEFAULT_FONT_FAMILY, deriveStylesPanelMode } from "@excalidraw/common";

import { CaptureUpdateAction, isTextElement } from "@excalidraw/element";

import { UnicodePicker } from "../components/UnicodePicker/UnicodePicker";
import { t } from "../i18n";

import { register } from "./register";

import type { AppState } from "../types";

/**
 * Opens a chart of unicode characters, inserting the picked one into the text
 * editor at the caret.
 *
 * Insertion itself goes through the text editor (same as typing), so this
 * action only toggles the popup.
 */
export const actionInsertCharacter = register<Pick<AppState, "openPopup">>({
  name: "insertCharacter",
  label: "labels.insertCharacter",
  trackEvent: false,
  perform: (elements, appState, value) => {
    return {
      appState: {
        ...appState,
        openPopup: value?.openPopup ?? null,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
  PanelComponent: ({ appState, app, updateData }) => {
    const { editingTextElement } = appState;

    if (!editingTextElement) {
      return null;
    }

    // `editingTextElement` isn't mutated, so get the latest version
    const latestEditingTextElement = app.scene.getElement(
      editingTextElement.id,
    );
    const fontFamily = isTextElement(latestEditingTextElement)
      ? latestEditingTextElement.fontFamily
      : appState.currentItemFontFamily || DEFAULT_FONT_FAMILY;

    const isFullMode = deriveStylesPanelMode(app.editorInterface) === "full";

    const picker = (
      <UnicodePicker
        isOpened={appState.openPopup === "unicodePicker"}
        fontFamily={fontFamily}
        compactMode={!isFullMode}
        onPopupChange={(open) => {
          updateData({ openPopup: open ? "unicodePicker" : null });
        }}
      />
    );

    if (!isFullMode) {
      return picker;
    }

    return (
      <fieldset>
        <legend>{t("labels.insertCharacter")}</legend>
        {picker}
      </fieldset>
    );
  },
});
