import { useEffect, useRef, useState } from "react";

import {
  createGradientBackground,
  getGradientColors,
  type GradientType,
} from "@excalidraw/element";

import { t } from "../i18n";

import { ColorInput } from "./ColorPicker/ColorInput";
import PickerHeading from "./ColorPicker/PickerHeading";
import { Range } from "./Range";

import "./BackgroundGradientPicker.scss";

const GRADIENT_START_COLOR = "#000000";
const GRADIENT_END_COLOR = "#ffffff";
const MIN_STOP_POSITION = 0;
const MAX_STOP_POSITION = 100;

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
    const previewPosition =
      ((event.clientX - bounds.left) / bounds.width) * MAX_STOP_POSITION;
    const position = MAX_STOP_POSITION - previewPosition;
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
    const currentPosition =
      MAX_STOP_POSITION - (stop === "start" ? startPosition : endPosition);
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
      updateStartPosition(MAX_STOP_POSITION - nextPosition);
    } else {
      updateEndPosition(MAX_STOP_POSITION - nextPosition);
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
    <div className="background-gradient-picker">
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
        <>
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
                MAX_STOP_POSITION - endPosition,
                MAX_STOP_POSITION - startPosition,
              ),
            }}
          >
            {(
              [
                ["end", MAX_STOP_POSITION - endPosition],
                ["start", MAX_STOP_POSITION - startPosition],
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
          {gradientType === "linear" && (
            <Range
              label={
                <span className="background-gradient-picker__angle-label">
                  {t("colorPicker.gradientAngle")}
                </span>
              }
              value={angle}
              onChange={updateAngle}
              min={0}
              max={360}
              step={1}
              minLabel="0°"
              hasCommonValue={false}
              testId="gradient-angle"
              alwaysShowValue
              formatValue={(value) => `${value}°`}
            />
          )}
          <div className="background-gradient-picker__stops">
            <div className="background-gradient-picker__stop">
              <span>{t("colorPicker.gradientStart")}</span>
              <ColorInput
                color={startColor}
                label={t("colorPicker.gradientStart")}
                colorPickerType="elementBackground"
                onChange={updateStartColor}
                manageActiveSection={false}
              />
            </div>
            <div className="background-gradient-picker__stop">
              <span>{t("colorPicker.gradientEnd")}</span>
              <ColorInput
                color={endColor}
                label={t("colorPicker.gradientEnd")}
                colorPickerType="elementBackground"
                onChange={updateEndColor}
                manageActiveSection={false}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
