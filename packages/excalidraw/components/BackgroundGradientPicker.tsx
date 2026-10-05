import { useEffect, useRef, useState } from "react";

import {
  createGradientBackground,
  getGradientColors,
  type GradientType,
} from "@excalidraw/element";

import { t } from "../i18n";

import { ColorInput } from "./ColorPicker/ColorInput";
import PickerHeading from "./ColorPicker/PickerHeading";

import "./BackgroundGradientPicker.scss";

const GRADIENT_START_COLOR = "#000000";
const GRADIENT_END_COLOR = "#ffffff";

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
  const [enabled, setEnabled] = useState(!!initialGradient);
  const previousSolidColor = useRef(
    initialGradient ? "transparent" : color || "transparent",
  );

  useEffect(() => {
    const gradient = color ? getGradientColors(color) : null;
    if (gradient) {
      setGradientType(gradient.type);
      setStartColor(gradient.startColor);
      setEndColor(gradient.endColor);
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
    if (enabled) {
      onChange(createGradientBackground(gradientType, value, endColor));
    }
  };

  const updateEndColor = (value: string) => {
    setEndColor(value);
    if (enabled) {
      onChange(createGradientBackground(gradientType, startColor, value));
    }
  };

  const updateGradientType = (type: GradientType) => {
    setGradientType(type);
    if (enabled) {
      onChange(createGradientBackground(type, startColor, endColor));
    }
  };

  const toggleGradient = (isEnabled: boolean) => {
    setEnabled(isEnabled);
    onEnabledChange(isEnabled);
    if (isEnabled) {
      if (color && !getGradientColors(color)) {
        previousSolidColor.current = color;
      }
      onChange(createGradientBackground(gradientType, startColor, endColor));
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
            className="background-gradient-picker__preview"
            role="img"
            aria-label={t("colorPicker.gradientPreview", {
              start: startColor,
              end: endColor,
            })}
            style={{
              backgroundImage: createGradientBackground(
                gradientType,
                startColor,
                endColor,
              ),
            }}
          />
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
