/**
 * Hybrid logical clock (HLC) for element `updated` timestamps, which
 * collaboration uses to decide which concurrent copy of an element wins
 * ("the latest change wins", see `reconcileElements`).
 *
 * A timestamp is (physical ms, logical counter), encoded in one number as
 * `ms + counter / 1024` so the element format doesn't change: older clients
 * and other code (e.g. expiring deleted elements) still read it as a ms
 * timestamp. Up to 2^43 ms (year ~2248) the encoding is exact in a double.
 *
 * - it follows the wall clock, and never goes backwards even if the device
 *   clock does
 * - every local change gets a timestamp strictly greater than any timestamp
 *   this clock returned or observed before: a change made after seeing
 *   another client's change is always newer than it, even when both happen
 *   in the same millisecond or this device's clock is behind
 * - remote timestamps too far ahead of the local wall clock are only adopted
 *   up to `maxDriftMs`, so one client with a badly wrong clock can't drag
 *   everyone's clock forward
 *
 * What no clock can do: order changes made *concurrently* on devices whose
 * clocks disagree, before they've exchanged anything. Those are ordered by
 * their (skewed) wall clocks.
 */

/** logical ticks per ms */
export const HLC_COUNTER_RESOLUTION = 1024;

const MAX_COUNTER = HLC_COUNTER_RESOLUTION - 1;

/** splits an encoded timestamp into its physical ms and logical counter */
export const decodeHybridTimestamp = (
  timestamp: number,
): [physical: number, counter: number] => {
  const physical = Math.floor(timestamp);
  const counter = Math.min(
    MAX_COUNTER,
    Math.round((timestamp - physical) * HLC_COUNTER_RESOLUTION),
  );
  return [physical, counter];
};

export const encodeHybridTimestamp = (physical: number, counter: number) =>
  physical + counter / HLC_COUNTER_RESOLUTION;

export class HybridClock {
  private physical = 0;
  private counter = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxDriftMs = 60 * 1000,
  ) {}

  /** a timestamp for a local change: greater than any returned/observed */
  tick(): number {
    const wallClock = Math.floor(this.now());
    if (wallClock > this.physical) {
      this.physical = wallClock;
      this.counter = 0;
    } else if (this.counter < MAX_COUNTER) {
      this.counter++;
    } else {
      // more than 1024 changes within one ms: borrow the next ms
      this.physical++;
      this.counter = 0;
    }
    return encodeHybridTimestamp(this.physical, this.counter);
  }

  /** advances the clock to a timestamp seen on a remote element */
  observe(timestamp: unknown) {
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
      return;
    }
    const maxAdoptable = Math.floor(this.now()) + this.maxDriftMs;
    const [physical, counter] =
      timestamp > maxAdoptable
        ? [maxAdoptable, 0]
        : decodeHybridTimestamp(timestamp);

    if (
      physical > this.physical ||
      (physical === this.physical && counter > this.counter)
    ) {
      this.physical = physical;
      this.counter = counter;
    }
  }
}

/** the editor's clock for element `updated` timestamps */
export const elementClock = new HybridClock();
