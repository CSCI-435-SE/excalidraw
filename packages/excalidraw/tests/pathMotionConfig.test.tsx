import React from "react";
import { vi } from "vitest";

import { pointFrom } from "@excalidraw/math";
import { getSizeFromPoints, reseed } from "@excalidraw/common";
import {
  getCommonBounds,
  getPathTargetElements,
  snapPathTargetsToStart,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawPathElement,
  PathMotionConfig,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { restoreElements } from "../data/restore";
import { AnimationController } from "../renderer/animation";

import { act, fireEvent, queryByTestId, render } from "./test-utils";
import { Pointer, UI } from "./helpers/ui";
import { API } from "./helpers/api";

import type { Animation } from "../renderer/animation";

const { h } = window;
const mouse = new Pointer("mouse");

/** lets the deferred commit in App.componentDidUpdate run */
const flushDeferred = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

const getPath = (id: string) =>
  h.elements.find((el) => el.id === id) as ExcalidrawPathElement;

const getElement = (id: string) =>
  h.elements.find((el) => el.id === id) as ExcalidrawElement;

type TargetKind = "rectangle" | "ellipse" | "diamond" | "text" | "group";

/**
 * target(s) centered around (50, 50), straight path from (300, 300) to
 * (300 + length, 300) — so a target's center at progress `p` along the path
 * is simply (300 + p * length, 300)
 */
const setup = ({
  length = 400,
  motion,
  target = "rectangle",
}: {
  length?: number;
  motion?: Partial<PathMotionConfig>;
  target?: TargetKind;
} = {}) => {
  let targets: ExcalidrawElement[];
  if (target === "group") {
    targets = [
      API.createElement({
        type: "rectangle",
        x: 0,
        y: 0,
        width: 40,
        height: 100,
        groupIds: ["g1"],
      }),
      API.createElement({
        type: "ellipse",
        x: 60,
        y: 0,
        width: 40,
        height: 100,
        groupIds: ["g1"],
      }),
    ];
  } else if (target === "text") {
    targets = [API.createElement({ type: "text", text: "Hello", x: 0, y: 0 })];
  } else {
    targets = [
      API.createElement({
        type: target,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        backgroundColor: "#000000",
      }),
    ];
  }

  const points = [pointFrom(0, 0), pointFrom(length, 0)];
  const path = API.createElement({
    type: "path",
    x: 300,
    y: 300,
    ...getSizeFromPoints(points),
    points: points as ExcalidrawPathElement["points"],
    targetElementId: target === "group" ? null : targets[0].id,
    targetGroupId: target === "group" ? "g1" : null,
    motion,
  });
  API.setElements([...targets, path]);
  return { targets, path };
};

const getTargetsCenter = (path: ExcalidrawPathElement) => {
  const elementsMap = h.app.scene.getNonDeletedElementsMap();
  const [minX, minY, maxX, maxY] = getCommonBounds(
    getPathTargetElements(path, elementsMap),
    elementsMap,
  );
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
};

/**
 * Starts playback of `path` while capturing its per-frame callback instead of
 * letting AnimationController run it on timers, so frames can be stepped by
 * exact amounts of time.
 */
const startPlayback = (path: ExcalidrawPathElement) => {
  let animation: Animation<any> | null = null;
  const spy = vi
    .spyOn(AnimationController, "start")
    .mockImplementation((_key, fn) => {
      animation = fn;
    });
  h.app.pathPlayback.startForPath(getPath(path.id));
  spy.mockRestore();
  expect(animation).not.toBeNull();

  let state: any;
  act(() => {
    state = animation!({ deltaTime: 0, state: undefined });
  });
  return {
    get totalDuration(): number {
      return state!.totalDuration;
    },
    /** advances playback by `ms`; returns false once it finished */
    step(ms: number) {
      act(() => {
        state = animation!({ deltaTime: ms, state });
      });
      return !!state;
    },
  };
};

const enterEditMode = () => {
  mouse.rightClickAt(400, 300);
  const item = queryByTestId(UI.queryContextMenu()!, "editMotionPath");
  expect(item).not.toBeNull();
  fireEvent.click(item!);
  expect(
    document.querySelector('[data-testid="motion-path-settings"]'),
  ).not.toBeNull();
};

const setSlider = (
  testId: "motion-path-start" | "motion-path-end",
  v: number,
) =>
  fireEvent.change(
    document.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement,
    { target: { value: String(v) } },
  );

beforeEach(async () => {
  localStorage.clear();
  reseed(7);
  mouse.reset();
  AnimationController.reset();
  await render(<Excalidraw handleKeyboardGlobally={true} />);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("movement timing", () => {
  // base speed is 300px/s at the "normal" multiplier
  it.each([
    // [path length, speed, expected ms]
    [300, 0.5, 2000],
    [300, 1, 1000],
    [300, 2, 500],
    [900, 0.5, 6000],
    [900, 1, 3000],
    [900, 2, 1500],
  ])("a %ipx path at %fx speed plays for %ims", (length, speed, expected) => {
    const { path } = setup({ length, motion: { speed } });
    expect(startPlayback(path).totalDuration).toBeCloseTo(expected);
  });

  it("only the configured start..end section counts towards the duration", () => {
    const { path } = setup({ length: 600, motion: { start: 0.25, end: 0.75 } });
    expect(startPlayback(path).totalDuration).toBeCloseTo(1000);
  });
});

describe("motion settings in the edit toolbar", () => {
  it("speed presets set the path's speed multiplier", () => {
    const { path } = setup();
    enterEditMode();

    UI.clickOnTestId("motion-path-speed-fast");
    expect(getPath(path.id).motion.speed).toEqual(2);
    expect(
      document
        .querySelector('[data-testid="motion-path-speed-fast"]')!
        .getAttribute("aria-pressed"),
    ).toBe("true");

    UI.clickOnTestId("motion-path-speed-slow");
    expect(getPath(path.id).motion.speed).toEqual(0.5);

    UI.clickOnTestId("motion-path-speed-normal");
    expect(getPath(path.id).motion.speed).toEqual(1);
  });

  it("changing the speed changes the playback duration", () => {
    const { path } = setup({ length: 300 });
    enterEditMode();

    UI.clickOnTestId("motion-path-speed-fast");
    expect(startPlayback(path).totalDuration).toBeCloseTo(500);
  });

  it("Play re-reads a tweaked End when resuming a paused session", () => {
    const { path } = setup({ length: 400 });
    enterEditMode();

    const first = startPlayback(path);
    // snapshot before pausing: `first`'s session is the very object Play
    // will mutate in place on resume, so its `totalDuration` getter would
    // otherwise reflect the *post*-refresh value once read afterwards
    const firstDuration = first.totalDuration;
    first.step(firstDuration / 2);
    expect(getTargetsCenter(getPath(path.id))).toEqual({ x: 500, y: 300 });

    h.app.pathPlayback.pause(getPath(path.id));
    setSlider("motion-path-end", 50);

    // span shrank from 0%..100% to 0%..50%, so the duration halves
    const second = startPlayback(path);
    expect(second.totalDuration).toBeCloseTo(firstDuration / 2);
    // the same progress fraction (50%) within the shrunk span lands at 25%
    // along the path, not where the stale (pre-tweak) session would have it
    expect(getTargetsCenter(getPath(path.id))).toEqual({ x: 400, y: 300 });
  });

  it("the easing select sets the path's easing", () => {
    const { path } = setup();
    enterEditMode();

    fireEvent.change(
      document.querySelector('[data-testid="motion-path-easing"]')!,
      { target: { value: "easeInOut" } },
    );
    expect(getPath(path.id).motion.easing).toEqual("easeInOut");
  });

  it("start/end sliders set the section and re-snap the element onto the start", () => {
    const { path } = setup({ length: 400 });
    enterEditMode();

    setSlider("motion-path-start", 25);
    setSlider("motion-path-end", 75);

    expect(getPath(path.id).motion).toMatchObject({ start: 0.25, end: 0.75 });
    // 25% along (300,300)→(700,300)
    expect(getTargetsCenter(getPath(path.id))).toEqual({ x: 400, y: 300 });
  });

  it("start and end can't cross", () => {
    const { path } = setup();
    enterEditMode();

    setSlider("motion-path-start", 80);
    setSlider("motion-path-end", 50);

    const { start, end } = getPath(path.id).motion;
    expect(start).toBeCloseTo(0.8);
    expect(end).toBeGreaterThan(start);
  });

  it("Reject restores the original motion settings and element position", () => {
    const { path, targets } = setup({ motion: { speed: 2 } });
    enterEditMode();

    UI.clickOnTestId("motion-path-speed-slow");
    setSlider("motion-path-start", 50);
    fireEvent.change(
      document.querySelector('[data-testid="motion-path-easing"]')!,
      { target: { value: "easeIn" } },
    );

    UI.clickOnTestId("motion-path-reject");

    expect(getPath(path.id).motion).toEqual({
      speed: 2,
      start: 0,
      end: 1,
      easing: "linear",
    });
    expect([getElement(targets[0].id).x, getElement(targets[0].id).y]).toEqual([
      0, 0,
    ]);
    expect(h.state.motionPathEditor).toBeNull();
  });

  it("Done keeps the configured settings and the element rests on the start", async () => {
    const { path } = setup({ length: 400 });
    enterEditMode();

    UI.clickOnTestId("motion-path-speed-fast");
    setSlider("motion-path-start", 50);
    UI.clickOnTestId("motion-path-done");
    await flushDeferred();

    expect(h.state.motionPathEditor).toBeNull();
    expect(getPath(path.id).motion).toMatchObject({ speed: 2, start: 0.5 });
    expect(getTargetsCenter(getPath(path.id))).toEqual({ x: 500, y: 300 });
  });
});

describe("playback with configured movement", () => {
  it("travels smoothly from the configured start to the configured end", () => {
    // 400px path, 25%..75% → 200px at 300px/s
    const { path } = setup({ length: 400, motion: { start: 0.25, end: 0.75 } });
    const playback = startPlayback(path);
    const duration = playback.totalDuration;

    expect(getTargetsCenter(path)).toEqual({ x: 400, y: 300 });

    let previousX = 400;
    for (let i = 1; i < 10; i++) {
      playback.step(duration / 10);
      const { x, y } = getTargetsCenter(path);
      expect(x).toBeGreaterThan(previousX);
      expect(x).toBeLessThan(600);
      expect(y).toBeCloseTo(300);
      previousX = x;
    }

    // last frame finishes and the element rests at the configured end,
    // not back where it started — Reset is what sends it back
    expect(playback.step(duration)).toBe(false);
    expect(getTargetsCenter(path)).toEqual({ x: 600, y: 300 });
  });

  it.each([
    // [easing, expected center x at half the duration]
    ["linear", 500], // 0.25 + 0.5 * 0.5   = 0.5    → 300 + 200
    ["easeIn", 425], // 0.25 + 0.125 * 0.5 = 0.3125 → 300 + 125
    ["easeInOut", 500], // symmetric around the midpoint
  ] as const)("applies %s easing", (easing, expectedX) => {
    const { path } = setup({
      length: 400,
      motion: { start: 0.25, end: 0.75, easing },
    });
    const playback = startPlayback(path);

    playback.step(playback.totalDuration / 2);
    expect(getTargetsCenter(path).x).toBeCloseTo(expectedX);
  });

  it("ease out covers more ground early than linear", () => {
    const { path } = setup({ motion: { easing: "easeOut" } });
    const playback = startPlayback(path);

    playback.step(playback.totalDuration / 4);
    // linear would be at 300 + 0.25 * 400 = 400
    expect(getTargetsCenter(path).x).toBeGreaterThan(400);
  });

  it("settings are retained when the animation is played again", () => {
    const { path } = setup({
      length: 400,
      motion: { speed: 2, start: 0.1, end: 0.9, easing: "easeInOut" },
    });

    const run = () => {
      const playback = startPlayback(path);
      const samples = [playback.totalDuration];
      while (playback.step(playback.totalDuration / 8)) {
        samples.push(getTargetsCenter(path).x);
      }
      return samples;
    };

    const first = run();
    const second = run();
    expect(second).toEqual(first);
    expect(getPath(path.id).motion).toEqual({
      speed: 2,
      start: 0.1,
      end: 0.9,
      easing: "easeInOut",
    });
  });

  it.each(["rectangle", "ellipse", "diamond", "text", "group"] as const)(
    "works for a %s target",
    (target) => {
      const { path } = setup({
        target,
        length: 400,
        motion: { start: 0.5, end: 1 },
      });
      const playback = startPlayback(path);

      // aligned onto the configured start point
      const start = getTargetsCenter(path);
      expect(start.x).toBeCloseTo(500);
      expect(start.y).toBeCloseTo(300);

      playback.step(playback.totalDuration / 2);
      const mid = getTargetsCenter(path);
      expect(mid.x).toBeCloseTo(600);
      expect(mid.y).toBeCloseTo(300);
    },
  );
});

describe("moving the path while it's playing", () => {
  /** the resting state every confirmed path has: element centered on start */
  const setupSnapped = (motion?: Partial<PathMotionConfig>) => {
    const result = setup({ length: 400, motion });
    act(() => {
      snapPathTargetsToStart(getPath(result.path.id), h.app.scene);
    });
    expect(getTargetsCenter(getPath(result.path.id))).toEqual({
      x: 300 + (motion?.start ?? 0) * 400,
      y: 300,
    });
    return result;
  };

  it("the element follows the moved path and ends at its (moved) end", () => {
    const { path } = setupSnapped();
    const playback = startPlayback(path);

    playback.step(playback.totalDuration / 2);
    expect(getTargetsCenter(getPath(path.id))).toEqual({ x: 500, y: 300 });

    // drag the path (by a point clear of the element) 100px down, mid-play
    mouse.downAt(650, 300);
    mouse.moveTo(650, 400);
    mouse.upAt(650, 400);
    expect([getPath(path.id).x, getPath(path.id).y]).toEqual([300, 400]);

    // remaining frames ride the path at its new location
    playback.step(playback.totalDuration / 4);
    expect(getTargetsCenter(getPath(path.id))).toEqual({ x: 600, y: 400 });

    // and the element comes to rest on the moved path's end (300,400)→(700,400)
    expect(playback.step(playback.totalDuration)).toBe(false);
    expect(getTargetsCenter(getPath(path.id))).toEqual({ x: 700, y: 400 });
  });

  it("also stays in sync with a configured start", () => {
    const { path } = setupSnapped({ start: 0.25 });
    const playback = startPlayback(path);

    playback.step(playback.totalDuration / 2);
    mouse.downAt(650, 300);
    mouse.moveTo(550, 450);
    mouse.upAt(550, 450);

    expect(playback.step(playback.totalDuration)).toBe(false);
    // the moved path is (200,450)→(600,450); playback still finishes at its
    // configured end (100%), unaffected by the mid-flight move
    expect(getTargetsCenter(getPath(path.id))).toEqual({ x: 600, y: 450 });
  });
});

describe("persistence", () => {
  it("restores legacy paths without motion settings with defaults", () => {
    const { path } = setup();
    const { motion: _motion, ...legacy } = getPath(path.id);

    const [restored] = restoreElements(
      [legacy as unknown as ExcalidrawPathElement],
      null,
    );
    expect((restored as ExcalidrawPathElement).motion).toEqual({
      speed: 1,
      start: 0,
      end: 1,
      easing: "linear",
    });
  });

  it("keeps saved motion settings and clamps invalid ones", () => {
    const { path } = setup();

    const [kept] = restoreElements(
      [
        {
          ...getPath(path.id),
          motion: { speed: 0.5, start: 0.2, end: 0.6, easing: "easeOut" },
        },
      ],
      null,
    );
    expect((kept as ExcalidrawPathElement).motion).toEqual({
      speed: 0.5,
      start: 0.2,
      end: 0.6,
      easing: "easeOut",
    });

    const [clamped] = restoreElements(
      [
        {
          ...getPath(path.id),
          motion: { speed: -1, start: -0.5, end: 3, easing: "nope" as any },
        },
      ],
      null,
    );
    expect((clamped as ExcalidrawPathElement).motion).toEqual({
      speed: 1,
      start: 0,
      end: 1,
      easing: "linear",
    });
  });
});
