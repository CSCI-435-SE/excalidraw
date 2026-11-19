import { nanoid } from "nanoid";
import { useState } from "react";

import { t } from "../i18n";
import { parsePageRange } from "../pages";

import type { DrawingPage } from "../pages";

/** Text field for picking pages to delete by position, e.g. "2-4, 7". */
export const PageRangeDelete = ({
  pages,
  disabled,
  onDelete,
}: {
  pages: readonly DrawingPage[];
  disabled: boolean;
  onDelete: (pageIds: readonly string[]) => void;
}) => {
  const [input, setInput] = useState("");
  const [errorId] = useState(() => `page-range-error-${nanoid()}`);
  const pageIds = parsePageRange(input, pages);
  const showError = input.trim() !== "" && !pageIds;

  return (
    <form
      className="page-range-delete"
      onSubmit={(event) => {
        event.preventDefault();
        if (pageIds && !disabled) {
          // positions shift once pages are deleted, so don't keep stale input
          setInput("");
          onDelete(pageIds);
        }
      }}
    >
      <label className="page-range-delete__label">
        {t("labels.deletePageRange")}
        <input
          type="text"
          className="page-range-delete__input"
          value={input}
          placeholder={t("labels.pageRangePlaceholder")}
          onChange={(event) => setInput(event.target.value)}
          disabled={disabled}
          aria-invalid={showError}
          aria-describedby={showError ? errorId : undefined}
        />
      </label>
      {showError && (
        <p id={errorId} className="page-range-delete__error" role="alert">
          {t("errors.invalidPageRange", { count: pages.length })}
        </p>
      )}
      <button
        type="submit"
        className="page-navigation__action"
        disabled={disabled || !pageIds}
      >
        {t("buttons.deletePageRange")}
      </button>
    </form>
  );
};
