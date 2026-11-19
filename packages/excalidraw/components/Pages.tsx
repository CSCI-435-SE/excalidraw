import clsx from "clsx";
import React, { useEffect, useState } from "react";

import { KEYS } from "@excalidraw/common";

import { isNonDeletedElement } from "@excalidraw/element";

import { exportToCanvas } from "../scene/export";

import { getDefaultAppState } from "../appState";
import { t } from "../i18n";

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

/** The one place page names are built, so page naming (#160) only changes this. */
export const getPageLabel = (page: DrawingPage, index: number) =>
  `${t("labels.page")} ${index + 1}`;

/**
 * Ctrl/Cmd+click multi-selection of pages, kept out of the page tabs so other
 * page features (e.g. clearing, #159) can reuse it.
 */
export const usePageSelection = (pages: readonly DrawingPage[]) => {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  // in page order, and ignoring ids of pages that no longer exist
  const selectedPageIds = pages
    .filter((page) => selectedIds.includes(page.id))
    .map((page) => page.id);

  return {
    selectedPageIds,
    toggle: (pageId: string) =>
      setSelectedIds((ids) =>
        ids.includes(pageId)
          ? ids.filter((id) => id !== pageId)
          : [...ids, pageId],
      ),
    selectAll: () => setSelectedIds(pages.map((page) => page.id)),
    clear: () => setSelectedIds([]),
  };
};

export const Pages = ({
  pages,
  activePageId,
  appState,
  files,
  onSelectPage,
  onCreatePage,
}: {
  pages: readonly DrawingPage[];
  activePageId: string;
  appState: UIAppState;
  files: BinaryFiles;
  onSelectPage: (pageId: string) => void;
  onCreatePage: () => void;
}) => {
  const selection = usePageSelection(pages);

  return (
    <div
      className="page-navigation"
      role="region"
      aria-label={t("labels.pages")}
    >
      <div className="page-navigation__list">
        {pages.map((page, index) => {
          const label = getPageLabel(page, index);
          const isSelected = selection.selectedPageIds.includes(page.id);
          return (
            <button
              type="button"
              key={page.id}
              className={clsx("page-navigation__item", {
                "page-navigation__item--selected": isSelected,
              })}
              aria-label={
                isSelected ? `${label}, ${t("labels.pageSelected")}` : label
              }
              aria-pressed={page.id === activePageId}
              onClick={(event) => {
                if (event[KEYS.CTRL_OR_CMD]) {
                  selection.toggle(page.id);
                  return;
                }
                selection.clear();
                onSelectPage(page.id);
              }}
            >
              <PagePreview page={page} files={files} appState={appState} />
              <span className="page-navigation__item-title">{label}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="page-navigation__action"
        onClick={selection.selectAll}
      >
        {t("labels.selectAll")}
      </button>
      <button
        type="button"
        className="page-navigation__action"
        onClick={onCreatePage}
        disabled={appState.viewModeEnabled}
      >
        <span aria-hidden="true">+</span>
        {t("buttons.addPage")}
      </button>
    </div>
  );
};

export { PageIcon };
