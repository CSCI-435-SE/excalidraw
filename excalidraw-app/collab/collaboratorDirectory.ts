/**
 * Per-room directory of collaborators this browser has seen ("Previously
 * seen"), so their drawings stay attributable — and individually toggleable —
 * after they leave, including across tab close/reopen.
 *
 * Stored locally only (room id → client id → name + last seen). Room keys are
 * never stored, so this can't be used to open a room.
 */

import type { CollaboratorDirectoryEntry } from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS } from "../app_constants";

export type CollaboratorDirectory = Map<string, CollaboratorDirectoryEntry>;

/** keep the most recently used rooms only */
const MAX_ROOMS = 20;
/** keep the most recently seen collaborators per room only */
const MAX_ENTRIES_PER_ROOM = 200;
/**
 * how stale `lastSeen` may get before a sighting is worth recording again
 * (pointer updates arrive ~30×/s, we don't want to write on each)
 */
export const SIGHTING_REFRESH_MS = 60 * 1000;

type StoredRooms = Record<
  string,
  { updated: number; entries: Record<string, CollaboratorDirectoryEntry> }
>;

const isEntry = (value: any): value is CollaboratorDirectoryEntry =>
  !!value &&
  typeof value === "object" &&
  (value.username === null || typeof value.username === "string") &&
  typeof value.lastSeen === "number";

const readRooms = (): StoredRooms => {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_COLLABORATOR_DIRECTORY) ||
        "{}",
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};

export const loadCollaboratorDirectory = (
  roomId: string,
): CollaboratorDirectory => {
  const directory: CollaboratorDirectory = new Map();
  const entries = readRooms()[roomId]?.entries;
  if (entries && typeof entries === "object") {
    for (const [clientId, entry] of Object.entries(entries)) {
      if (clientId && isEntry(entry)) {
        directory.set(clientId, {
          username: entry.username,
          lastSeen: entry.lastSeen,
        });
      }
    }
  }
  return directory;
};

export const saveCollaboratorDirectory = (
  roomId: string,
  directory: ReadonlyMap<string, CollaboratorDirectoryEntry>,
) => {
  const { [roomId]: _previous, ...otherRooms } = readRooms();

  const currentRoom = {
    updated: Date.now(),
    entries: Object.fromEntries(
      [...directory]
        .sort(([, a], [, b]) => b.lastSeen - a.lastSeen)
        .slice(0, MAX_ENTRIES_PER_ROOM),
    ),
  };

  // the current room is always kept (even when timestamps tie); the rest
  // are pruned by recency
  const recentOtherRooms = Object.entries(otherRooms)
    .sort(([, a], [, b]) => (b?.updated ?? 0) - (a?.updated ?? 0))
    .slice(0, MAX_ROOMS - 1);

  try {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_COLLABORATOR_DIRECTORY,
      JSON.stringify({
        ...Object.fromEntries(recentOtherRooms),
        [roomId]: currentRoom,
      }),
    );
  } catch {
    // storage unavailable — directory stays in memory for this session
  }
};

/**
 * Records that `clientId` was seen. Returns the updated directory, or `null`
 * when nothing changed enough to be worth publishing/saving.
 *
 * @param username empty/missing = keep the known name (a client may not have
 * picked one yet; that shouldn't erase what we know)
 */
export const recordCollaboratorSighting = (
  directory: ReadonlyMap<string, CollaboratorDirectoryEntry>,
  clientId: string,
  username: string | null | undefined,
  now = Date.now(),
): CollaboratorDirectory | null => {
  const prev = directory.get(clientId);
  const nextUsername = username || prev?.username || null;

  if (
    prev &&
    prev.username === nextUsername &&
    now - prev.lastSeen < SIGHTING_REFRESH_MS
  ) {
    return null;
  }

  const next = new Map(directory);
  next.set(clientId, { username: nextUsername, lastSeen: now });
  return next;
};
