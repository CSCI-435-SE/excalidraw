import { actionClearCanvas } from "../actions";
import { atom, useAtom } from "../editor-jotai";
import { t } from "../i18n";

import { useApp, useExcalidrawActionManager } from "./App";
import ConfirmDialog from "./ConfirmDialog";

export const activeConfirmDialogAtom = atom<"clearCanvas" | null>(null);

export const ActiveConfirmDialog = () => {
  const [activeConfirmDialog, setActiveConfirmDialog] = useAtom(
    activeConfirmDialogAtom,
  );
  const actionManager = useExcalidrawActionManager();
  const app = useApp();

  if (!activeConfirmDialog) {
    return null;
  }

  if (activeConfirmDialog === "clearCanvas") {
    // the canvas is the active page; other pages are its sub-canvases
    const hasOtherPages = app.getPageIds().length > 1;

    if (hasOtherPages) {
      return (
        <ConfirmDialog
          onSecondaryConfirm={() => {
            actionManager.executeAction(actionClearCanvas, "ui", {
              scope: "canvas",
            });
            setActiveConfirmDialog(null);
          }}
          secondaryConfirmText={t("buttons.clearCanvasOnly")}
          onConfirm={() => {
            actionManager.executeAction(actionClearCanvas, "ui", {
              scope: "allPages",
            });
            setActiveConfirmDialog(null);
          }}
          confirmText={t("buttons.clearCanvasAndPages")}
          onCancel={() => setActiveConfirmDialog(null)}
          title={t("clearCanvasDialog.title")}
        >
          <p className="clear-canvas__content">
            {t("clearCanvasDialog.withPages")}
          </p>
        </ConfirmDialog>
      );
    }

    return (
      <ConfirmDialog
        onConfirm={() => {
          actionManager.executeAction(actionClearCanvas);
          setActiveConfirmDialog(null);
        }}
        onCancel={() => setActiveConfirmDialog(null)}
        title={t("clearCanvasDialog.title")}
      >
        <p className="clear-canvas__content"> {t("alerts.clearReset")}</p>
      </ConfirmDialog>
    );
  }

  return null;
};
