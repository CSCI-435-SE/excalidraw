import { actionCancelMasking } from "../actions";
import { t } from "../i18n";

import { Island } from "./Island";

import "./MaskingModeBar.scss";

import type { ActionManager } from "../actions/manager";

/** shown at the bottom of the canvas while picking the element to mask */
export const MaskingModeBar = ({
  actionManager,
}: {
  actionManager: ActionManager;
}) => (
  <Island padding={1} className="masking-mode-bar">
    <span className="masking-mode-bar__hint">{t("labels.mask.picking")}</span>
    <button
      type="button"
      className="masking-mode-bar__cancel"
      data-testid="masking-mode-cancel"
      onClick={() => actionManager.executeAction(actionCancelMasking, "ui")}
    >
      {t("buttons.cancel")}
    </button>
  </Island>
);
