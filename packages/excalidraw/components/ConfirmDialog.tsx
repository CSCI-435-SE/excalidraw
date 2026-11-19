import { flushSync } from "react-dom";

import { useSetAtom } from "../editor-jotai";
import { t } from "../i18n";

import { Dialog } from "./Dialog";
import DialogActionButton from "./DialogActionButton";
import { isLibraryMenuOpenAtom } from "./LibraryMenu";
import { useExcalidrawContainer, useExcalidrawSetAppState } from "./App";

import "./ConfirmDialog.scss";

import type { DialogProps } from "./Dialog";

interface Props extends Omit<DialogProps, "onCloseRequest"> {
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  /** optional second confirm action, rendered between cancel and confirm */
  onSecondaryConfirm?: () => void;
  secondaryConfirmText?: string;
}
const ConfirmDialog = (props: Props) => {
  const {
    onConfirm,
    onCancel,
    onSecondaryConfirm,
    children,
    confirmText = t("buttons.confirm"),
    cancelText = t("buttons.cancel"),
    secondaryConfirmText = t("buttons.confirm"),
    className = "",
    ...rest
  } = props;
  const setAppState = useExcalidrawSetAppState();
  const setIsLibraryMenuOpen = useSetAtom(isLibraryMenuOpenAtom);
  const { container } = useExcalidrawContainer();

  const runAndRefocus = (callback: () => void) => {
    setAppState({ openMenu: null });
    setIsLibraryMenuOpen(false);
    // flush any pending updates synchronously,
    // otherwise it could lead to crash in some chromium versions (131.0.6778.86),
    // when `.focus` is invoked with container in some intermediate state
    // (container seems mounted in DOM, but focus still causes a crash)
    flushSync(() => {
      callback();
    });

    container?.focus();
  };

  return (
    <Dialog
      onCloseRequest={onCancel}
      size="small"
      {...rest}
      className={`confirm-dialog ${className}`}
    >
      {children}
      <div className="confirm-dialog-buttons">
        <DialogActionButton
          label={cancelText}
          onClick={() => runAndRefocus(onCancel)}
        />
        {onSecondaryConfirm && (
          <DialogActionButton
            label={secondaryConfirmText}
            onClick={() => runAndRefocus(onSecondaryConfirm)}
            actionType="danger"
          />
        )}
        <DialogActionButton
          label={confirmText}
          onClick={() => runAndRefocus(onConfirm)}
          actionType="danger"
        />
      </div>
    </Dialog>
  );
};
export default ConfirmDialog;
