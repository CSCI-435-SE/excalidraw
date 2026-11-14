import {
  getDefaultImageAdjustments,
  IMAGE_ADJUSTMENT_DEFS,
  IMAGE_ADJUSTMENT_ORDER,
  IMAGE_FILTER_DEFS,
  IMAGE_FILTER_ORDER,
} from "@excalidraw/element";

import type {
  ImageFilterPropDef,
  ImageFilterPropName,
} from "@excalidraw/element";
import type {
  ExcalidrawImageElement,
  ImageFilterEntry,
  ImageFilterType,
} from "@excalidraw/element/types";

import { t } from "../i18n";

import { IconButton } from "./IconButton";
import { resetIcon, TrashIcon } from "./icons";
import { Range } from "./Range";

import "./ImageFiltersPanel.scss";

import type { ImageFiltersUpdate } from "../actions/actionImageFilter";

const formatValue = (value: number) => Number(value.toFixed(2));

const PropRange = ({
  label,
  def,
  value,
  testId,
  onChange,
}: {
  label: React.ReactNode;
  def: ImageFilterPropDef;
  value: number;
  testId: string;
  onChange: (value: number) => void;
}) => (
  <Range
    label={label}
    value={value}
    onChange={onChange}
    min={def.min}
    max={def.max}
    step={def.step}
    formatValue={formatValue}
    alwaysShowValue
    testId={testId}
  />
);

const FilterControls = ({
  filter,
  appliedTypes,
  onChange,
}: {
  filter: ImageFilterEntry;
  appliedTypes: Set<ImageFilterType>;
  onChange: (update: ImageFiltersUpdate) => void;
}) => {
  const defs: Record<string, ImageFilterPropDef> =
    IMAGE_FILTER_DEFS[filter.type].props;
  const values = filter as unknown as Record<string, number>;

  return (
    <div
      className="image-filters-panel__filter"
      data-testid={`image-filter-${filter.type}`}
    >
      <div className="image-filters-panel__header">
        <select
          className="image-filters-panel__select"
          aria-label={t("labels.imageFilters.swap")}
          title={t("labels.imageFilters.swap")}
          data-testid={`image-filter-${filter.type}-type`}
          value={filter.type}
          onChange={(event) =>
            onChange({
              op: "swap",
              type: filter.type,
              newType: event.target.value as ImageFilterType,
            })
          }
        >
          {IMAGE_FILTER_ORDER.filter(
            (type) => type === filter.type || !appliedTypes.has(type),
          ).map((type) => (
            <option key={type} value={type}>
              {t(`labels.imageFilters.${type}`)}
            </option>
          ))}
        </select>
        <IconButton
          type="icon"
          size="small"
          icon={resetIcon}
          title={t("labels.imageFilters.reset")}
          aria-label={t("labels.imageFilters.reset")}
          data-testid={`image-filter-${filter.type}-reset`}
          onClick={() => onChange({ op: "reset", type: filter.type })}
        />
        <IconButton
          type="icon"
          size="small"
          icon={TrashIcon}
          title={t("labels.imageFilters.remove")}
          aria-label={t("labels.imageFilters.remove")}
          data-testid={`image-filter-${filter.type}-remove`}
          onClick={() => onChange({ op: "remove", type: filter.type })}
        />
      </div>
      {Object.entries(defs).map(([name, def]) => (
        <PropRange
          key={name}
          label={
            <span className="image-filters-panel__label">
              {t(`labels.imageFilters.${name as ImageFilterPropName}`)}
              {filter.type === "colorShift" && name === "hue" && (
                <span
                  className="image-filters-panel__swatch"
                  data-testid="image-filter-colorShift-swatch"
                  style={{
                    background: `hsl(${Math.round(
                      filter.hue * 360,
                    )}, 100%, 50%)`,
                  }}
                />
              )}
            </span>
          }
          def={def}
          value={values[name]}
          testId={`image-filter-${filter.type}-${name}`}
          onChange={(value) =>
            onChange({
              op: "update",
              type: filter.type,
              props: { [name]: value },
            })
          }
        />
      ))}
    </div>
  );
};

export const ImageFiltersPanel = ({
  element,
  onChange,
}: {
  element: ExcalidrawImageElement;
  onChange: (update: ImageFiltersUpdate) => void;
}) => {
  const appliedTypes = new Set(element.filters.map((filter) => filter.type));
  const availableTypes = IMAGE_FILTER_ORDER.filter(
    (type) => !appliedTypes.has(type),
  );
  const adjustments = element.adjustments ?? getDefaultImageAdjustments();

  return (
    <div className="image-filters-panel" data-testid="image-filters-panel">
      {element.filters.map((filter) => (
        <FilterControls
          key={filter.type}
          filter={filter}
          appliedTypes={appliedTypes}
          onChange={onChange}
        />
      ))}

      {availableTypes.length > 0 && (
        <select
          className="image-filters-panel__select"
          aria-label={t("labels.imageFilters.add")}
          data-testid="image-filter-add"
          value=""
          onChange={(event) =>
            onChange({
              op: "add",
              type: event.target.value as ImageFilterType,
            })
          }
        >
          <option value="" disabled>
            {t("labels.imageFilters.add")}
          </option>
          {availableTypes.map((type) => (
            <option key={type} value={type}>
              {t(`labels.imageFilters.${type}`)}
            </option>
          ))}
        </select>
      )}

      <div className="image-filters-panel__filter">
        <div className="image-filters-panel__header">
          <span className="image-filters-panel__title">
            {t("labels.imageFilters.adjustments")}
          </span>
          <IconButton
            type="icon"
            size="small"
            icon={resetIcon}
            title={t("labels.imageFilters.resetAdjustments")}
            aria-label={t("labels.imageFilters.resetAdjustments")}
            data-testid="image-adjustments-reset"
            disabled={!element.adjustments}
            onClick={() => onChange({ op: "resetAdjustments" })}
          />
        </div>
        {IMAGE_ADJUSTMENT_ORDER.map((name) => (
          <PropRange
            key={name}
            label={t(`labels.imageFilters.${name}`)}
            def={IMAGE_ADJUSTMENT_DEFS[name]}
            value={adjustments[name]}
            testId={`image-adjustment-${name}`}
            onChange={(value) =>
              onChange({
                op: "updateAdjustments",
                adjustments: { [name]: value },
              })
            }
          />
        ))}
      </div>
    </div>
  );
};
