import type {
  ExcalidrawTextElement,
  NonDeleted,
} from "@excalidraw/element/types";

import { Excalidraw } from "../..";
import { API } from "../../tests/helpers/api";
import { Keyboard, Pointer, UI } from "../../tests/helpers/ui";
import { getTextEditor, updateTextEditor } from "../../tests/queries/dom";
import {
  act,
  fireEvent,
  render,
  screen,
  unmountComponent,
} from "../../tests/test-utils";

import { formatCodePoint, insertIntoTextEditor } from "./UnicodePicker";

unmountComponent();

const { h } = window;
const mouse = new Pointer("mouse");

const openUnicodePicker = () => {
  const trigger = screen.getByTestId("unicode-picker-trigger");
  // the pointerdown keeps the text editor from submitting once it loses
  // focus to the popover, as in the browser
  fireEvent.pointerDown(trigger);
  fireEvent.pointerUp(trigger);
  act(() => {
    trigger.click();
  });
  expect(h.state.openPopup).toBe("unicodePicker");
  expect(h.state.editingTextElement).not.toBeNull();
};

const searchCodePoint = (query: string) => {
  const input = document.querySelector(
    ".UnicodePicker .QuickSearch__input",
  ) as HTMLInputElement;
  fireEvent.change(input, { target: { value: query } });
};

describe("UnicodePicker", () => {
  let textElement: ExcalidrawTextElement;
  let editor: HTMLTextAreaElement;

  beforeAll(() => {
    (global as any).ResizeObserver =
      (global as any).ResizeObserver ||
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
  });

  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);

    textElement = UI.createElement("text");
    mouse.clickOn(textElement);
    editor = await getTextEditor();
    updateTextEditor(editor, "ab");
    // let the editor's deferred focus handling settle before opening popovers
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  });

  it("formats code points", () => {
    expect(formatCodePoint("A")).toBe("U+0041");
    expect(formatCodePoint("☃")).toBe("U+2603");
    expect(formatCodePoint("😀")).toBe("U+1F600");
  });

  it("isn't shown when not editing text", () => {
    Keyboard.exitTextEditor(editor);
    API.setSelectedElements([textElement as NonDeleted<ExcalidrawTextElement>]);

    expect(h.state.editingTextElement).toBeNull();
    expect(screen.getByTestId("font-family-show-fonts")).not.toBeNull();
    expect(screen.queryByTestId("unicode-picker-trigger")).toBeNull();
  });

  it("shows the first block of characters when opened", () => {
    openUnicodePicker();

    expect(screen.getByTestId("unicode-picker-char-U+0041")).not.toBeNull();
    // control characters have no glyph
    expect(screen.queryByTestId("unicode-picker-char-U+007F")).toBeNull();
  });

  it("inserts the picked character at the caret", () => {
    editor.setSelectionRange(1, 1);
    openUnicodePicker();

    searchCodePoint("U+2603");
    fireEvent.click(screen.getByTestId("unicode-picker-char-U+2603"));

    expect(editor.value).toBe("a☃b");
    expect((h.elements[0] as ExcalidrawTextElement).originalText).toBe("a☃b");
  });

  it("replaces the selected text", () => {
    editor.setSelectionRange(0, 2);
    openUnicodePicker();

    searchCodePoint("3a9");
    fireEvent.click(screen.getByTestId("unicode-picker-char-U+03A9"));

    expect(editor.value).toBe("Ω");
  });

  it("keeps the caret after astral characters across insertions", () => {
    editor.setSelectionRange(1, 1);
    openUnicodePicker();

    searchCodePoint("1F600");
    const emoji = screen.getByTestId("unicode-picker-char-U+1F600");
    fireEvent.click(emoji);
    fireEvent.click(emoji);

    expect(editor.value).toBe("a😀😀b");

    Keyboard.exitTextEditor(editor);
    expect((h.elements[0] as ExcalidrawTextElement).originalText).toBe(
      "a😀😀b",
    );
  });

  it("shows nothing for invalid code points", () => {
    openUnicodePicker();

    searchCodePoint("110000");
    expect(document.querySelector(".UnicodePicker__char")).toBeNull();

    // lone surrogate
    searchCodePoint("D800");
    expect(document.querySelector(".UnicodePicker__char")).toBeNull();
  });

  it("returns the next caret position when inserting", () => {
    expect(insertIntoTextEditor("😀", { start: 0, end: 0 })).toEqual({
      start: 2,
      end: 2,
    });
    expect(editor.value).toBe("😀ab");
  });
});
