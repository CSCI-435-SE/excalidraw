/**
 * The collaborator dropdown's saved settings (#83), next to #116's
 * per-room collaborator directory: one global preference (how newcomers
 * start) and, per room, hidden and locked collaborators, the Layering switch
 * and the layer order.
 *
 * Stored locally only, in one versioned entry. The matching AppState fields
 * are never persisted with the scene, exported or synced; this module is the
 * only place they're saved. Hiding my own drawings is never saved or
 * restored, so a room never opens stuck in view mode.
 */

import {
  DEFAULT_NEW_COLLABORATOR,
  NEW_COLLABORATOR_DEFAULTS,
} from "@excalidraw/element";

import type { AppState } from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS } from "../app_constants";

import { readStoredObject, withRecentRooms } from "./collaboratorDirectory";

/** bump when the stored shape changes; other versions are ignored */
const VERSION = 1;

export type CollaboratorSettings = Pick<
  AppState,
  | "newCollaboratorDefault"
  | "hiddenCollaboratorIds"
  | "lockedCollaboratorIds"
  | "collaboratorLayeringEnabled"
  | "collaboratorLayerOrder"
>;

const SETTINGS_KEYS = [
  "newCollaboratorDefault",
  "hiddenCollaboratorIds",
  "lockedCollaboratorIds",
  "collaboratorLayeringEnabled",
  "collaboratorLayerOrder",
] as const;

/** whether `a` and `b` (e.g. two AppStates) hold the same settings objects */
export const isSameCollaboratorSettings = (
  a: CollaboratorSettings,
  b: CollaboratorSettings,
) => SETTINGS_KEYS.every((key) => a[key] === b[key]);

type StoredRoom = {
  updated: number;
  hidden: string[];
  locked: string[];
  layeringEnabled: boolean;
  layerOrder: readonly string[] | null;
};

const isIdList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === "string");

const readSettings = () => {
  const stored = readStoredObject(
    STORAGE_KEYS.LOCAL_STORAGE_COLLABORATOR_SETTINGS,
  );
  return stored.version === VERSION ? stored : {};
};

/**
 * The saved settings for `roomId`. Anything missing, unreadable or from
 * another version falls back to its default; `selfId` is never restored as
 * hidden.
 */
export const loadCollaboratorSettings = (
  roomId: string,
  selfId: string | null,
): CollaboratorSettings => {
  const stored = readSettings();
  const { hidden, locked, layeringEnabled, layerOrder } =
    stored.rooms?.[roomId] ?? {};
  return {
    newCollaboratorDefault: NEW_COLLABORATOR_DEFAULTS.includes(
      stored.newcomerDefault,
    )
      ? stored.newcomerDefault
      : DEFAULT_NEW_COLLABORATOR,
    hiddenCollaboratorIds: new Set(
      isIdList(hidden) ? hidden.filter((id) => id !== selfId) : [],
    ),
    lockedCollaboratorIds: new Set(isIdList(locked) ? locked : []),
    collaboratorLayeringEnabled: layeringEnabled === true,
    collaboratorLayerOrder: isIdList(layerOrder) ? layerOrder : null,
  };
};

/** saves the settings (the newcomer default for all rooms, the rest for `roomId`) */
export const saveCollaboratorSettings = (
  roomId: string,
  settings: CollaboratorSettings,
  selfId: string | null,
) => {
  const currentRoom: StoredRoom = {
    updated: Date.now(),
    hidden: [...settings.hiddenCollaboratorIds].filter((id) => id !== selfId),
    locked: [...settings.lockedCollaboratorIds],
    layeringEnabled: settings.collaboratorLayeringEnabled,
    layerOrder: settings.collaboratorLayerOrder,
  };
  try {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_COLLABORATOR_SETTINGS,
      JSON.stringify({
        version: VERSION,
        newcomerDefault: settings.newCollaboratorDefault,
        rooms: withRecentRooms(readSettings().rooms, roomId, currentRoom),
      }),
    );
  } catch {
    // storage unavailable — settings stay in memory for this session
  }
};
