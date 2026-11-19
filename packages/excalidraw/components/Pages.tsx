import React, { useEffect, useState } from "react";

import clsx from "clsx";

import { isNonDeletedElement } from "@excalidraw/element";

import { exportToCanvas } from "../scene/export";

import { getDefaultAppState } from "../appState";
import { t } from "../i18n";

import ConfirmDialog from "./ConfirmDialog";
import { PageDeleteDialog } from "./PageDeleteDialog";

import "./Pages.scss";

import type { BinaryFiles, UIAppState } from "../types";
import type { DrawingPage } from "../pages";

const PAGE_PREVIEW_WIDTH = 144;
const PAGE_PREVIEW_HEIGHT = 96;

const PageIcon = () => (
  <svg
    aria-hidden="true"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </svg>
);

const PagePreview = React.memo(
  ({
    page,
    files,
    appState,
  }: {
    page: DrawingPage;
    files: BinaryFiles;
    appState: UIAppState;
  }) => {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
      let active = true;
      const elements = page.elements.filter(isNonDeletedElement);

      if (!elements.length) {
        setPreviewUrl(null);
        return;
      }

      const timeout = window.setTimeout(() => {
        const defaultAppState = getDefaultAppState();
        const previewAppState = {
          ...defaultAppState,
          ...appState,
          ...page.settings,
          width: appState.width,
          height: appState.height,
          offsetTop: 0,
          offsetLeft: 0,
          scrollX: 0,
          scrollY: 0,
          zoom: defaultAppState.zoom,
        };

        void exportToCanvas(
          elements,
          previewAppState,
          files,
          {
            exportBackground: true,
            exportPadding: 8,
            viewBackgroundColor: page.settings.viewBackgroundColor,
          },
          (width, height) => {
            const scale = Math.min(
              PAGE_PREVIEW_WIDTH / Math.max(width, 1),
              PAGE_PREVIEW_HEIGHT / Math.max(height, 1),
              1,
            );
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.ceil(width * scale));
            canvas.height = Math.max(1, Math.ceil(height * scale));
            return { canvas, scale };
          },
        )
          .then((canvas) => {
            if (active) {
              setPreviewUrl(canvas.toDataURL());
            }
          })
          .catch((error: unknown) => {
            console.error("Failed to render page preview", error);
          });
      }, 250);

      return () => {
        active = false;
        window.clearTimeout(timeout);
      };
    }, [appState, files, page]);

    return previewUrl ? (
      <img className="page-navigation__preview" src={previewUrl} alt="" />
    ) : (
      <span
        className="page-navigation__preview page-navigation__preview--empty"
        aria-hidden="true"
      />
    );
  },
  (prevProps, nextProps) =>
    prevProps.page === nextProps.page &&
    prevProps.files === nextProps.files &&
    prevProps.appState.exportWithDarkMode ===
      nextProps.appState.exportWithDarkMode &&
    prevProps.appState.theme === nextProps.appState.theme,
);

export const Pages = ({
  pages,
  activePageId,
  appState,
  files,
  onSelectPage,
  onCreatePage,
  clearingSelection,
  onEnterClearingMode,
  onExitClearingMode,
  onTogglePageForClearing,
  onSetAllPagesForClearing,
  onClearSelectedPages,
  selectionMode,
  onEnterDeletingMode,
  onDeleteSelectedPages,
}: {
  pages: readonly DrawingPage[];
  activePageId: string;
  appState: UIAppState;
  files: BinaryFiles;
  onSelectPage: (pageId: string) => void;
  onCreatePage: () => void;
  /** `null` when not in clearing mode */
  clearingSelection: readonly string[] | null;
  onEnterClearingMode: () => void;
  onExitClearingMode: () => void;
  onTogglePageForClearing: (pageId: string) => void;
  onSetAllPagesForClearing: (selected: boolean) => void;
  onClearSelectedPages: () => void;
  /** whether the page selection above is for clearing or deleting */
  selectionMode: "clear" | "delete";
  onEnterDeletingMode: () => void;
  onDeleteSelectedPages: () => void;
}) => {
  // local state so the confirmation is scoped to this editor instance
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const isClearing = clearingSelection !== null;
  // deleting mode (#158) reuses clearing mode's page selection
  const isDeleting = isClearing && selectionMode === "delete";
  const selectedCount = clearingSelection
    ? pages.filter((page) => clearingSelection.includes(page.id)).length
    : 0;
  // there is always at least one page
  const allSelected = selectedCount === pages.length;

  // never carry a pending confirmation into or out of clearing mode
  useEffect(() => {
    setIsConfirmingClear(false);
  }, [isClearing]);

  return (
    <div
      className="page-navigation"
      role="region"
      aria-label={t("labels.pages")}
    >
      {isClearing && (
        <div className="page-navigation__clearing-header">
          {isDeleting ? t("labels.deletingMode") : t("labels.clearingMode")}
        </div>
      )}
      <div className="page-navigation__list">
        {pages.map((page, index) => {
          const isActive = page.id === activePageId;
          const isSelected = !!clearingSelection?.includes(page.id);
          const title = `${t("labels.page")} ${index + 1}`;
          const content = (
            <>
              <PagePreview page={page} files={files} appState={appState} />
              <span className="page-navigation__item-title">
                {isClearing && (
                  <span
                    className={clsx("page-navigation__checkbox", {
                      "page-navigation__checkbox--checked": isSelected,
                    })}
                    aria-hidden="true"
                  >
                    {isSelected ? "✓" : ""}
                  </span>
                )}
                {title}
                {isClearing && isActive && (
                  <span className="page-navigation__current-badge">
                    {t("labels.currentPage")}
                  </span>
                )}
              </span>
            </>
          );

          return isClearing ? (
            <button
              type="button"
              key={page.id}
              role="checkbox"
              className={clsx("page-navigation__item", {
                "page-navigation__item--current": isActive,
                "page-navigation__item--selected": isSelected,
              })}
              aria-label={title}
              aria-checked={isSelected}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onTogglePageForClearing(page.id)}
            >
              {content}
            </button>
          ) : (
            <button
              type="button"
              key={page.id}
              className="page-navigation__item"
              aria-label={title}
              aria-pressed={isActive}
              onClick={() => onSelectPage(page.id)}
            >
              {content}
            </button>
          );
        })}
      </div>
      {isClearing ? (
        <div className="page-navigation__actions">
          <button
            type="button"
            className="page-navigation__add"
            onClick={() => onSetAllPagesForClearing(!allSelected)}
          >
            {allSelected
              ? t("buttons.deselectAllPages")
              : t("buttons.selectAllPages")}
          </button>
          <button
            type="button"
            className="page-navigation__add page-navigation__add--danger"
            onClick={() => setIsConfirmingClear(true)}
            disabled={!selectedCount || appState.viewModeEnabled}
          >
            {isDeleting ? t("labels.delete") : t("buttons.clearPages")}
          </button>
          <button
            type="button"
            className="page-navigation__add"
            onClick={onExitClearingMode}
          >
            {isDeleting
              ? t("buttons.exitDeletingMode")
              : t("buttons.exitClearingMode")}
          </button>
        </div>
      ) : (
        <div className="page-navigation__actions">
          <button
            type="button"
            className="page-navigation__add"
            onClick={onCreatePage}
            disabled={appState.viewModeEnabled}
          >
            <span aria-hidden="true">+</span>
            {t("buttons.addPage")}
          </button>
          <button
            type="button"
            className="page-navigation__add"
            onClick={onEnterClearingMode}
            disabled={appState.viewModeEnabled}
          >
            {t("buttons.enterClearingMode")}
          </button>
          <button
            type="button"
            className="page-navigation__add"
            onClick={onEnterDeletingMode}
            disabled={appState.viewModeEnabled}
          >
            {t("buttons.enterDeletingMode")}
          </button>
        </div>
      )}
      {isDeleting && isConfirmingClear && (
        <PageDeleteDialog
          pages={pages}
          pageIds={clearingSelection}
          onConfirm={() => {
            setIsConfirmingClear(false);
            onDeleteSelectedPages();
          }}
          onCancel={() => setIsConfirmingClear(false)}
        />
      )}
      {isClearing && !isDeleting && isConfirmingClear && (
        <ConfirmDialog
          title={t("clearPagesDialog.title")}
          confirmText={t("buttons.clearPages")}
          onConfirm={() => {
            setIsConfirmingClear(false);
            onClearSelectedPages();
          }}
          onCancel={() => setIsConfirmingClear(false)}
        >
          <p>{t("clearPagesDialog.content", { count: selectedCount })}</p>
        </ConfirmDialog>
      )}
    </div>
  );
};

export { PageIcon };
