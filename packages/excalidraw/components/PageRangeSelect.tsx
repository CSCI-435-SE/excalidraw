import { nanoid } from "nanoid";
import { useState } from "react";

import { t } from "../i18n";
import { parsePageRange } from "../pages";

import type { DrawingPage } from "../pages";

/** Text field for selecting pages by position, e.g. "2-4, 7". */
export const PageRangeSelect = ({
  pages,
  onSelect,
}: {
  pages: readonly DrawingPage[];
  onSelect: (pageIds: readonly string[]) => void;
}) => {
  const [input, setInput] = useState("");
  const [errorId] = useState(() => `page-range-error-${nanoid()}`);
  const pageIds = parsePageRange(input, pages);
  const showError = input.trim() !== "" && !pageIds;

  return (
    <form
      className="page-range-select"
      onSubmit={(event) => {
        event.preventDefault();
        if (pageIds) {
          // positions shift once pages are deleted, so don't keep stale input
          setInput("");
          onSelect(pageIds);
        }
      }}
    >
      <div className="page-navigation__actions-row">
        <input
          type="text"
          className="page-range-select__input"
          value={input}
          aria-label={t("labels.selectPageRange")}
          placeholder={t("labels.pageRangePlaceholder")}
          onChange={(event) => setInput(event.target.value)}
          aria-invalid={showError}
          aria-describedby={showError ? errorId : undefined}
        />
        <button
          type="submit"
          className="page-navigation__add"
          disabled={!pageIds}
        >
          {t("buttons.selectPageRange")}
        </button>
      </div>
      {showError && (
        <p id={errorId} className="page-range-select__error" role="alert">
          {t("errors.invalidPageRange", { count: pages.length })}
        </p>
      )}
    </form>
  );
};
