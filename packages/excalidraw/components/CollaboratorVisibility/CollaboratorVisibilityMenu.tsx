import clsx from "clsx";
import { Popover } from "radix-ui";
import { useMemo, useState } from "react";

import { getCollaboratorLayerOrder } from "@excalidraw/element";

import {
  actionHideAllCollaborators,
  actionLockAllCollaborators,
  actionMoveCollaboratorLayer,
  actionResetCollaboratorLayerOrder,
  actionShowAllCollaborators,
  actionToggleCollaboratorLayering,
  actionToggleCollaboratorLock,
  actionToggleCollaboratorVisibility,
  actionUnlockAllCollaborators,
} from "../../actions";
import { getClientColor } from "../../clients";
import { useUIAppState } from "../../context/ui-appState";
import { t } from "../../i18n";
import {
  getBulkLockAvailability,
  getCollaboratorLayerRows,
  getCollaboratorVisibilityRows,
} from "../../scene/visibility";
import { useExcalidrawActionManager, useExcalidrawElements } from "../App";
import { Avatar } from "../Avatar";
import {
  BringForwardIcon,
  DotsHorizontalIcon,
  DotsIcon,
  eyeClosedIcon,
  eyeIcon,
  LockedIcon,
  resetIcon,
  SendBackwardIcon,
  UnlockedIcon,
} from "../icons";
import { Island } from "../Island";
import { QuickSearch } from "../QuickSearch";
import { Switch } from "../Switch";

import "./CollaboratorVisibilityMenu.scss";

import type { DragEvent } from "react";

import type {
  CollaboratorLayerRow,
  CollaboratorVisibilityRow,
} from "../../scene/visibility";
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

/** #82: while layering is on, #116's section titles become row labels */
const SECTION_LABELS = {
  inRoom: "collaboratorVisibility.inRoom",
  previouslySeen: "collaboratorVisibility.previouslySeen",
  miscellaneous: "collaboratorVisibility.miscellaneous",
} as const;

/** #82: the ↑ · ↓ controls of a row while layering is on */
type LayerControls = {
  /** the #116 section, shown as a label since rows form a single list */
  sectionLabel: string;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  /**
   * drag-and-drop by the handle (dropping is handled by the list, see
   * `MenuContent`); `null` while it isn't available
   */
  drag: {
    isDragged: boolean;
    /** where the dragged row would land, relative to this row */
    dropIndicator: "above" | "below" | null;
    onDragStart: () => void;
    onDragEnd: () => void;
  } | null;
};

/** marks a row of the layered list, so the list can tell which row a drag is over */
const LAYER_ROW_ID_ATTRIBUTE = "data-layer-row-id";

const LayerButtons = ({
  row,
  label,
  layer,
}: {
  row: CollaboratorVisibilityRow;
  label: string;
  layer: LayerControls;
}) => (
  <div className="CollaboratorVisibilityMenu__layer">
    <button
      type="button"
      className="CollaboratorVisibilityMenu__layer-btn"
      onClick={layer.onMoveUp ?? undefined}
      disabled={!layer.onMoveUp}
      aria-label={t("collaboratorLayer.moveUp", { name: label })}
      title={t("collaboratorLayer.moveUp", { name: label })}
      data-testid={`collaborator-layer-up-${row.id}`}
    >
      {BringForwardIcon}
    </button>
    <span
      className={clsx("CollaboratorVisibilityMenu__layer-handle", {
        "is-disabled": !layer.drag,
      })}
      draggable={!!layer.drag}
      onDragStart={(event) => {
        if (!layer.drag) {
          return;
        }
        // required by some browsers (e.g. Firefox) for a drag to start
        event.dataTransfer?.setData("text/plain", row.id);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
        }
        const rowElement = event.currentTarget.closest(
          ".CollaboratorVisibilityMenu__row-wrapper",
        );
        if (rowElement && event.dataTransfer?.setDragImage) {
          event.dataTransfer.setDragImage(rowElement, 0, 0);
        }
        layer.drag.onDragStart();
      }}
      onDragEnd={() => layer.drag?.onDragEnd()}
      title={t("collaboratorLayer.dragHandle", { name: label })}
      aria-hidden="true"
      data-testid={`collaborator-layer-handle-${row.id}`}
    >
      {DotsIcon}
    </span>
    <button
      type="button"
      className="CollaboratorVisibilityMenu__layer-btn"
      onClick={layer.onMoveDown ?? undefined}
      disabled={!layer.onMoveDown}
      aria-label={t("collaboratorLayer.moveDown", { name: label })}
      title={t("collaboratorLayer.moveDown", { name: label })}
      data-testid={`collaborator-layer-down-${row.id}`}
    >
      {SendBackwardIcon}
    </button>
  </div>
);

const Row = ({
  row,
  label,
  hint,
  onToggle,
  onToggleLock,
  avatarless,
  layer,
}: {
  row: CollaboratorVisibilityRow;
  label: string;
  hint?: string;
  onToggle: (id: string) => void;
  onToggleLock: (id: string) => void;
  avatarless?: boolean;
  /** #82: only while layering is on */
  layer?: LayerControls;
}) => (
  <div
    className={clsx("CollaboratorVisibilityMenu__row-wrapper", {
      "is-dragged": layer?.drag?.isDragged,
      "is-drop-above": layer?.drag?.dropIndicator === "above",
      "is-drop-below": layer?.drag?.dropIndicator === "below",
    })}
    {...(layer ? { [LAYER_ROW_ID_ATTRIBUTE]: row.id } : {})}
    data-testid={`collaborator-row-${row.id}`}
  >
    {layer && <LayerButtons row={row} label={label} layer={layer} />}
    <VisibilityToggle
      row={row}
      label={label}
      hint={hint}
      sectionLabel={layer?.sectionLabel}
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
  sectionLabel,
  onToggle,
  avatarless,
}: {
  row: CollaboratorVisibilityRow;
  label: string;
  hint?: string;
  /** #82: the row's #116 section while layering is on */
  sectionLabel?: string;
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
      {sectionLabel && (
        <span className="CollaboratorVisibilityMenu__row-section">
          {sectionLabel}
        </span>
      )}
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

  // #82: while layering is on, rows form a single list in layer order
  const isLayering = appState.collaboratorLayeringEnabled;
  const layerOrder = useMemo(
    () => getCollaboratorLayerOrder(appState),
    [appState],
  );
  const layerRows = useMemo(
    () => (isLayering ? getCollaboratorLayerRows(rows, layerOrder) : []),
    [isLayering, rows, layerOrder],
  );
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  /** moves `id` to where `targetId` is (positions are in the full order) */
  const moveTo = (id: string, targetId: string) =>
    actionManager.executeAction(actionMoveCollaboratorLayer, "ui", {
      id,
      toIndex: layerOrder.indexOf(targetId),
    });

  const endDrag = () => {
    setDraggedId(null);
    setDropTargetId(null);
  };

  /**
   * ↑ / ↓ move past the neighbouring row of the whole list (also while
   * filtering by name); dragging is only available without a filter
   */
  const draggedIndex = layerRows.findIndex((row) => row.id === draggedId);

  const getLayerControls = (index: number): LayerControls => {
    const row = layerRows[index];
    const above = layerRows[index - 1];
    const below = layerRows[index + 1];
    const isDropTarget =
      draggedIndex !== -1 && draggedIndex !== index && dropTargetId === row.id;
    return {
      sectionLabel: t(SECTION_LABELS[row.section]),
      onMoveUp: above ? () => moveTo(row.id, above.id) : null,
      onMoveDown: below ? () => moveTo(row.id, below.id) : null,
      drag: term
        ? null
        : {
            isDragged: draggedId === row.id,
            // a row dragged up lands above its target, dragged down below it
            dropIndicator: !isDropTarget
              ? null
              : draggedIndex > index
              ? "above"
              : "below",
            onDragStart: () => setDraggedId(row.id),
            onDragEnd: endDrag,
          },
    };
  };

  /**
   * While a row is dragged, the whole list (rows, their contents and the
   * gaps between them) accepts it, so the cursor doesn't flash "no drop"
   * when the pointer crosses into another element. The drop goes to the
   * last row the pointer was over.
   */
  const onListDragEnterOrOver = (event: DragEvent<HTMLDivElement>) => {
    if (!draggedId) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    const rowId = (event.target as Element)
      .closest(`[${LAYER_ROW_ID_ATTRIBUTE}]`)
      ?.getAttribute(LAYER_ROW_ID_ATTRIBUTE);
    if (rowId) {
      setDropTargetId(rowId);
    }
  };

  const onListDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!draggedId) {
      return;
    }
    event.preventDefault();
    // a row reorder, not a drop onto the canvas (App's onDrop)
    event.stopPropagation();
    if (dropTargetId && dropTargetId !== draggedId) {
      moveTo(draggedId, dropTargetId);
    }
    endDrag();
  };

  const isShownWhileFiltering = (row: CollaboratorLayerRow) =>
    row.section === "miscellaneous" ? !term : matches(row);

  const getHint = (row: CollaboratorLayerRow) => {
    if (row.section === "miscellaneous") {
      return t("collaboratorVisibility.miscellaneousHint");
    }
    if (row.section === "previouslySeen") {
      return t("collaboratorVisibility.leftHint");
    }
    return row.isCurrentUser
      ? t("collaboratorVisibility.ownRowHint")
      : undefined;
  };

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
      <div className="CollaboratorVisibilityMenu__bulk">
        <label className="CollaboratorVisibilityMenu__layering">
          <Switch
            name="collaborator-layering"
            checked={isLayering}
            title={t("collaboratorLayer.toggle")}
            onChange={() =>
              actionManager.executeAction(
                actionToggleCollaboratorLayering,
                "ui",
              )
            }
          />
          {t("collaboratorLayer.layering")}
        </label>
        <button
          type="button"
          className="CollaboratorVisibilityMenu__bulk-btn"
          onClick={() =>
            actionManager.executeAction(actionResetCollaboratorLayerOrder, "ui")
          }
          disabled={!isLayering}
          data-testid="collaborator-layer-reset"
        >
          {resetIcon}
          {t("collaboratorLayer.resetShort")}
        </button>
      </div>

      {showSearch && (
        <QuickSearch
          placeholder={t("quickSearch.placeholder")}
          onChange={setSearchTerm}
        />
      )}

      {isLayering ? (
        <div
          className="CollaboratorVisibilityMenu__sections"
          data-testid="collaborator-layer-list"
          onDragEnter={onListDragEnterOrOver}
          onDragOver={onListDragEnterOrOver}
          onDrop={onListDrop}
        >
          {layerRows.map((row, index) =>
            // the miscellaneous row has no name, so it's hidden while
            // filtering by name (as in #116's sections)
            !isShownWhileFiltering(row) ? null : (
              <Row
                key={row.id}
                row={row}
                label={
                  row.section === "miscellaneous"
                    ? t("collaboratorVisibility.miscellaneousRow")
                    : getLabel(row)
                }
                hint={getHint(row)}
                onToggle={toggle}
                onToggleLock={toggleLock}
                avatarless={row.section === "miscellaneous"}
                layer={getLayerControls(index)}
              />
            ),
          )}
        </div>
      ) : (
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
      )}
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
