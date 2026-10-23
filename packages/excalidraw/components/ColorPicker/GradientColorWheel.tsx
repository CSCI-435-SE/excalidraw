import { useEffect, useRef } from "react";

import { isColorDark, OKLCH_MAX_CHROMA, oklchToHex } from "@excalidraw/common";

import type { Oklch } from "@excalidraw/common";

import { t } from "../../i18n";

import "./GradientColorWheel.scss";

export type GradientWheelStop = "a" | "b";

const WHEEL_SIZE = 100;
/** lightness used to paint the wheel itself (stop lightness is set by sliders) */
const WHEEL_DISPLAY_LIGHTNESS = 0.75;
const HUE_STEP = 1;
const CHROMA_STEP = OKLCH_MAX_CHROMA / 100;

let wheelImageCache: { size: number; data: ImageData } | null = null;

const paintWheel = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const size = canvas.width;
  if (wheelImageCache?.size !== size) {
    const image = context.createImageData(size, size);
    const radius = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - radius;
        const dy = y + 0.5 - radius;
        const distance = Math.hypot(dx, dy) / radius;
        if (distance > 1) {
          continue;
        }
        const hex = oklchToHex({
          l: WHEEL_DISPLAY_LIGHTNESS,
          c: distance * OKLCH_MAX_CHROMA,
          h: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360,
        });
        const index = (y * size + x) * 4;
        image.data[index] = parseInt(hex.slice(1, 3), 16);
        image.data[index + 1] = parseInt(hex.slice(3, 5), 16);
        image.data[index + 2] = parseInt(hex.slice(5, 7), 16);
        // soften the outer edge
        image.data[index + 3] = Math.round(
          255 * Math.min(1, (1 - distance) * radius + 0.5),
        );
      }
    }
    wheelImageCache = { size, data: image };
  }
  context.putImageData(wheelImageCache.data, 0, 0);
};

/** position of a stop on the wheel, in 0-1 fractions of the wheel size */
const getStopPosition = ({ c, h }: Oklch) => {
  const distance = Math.min(1, c / OKLCH_MAX_CHROMA) / 2;
  const hueRad = (h * Math.PI) / 180;
  return {
    left: 0.5 + Math.cos(hueRad) * distance,
    top: 0.5 + Math.sin(hueRad) * distance,
  };
};

export const GradientColorWheel = ({
  colors,
  onChange,
}: {
  colors: Record<GradientWheelStop, Oklch>;
  onChange: (stop: GradientWheelStop, color: Oklch) => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const draggedStop = useRef<GradientWheelStop | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const size = Math.round(WHEEL_SIZE * (window.devicePixelRatio || 1));
    canvas.width = size;
    canvas.height = size;
    paintWheel(canvas);
  }, []);

  const getColorFromPointer = (
    event: React.PointerEvent,
    stop: GradientWheelStop,
  ): Oklch | null => {
    const bounds = wheelRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) {
      return null;
    }
    const radius = bounds.width / 2;
    const dx = event.clientX - (bounds.left + radius);
    const dy = event.clientY - (bounds.top + radius);
    return {
      l: colors[stop].l,
      c: Math.min(1, Math.hypot(dx, dy) / radius) * OKLCH_MAX_CHROMA,
      h: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360,
    };
  };

  const getNearestStop = (event: React.PointerEvent): GradientWheelStop => {
    const bounds = wheelRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) {
      return "a";
    }
    const [distanceA, distanceB] = (["a", "b"] as const).map((stop) => {
      const { left, top } = getStopPosition(colors[stop]);
      return Math.hypot(
        event.clientX - (bounds.left + left * bounds.width),
        event.clientY - (bounds.top + top * bounds.height),
      );
    });
    return distanceB < distanceA ? "b" : "a";
  };

  const updateFromPointer = (
    event: React.PointerEvent,
    stop: GradientWheelStop,
  ) => {
    const color = getColorFromPointer(event, stop);
    if (color) {
      onChange(stop, color);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const target = event.target as HTMLElement;
    const stop =
      (target.dataset.stop as GradientWheelStop | undefined) ??
      getNearestStop(event);
    draggedStop.current = stop;
    event.currentTarget.setPointerCapture(event.pointerId);
    wheelRef.current
      ?.querySelector<HTMLElement>(`[data-stop="${stop}"]`)
      ?.focus();
    // clicking a dot shouldn't move it, only clicking empty wheel space
    if (!target.dataset.stop) {
      updateFromPointer(event, stop);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (draggedStop.current) {
      updateFromPointer(event, draggedStop.current);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    draggedStop.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    stop: GradientWheelStop,
  ) => {
    const { l, c, h } = colors[stop];
    const multiplier = event.shiftKey ? 10 : 1;
    let next: Oklch;
    switch (event.key) {
      case "ArrowLeft":
        next = { l, c, h: (h - HUE_STEP * multiplier + 360) % 360 };
        break;
      case "ArrowRight":
        next = { l, c, h: (h + HUE_STEP * multiplier) % 360 };
        break;
      case "ArrowUp":
        next = {
          l,
          c: Math.min(OKLCH_MAX_CHROMA, c + CHROMA_STEP * multiplier),
          h,
        };
        break;
      case "ArrowDown":
        next = { l, c: Math.max(0, c - CHROMA_STEP * multiplier), h };
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    onChange(stop, next);
  };

  return (
    <div className="gradient-color-wheel">
      <div
        ref={wheelRef}
        className="gradient-color-wheel__wheel"
        role="group"
        aria-label={t("colorPicker.gradientWheel")}
        style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <canvas ref={canvasRef} className="gradient-color-wheel__canvas" />
        <span className="gradient-color-wheel__center" />
        {(["a", "b"] as const).map((stop) => {
          const { left, top } = getStopPosition(colors[stop]);
          const { h, c } = colors[stop];
          const hex = oklchToHex(colors[stop]);
          return (
            <button
              key={stop}
              type="button"
              data-stop={stop}
              className="gradient-color-wheel__dot"
              role="slider"
              aria-label={t(
                stop === "a"
                  ? "colorPicker.gradientColorA"
                  : "colorPicker.gradientColorB",
              )}
              aria-valuemin={0}
              aria-valuemax={360}
              aria-valuenow={Math.round(h)}
              aria-valuetext={`H ${Math.round(h)}° C ${Math.round(
                (c / OKLCH_MAX_CHROMA) * 100,
              )}%`}
              style={{
                left: `${left * 100}%`,
                top: `${top * 100}%`,
                background: hex,
                color: isColorDark(hex) ? "#fff" : "#1e1e1e",
                // A stays on top when the dots overlap
                zIndex: stop === "a" ? 2 : 1,
              }}
              onKeyDown={(event) => handleKeyDown(event, stop)}
            >
              {stop.toUpperCase()}
            </button>
          );
        })}
      </div>
      <div className="gradient-color-wheel__hint">
        {t("colorPicker.gradientWheelHint")}
      </div>
    </div>
  );
};
