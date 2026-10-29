import clsx from "clsx";

import { getMaskMode } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { actionToggleMaskMode } from "../actions";
import { t } from "../i18n";

import { useExcalidrawActionManager } from "./App";

import "./MaskModeToggle.scss";

/**
 * Show inside | Show outside, for the mask being edited or picked for. Shared
 * by the mask options and the masking-mode bar.
 */
export const MaskModeToggle = ({ mask }: { mask: ExcalidrawElement }) => {
  const actionManager = useExcalidrawActionManager();
  const maskMode = getMaskMode(mask);

  return (
    <div className="mask-mode-toggle" role="radiogroup">
      {(["inside", "outside"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={maskMode === mode}
          className={clsx("mask-mode-toggle__button", {
            "mask-mode-toggle__button--active": maskMode === mode,
          })}
          data-testid={`mask-mode-${mode}`}
          onClick={() =>
            maskMode !== mode &&
            actionManager.executeAction(actionToggleMaskMode, "ui")
          }
        >
          {t(
            mode === "inside"
              ? "labels.mask.showInside"
              : "labels.mask.showOutside",
          )}
        </button>
      ))}
    </div>
  );
};
