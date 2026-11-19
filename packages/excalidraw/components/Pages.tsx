import clsx from "clsx";
import React, { useEffect, useState } from "react";

import { isNonDeletedElement } from "@excalidraw/element";

import { exportToCanvas } from "../scene/export";

import { getDefaultAppState } from "../appState";
import { t } from "../i18n";

import { Tooltip } from "./Tooltip";

import "./Pages.scss";

import type { BinaryFiles, UIAppState } from "../types";
import type { DrawingPage } from "../pages";

const PAGE_PREVIEW_WIDTH = 144;
const PAGE_PREVIEW_HEIGHT = 96;
/** opens the page info menu for the focused page tab */
const PAGE_INFO_KEY = "F2";

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

const PageTab = ({
  page,
  isActive,
  appState,
  files,
  onSelectPage,
  onOpenPageInfo,
}: {
  page: DrawingPage;
  isActive: boolean;
  appState: UIAppState;
  files: BinaryFiles;
  onSelectPage: (pageId: string) => void;
  onOpenPageInfo: (pageId: string) => void;
}) => {
  const tab = (
    <button
      type="button"
      className={clsx("page-navigation__item", {
        "page-navigation__item--no-thumbnail": !page.showThumbnail,
      })}
      aria-label={page.name}
      aria-pressed={isActive}
      onClick={() => onSelectPage(page.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenPageInfo(page.id);
      }}
      onKeyDown={(event) => {
        if (event.key === PAGE_INFO_KEY) {
          event.preventDefault();
          event.stopPropagation();
          onOpenPageInfo(page.id);
        }
      }}
    >
      {page.showThumbnail ? (
        <PagePreview page={page} files={files} appState={appState} />
      ) : null}
      <span className="page-navigation__item-title">
        {!page.showThumbnail && <PageIcon />}
        <span className="page-navigation__item-name">{page.name}</span>
      </span>
    </button>
  );

  // only show the hover metadata when there is something to show
  return page.description ? (
    <Tooltip label={page.description} long>
      {tab}
    </Tooltip>
  ) : (
    tab
  );
};

export const Pages = ({
  pages,
  activePageId,
  appState,
  files,
  onSelectPage,
  onCreatePage,
  onOpenPageInfo,
}: {
  pages: readonly DrawingPage[];
  activePageId: string;
  appState: UIAppState;
  files: BinaryFiles;
  onSelectPage: (pageId: string) => void;
  onCreatePage: () => void;
  onOpenPageInfo: (pageId: string) => void;
}) => (
  <div className="page-navigation" role="region" aria-label={t("labels.pages")}>
    <div className="page-navigation__list">
      {pages.map((page) => (
        <PageTab
          key={page.id}
          page={page}
          isActive={page.id === activePageId}
          appState={appState}
          files={files}
          onSelectPage={onSelectPage}
          onOpenPageInfo={onOpenPageInfo}
        />
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
