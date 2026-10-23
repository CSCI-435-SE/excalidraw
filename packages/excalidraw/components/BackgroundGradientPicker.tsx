import { useEffect, useRef, useState } from "react";

import {
  colorToHex,
  colorToOklch,
  getOklchCusp,
  OKLCH_MAX_CHROMA,
  oklchToHex,
} from "@excalidraw/common";
import {
  createGradientBackground,
  getGradientColors,
  type GradientType,
} from "@excalidraw/element";

import type { Oklch } from "@excalidraw/common";

import { t } from "../i18n";

import { ColorInput } from "./ColorPicker/ColorInput";
import { GradientColorWheel } from "./ColorPicker/GradientColorWheel";
import PickerHeading from "./ColorPicker/PickerHeading";

import "./BackgroundGradientPicker.scss";

import type { GradientWheelStop } from "./ColorPicker/GradientColorWheel";

const GRADIENT_START_COLOR = "#000000";
const GRADIENT_END_COLOR = "#ffffff";
const MIN_STOP_POSITION = 0;
const MAX_STOP_POSITION = 100;
const GRADIENT_NAV_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

// The lightness slider tops out at white only for grey (zero chroma). With
// chroma, 100% is the lightest color that still keeps that chroma: a point on
// the sRGB gamut's upper edge, which runs from white to the hue's cusp. A curve
// spreads out the lighter end, since low OKLCH lightness looks near-black.
const LIGHTNESS_CURVE = 0.6;

const getMaxLightness = ({ c, h }: Pick<Oklch, "c" | "h">) => {
  const cusp = getOklchCusp(h);
  return 1 - (1 - cusp.l) * Math.min(1, c / cusp.c);
};

const sliderToLightness = (value: number, color: Pick<Oklch, "c" | "h">) =>
  getMaxLightness(color) * (value / 100) ** LIGHTNESS_CURVE;

/** slider track showing the stop's color from black to its 100% lightness */
const getLightnessTrack = (color: Pick<Oklch, "c" | "h">) =>
  `linear-gradient(to right, ${[0, 25, 50, 75, 100]
    .map((value) =>
      oklchToHex({ ...color, l: sliderToLightness(value, color) }),
    )
    .join(", ")})`;

const lightnessToSlider = (color: Oklch) =>
  Math.round(
    Math.min(1, color.l / getMaxLightness(color)) ** (1 / LIGHTNESS_CURVE) *
      100,
  );

export const BackgroundGradientPicker = ({
  color,
  onChange,
  onEnabledChange,
}: {
  color: string | null;
  onChange: (color: string) => void;
  onEnabledChange: (enabled: boolean) => void;
}) => {
  const initialGradient = color ? getGradientColors(color) : null;
  const [gradientType, setGradientType] = useState<GradientType>(
    initialGradient?.type ?? "linear",
  );
  const [startColor, setStartColor] = useState(
    initialGradient?.startColor ?? GRADIENT_START_COLOR,
  );
  const [endColor, setEndColor] = useState(
    initialGradient?.endColor ?? GRADIENT_END_COLOR,
  );
  const [angle, setAngle] = useState(initialGradient?.angle ?? 90);
  const [startPosition, setStartPosition] = useState(
    initialGradient?.startPosition ?? MIN_STOP_POSITION,
  );
  const [endPosition, setEndPosition] = useState(
    initialGradient?.endPosition ?? MAX_STOP_POSITION,
  );
  const [enabled, setEnabled] = useState(!!initialGradient);
  const previewRef = useRef<HTMLDivElement>(null);
  const draggedStop = useRef<"start" | "end" | null>(null);
  const previousSolidColor = useRef(
    initialGradient ? "transparent" : color || "transparent",
  );
  // last OKLCH value and lightness slider value per stop, so hue/chroma
  // survive round-trips through hex (e.g. hue is lost when dragging lightness
  // to 0 or chroma to the center)
  const stopCache = useRef<
    Partial<Record<GradientWheelStop, { oklch: Oklch; lightness: number }>>
  >({});

  const getStop = (stop: GradientWheelStop, stopColor: string) => {
    const cached = stopCache.current[stop];
    if (
      cached &&
      oklchToHex(cached.oklch) === colorToHex(stopColor)?.slice(0, 7)
    ) {
      return cached;
    }
    const oklch = colorToOklch(stopColor) ?? { l: 0, c: 0, h: 0 };
    const next = { oklch, lightness: lightnessToSlider(oklch) };
    stopCache.current[stop] = next;
    return next;
  };

  const stops = {
    a: getStop("a", startColor),
    b: getStop("b", endColor),
  };
  const stopOklch: Record<GradientWheelStop, Oklch> = {
    a: stops.a.oklch,
    b: stops.b.oklch,
  };

  const applyGradient = (
    changes: Partial<{
      type: GradientType;
      startColor: string;
      endColor: string;
      angle: number;
      startPosition: number;
      endPosition: number;
    }>,
  ) => {
    if (enabled) {
      onChange(
        createGradientBackground(
          changes.type ?? gradientType,
          changes.startColor ?? startColor,
          changes.endColor ?? endColor,
          changes.angle ?? angle,
          changes.startPosition ?? startPosition,
          changes.endPosition ?? endPosition,
        ),
      );
    }
  };

  useEffect(() => {
    const gradient = color ? getGradientColors(color) : null;
    if (gradient) {
      setGradientType(gradient.type);
      setStartColor(gradient.startColor);
      setEndColor(gradient.endColor);
      setAngle(gradient.angle ?? 90);
      setStartPosition(gradient.startPosition ?? MIN_STOP_POSITION);
      setEndPosition(gradient.endPosition ?? MAX_STOP_POSITION);
      setEnabled(true);
      onEnabledChange(true);
    } else {
      setEnabled(false);
      onEnabledChange(false);
      if (color) {
        previousSolidColor.current = color;
      }
    }
  }, [color, onEnabledChange]);

  const updateStartColor = (value: string) => {
    setStartColor(value);
    applyGradient({ startColor: value });
  };

  const updateEndColor = (value: string) => {
    setEndColor(value);
    applyGradient({ endColor: value });
  };

  const updateStop = (
    stop: GradientWheelStop,
    { c, h }: Pick<Oklch, "c" | "h">,
    lightness: number,
  ) => {
    const oklch = { l: sliderToLightness(lightness, { c, h }), c, h };
    stopCache.current[stop] = { oklch, lightness };
    const hex = oklchToHex(oklch);
    if (stop === "a") {
      updateStartColor(hex);
    } else {
      updateEndColor(hex);
    }
  };

  const updateGradientType = (type: GradientType) => {
    setGradientType(type);
    applyGradient({ type });
  };

  const updateAngle = (value: number) => {
    setAngle(value);
    applyGradient({ angle: value });
  };

  const updateStartPosition = (position: number) => {
    const nextPosition = Math.min(
      endPosition,
      Math.max(MIN_STOP_POSITION, Math.round(position)),
    );
    setStartPosition(nextPosition);
    applyGradient({ startPosition: nextPosition });
  };

  const updateEndPosition = (position: number) => {
    const nextPosition = Math.max(
      startPosition,
      Math.min(MAX_STOP_POSITION, Math.round(position)),
    );
    setEndPosition(nextPosition);
    applyGradient({ endPosition: nextPosition });
  };

  const updateStopFromPointer = (
    event: React.PointerEvent<HTMLButtonElement>,
    stop: "start" | "end",
  ) => {
    const bounds = previewRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) {
      return;
    }
    const position =
      ((event.clientX - bounds.left) / bounds.width) * MAX_STOP_POSITION;
    if (stop === "start") {
      updateStartPosition(position);
    } else {
      updateEndPosition(position);
    }
  };

  const handleStopPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    stop: "start" | "end",
  ) => {
    event.preventDefault();
    draggedStop.current = stop;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleStopPointerMove = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (draggedStop.current) {
      updateStopFromPointer(event, draggedStop.current);
    }
  };

  const handleStopPointerUp = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    draggedStop.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleStopKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    stop: "start" | "end",
  ) => {
    const currentPosition = stop === "start" ? startPosition : endPosition;
    const step = event.shiftKey ? 10 : 1;
    let nextPosition: number;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        nextPosition = currentPosition - step;
        break;
      case "ArrowRight":
      case "ArrowUp":
        nextPosition = currentPosition + step;
        break;
      case "Home":
        nextPosition = MIN_STOP_POSITION;
        break;
      case "End":
        nextPosition = MAX_STOP_POSITION;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (stop === "start") {
      updateStartPosition(nextPosition);
    } else {
      updateEndPosition(nextPosition);
    }
  };

  const toggleGradient = (isEnabled: boolean) => {
    setEnabled(isEnabled);
    onEnabledChange(isEnabled);
    if (isEnabled) {
      if (color && !getGradientColors(color)) {
        previousSolidColor.current = color;
      }
      onChange(
        createGradientBackground(
          gradientType,
          startColor,
          endColor,
          angle,
          startPosition,
          endPosition,
        ),
      );
    } else {
      onChange(previousSolidColor.current);
    }
  };

  return (
    <div
      className="background-gradient-picker"
      onKeyDown={(event) => {
        // keep slider keys away from the color picker's palette navigation,
        // which would otherwise replace the gradient with a swatch color
        if (GRADIENT_NAV_KEYS.has(event.key)) {
          event.stopPropagation();
        }
      }}
    >
      <div className="background-gradient-picker__header">
        <label className="background-gradient-picker__toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => toggleGradient(event.target.checked)}
            onKeyDown={(event) => event.stopPropagation()}
          />
          <PickerHeading>{t("colorPicker.gradientEnabled")}</PickerHeading>
        </label>
        {enabled && (
          <span className="background-gradient-picker__chip">
            {t("colorPicker.gradientColorSpace")}
          </span>
        )}
      </div>
      {enabled && (
        <>
          <GradientColorWheel
            colors={stopOklch}
            onChange={(stop, oklch) =>
              updateStop(stop, oklch, stops[stop].lightness)
            }
          />
          {(
            [
              ["a", startColor, updateStartColor],
              ["b", endColor, updateEndColor],
            ] as const
          ).map(([stop, stopColor, updateColor]) => {
            const oklch = stopOklch[stop];
            const label = t(
              stop === "a"
                ? "colorPicker.gradientColorA"
                : "colorPicker.gradientColorB",
            );
            const { lightness } = stops[stop];
            return (
              <div
                key={stop}
                className="background-gradient-picker__card"
                data-testid={`gradient-card-${stop}`}
              >
                <div className="background-gradient-picker__card-row">
                  <span
                    className="background-gradient-picker__badge"
                    aria-hidden="true"
                  >
                    {stop.toUpperCase()}
                  </span>
                  <ColorInput
                    color={stopColor}
                    label={label}
                    colorPickerType="elementBackground"
                    onChange={updateColor}
                    manageActiveSection={false}
                  />
                </div>
                <div className="background-gradient-picker__card-row">
                  <input
                    type="range"
                    className="background-gradient-picker__slider"
                    aria-label={`${label} ${t(
                      "colorPicker.gradientLightness",
                    )}`}
                    data-testid={`gradient-lightness-${stop}`}
                    min={0}
                    max={100}
                    step={1}
                    value={lightness}
                    onChange={(event) =>
                      updateStop(stop, oklch, +event.target.value)
                    }
                    style={{
                      ["--slider-track" as string]: getLightnessTrack(oklch),
                    }}
                  />
                  <span
                    className="background-gradient-picker__readout"
                    title={`H ${Math.round(oklch.h)}° / C ${Math.round(
                      (Math.min(oklch.c, OKLCH_MAX_CHROMA) / OKLCH_MAX_CHROMA) *
                        100,
                    )}%`}
                  >
                    {`L ${lightness}%`}
                  </span>
                </div>
              </div>
            );
          })}
          <div className="background-gradient-picker__header">
            <PickerHeading>
              {t("colorPicker.gradientPreviewHeading")}
            </PickerHeading>
            <div
              className="background-gradient-picker__type-switch"
              role="group"
              aria-label={t("colorPicker.gradientType")}
            >
              {(["linear", "radial"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={gradientType === type}
                  onClick={() => updateGradientType(type)}
                >
                  {t(`colorPicker.gradientType_${type}`)}
                </button>
              ))}
            </div>
          </div>
          <div
            ref={previewRef}
            className="background-gradient-picker__preview"
            role="group"
            aria-label={t("colorPicker.gradientPreview", {
              start: startColor,
              end: endColor,
            })}
            style={{
              backgroundImage: createGradientBackground(
                gradientType,
                startColor,
                endColor,
                90,
                startPosition,
                endPosition,
              ),
            }}
          >
            {(
              [
                ["start", startPosition],
                ["end", endPosition],
              ] as const
            ).map(([stop, position]) => (
              <button
                key={stop}
                type="button"
                className="background-gradient-picker__stop-handle"
                role="slider"
                aria-label={t(
                  stop === "start"
                    ? "colorPicker.gradientStartPosition"
                    : "colorPicker.gradientEndPosition",
                )}
                aria-valuemin={MIN_STOP_POSITION}
                aria-valuemax={MAX_STOP_POSITION}
                aria-valuenow={position}
                aria-valuetext={`${position}%`}
                style={{
                  left: `${position}%`,
                }}
                onPointerDown={(event) => handleStopPointerDown(event, stop)}
                onPointerMove={handleStopPointerMove}
                onPointerUp={handleStopPointerUp}
                onPointerCancel={handleStopPointerUp}
                onKeyDown={(event) => handleStopKeyDown(event, stop)}
              />
            ))}
          </div>
          <div className="background-gradient-picker__amounts">
            <span>{`A · ${startPosition}%`}</span>
            <span>{`B · ${endPosition}%`}</span>
          </div>
          {gradientType === "linear" && (
            <label className="background-gradient-picker__angle">
              <span className="background-gradient-picker__angle-label">
                {t("colorPicker.gradientAngle")}
              </span>
              <input
                type="range"
                className="background-gradient-picker__slider"
                data-testid="gradient-angle"
                min={0}
                max={360}
                step={1}
                value={angle}
                onChange={(event) => updateAngle(+event.target.value)}
                style={{
                  ["--slider-track" as string]: `linear-gradient(to right, var(--color-slider-track) ${
                    (angle / 360) * 100
                  }%, var(--button-bg) ${(angle / 360) * 100}%)`,
                }}
              />
              <span className="background-gradient-picker__readout">
                {`${angle}°`}
              </span>
            </label>
          )}
        </>
      )}
    </div>
  );
};
