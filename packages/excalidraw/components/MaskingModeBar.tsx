import { actionCancelMasking, actionMaskAll, actionMaskNone } from "../actions";
import { getEditedMask } from "../actions/actionMask";
import { t } from "../i18n";

import { useExcalidrawAppState, useExcalidrawElements } from "./App";
import { Island } from "./Island";
import { MaskModeToggle } from "./MaskModeToggle";

import "./MaskingModeBar.scss";

import type { ActionManager } from "../actions/manager";

/** shown at the bottom of the canvas while picking the element to mask */
export const MaskingModeBar = ({
  actionManager,
}: {
  actionManager: ActionManager;
}) => {
  const appState = useExcalidrawAppState();
  const elements = useExcalidrawElements();
  const mask = getEditedMask(elements, appState);

  return (
    <Island padding={1} className="masking-mode-bar">
      <span className="masking-mode-bar__hint">{t("labels.mask.picking")}</span>
      {mask && <MaskModeToggle mask={mask} />}
      <button
        type="button"
        className="masking-mode-bar__button"
        data-testid="masking-mode-all"
        onClick={() => actionManager.executeAction(actionMaskAll, "ui")}
      >
        {t("labels.mask.all")}
      </button>
      <button
        type="button"
        className="masking-mode-bar__button"
        data-testid="masking-mode-none"
        onClick={() => actionManager.executeAction(actionMaskNone, "ui")}
      >
        {t("labels.mask.none")}
      </button>
      <button
        type="button"
        className="masking-mode-bar__button"
        data-testid="masking-mode-cancel"
        onClick={() => actionManager.executeAction(actionCancelMasking, "ui")}
      >
        {t("buttons.cancel")}
      </button>
    </Island>
  );
};
