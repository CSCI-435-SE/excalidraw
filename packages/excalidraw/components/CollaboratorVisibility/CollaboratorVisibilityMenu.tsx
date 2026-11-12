import clsx from "clsx";
import { Popover } from "radix-ui";
import { useMemo, useState } from "react";

import {
  actionHideAllCollaborators,
  actionLockAllCollaborators,
  actionShowAllCollaborators,
  actionToggleCollaboratorLock,
  actionToggleCollaboratorVisibility,
  actionUnlockAllCollaborators,
} from "../../actions";
import { getClientColor } from "../../clients";
import { useUIAppState } from "../../context/ui-appState";
import { t } from "../../i18n";
import {
  getBulkLockAvailability,
  getCollaboratorVisibilityRows,
} from "../../scene/visibility";
import { useExcalidrawActionManager, useExcalidrawElements } from "../App";
import { Avatar } from "../Avatar";
import {
  DotsHorizontalIcon,
  eyeClosedIcon,
  eyeIcon,
  LockedIcon,
  UnlockedIcon,
} from "../icons";
import { Island } from "../Island";
import { QuickSearch } from "../QuickSearch";

import "./CollaboratorVisibilityMenu.scss";

import type { CollaboratorVisibilityRow } from "../../scene/visibility";
import type { SocketId } from "../../types";

/** same as UserList */
const SHOW_FILTER_AT = 8;

/** title of a row's lock toggle (explains why it's disabled, if it is) */
const getLockTitle = (row: CollaboratorVisibilityRow, label: string) => {
  if (row.isCurrentUser) {
    return t("collaboratorLock.ownCantLock");
  }
  if (row.isHidden) {
    return t("collaboratorLock.hiddenAlwaysLocked", { name: label });
  }
  return t(
    row.isLocked
      ? "collaboratorLock.unlockDrawingsOf"
      : "collaboratorLock.lockDrawingsOf",
    { name: label },
  );
};

const Row = ({
  row,
  label,
  hint,
  onToggle,
  onToggleLock,
  avatarless,
}: {
  row: CollaboratorVisibilityRow;
  label: string;
  hint?: string;
  onToggle: (id: string) => void;
  onToggleLock: (id: string) => void;
  avatarless?: boolean;
}) => (
  <div className="CollaboratorVisibilityMenu__row-wrapper">
    <VisibilityToggle
      row={row}
      label={label}
      hint={hint}
      onToggle={onToggle}
      avatarless={avatarless}
    />
    <button
      type="button"
      className={clsx("CollaboratorVisibilityMenu__lock", {
        "is-locked": row.isLocked,
      })}
      onClick={() => onToggleLock(row.id)}
      disabled={row.isLockDisabled}
      aria-pressed={row.isLocked}
      aria-label={getLockTitle(row, label)}
      title={getLockTitle(row, label)}
      data-testid={`collaborator-lock-row-${row.id}`}
    >
      {row.isLocked ? LockedIcon : UnlockedIcon}
    </button>
  </div>
);

/** #116's row button: toggles the collaborator's visibility */
const VisibilityToggle = ({
  row,
  label,
  hint,
  onToggle,
  avatarless,
}: {
  row: CollaboratorVisibilityRow;
  label: string;
  hint?: string;
  onToggle: (id: string) => void;
  avatarless?: boolean;
}) => (
  <button
    type="button"
    className={clsx("CollaboratorVisibilityMenu__row", {
      "is-hidden": row.isHidden,
    })}
    onClick={() => onToggle(row.id)}
    aria-pressed={!row.isHidden}
    title={t(
      row.isHidden
        ? "collaboratorVisibility.showDrawingsOf"
        : "collaboratorVisibility.hideDrawingsOf",
      { name: label },
    )}
    data-testid={`collaborator-visibility-row-${row.id}`}
  >
    {avatarless ? (
      <span className="CollaboratorVisibilityMenu__misc-avatar">?</span>
    ) : (
      <Avatar
        // same color as the collaborator's avatar/cursor (hashed from the id)
        color={getClientColor(row.id as SocketId, { id: row.id })}
        name={row.username || "?"}
        src={row.avatarUrl}
        onClick={() => {}}
      />
    )}
    <span className="CollaboratorVisibilityMenu__row-text">
      <span className="CollaboratorVisibilityMenu__row-name">{label}</span>
      {hint && (
        <span className="CollaboratorVisibilityMenu__row-hint">{hint}</span>
      )}
    </span>
    <span
      className="CollaboratorVisibilityMenu__row-count"
      title={t("collaboratorVisibility.drawingsCount")}
    >
      {row.drawingsCount}
    </span>
    <span className="CollaboratorVisibilityMenu__row-eye">
      {row.isHidden ? eyeClosedIcon : eyeIcon}
    </span>
  </button>
);

const MenuContent = () => {
  const appState = useUIAppState();
  const elements = useExcalidrawElements();
  const actionManager = useExcalidrawActionManager();
  const [searchTerm, setSearchTerm] = useState("");

  const rows = useMemo(
    () => getCollaboratorVisibilityRows(elements, appState),
    [elements, appState],
  );

  const getLabel = (row: CollaboratorVisibilityRow) => {
    const name = row.username || t("collaboratorVisibility.unnamed");
    return row.isCurrentUser ? t("collaboratorVisibility.you", { name }) : name;
  };

  const term = searchTerm.trim().toLowerCase();
  const matches = (row: CollaboratorVisibilityRow) =>
    !term || getLabel(row).toLowerCase().includes(term);

  const inRoom = rows.inRoom.filter(matches);
  const previouslySeen = rows.previouslySeen.filter(matches);
  const showSearch =
    rows.inRoom.length + rows.previouslySeen.length >= SHOW_FILTER_AT;

  const toggle = (id: string) =>
    actionManager.executeAction(actionToggleCollaboratorVisibility, "ui", id);
  const toggleLock = (id: string) =>
    actionManager.executeAction(actionToggleCollaboratorLock, "ui", id);

  // bulk lock buttons only apply to visible collaborators (not yourself)
  const { canLockAll, canUnlockAll } = getBulkLockAvailability(rows);

  return (
    <div className="CollaboratorVisibilityMenu__content">
      <div className="CollaboratorVisibilityMenu__title">
        {t("collaboratorVisibility.title")}
      </div>
      <div className="CollaboratorVisibilityMenu__bulk">
        <button
          type="button"
          className="CollaboratorVisibilityMenu__bulk-btn"
          onClick={() =>
            actionManager.executeAction(actionShowAllCollaborators, "ui")
          }
          disabled={appState.hiddenCollaboratorIds.size === 0}
        >
          {eyeIcon}
          {t("collaboratorVisibility.showAllShort")}
        </button>
        <button
          type="button"
          className="CollaboratorVisibilityMenu__bulk-btn"
          onClick={() =>
            actionManager.executeAction(actionHideAllCollaborators, "ui")
          }
        >
          {eyeClosedIcon}
          {t("collaboratorVisibility.hideAllShort")}
        </button>
      </div>
      <div className="CollaboratorVisibilityMenu__bulk">
        <button
          type="button"
          className="CollaboratorVisibilityMenu__bulk-btn"
          onClick={() =>
            actionManager.executeAction(actionLockAllCollaborators, "ui")
          }
          disabled={!canLockAll}
        >
          {LockedIcon}
          {t("collaboratorLock.lockAllShort")}
        </button>
        <button
          type="button"
          className="CollaboratorVisibilityMenu__bulk-btn"
          onClick={() =>
            actionManager.executeAction(actionUnlockAllCollaborators, "ui")
          }
          disabled={!canUnlockAll}
        >
          {UnlockedIcon}
          {t("collaboratorLock.unlockAllShort")}
        </button>
      </div>

      {showSearch && (
        <QuickSearch
          placeholder={t("quickSearch.placeholder")}
          onChange={setSearchTerm}
        />
      )}

      <div className="CollaboratorVisibilityMenu__sections">
        {inRoom.length > 0 && (
          <section>
            <div className="CollaboratorVisibilityMenu__section-title">
              {t("collaboratorVisibility.inRoom")}
            </div>
            {inRoom.map((row) => (
              <Row
                key={row.id}
                row={row}
                label={getLabel(row)}
                hint={
                  row.isCurrentUser
                    ? t("collaboratorVisibility.ownRowHint")
                    : undefined
                }
                onToggle={toggle}
                onToggleLock={toggleLock}
              />
            ))}
          </section>
        )}

        {previouslySeen.length > 0 && (
          <section>
            <div className="CollaboratorVisibilityMenu__section-title">
              {t("collaboratorVisibility.previouslySeen")}
            </div>
            {previouslySeen.map((row) => (
              <Row
                key={row.id}
                row={row}
                label={getLabel(row)}
                hint={t("collaboratorVisibility.leftHint")}
                onToggle={toggle}
                onToggleLock={toggleLock}
              />
            ))}
          </section>
        )}

        {/* hidden while filtering by name (it has no name) */}
        {!term && (
          <section>
            <div className="CollaboratorVisibilityMenu__section-title">
              {t("collaboratorVisibility.miscellaneous")}
            </div>
            <Row
              row={rows.miscellaneous}
              label={t("collaboratorVisibility.miscellaneousRow")}
              hint={t("collaboratorVisibility.miscellaneousHint")}
              onToggle={toggle}
              onToggleLock={toggleLock}
              avatarless
            />
          </section>
        )}
      </div>
    </div>
  );
};

/**
 * Rounded-square ⋯ button next to the collaborator avatars, opening the
 * local-only drawing visibility controls.
 */
export const CollaboratorVisibilityMenu = ({
  className,
}: {
  className?: string;
}) => {
  const appState = useUIAppState();
  const [isOpen, setIsOpen] = useState(false);
  const hasHidden = appState.hiddenCollaboratorIds.size > 0;

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger
        className={clsx("CollaboratorVisibilityMenu__trigger", className, {
          "is-active": hasHidden,
        })}
        title={t("collaboratorVisibility.title")}
        aria-label={t("collaboratorVisibility.title")}
        data-testid="collaborator-visibility-trigger"
      >
        {DotsHorizontalIcon}
        {hasHidden && (
          <span
            className="CollaboratorVisibilityMenu__badge"
            data-testid="collaborator-visibility-badge"
          />
        )}
      </Popover.Trigger>
      {isOpen && (
        <Popover.Content
          className="CollaboratorVisibilityMenu__popover"
          align="end"
          sideOffset={10}
          style={{ zIndex: 2 }}
        >
          <Island padding={2}>
            <MenuContent />
          </Island>
        </Popover.Content>
      )}
    </Popover.Root>
  );
};
