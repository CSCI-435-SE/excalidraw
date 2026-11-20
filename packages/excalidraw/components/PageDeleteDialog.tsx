import { t } from "../i18n";
import { getPageLabel } from "../pages";

import ConfirmDialog from "./ConfirmDialog";

import type { DrawingPage } from "../pages";

export const PageDeleteDialog = ({
  pages,
  pageIds,
  onConfirm,
  onCancel,
}: {
  pages: readonly DrawingPage[];
  pageIds: readonly string[];
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  const labels = pages.flatMap((page) =>
    pageIds.includes(page.id) ? [getPageLabel(page)] : [],
  );

  return (
    <ConfirmDialog
      title={t("deletePagesDialog.title")}
      confirmText={t("labels.delete")}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>{t("deletePagesDialog.message", { pages: labels.join(", ") })}</p>
      {labels.length === pages.length && (
        <p>{t("deletePagesDialog.allPagesNote")}</p>
      )}
    </ConfirmDialog>
  );
};
