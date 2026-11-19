import { useState } from "react";

import { KEYS } from "@excalidraw/common";

import { t } from "../i18n";
import {
  PAGE_DESCRIPTION_MAX_LENGTH,
  PAGE_NAME_MAX_LENGTH,
  isPageInfoValid,
  validatePageInfo,
} from "../pages";
import { getNormalizedGridSize } from "../scene/normalize";

import { CheckboxItem } from "./CheckboxItem";
import { Dialog } from "./Dialog";
import DialogActionButton from "./DialogActionButton";
import { Switch } from "./Switch";
import { TextField } from "./TextField";

import "./PageInfoDialog.scss";

import type { DrawingPage, PageInfoPatch } from "../pages";
import type { KeyboardEvent } from "react";

const getPatchFromPage = (page: DrawingPage): PageInfoPatch => ({
  name: page.name,
  description: page.description,
  showThumbnail: page.showThumbnail,
  grid: {
    gridModeEnabled: page.settings.gridModeEnabled,
    gridSnapEnabled: page.settings.gridSnapEnabled,
    gridSize: page.settings.gridSize,
  },
});

/**
 * Shows a page's name, description and settings, and lets the user edit them.
 * Changes are kept in a local draft until explicitly saved.
 */
export const PageInfoDialog = ({
  page,
  pages,
  onSave,
  onClose,
}: {
  page: DrawingPage;
  pages: readonly DrawingPage[];
  onSave: (patch: PageInfoPatch) => void;
  onClose: () => void;
}) => {
  const [draft, setDraft] = useState<PageInfoPatch | null>(null);
  // keep the raw text so the field can be cleared while typing
  const [gridSizeInput, setGridSizeInput] = useState("");

  const startEditing = () => {
    const initial = getPatchFromPage(page);
    setDraft(initial);
    setGridSizeInput(String(initial.grid.gridSize));
  };

  const cancelEditing = () => {
    setDraft(null);
  };

  const validation = draft
    ? validatePageInfo(draft, pages, page.id)
    : { nameError: undefined, descriptionError: undefined };
  const canSave = !!draft && isPageInfoValid(validation);

  const handleSave = () => {
    if (!draft || !canSave) {
      return;
    }
    onSave({ ...draft, name: draft.name.trim() });
  };

  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === KEYS.ENTER) {
      event.preventDefault();
      handleSave();
    }
  };

  const updateDraft = (patch: Partial<PageInfoPatch>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const updateGrid = (patch: Partial<PageInfoPatch["grid"]>) => {
    setDraft((prev) =>
      prev ? { ...prev, grid: { ...prev.grid, ...patch } } : prev,
    );
  };

  const nameErrorMessage =
    validation.nameError === "empty"
      ? t("pageInfoDialog.errors.emptyName")
      : validation.nameError === "duplicate"
      ? t("pageInfoDialog.errors.duplicateName")
      : validation.nameError === "tooLong"
      ? t("pageInfoDialog.errors.nameTooLong", { max: PAGE_NAME_MAX_LENGTH })
      : null;

  const renderView = () => (
    <>
      <dl className="PageInfoDialog__details">
        <dt>{t("pageInfoDialog.name")}</dt>
        <dd className="PageInfoDialog__name">{page.name}</dd>
        {page.description && (
          <>
            <dt>{t("pageInfoDialog.description")}</dt>
            <dd className="PageInfoDialog__description">{page.description}</dd>
          </>
        )}
        <dt>{t("pageInfoDialog.thumbnail")}</dt>
        <dd>
          {page.showThumbnail
            ? t("pageInfoDialog.thumbnailShown")
            : t("pageInfoDialog.thumbnailHidden")}
        </dd>
        <dt>{t("pageInfoDialog.grid")}</dt>
        <dd>
          {page.settings.gridModeEnabled
            ? t("pageInfoDialog.gridShown")
            : t("pageInfoDialog.gridHidden")}
          {" · "}
          {page.settings.gridSnapEnabled
            ? t("pageInfoDialog.snapOn")
            : t("pageInfoDialog.snapOff")}
          {" · "}
          {t("pageInfoDialog.gridSize")}: {page.settings.gridSize}
        </dd>
      </dl>
      <div className="PageInfoDialog__actions">
        <DialogActionButton label={t("buttons.close")} onClick={onClose} />
        <DialogActionButton
          label={t("buttons.edit")}
          onClick={startEditing}
          actionType="primary"
        />
      </div>
    </>
  );

  const renderEdit = (draft: PageInfoPatch) => (
    <>
      <div className="PageInfoDialog__fields">
        <div>
          <TextField
            label={t("pageInfoDialog.name")}
            value={draft.name}
            onChange={(name) => updateDraft({ name })}
            onKeyDown={handleNameKeyDown}
            selectOnRender
            fullWidth
          />
          {nameErrorMessage && (
            <div className="PageInfoDialog__error" role="alert">
              {nameErrorMessage}
            </div>
          )}
        </div>
        <label className="PageInfoDialog__textarea">
          <span className="PageInfoDialog__label">
            {t("pageInfoDialog.description")}
          </span>
          <textarea
            value={draft.description}
            placeholder={t("pageInfoDialog.descriptionPlaceholder")}
            rows={4}
            onChange={(event) =>
              updateDraft({ description: event.target.value })
            }
            aria-invalid={!!validation.descriptionError}
          />
          <span
            className={
              validation.descriptionError
                ? "PageInfoDialog__counter PageInfoDialog__counter--error"
                : "PageInfoDialog__counter"
            }
          >
            {t("pageInfoDialog.charCount", {
              count: draft.description.length,
              max: PAGE_DESCRIPTION_MAX_LENGTH,
            })}
          </span>
          {validation.descriptionError && (
            <span className="PageInfoDialog__error" role="alert">
              {t("pageInfoDialog.errors.descriptionTooLong", {
                max: PAGE_DESCRIPTION_MAX_LENGTH,
              })}
            </span>
          )}
        </label>
        <CheckboxItem
          checked={draft.showThumbnail}
          onChange={(showThumbnail) => updateDraft({ showThumbnail })}
        >
          {t("pageInfoDialog.showThumbnail")}
        </CheckboxItem>
        <fieldset className="PageInfoDialog__grid">
          <legend>{t("pageInfoDialog.grid")}</legend>
          <label className="PageInfoDialog__row">
            <span>{t("pageInfoDialog.showGrid")}</span>
            <Switch
              name="page-info-grid-mode"
              title={t("pageInfoDialog.showGrid")}
              checked={draft.grid.gridModeEnabled}
              onChange={(gridModeEnabled) => updateGrid({ gridModeEnabled })}
            />
          </label>
          <label className="PageInfoDialog__row">
            <span>{t("pageInfoDialog.snapToGrid")}</span>
            <Switch
              name="page-info-grid-snap"
              title={t("pageInfoDialog.snapToGrid")}
              checked={draft.grid.gridSnapEnabled}
              onChange={(gridSnapEnabled) => updateGrid({ gridSnapEnabled })}
            />
          </label>
          <label className="PageInfoDialog__row">
            <span>{t("pageInfoDialog.gridSize")}</span>
            <input
              className="PageInfoDialog__number"
              type="number"
              min={1}
              max={100}
              value={gridSizeInput}
              onChange={(event) => {
                setGridSizeInput(event.target.value);
                const value = Number(event.target.value);
                if (event.target.value !== "" && Number.isFinite(value)) {
                  updateGrid({ gridSize: getNormalizedGridSize(value) });
                }
              }}
              onBlur={() => setGridSizeInput(String(draft.grid.gridSize))}
            />
          </label>
        </fieldset>
      </div>
      <div className="PageInfoDialog__actions">
        <DialogActionButton
          label={t("buttons.cancel")}
          onClick={cancelEditing}
        />
        <DialogActionButton
          label={t("pageInfoDialog.save")}
          onClick={handleSave}
          actionType="primary"
          disabled={!canSave}
        />
      </div>
    </>
  );

  return (
    <Dialog
      size="small"
      onCloseRequest={onClose}
      title={t("pageInfoDialog.title")}
      className="PageInfoDialog"
    >
      {draft ? renderEdit(draft) : renderView()}
    </Dialog>
  );
};
