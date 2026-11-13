import { useEffect, useState } from "react";

import { KEYS } from "@excalidraw/common";

import { CustomFontError, loadCustomFontFile } from "../data/customFonts";
import { t } from "../i18n";

import { CheckboxItem } from "./CheckboxItem";
import { Dialog } from "./Dialog";
import DialogActionButton from "./DialogActionButton";
import { TextField } from "./TextField";

import "./CustomFontUploadDialog.scss";

import type { CustomFontCandidate } from "../data/customFonts";
import type { CustomFontErrorCode } from "../data/customFonts";
import type { CustomFontData } from "../types";
import type { KeyboardEvent } from "react";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; candidate: CustomFontCandidate }
  | { status: "error"; code: CustomFontErrorCode };

/**
 * Dialog shown after the user picks a font file (#140): validates the file,
 * lets the user name the font and requires them to acknowledge its license
 * before it can be added.
 */
export const CustomFontUploadDialog = ({
  file,
  onConfirm,
  onCancel,
}: {
  file: File;
  onConfirm: (font: CustomFontData) => void;
  onCancel: () => void;
}) => {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [name, setName] = useState("");
  const [licenseAcknowledged, setLicenseAcknowledged] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setState({ status: "loading" });
    loadCustomFontFile(file)
      .then((candidate) => {
        if (!cancelled) {
          setState({ status: "ready", candidate });
          setName(candidate.name);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: "error",
            code: error instanceof CustomFontError ? error.code : "invalidFont",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  const trimmedName = name.trim();
  const canConfirm =
    state.status === "ready" && licenseAcknowledged && trimmedName !== "";

  const handleConfirm = () => {
    if (!canConfirm) {
      return;
    }
    onConfirm({
      ...state.candidate,
      name: trimmedName,
      licenseAcknowledged: true,
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
      title={t("customFontDialog.title")}
      className="CustomFontUploadDialog"
    >
      <div className="CustomFontUploadDialog__fields">
        {state.status === "loading" && (
          <p className="CustomFontUploadDialog__status">
            {t("customFontDialog.loading")}
          </p>
        )}

        {state.status === "error" && (
          <p className="CustomFontUploadDialog__error" role="alert">
            {t(`customFontDialog.errors.${state.code}`)}
          </p>
        )}

        {state.status === "ready" && (
          <>
            <TextField
              label={t("customFontDialog.name")}
              placeholder={t("customFontDialog.namePlaceholder")}
              value={name}
              onChange={setName}
              onKeyDown={handleKeyDown}
              selectOnRender
              fullWidth
            />
            <CheckboxItem
              checked={licenseAcknowledged}
              onChange={setLicenseAcknowledged}
            >
              {t("customFontDialog.license")}
            </CheckboxItem>
          </>
        )}
      </div>
      <div className="CustomFontUploadDialog__actions">
        <DialogActionButton label={t("buttons.cancel")} onClick={onCancel} />
        {state.status !== "error" && (
          <DialogActionButton
            label={t("customFontDialog.add")}
            onClick={handleConfirm}
            actionType="primary"
            disabled={!canConfirm}
          />
        )}
      </div>
    </Dialog>
  );
};
