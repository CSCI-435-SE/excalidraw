/**
 * Collaboration conflict rules:
 * - the latest change wins (hybrid logical clock timestamps in `updated`),
 *   falling back to the version rules for same-ms changes and old data
 * - co-owners (`customData.editorIds`) are merged from both copies
 */
import {
  HLC_COUNTER_RESOLUTION,
  HybridClock,
  decodeHybridTimestamp,
  encodeHybridTimestamp,
} from "@excalidraw/common";
import {
  CREATOR_ID_KEY,
  EDITOR_IDS_KEY,
  EDITOR_SEQS_KEY,
  newElement,
} from "@excalidraw/element";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { reconcileElements } from "../../data/reconcile";

import type { RemoteExcalidrawElement } from "../../data/reconcile";
import type { AppState } from "../../types";

const element = (
  opts: {
    version: number;
    updated?: number;
    versionNonce?: number;
    isDeleted?: boolean;
    editors?: Record<string, { seq: number; present: boolean }>;
  },
  id = "shape",
): OrderedExcalidrawElement => {
  const editors = Object.entries(opts.editors ?? {});
  return {
    ...newElement({ type: "rectangle", x: 0, y: 0 }),
    id,
    index: "a0",
    version: opts.version,
    versionNonce: opts.versionNonce ?? 1,
    updated: opts.updated as number,
    isDeleted: !!opts.isDeleted,
    customData: {
      [CREATOR_ID_KEY]: "bob",
      ...(editors.length
        ? {
            [EDITOR_IDS_KEY]: editors
              .filter(([, e]) => e.present)
              .map(([id]) => id),
            [EDITOR_SEQS_KEY]: Object.fromEntries(
              editors.map(([id, e]) => [id, e.seq]),
            ),
          }
        : {}),
    },
  } as unknown as OrderedExcalidrawElement;
};

const noEdit = {} as AppState;

/** reconciles on "my" client and on the other client; both must agree */
const reconcileBothWays = (
  mine: OrderedExcalidrawElement,
  theirs: OrderedExcalidrawElement,
  appState = noEdit,
) => {
  const onMine = reconcileElements(
    [structuredClone(mine)],
    [structuredClone(theirs)] as RemoteExcalidrawElement[],
    appState,
  )[0];
  const onTheirs = reconcileElements(
    [structuredClone(theirs)],
    [structuredClone(mine)] as RemoteExcalidrawElement[],
    noEdit,
  )[0];
  return { onMine, onTheirs };
};

describe("HybridClock", () => {
  const parts = (timestamp: number) => decodeHybridTimestamp(timestamp);

  it("follows the wall clock", () => {
    let now = 1000;
    const clock = new HybridClock(() => now);
    expect(clock.tick()).toBe(1000);
    now = 1500;
    expect(clock.tick()).toBe(1500);
  });

  it("changes within the same ms get increasing logical counters", () => {
    const clock = new HybridClock(() => 1000);
    const a = clock.tick();
    const b = clock.tick();
    const c = clock.tick();
    expect([a, b, c].map(parts)).toEqual([
      [1000, 0],
      [1000, 1],
      [1000, 2],
    ]);
    expect(a < b && b < c).toBe(true);
  });

  it("never goes backwards, even if the device clock does", () => {
    let now = 1000;
    const clock = new HybridClock(() => now);
    const before = clock.tick();
    now = 400;
    const after = clock.tick();
    expect(after).toBeGreaterThan(before);
    expect(parts(after)).toEqual([1000, 1]);
  });

  it("a change after observing a remote one is strictly newer (device clock behind)", () => {
    const clock = new HybridClock(() => 1000);
    clock.observe(5000);
    expect(clock.tick()).toBeGreaterThan(5000);
    expect(parts(clock.tick())).toEqual([5000, 2]);
  });

  it("a change after observing a remote one in the same ms is strictly newer", () => {
    const clock = new HybridClock(() => 1000);
    const remote = encodeHybridTimestamp(1000, 7);
    clock.observe(remote);
    expect(clock.tick()).toBeGreaterThan(remote);
    expect(parts(clock.tick())).toEqual([1000, 9]);
  });

  it("ignores observed timestamps older than its own", () => {
    const clock = new HybridClock(() => 1000);
    clock.tick();
    clock.observe(10);
    expect(parts(clock.tick())).toEqual([1000, 1]);
  });

  it("adopts remote timestamps only up to the max drift ahead of the wall clock", () => {
    const clock = new HybridClock(() => 1000, 60_000);
    clock.observe(1000 + 3_600_000);
    expect(parts(clock.tick())).toEqual([61_000, 1]);
  });

  it("borrows the next ms after 1024 changes within one ms", () => {
    const clock = new HybridClock(() => 1000);
    let last = 0;
    for (let i = 0; i < HLC_COUNTER_RESOLUTION; i++) {
      last = clock.tick();
    }
    expect(parts(last)).toEqual([1000, HLC_COUNTER_RESOLUTION - 1]);
    const next = clock.tick();
    expect(next).toBeGreaterThan(last);
    expect(parts(next)).toEqual([1001, 0]);
  });

  it("encodes exactly for present-day timestamps", () => {
    const physical = Date.UTC(2026, 10, 12);
    for (const counter of [0, 1, 511, HLC_COUNTER_RESOLUTION - 1]) {
      expect(parts(encodeHybridTimestamp(physical, counter))).toEqual([
        physical,
        counter,
      ]);
    }
  });

  it("ignores invalid timestamps", () => {
    const clock = new HybridClock(() => 1000);
    clock.observe(undefined);
    clock.observe(NaN);
    clock.observe(Infinity);
    clock.observe("9999");
    expect(clock.tick()).toBe(1000);
  });
});

describe("reconcileElements — the latest change wins", () => {
  it("a later delete beats an earlier edit with many more versions", () => {
    // Bob dragged the shape (many version bumps) and stopped at t=100;
    // Alice deleted it at t=200 (a single version bump)
    const bobs = element({ version: 50, updated: 100 });
    const alices = element({ version: 6, updated: 200, isDeleted: true });

    const { onMine, onTheirs } = reconcileBothWays(bobs, alices);
    expect(onMine.isDeleted).toBe(true);
    expect(onTheirs.isDeleted).toBe(true);
  });

  it("a later edit beats an earlier delete", () => {
    const bobs = element({ version: 7, updated: 300 });
    const alices = element({ version: 6, updated: 200, isDeleted: true });

    const { onMine, onTheirs } = reconcileBothWays(bobs, alices);
    expect(onMine.isDeleted).toBe(false);
    expect(onTheirs.isDeleted).toBe(false);
  });

  it("same millisecond: falls back to the higher version", () => {
    const a = element({ version: 9, updated: 200 });
    const b = element({ version: 6, updated: 200, isDeleted: true });

    const { onMine, onTheirs } = reconcileBothWays(a, b);
    expect(onMine.version).toBe(9);
    expect(onTheirs.version).toBe(9);
  });

  it("same millisecond and version: the lowest versionNonce wins", () => {
    const a = element({ version: 6, updated: 200, versionNonce: 5 });
    const b = element({
      version: 6,
      updated: 200,
      versionNonce: 2,
      isDeleted: true,
    });

    const { onMine, onTheirs } = reconcileBothWays(a, b);
    expect(onMine.versionNonce).toBe(2);
    expect(onTheirs.versionNonce).toBe(2);
  });

  it("old data without timestamps: falls back to the version rules", () => {
    const a = element({ version: 9 });
    const b = element({ version: 6, updated: 500, isDeleted: true });

    const { onMine, onTheirs } = reconcileBothWays(a, b);
    expect(onMine.version).toBe(9);
    expect(onTheirs.version).toBe(9);
  });

  it("an element being edited locally still keeps the local copy", () => {
    const mine = element({ version: 7, updated: 100 });
    const theirs = element({ version: 8, updated: 200, isDeleted: true });

    const [result] = reconcileElements(
      [mine],
      [theirs] as RemoteExcalidrawElement[],
      { resizingElement: mine } as unknown as AppState,
    );
    expect(result).toBe(mine);
  });
});

describe("reconcileElements — co-owners are merged", () => {
  const coOwners = (el: OrderedExcalidrawElement) => ({
    ids: el.customData?.[EDITOR_IDS_KEY],
    seqs: el.customData?.[EDITOR_SEQS_KEY],
  });

  it("concurrent co-owner stamps both survive, whichever copy wins", () => {
    const carols = element({
      version: 7,
      updated: 300,
      editors: { carol: { seq: 1, present: true } },
    });
    const daves = element({
      version: 7,
      updated: 200,
      editors: { dave: { seq: 1, present: true } },
    });

    const { onMine, onTheirs } = reconcileBothWays(carols, daves);
    const expected = { ids: ["carol", "dave"], seqs: { carol: 1, dave: 1 } };
    expect(coOwners(onMine)).toEqual(expected);
    expect(coOwners(onTheirs)).toEqual(expected);
    // the element's other properties still come from the latest change
    expect(onMine.updated).toBe(300);
    expect(onTheirs.updated).toBe(300);
  });

  it("an undone co-ownership stays removed against a stale copy", () => {
    // my undo removed me (seq 2) but the other copy is a newer edit made
    // before my undo arrived (it still lists me at seq 1)
    const mine = element({
      version: 9,
      updated: 300,
      editors: { me: { seq: 2, present: false } },
    });
    const theirs = element({
      version: 8,
      updated: 400,
      editors: { me: { seq: 1, present: true } },
    });

    const { onMine, onTheirs } = reconcileBothWays(mine, theirs);
    expect(onMine.updated).toBe(400);
    expect(coOwners(onMine)).toEqual({ ids: [], seqs: { me: 2 } });
    expect(coOwners(onTheirs)).toEqual({ ids: [], seqs: { me: 2 } });
  });

  it("merging into the local winner keeps the same element object", () => {
    const mine = element({
      version: 9,
      updated: 300,
      editors: { carol: { seq: 1, present: true } },
    });
    const theirs = element({
      version: 8,
      updated: 200,
      editors: { dave: { seq: 1, present: true } },
    });

    const [result] = reconcileElements(
      [mine],
      [theirs] as RemoteExcalidrawElement[],
      noEdit,
    );
    expect(result).toBe(mine);
    expect(result.version).toBe(9);
    expect(coOwners(result).ids).toEqual(["carol", "dave"]);
  });

  it("doesn't touch elements whose co-owners already match", () => {
    const mine = element({ version: 9, updated: 300 });
    const theirs = element({ version: 10, updated: 400 }, "shape");

    const [result] = reconcileElements(
      [mine],
      [theirs] as RemoteExcalidrawElement[],
      noEdit,
    );
    expect(result).toBe(theirs);
  });
});
