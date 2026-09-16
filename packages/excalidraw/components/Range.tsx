import React, { useEffect } from "react";

import { RadioButton } from "./RadioButton";

import "./Range.scss";

import type { JSX } from "react";

export type RangeNotch = {
  value: number;
  icon: JSX.Element;
  label: string;
  testId?: string;
};

export type RangeProps = {
  label: React.ReactNode;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  minLabel?: React.ReactNode;
  hasCommonValue?: boolean;
  testId?: string;
  /** exact, directly-selectable presets rendered as a row above the track, equally spaced */
  notches?: RangeNotch[];
  /** formats the live numeric value shown above the thumb */
  formatValue?: (value: number) => React.ReactNode;
  /** show the value bubble even when value === min (default: hidden at min) */
  alwaysShowValue?: boolean;
};

export const Range = ({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 10,
  minLabel = min,
  hasCommonValue = true,
  testId,
  notches,
  formatValue,
  alwaysShowValue = false,
}: RangeProps) => {
  const rangeRef = React.useRef<HTMLInputElement>(null);
  const valueRef = React.useRef<HTMLDivElement>(null);
  const minLabelRef = React.useRef<HTMLDivElement>(null);

  const displayValue = formatValue ? formatValue(value) : value;
  const showsValue = alwaysShowValue || value !== min;

  useEffect(() => {
    if (rangeRef.current && valueRef.current) {
      const rangeElement = rangeRef.current;
      const valueElement = valueRef.current;
      const inputWidth = rangeElement.offsetWidth;
      const thumbWidth =
        parseFloat(
          getComputedStyle(rangeElement).getPropertyValue(
            "--slider-thumb-size",
          ),
        ) || 16;
      const progress = ((value - min) / (max - min || 1)) * 100;
      const position =
        (progress / 100) * (inputWidth - thumbWidth) + thumbWidth / 2;
      valueElement.style.left = `${position}px`;
      rangeElement.style.background = `linear-gradient(to right, var(--color-slider-track) 0%, var(--color-slider-track) ${progress}%, var(--button-bg) ${progress}%, var(--button-bg) 100%)`;
    }

    if (valueRef.current && minLabelRef.current) {
      const minLabelElement = minLabelRef.current;
      // hide the min-value tick label whenever the value bubble would render
      // on top of (or right next to) it, so the two never overlap
      const overlapping =
        showsValue &&
        valueRef.current.getBoundingClientRect().left <
          minLabelElement.getBoundingClientRect().right + 4;
      minLabelElement.style.visibility = overlapping ? "hidden" : "visible";
    }
  }, [max, min, value, showsValue]);

  return (
    <label className="control-label">
      {label}
      <div className="range-wrapper">
        {notches && notches.length > 0 && (
          <div className="range-notches">
            {notches.map((notch) => (
              <RadioButton
                key={notch.value}
                icon={notch.icon}
                title={notch.label}
                testId={notch.testId}
                active={hasCommonValue && value === notch.value}
                onClick={() => onChange(notch.value)}
              />
            ))}
          </div>
        )}
        <input
          style={{
            ["--color-slider-track" as string]: hasCommonValue
              ? undefined
              : "var(--button-bg)",
          }}
          ref={rangeRef}
          type="range"
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            onChange(+event.target.value);
          }}
          value={value}
          className="range-input"
          data-testid={testId}
        />
        <div className="value-bubble" ref={valueRef}>
          {showsValue ? displayValue : null}
        </div>
        <div className="zero-label" ref={minLabelRef}>
          {minLabel}
        </div>
      </div>
    </label>
  );
};
