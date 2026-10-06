import { useState } from "react";

import { KEYS, normalizeLink } from "@excalidraw/common";

import type { TextHyperlink } from "@excalidraw/element/types";

import { t } from "../i18n";

import { CheckboxItem } from "./CheckboxItem";
import { Dialog } from "./Dialog";
import DialogActionButton from "./DialogActionButton";
import { TextField } from "./TextField";

import "./TextHyperlinkDialog.scss";

import type { KeyboardEvent } from "react";

export type TextHyperlinkDialogResult = {
  displayText: string;
  url: string;
  color: TextHyperlink["color"];
};

/**
 * Dialog for inserting a hyperlink into the text being edited, opened via
 * Ctrl/Cmd+K from the text editor.
 */
export const TextHyperlinkDialog = ({
  initialDisplayText,
  onConfirm,
  onCancel,
}: {
  initialDisplayText: string;
  onConfirm: (result: TextHyperlinkDialogResult) => void;
  onCancel: () => void;
}) => {
  const [displayText, setDisplayText] = useState(initialDisplayText);
  const [url, setUrl] = useState("");
  const [useTextColor, setUseTextColor] = useState(false);

  const normalizedUrl = normalizeLink(url);

  const handleConfirm = () => {
    if (!normalizedUrl) {
      return;
    }
    onConfirm({
      // fall back to the URL itself when no text was provided
      displayText: displayText || url.trim(),
      url: normalizedUrl,
      color: useTextColor ? "inherit" : "link",
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === KEYS.ENTER) {
      event.preventDefault();
      handleConfirm();
    }
  };

  return (
    <Dialog
      size="small"
      onCloseRequest={onCancel}
      title={t("textHyperlinkDialog.title")}
      className="TextHyperlinkDialog"
    >
      <div className="TextHyperlinkDialog__fields">
        <TextField
          label={t("textHyperlinkDialog.displayText")}
          placeholder={t("textHyperlinkDialog.displayTextPlaceholder")}
          value={displayText}
          onChange={setDisplayText}
          onKeyDown={handleKeyDown}
          fullWidth
        />
        <TextField
          label={t("textHyperlinkDialog.url")}
          placeholder="https://"
          value={url}
          onChange={setUrl}
          onKeyDown={handleKeyDown}
          fullWidth
        />
        <CheckboxItem checked={useTextColor} onChange={setUseTextColor}>
          {t("textHyperlinkDialog.useTextColor")}
        </CheckboxItem>
      </div>
      <div className="TextHyperlinkDialog__actions">
        <DialogActionButton label={t("buttons.cancel")} onClick={onCancel} />
        <DialogActionButton
          label={t("buttons.confirm")}
          onClick={handleConfirm}
          actionType="primary"
          disabled={!normalizedUrl}
        />
      </div>
    </Dialog>
  );
};
