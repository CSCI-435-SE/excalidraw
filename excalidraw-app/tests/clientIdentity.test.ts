import { vi } from "vitest";

import { STORAGE_KEYS } from "../app_constants";
import { acquireClientId } from "../collab/clientIdentity";

/**
 * Minimal Web Locks stand-in: one shared lock table (the browser profile),
 * one LockManager per simulated tab. Closing a tab releases its locks, like
 * the browser does.
 */
const createBrowser = () => {
  const held = new Map<string, symbol>();

  const openTab = () => {
    const tab = Symbol("tab");

    const locks = {
      request: async (
        name: string,
        optionsOrCallback: LockOptions | LockGrantedCallback<unknown>,
        maybeCallback?: LockGrantedCallback<unknown>,
      ) => {
        const [options, callback] =
          typeof optionsOrCallback === "function"
            ? [{} as LockOptions, optionsOrCallback]
            : [optionsOrCallback, maybeCallback!];

        if (held.has(name)) {
          if (options.ifAvailable) {
            return callback(null);
          }
          throw new Error(`test lock "${name}" contended`);
        }

        held.set(name, tab);
        const result = callback({ name, mode: "exclusive" } as Lock);
        // released when the callback settles; a never-settling callback holds
        // the lock until the tab closes
        Promise.resolve(result).finally(() => {
          if (held.get(name) === tab) {
            held.delete(name);
          }
        });
        return result;
      },
    } as unknown as LockManager;

    const close = () => {
      for (const [name, owner] of held) {
        if (owner === tab) {
          held.delete(name);
        }
      }
    };

    return { locks, close };
  };

  return { openTab };
};

// each simulated tab has its own sessionStorage; localStorage is shared
const switchToFreshTabSession = () => sessionStorage.clear();

describe("acquireClientId", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("gives a new tab a new id and remembers it in the profile's pool", async () => {
    const tab = createBrowser().openTab();

    const id = await acquireClientId(tab.locks);

    expect(id).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_CLIENT_IDS)!),
    ).toEqual([id]);
    expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_STORAGE_CLIENT_ID)).toBe(
      id,
    );
  });

  it("gives concurrently open tabs different ids", async () => {
    const browser = createBrowser();

    const id1 = await acquireClientId(browser.openTab().locks);
    switchToFreshTabSession();
    const id2 = await acquireClientId(browser.openTab().locks);

    expect(id2).not.toBe(id1);
  });

  it("lets a new tab reclaim a closed tab's id", async () => {
    const browser = createBrowser();

    const tab1 = browser.openTab();
    const id1 = await acquireClientId(tab1.locks);
    tab1.close();

    switchToFreshTabSession();
    const id2 = await acquireClientId(browser.openTab().locks);

    expect(id2).toBe(id1);
  });

  it("keeps the id across a reload (same tab session)", async () => {
    const browser = createBrowser();

    const beforeReload = browser.openTab();
    const id1 = await acquireClientId(beforeReload.locks);
    beforeReload.close(); // reload releases the page's locks

    const afterReload = browser.openTab(); // sessionStorage kept
    expect(await acquireClientId(afterReload.locks)).toBe(id1);
  });

  it("gives a duplicated tab (copied sessionStorage) its own id", async () => {
    const browser = createBrowser();

    const id1 = await acquireClientId(browser.openTab().locks);
    // duplicate: same sessionStorage contents, original tab still open
    const id2 = await acquireClientId(browser.openTab().locks);

    expect(id2).not.toBe(id1);
  });

  it("falls back to a per-tab sessionStorage id without Web Locks", async () => {
    const id1 = await acquireClientId(undefined);
    expect(await acquireClientId(undefined)).toBe(id1);

    switchToFreshTabSession();
    expect(await acquireClientId(undefined)).not.toBe(id1);
  });
});

describe("acquireClientId when storage or Web Locks misbehave", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("treats a malformed pool as empty", async () => {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_CLIENT_IDS,
      JSON.stringify({ not: "an array" }),
    );

    const id = await acquireClientId(createBrowser().openTab().locks);

    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_CLIENT_IDS)!),
    ).toEqual([id]);
  });

  it("adds this tab's (sessionStorage) id back to the pool if it's missing", async () => {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_STORAGE_CLIENT_ID, "orphan");

    expect(await acquireClientId(createBrowser().openTab().locks)).toBe(
      "orphan",
    );
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_CLIENT_IDS)!),
    ).toEqual(["orphan"]);
  });

  it("still gets an id when storage is unavailable (private mode, quota…)", async () => {
    // the test setup's localStorage is a plain object, sessionStorage is a
    // jsdom Storage: break both
    for (const storage of [localStorage, Storage.prototype]) {
      for (const method of ["getItem", "setItem"] as const) {
        vi.spyOn(storage, method).mockImplementation(() => {
          throw new Error("storage unavailable");
        });
      }
    }

    const id = await acquireClientId(createBrowser().openTab().locks);

    expect(typeof id).toBe("string");
    expect(id).toBeTruthy();
    expect(localStorage.getItem).toHaveBeenCalled();
    expect(sessionStorage.getItem).toHaveBeenCalled();
  });

  it("falls back to sessionStorage when Web Locks fail", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const brokenLocks = {
      request: () => Promise.reject(new Error("locks broken")),
    } as unknown as LockManager;

    const id = await acquireClientId(brokenLocks);

    expect(id).toBeTruthy();
    expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_STORAGE_CLIENT_ID)).toBe(
      id,
    );
    expect(consoleError).toHaveBeenCalled();
  });
});
