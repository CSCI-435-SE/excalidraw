import React, { useEffect, useRef, useState } from "react";

import clsx from "clsx";

import { KEYS } from "@excalidraw/common";
import { isNonDeletedElement } from "@excalidraw/element";

import { exportToCanvas } from "../scene/export";

import { getDefaultAppState } from "../appState";
import { t } from "../i18n";

import ConfirmDialog from "./ConfirmDialog";
import { PageDeleteDialog } from "./PageDeleteDialog";
import { PageRangeSelect } from "./PageRangeSelect";
import { Tooltip } from "./Tooltip";

import "./Pages.scss";

import type { BinaryFiles, UIAppState } from "../types";
import type {
  DrawingPage,
  PageDropPlacement,
  PageFolder,
  PageNavRef,
  PageTree,
} from "../pages";

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

type DropTarget = { ref: PageNavRef; placement: PageDropPlacement };

const isSameRef = (a: PageNavRef | null | undefined, b: PageNavRef) =>
  !!a && a.type === b.type && a.id === b.id;

/**
 * A page tab outside clearing mode: selects the page on click, opens its page
 * info menu on right-click or F2, and shows its description on hover.
 */
const PageTab = ({
  page,
  isActive,
  onSelectPage,
  onOpenPageInfo,
  onShiftContextMenu,
  className,
  buttonProps,
  children,
}: {
  page: DrawingPage;
  isActive: boolean;
  onSelectPage: (pageId: string) => void;
  onOpenPageInfo: (pageId: string) => void;
  /** Shift + right-click selects the page for a new folder (#162) */
  onShiftContextMenu: (pageId: string) => void;
  className?: string;
  buttonProps?: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    "data-folder-selected"?: boolean;
  };
  children: React.ReactNode;
}) => {
  const tab = (
    <button
      type="button"
      {...buttonProps}
      className={clsx("page-navigation__item", className)}
      aria-label={page.name}
      aria-pressed={isActive}
      onClick={(event) => {
        // Shift + click belongs to dragging (#162); it never switches pages
        if (!event.shiftKey) {
          onSelectPage(page.id);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          onShiftContextMenu(page.id);
        } else {
          onOpenPageInfo(page.id);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === PAGE_INFO_KEY) {
          event.preventDefault();
          event.stopPropagation();
          onOpenPageInfo(page.id);
        }
      }}
    >
      {children}
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
  clearingSelection,
  onEnterClearingMode,
  onExitClearingMode,
  onTogglePageForClearing,
  onSetAllPagesForClearing,
  onClearSelectedPages,
  selectionMode,
  onEnterDeletingMode,
  onDeleteSelectedPages,
  onSetPageSelection,
  pageTree,
  onMoveNavItem,
  onCreateFolder,
  onToggleFolder,
  onDeleteFolder,
}: {
  pages: readonly DrawingPage[];
  activePageId: string;
  appState: UIAppState;
  files: BinaryFiles;
  onSelectPage: (pageId: string) => void;
  onCreatePage: () => void;
  onOpenPageInfo: (pageId: string) => void;
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
  onSetPageSelection: (pageIds: readonly string[]) => void;
  /** navigation order and folders (#162); `pages` is in its flattened order */
  pageTree: PageTree;
  onMoveNavItem: (
    dragged: PageNavRef,
    target: PageNavRef,
    placement: PageDropPlacement,
  ) => void;
  onCreateFolder: (pageIds: readonly string[], name: string) => void;
  onToggleFolder: (folderId: string) => void;
  /** deletes the folder only; its pages move back to the top level */
  onDeleteFolder: (folderId: string) => void;
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
  // reordering and folders (#162) are off in view mode and page modes
  const canOrganize = !isClearing && !appState.viewModeEnabled;

  // Shift + drag reordering
  const [drag, setDrag] = useState<PageNavRef | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  // read by the window listeners, which are bound once per drag
  const dropTargetRef = useRef<DropTarget | null>(null);
  dropTargetRef.current = dropTarget;

  // Shift + right-click selection of pages for a new folder
  const [folderSelection, setFolderSelection] = useState<readonly string[]>([]);
  // null = the user has not typed a name, so the default name is shown
  const [folderName, setFolderName] = useState<string | null>(null);

  // pages can be deleted while they are selected for a folder
  const validFolderSelection = folderSelection.filter((id) =>
    pages.some((page) => page.id === id),
  );
  const folderCount = pageTree.filter((node) => node.type === "folder").length;
  const currentFolderName =
    folderName ?? t("labels.defaultFolderName", { number: folderCount + 1 });

  // never carry a pending confirmation into or out of clearing mode
  useEffect(() => {
    setIsConfirmingClear(false);
  }, [isClearing]);

  useEffect(() => {
    if (!canOrganize) {
      setDrag(null);
      setDropTarget(null);
      setFolderSelection([]);
      setFolderName(null);
    }
  }, [canOrganize]);

  useEffect(() => {
    if (!drag) {
      return;
    }
    const endDrag = () => {
      setDrag(null);
      setDropTarget(null);
    };
    const onPointerUp = () => {
      const target = dropTargetRef.current;
      if (target && !isSameRef(drag, target.ref)) {
        onMoveNavItem(drag, target.ref, target.placement);
      }
      endDrag();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEYS.ESCAPE) {
        endDrag();
      }
    };
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [drag, onMoveNavItem]);

  const getDragProps = (ref: PageNavRef) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (!canOrganize || !event.shiftKey || event.button !== 0) {
        return;
      }
      // no text selection or focus change while dragging
      event.preventDefault();
      setDrag(ref);
      setDropTarget(null);
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      if (!drag) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const placement: PageDropPlacement =
        event.clientY > rect.top + rect.height / 2 ? "after" : "before";
      if (
        !isSameRef(dropTarget?.ref, ref) ||
        dropTarget?.placement !== placement
      ) {
        setDropTarget({ ref, placement });
      }
    },
  });

  const getDragClassNames = (ref: PageNavRef) => {
    const isDropTarget =
      !!drag && !isSameRef(drag, ref) && isSameRef(dropTarget?.ref, ref);
    return {
      "page-navigation__item--dragging": isSameRef(drag, ref),
      "page-navigation__item--drop-before":
        isDropTarget && dropTarget?.placement === "before",
      "page-navigation__item--drop-after":
        isDropTarget && dropTarget?.placement === "after",
    };
  };

  const toggleFolderSelection = (pageId: string) => {
    setFolderSelection((selection) =>
      selection.includes(pageId)
        ? selection.filter((id) => id !== pageId)
        : [...selection, pageId],
    );
  };

  const resetFolderSelection = () => {
    setFolderSelection([]);
    setFolderName(null);
  };

  const pagesById = new Map(pages.map((page) => [page.id, page]));

  const renderPage = (pageId: string) => {
    const page = pagesById.get(pageId);
    if (!page) {
      return null;
    }
    const ref: PageNavRef = { type: "page", id: page.id };
    const isActive = page.id === activePageId;
    const isSelected = !!clearingSelection?.includes(page.id);
    const isFolderSelected = validFolderSelection.includes(page.id);
    const title = page.name;
    const content = (
      <>
        {page.showThumbnail ? (
          <PagePreview page={page} files={files} appState={appState} />
        ) : null}
        <span className="page-navigation__item-title">
          {(isClearing || isFolderSelected) && (
            <span
              className={clsx("page-navigation__checkbox", {
                "page-navigation__checkbox--checked": isSelected,
                "page-navigation__checkbox--folder": isFolderSelected,
              })}
              aria-hidden="true"
            >
              {isSelected || isFolderSelected ? "✓" : ""}
            </span>
          )}
          {!page.showThumbnail && <PageIcon />}
          <span className="page-navigation__item-name">{title}</span>
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
      <PageTab
        key={page.id}
        page={page}
        isActive={isActive}
        onSelectPage={onSelectPage}
        onOpenPageInfo={onOpenPageInfo}
        onShiftContextMenu={(id) => {
          if (canOrganize) {
            toggleFolderSelection(id);
          }
        }}
        className={clsx(getDragClassNames(ref), {
          "page-navigation__item--folder-selected": isFolderSelected,
        })}
        buttonProps={{
          ...getDragProps(ref),
          "data-folder-selected": isFolderSelected || undefined,
        }}
      >
        {content}
      </PageTab>
    );
  };

  const renderFolder = (folder: PageFolder) => {
    const ref: PageNavRef = { type: "folder", id: folder.id };
    return (
      <div
        key={folder.id}
        className="page-navigation__folder"
        role="group"
        aria-label={folder.name}
      >
        <div className="page-navigation__folder-row">
          <button
            type="button"
            className={clsx(
              "page-navigation__folder-header",
              getDragClassNames(ref),
            )}
            aria-expanded={!folder.collapsed}
            aria-label={folder.name}
            onClick={(event) => {
              if (!event.shiftKey) {
                onToggleFolder(folder.id);
              }
            }}
            {...getDragProps(ref)}
          >
            <span
              className="page-navigation__folder-chevron"
              aria-hidden="true"
            >
              {folder.collapsed ? "▸" : "▾"}
            </span>
            <span className="page-navigation__folder-name">{folder.name}</span>
            <span className="page-navigation__folder-count" aria-hidden="true">
              {folder.pageIds.length}
            </span>
          </button>
          {canOrganize && (
            <button
              type="button"
              className="page-navigation__folder-delete"
              aria-label={t("buttons.deleteFolder", { name: folder.name })}
              title={t("buttons.deleteFolder", { name: folder.name })}
              onClick={() => onDeleteFolder(folder.id)}
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
        {!folder.collapsed && (
          <div className="page-navigation__folder-pages">
            {folder.pageIds.map(renderPage)}
          </div>
        )}
      </div>
    );
  };

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
      <div
        className={clsx("page-navigation__list", {
          "page-navigation__list--dragging": !!drag,
        })}
      >
        {pageTree.map((node) =>
          node.type === "page" ? renderPage(node.pageId) : renderFolder(node),
        )}
      </div>
      {isClearing ? (
        <div className="page-navigation__actions">
          <div className="page-navigation__actions-row">
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
              className="page-navigation__add"
              onClick={() =>
                onSetPageSelection(
                  pages
                    .filter((page) => page.id !== activePageId)
                    .map((page) => page.id),
                )
              }
              disabled={pages.length < 2}
            >
              {t("buttons.selectOtherPages")}
            </button>
          </div>
          <PageRangeSelect pages={pages} onSelect={onSetPageSelection} />
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
          {canOrganize && validFolderSelection.length > 0 ? (
            <form
              className="page-folder-create"
              onSubmit={(event) => {
                event.preventDefault();
                if (currentFolderName.trim()) {
                  onCreateFolder(validFolderSelection, currentFolderName);
                  resetFolderSelection();
                }
              }}
            >
              <p className="page-folder-create__label">
                {t("labels.pagesSelectedForFolder", {
                  count: validFolderSelection.length,
                })}
              </p>
              <input
                type="text"
                className="page-range-select__input"
                aria-label={t("labels.folderName")}
                value={currentFolderName}
                onChange={(event) => setFolderName(event.target.value)}
                aria-invalid={!currentFolderName.trim()}
              />
              <div className="page-navigation__actions-row">
                <button
                  type="submit"
                  className="page-navigation__add"
                  disabled={!currentFolderName.trim()}
                >
                  {t("buttons.createFolder")}
                </button>
                <button
                  type="button"
                  className="page-navigation__add"
                  onClick={resetFolderSelection}
                >
                  {t("buttons.cancel")}
                </button>
              </div>
            </form>
          ) : (
            !appState.viewModeEnabled && (
              <p className="page-navigation__hint">
                {t("labels.pageOrganizeHint")}
              </p>
            )
          )}
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
