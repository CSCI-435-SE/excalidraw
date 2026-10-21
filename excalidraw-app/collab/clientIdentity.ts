/**
 * Per-tab collaborator identity.
 *
 * Every open tab is its own collaborator (matching the per-tab cursors and
 * avatars), yet a closed tab's id can be reclaimed later so its drawings stay
 * attributed to it:
 *
 * - the browser profile keeps a pool of ids in localStorage
 * - a tab claims an id by holding a Web Lock named after it for its lifetime
 *   (the browser releases it when the tab closes or crashes)
 * - a tab prefers the id in its own sessionStorage (reloads, restored tabs);
 *   a duplicated tab copies sessionStorage but can't get that lock, so it
 *   falls through to a free/new id
 *
 * Without Web Locks we fall back to sessionStorage only (per-tab, but a
 * closed tab's id is not reclaimed).
 */

import { randomId } from "@excalidraw/common";

import { STORAGE_KEYS } from "../app_constants";

/** cap so the pool can't grow unbounded over time */
const MAX_POOL_SIZE = 32;
const POOL_LOCK_NAME = "excalidraw-client-id-pool";
const getIdLockName = (id: string) => `excalidraw-client-id:${id}`;

const readPool = (): string[] => {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_CLIENT_IDS) || "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string" && !!id)
      : [];
  } catch {
    return [];
  }
};

const writePool = (pool: string[]) => {
  try {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_CLIENT_IDS,
      JSON.stringify(pool.slice(-MAX_POOL_SIZE)),
    );
  } catch {
    // storage unavailable (private mode, quota…) — id stays tab-local
  }
};

const readSessionId = (): string | null => {
  try {
    return sessionStorage.getItem(STORAGE_KEYS.SESSION_STORAGE_CLIENT_ID);
  } catch {
    return null;
  }
};

const writeSessionId = (id: string) => {
  try {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_STORAGE_CLIENT_ID, id);
  } catch {
    // storage unavailable — id is still valid for this page lifetime
  }
};

/**
 * Resolves `true` once this tab holds the id's lock, `false` if another tab
 * holds it. A held lock is kept until the tab closes.
 */
const tryClaimId = (locks: LockManager, id: string): Promise<boolean> =>
  new Promise((resolve) => {
    locks
      .request(getIdLockName(id), { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return;
        }
        resolve(true);
        // never settles → lock is held for the lifetime of the tab
        return new Promise<never>(() => {});
      })
      .catch(() => resolve(false));
  });

const claimIdFromPool = async (locks: LockManager): Promise<string> =>
  // serialize pool access across tabs so two tabs opened at once don't
  // overwrite each other's additions
  // (`await`: the DOM typings nest the callback's promise)
  await locks.request(POOL_LOCK_NAME, async () => {
    const pool = readPool();
    const sessionId = readSessionId();
    const candidates = sessionId
      ? [sessionId, ...pool.filter((id) => id !== sessionId)]
      : pool;

    for (const id of candidates) {
      if (await tryClaimId(locks, id)) {
        if (!pool.includes(id)) {
          writePool([...pool, id]);
        }
        return id;
      }
    }

    const id = randomId();
    await tryClaimId(locks, id);
    writePool([...pool, id]);
    return id;
  });

/**
 * Claims an id for this tab. Use `getClientId()` instead; exported for tests
 * (`locks` lets them simulate several tabs).
 */
export const acquireClientId = async (
  locks: LockManager | undefined = typeof navigator !== "undefined"
    ? navigator.locks
    : undefined,
): Promise<string> => {
  let id: string | null = null;
  if (locks) {
    try {
      id = await claimIdFromPool(locks);
    } catch (error: any) {
      console.error("Failed to claim collaborator id from pool", error);
    }
  }

  id = id ?? readSessionId() ?? randomId();
  writeSessionId(id);
  return id;
};

let clientIdPromise: Promise<string> | null = null;

/** This tab's collaborator id. Stable for the tab's lifetime. */
export const getClientId = (): Promise<string> => {
  if (!clientIdPromise) {
    clientIdPromise = acquireClientId();
  }
  return clientIdPromise;
};
