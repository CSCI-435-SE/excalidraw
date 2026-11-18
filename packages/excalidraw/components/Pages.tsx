import React, { useEffect, useState } from "react";

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
}) => (
  <div className="page-navigation" role="region" aria-label={t("labels.pages")}>
    <div className="page-navigation__list">
      {pages.map((page, index) => (
        <button
          type="button"
          key={page.id}
          className="page-navigation__item"
          aria-label={`${t("labels.page")} ${index + 1}`}
          aria-pressed={page.id === activePageId}
          onClick={() => onSelectPage(page.id)}
        >
          <PagePreview page={page} files={files} appState={appState} />
          <span className="page-navigation__item-title">
            {t("labels.page")} {index + 1}
          </span>
        </button>
      ))}
    </div>
    <button
      type="button"
      className="page-navigation__add"
      onClick={onCreatePage}
      disabled={appState.viewModeEnabled}
    >
      <span aria-hidden="true">+</span>
      {t("buttons.addPage")}
    </button>
  </div>
);

export { PageIcon };
