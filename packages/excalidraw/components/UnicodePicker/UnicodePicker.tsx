import { Popover } from "radix-ui";
import { useMemo, useRef, useState } from "react";

import {
  getFontFamilyString,
  MOBILE_ACTION_BUTTON_BG,
} from "@excalidraw/common";

import type { FontFamilyValues } from "@excalidraw/element/types";

import { t } from "../../i18n";
import { useApp, useExcalidrawContainer } from "../App";
import { IconButton } from "../IconButton";
import { PropertiesPopover } from "../PropertiesPopover";
import { QuickSearch } from "../QuickSearch";
import { UnicodeIcon } from "../icons";
import {
  restoreCaretPosition,
  saveCaretPosition,
} from "../../hooks/useTextEditorFocus";

import { MAX_CODE_POINT, UNICODE_BLOCKS } from "./unicodeBlocks";

import "./UnicodePicker.scss";

/** number of code points shown per page of the chart */
export const UNICODE_PAGE_SIZE = 256;

// unassigned, control, surrogate and private use code points have no glyph
const RE_NOT_RENDERABLE = /^[\p{Cn}\p{Cc}\p{Cs}\p{Co}]$/u;
// combining marks are shown on a dotted circle so they're visible on their own
const RE_COMBINING_MARK = /^\p{M}$/u;
const RE_CODE_POINT_QUERY = /^(?:u\+|0x)?([0-9a-f]{1,6})$/i;

type CaretPosition = { start: number; end: number };

export const formatCodePoint = (char: string) =>
  `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;

const isRenderable = (char: string) => !RE_NOT_RENDERABLE.test(char);

const getCharsInRange = (start: number, end: number) => {
  const chars: string[] = [];
  for (let codePoint = start; codePoint <= end; codePoint++) {
    const char = String.fromCodePoint(codePoint);
    if (isRenderable(char)) {
      chars.push(char);
    }
  }
  return chars;
};

/**
 * Inserts text into the wysiwyg text editor, replacing the given selection
 * (or the editor's current one).
 *
 * Goes through the editor's `input` event so that the text element gets
 * updated the same way as when typing.
 *
 * @returns the caret position after the inserted text
 */
export const insertIntoTextEditor = (
  text: string,
  caret: CaretPosition | null,
): CaretPosition | null => {
  const textEditor = document.querySelector<HTMLTextAreaElement>(
    ".excalidraw-wysiwyg",
  );
  if (!textEditor) {
    return null;
  }

  const start = caret?.start ?? textEditor.selectionStart;
  const end = caret?.end ?? textEditor.selectionEnd;

  textEditor.setRangeText(text, start, end, "end");
  textEditor.dispatchEvent(new Event("input", { bubbles: true }));

  // `text.length` counts UTF-16 code units, same as textarea selection offsets
  const position = start + text.length;
  return { start: position, end: position };
};

interface UnicodePickerProps {
  isOpened: boolean;
  fontFamily: FontFamilyValues;
  onPopupChange: (open: boolean) => void;
  compactMode?: boolean;
}

export const UnicodePicker = ({
  isOpened,
  fontFamily,
  onPopupChange,
  compactMode = false,
}: UnicodePickerProps) => {
  const { container } = useExcalidrawContainer();
  const app = useApp();
  const caretRef = useRef<CaretPosition | null>(null);

  const [blockIndex, setBlockIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");

  const block = UNICODE_BLOCKS[blockIndex];
  const pageCount = Math.ceil(
    (block.end - block.start + 1) / UNICODE_PAGE_SIZE,
  );
  const pageStart = block.start + page * UNICODE_PAGE_SIZE;
  const pageEnd = Math.min(block.end, pageStart + UNICODE_PAGE_SIZE - 1);

  const chars = useMemo(() => {
    const queryMatch = query.match(RE_CODE_POINT_QUERY);
    if (queryMatch) {
      const codePoint = parseInt(queryMatch[1], 16);
      if (codePoint > MAX_CODE_POINT) {
        return [];
      }
      const char = String.fromCodePoint(codePoint);
      return isRenderable(char) ? [char] : [];
    }
    if (query) {
      return [];
    }
    return getCharsInRange(pageStart, pageEnd);
  }, [query, pageStart, pageEnd]);

  const compactStyle = compactMode
    ? {
        ...MOBILE_ACTION_BUTTON_BG,
        width: "2rem",
        height: "2rem",
      }
    : {};

  return (
    <Popover.Root
      open={isOpened}
      onOpenChange={(open) => {
        if (open) {
          // the editor loses focus to the popover, so remember its selection
          caretRef.current = saveCaretPosition();
        }
        onPopupChange(open);
      }}
    >
      <Popover.Trigger asChild>
        <div data-openpopup="unicodePicker" className="properties-trigger">
          <IconButton
            type="toggle"
            icon={UnicodeIcon}
            title={t("labels.insertCharacter")}
            aria-label={t("labels.insertCharacter")}
            className="standalone properties-trigger"
            data-testid="unicode-picker-trigger"
            checked={isOpened}
            style={{
              border: "none",
              ...compactStyle,
            }}
          />
        </div>
      </Popover.Trigger>
      {isOpened && (
        <PropertiesPopover
          className="properties-content UnicodePicker"
          container={container}
          style={{ width: "19rem" }}
          preventAutoFocusOnTouch
          onClose={() => {
            // don't steal focus from another popup we were closed in favor of
            if (!app.state.openPopup) {
              restoreCaretPosition(caretRef.current);
            }
          }}
          onFocusOutside={(event) => {
            // inserting may refocus the text editor, which shouldn't close us
            if (
              event.target instanceof HTMLElement &&
              event.target.classList.contains("excalidraw-wysiwyg")
            ) {
              event.preventDefault();
            }
          }}
        >
          <QuickSearch
            placeholder={t("unicodePicker.search")}
            onChange={setQuery}
          />
          {!query && (
            <div className="UnicodePicker__nav">
              <select
                className="UnicodePicker__block"
                aria-label={t("unicodePicker.block")}
                data-testid="unicode-picker-block"
                value={blockIndex}
                onChange={(event) => {
                  setBlockIndex(Number(event.target.value));
                  setPage(0);
                }}
              >
                {UNICODE_BLOCKS.map((unicodeBlock, index) => (
                  <option key={unicodeBlock.name} value={index}>
                    {unicodeBlock.name}
                  </option>
                ))}
              </select>
              {pageCount > 1 && (
                <div className="UnicodePicker__pages">
                  <button
                    type="button"
                    aria-label={t("unicodePicker.previousPage")}
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    ‹
                  </button>
                  <span>
                    {formatCodePoint(String.fromCodePoint(pageStart))}–
                    {formatCodePoint(String.fromCodePoint(pageEnd))}
                  </span>
                  <button
                    type="button"
                    aria-label={t("unicodePicker.nextPage")}
                    disabled={page >= pageCount - 1}
                    onClick={() => setPage(page + 1)}
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          )}
          <div
            className="UnicodePicker__grid"
            role="listbox"
            style={{ fontFamily: getFontFamilyString({ fontFamily }) }}
          >
            {chars.length ? (
              chars.map((char) => (
                <button
                  key={char}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="UnicodePicker__char"
                  title={formatCodePoint(char)}
                  aria-label={formatCodePoint(char)}
                  data-testid={`unicode-picker-char-${formatCodePoint(char)}`}
                  onClick={() => {
                    caretRef.current = insertIntoTextEditor(
                      char,
                      caretRef.current,
                    );
                  }}
                >
                  {RE_COMBINING_MARK.test(char) ? `◌${char}` : char}
                </button>
              ))
            ) : (
              <div className="UnicodePicker__empty">
                {t("unicodePicker.empty")}
              </div>
            )}
          </div>
        </PropertiesPopover>
      )}
    </Popover.Root>
  );
};
