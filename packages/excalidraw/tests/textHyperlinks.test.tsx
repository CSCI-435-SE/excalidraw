import { getFontString } from "@excalidraw/common";
import { getLineWidth } from "@excalidraw/element";

import type { ExcalidrawTextElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { render, unmountComponent } from "./test-utils";

import type { MockInstance } from "vitest";

unmountComponent();

const mouse = new Pointer("mouse");

describe("opening text hyperlinks", () => {
  const { h } = window;

  let windowOpen: MockInstance<typeof window.open>;

  beforeEach(() => {
    mouse.reset();
    windowOpen = vi
      .spyOn(window, "open")
      .mockReturnValue({ opener: null, location: "" } as unknown as Window);
  });

  afterEach(() => {
    windowOpen.mockRestore();
  });

  /** creates "visit Google today" with "Google" hyperlinked */
  const setup = () => {
    const text = API.createElement({
      type: "text",
      text: "visit Google today",
      x: 0,
      y: 0,
    }) as ExcalidrawTextElement;

    API.setElements([text]);
    API.updateElement(text, {
      textHyperlinks: [
        { start: 6, end: 12, url: "https://google.com", color: "link" },
      ],
    });

    const font = getFontString(text);
    const hyperlinkX =
      (getLineWidth("visit ", font) + getLineWidth("visit Google", font)) / 2;

    return { text, hyperlinkX, y: 5 };
  };

  it("should open the hyperlink on ctrl/cmd+click", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    const { hyperlinkX, y } = setup();

    Keyboard.withModifierKeys({ ctrl: true }, () => {
      mouse.clickAt(hyperlinkX, y);
    });

    expect(windowOpen).toHaveBeenCalledTimes(1);
    expect(windowOpen).toHaveBeenCalledWith(undefined, "_blank");
    // the click opens the hyperlink instead of selecting the element
    expect(API.getSelectedElements()).toEqual([]);
  });

  it("should not open the hyperlink on a plain click", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    const { text, hyperlinkX, y } = setup();

    mouse.clickAt(hyperlinkX, y);

    expect(windowOpen).not.toHaveBeenCalled();
    expect(API.getSelectedElements().map((element) => element.id)).toEqual([
      text.id,
    ]);
  });

  it("should not open anything on ctrl/cmd+click outside hyperlinks", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    const { y } = setup();

    Keyboard.withModifierKeys({ ctrl: true }, () => {
      mouse.clickAt(1, y);
    });

    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("should let the host handle the hyperlink via onLinkOpen", async () => {
    const onLinkOpen = vi.fn((element, event) => {
      event.preventDefault();
    });
    await render(
      <Excalidraw handleKeyboardGlobally={true} onLinkOpen={onLinkOpen} />,
    );
    const { text, hyperlinkX, y } = setup();

    Keyboard.withModifierKeys({ ctrl: true }, () => {
      mouse.clickAt(hyperlinkX, y);
    });

    expect(onLinkOpen).toHaveBeenCalledTimes(1);
    expect(onLinkOpen.mock.calls[0][0]).toMatchObject({
      id: text.id,
      link: "https://google.com",
    });
    expect(windowOpen).not.toHaveBeenCalled();
    expect(h.state.editingTextElement).toBe(null);
  });
});
