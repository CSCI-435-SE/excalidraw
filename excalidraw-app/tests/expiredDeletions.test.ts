import { newElement } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { DELETED_ELEMENT_TIMEOUT } from "../app_constants";
import {
  getExpiredResurrections,
  getLocalElementsWithExpiredDeletion,
  isPastDeletionExpiry,
} from "../collab/expiredDeletions";

const NOW = Date.UTC(2026, 10, 12);
const OLD = NOW - DELETED_ELEMENT_TIMEOUT - 1;
const RECENT = NOW - 1000;

const element = (
  id: string,
  updated: number,
  isDeleted = false,
): ExcalidrawElement => ({
  ...newElement({ type: "rectangle", x: 0, y: 0 }),
  id,
  updated,
  isDeleted,
});

describe("isPastDeletionExpiry", () => {
  it("is true only for changes older than the deletion timeout", () => {
    expect(isPastDeletionExpiry(element("a", OLD), NOW)).toBe(true);
    expect(
      isPastDeletionExpiry(element("a", NOW - DELETED_ELEMENT_TIMEOUT), NOW),
    ).toBe(false);
    expect(isPastDeletionExpiry(element("a", RECENT), NOW)).toBe(false);
  });

  it("works with hybrid logical clock timestamps (fractional ms)", () => {
    expect(isPastDeletionExpiry(element("a", OLD + 0.5), NOW)).toBe(true);
  });
});

describe("getExpiredResurrections (receiving an update)", () => {
  it("ignores an old live element this client doesn't have", () => {
    const stale = element("stale", OLD);
    expect(getExpiredResurrections([stale], new Map(), NOW)).toEqual(
      new Set(["stale"]),
    );
  });

  it("measures age by the sender's clock: a sender far behind can still add elements", () => {
    const senderNow = NOW - 3 * DELETED_ELEMENT_TIMEOUT;
    const justDrawn = element("new", senderNow - 1000);
    expect(getExpiredResurrections([justDrawn], new Map(), senderNow)).toEqual(
      new Set(),
    );
  });

  it("ignores nothing without the sender's clock (older clients)", () => {
    const stale = element("stale", OLD);
    expect(getExpiredResurrections([stale], new Map(), undefined)).toEqual(
      new Set(),
    );
  });

  it("accepts elements this client has, recent ones and deletes", () => {
    const known = element("known", OLD);
    const recent = element("recent", RECENT);
    const deleted = element("deleted", OLD, true);
    expect(
      getExpiredResurrections(
        [known, recent, deleted],
        new Map([["known", known]]),
        NOW,
      ),
    ).toEqual(new Set());
  });
});

describe("getLocalElementsWithExpiredDeletion (against the stored scene)", () => {
  const knownToRoom = (ids: string[]) => (id: string) => ids.includes(id);

  it("finds old live elements the room had but no longer has", () => {
    const stale = element("stale", OLD);
    expect(
      getLocalElementsWithExpiredDeletion(
        [stale],
        new Set(),
        knownToRoom(["stale"]),
        NOW,
      ).map((el) => el.id),
    ).toEqual(["stale"]);
  });

  it("keeps elements still in the room", () => {
    const live = element("live", OLD);
    expect(
      getLocalElementsWithExpiredDeletion(
        [live],
        new Set(["live"]),
        knownToRoom(["live"]),
        NOW,
      ),
    ).toEqual([]);
  });

  it("keeps elements the room never saw (e.g. drawn offline)", () => {
    const offline = element("offline", OLD);
    expect(
      getLocalElementsWithExpiredDeletion(
        [offline],
        new Set(),
        () => false,
        NOW,
      ),
    ).toEqual([]);
  });

  it("keeps recently changed elements (not yet saved)", () => {
    const recent = element("recent", RECENT);
    expect(
      getLocalElementsWithExpiredDeletion(
        [recent],
        new Set(),
        knownToRoom(["recent"]),
        NOW,
      ),
    ).toEqual([]);
  });

  it("ignores elements that are already deleted", () => {
    const deleted = element("deleted", OLD, true);
    expect(
      getLocalElementsWithExpiredDeletion(
        [deleted],
        new Set(),
        knownToRoom(["deleted"]),
        NOW,
      ),
    ).toEqual([]);
  });
});
