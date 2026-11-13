import { FONT_FAMILY } from "@excalidraw/common";

import type {
  ExcalidrawTextElement,
  NonDeleted,
} from "@excalidraw/element/types";

import { openCustomFontFile } from "../data/customFonts";
import { Fonts } from "../fonts";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import {
  act,
  fireEvent,
  render,
  screen,
  unmountComponent,
  waitFor,
} from "./test-utils";

// the system file picker can't run in jsdom, so it's replaced per test
vi.mock("../data/customFonts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data/customFonts")>()),
  openCustomFontFile: vi.fn(),
}));

const openFileMock = vi.mocked(openCustomFontFile);

unmountComponent();

const { h } = window;

// "wOF2" signature + 4 header bytes
const FONT_BYTES = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0]);
// djb2 of FONT_BYTES worked out by hand (h = h * 33 + byte, mod 2^32):
// 5381 → 177692 → 5863915 → 193509265 → 2090838499 → 278193731
//      → 590458532 → 2305262372 → 3059214244, plus the range start (2000)
const FONT_ID = 3_059_216_244;
const TTF_BYTES = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0, 1, 0, 0]);

const fontFile = (bytes = FONT_BYTES, name = "Test Font.woff2") =>
  new File([bytes], name);

const openFontPicker = () => {
  const trigger = screen.getByTestId("font-family-show-fonts");
  act(() => {
    trigger.click();
  });
};

const clickUploadButton = async () => {
  const button = screen.getByTestId("font-picker-upload");
  expect(button.textContent).toBe("Upload font");
  await act(async () => {
    fireEvent.click(button);
  });
};

/** picks a file through the font picker's footer upload button */
const uploadThroughPicker = async (file: File) => {
  openFontPicker();
  openFileMock.mockResolvedValueOnce(file);
  await clickUploadButton();
};

/** ticks the license box and confirms the upload dialog */
const confirmUploadDialog = async () => {
  const checkbox = await screen.findByRole("checkbox");
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: "Add font" }));
};

describe("uploading a custom font through the font picker (#140)", () => {
  const fontsAdd = vi.mocked(window.document.fonts.add);

  beforeAll(() => {
    (global as any).ResizeObserver =
      (global as any).ResizeObserver ||
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    // the jsdom `document.fonts` mock from setupTests.ts has no `delete`
    Object.assign(window.document.fonts, { delete: vi.fn() });
  });

  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    fontsAdd.mockClear();
    openFileMock.mockReset();
  });

  afterEach(() => {
    Fonts.unregisterCustomFont(FONT_ID);
  });

  const addSelectedText = () => {
    const text = API.createElement({
      type: "text",
      text: "hello",
      fontFamily: FONT_FAMILY.Excalifont,
    }) as NonDeleted<ExcalidrawTextElement>;
    API.setElements([text]);
    API.setSelectedElements([text]);
    return text;
  };

  it("applies the uploaded font to the selected text", async () => {
    const text = addSelectedText();

    await uploadThroughPicker(fontFile());
    await confirmUploadDialog();

    await waitFor(() => {
      expect(
        (h.elements.find((el) => el.id === text.id) as ExcalidrawTextElement)
          .fontFamily,
      ).toBe(FONT_ID);
    });
    expect(h.state.currentItemFontFamily).toBe(FONT_ID);
  });

  it("registers the font under the name from the dialog", async () => {
    addSelectedText();

    await uploadThroughPicker(fontFile());
    await confirmUploadDialog();

    await waitFor(() => {
      expect(Fonts.registered.get(FONT_ID)?.metadata.custom).toEqual({
        name: "Test Font",
      });
    });
  });

  it("adds the font face to the document so it renders straight away", async () => {
    addSelectedText();

    await uploadThroughPicker(fontFile());
    await confirmUploadDialog();

    await waitFor(() => {
      expect(fontsAdd).toHaveBeenCalledWith(
        expect.objectContaining({ family: `ExcalidrawCustomFont-${FONT_ID}` }),
      );
    });
  });

  it("makes the font the default for new text when nothing is selected", async () => {
    Keyboard.keyPress("t");

    await uploadThroughPicker(fontFile());
    await confirmUploadDialog();

    await waitFor(() => {
      expect(h.state.currentItemFontFamily).toBe(FONT_ID);
    });
  });

  it("closes the picker and opens the upload dialog for the chosen file", async () => {
    addSelectedText();
    const file = fontFile();

    await uploadThroughPicker(file);

    expect(h.state.openPopup).toBeNull();
    expect(h.state.openDialog).toEqual({ name: "customFontUpload", file });
    expect(await screen.findByText("Add custom font")).not.toBeNull();
  });

  it("still opens the upload dialog if the picker closes while the file dialog is open", async () => {
    // regression: a hidden <input type="file"> inside the picker lost the
    // chosen file whenever the picker unmounted during the system file dialog
    addSelectedText();
    const file = fontFile();
    let resolveFile!: (file: File) => void;
    openFileMock.mockReturnValueOnce(
      new Promise<File>((resolve) => {
        resolveFile = resolve;
      }),
    );

    openFontPicker();
    await clickUploadButton();

    // e.g. a stray click on the canvas from double-clicking the file
    act(() => {
      h.setState({ openPopup: null });
    });
    expect(screen.queryByTestId("font-picker-upload")).toBeNull();

    await act(async () => {
      resolveFile(file);
    });

    expect(h.state.openDialog).toEqual({ name: "customFontUpload", file });
  });

  it("does nothing when the file dialog is cancelled", async () => {
    addSelectedText();
    const warn = vi.spyOn(console, "warn");
    openFileMock.mockRejectedValueOnce(
      new DOMException("The user aborted a request.", "AbortError"),
    );

    openFontPicker();
    await clickUploadButton();

    expect(h.state.openDialog).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("closes the dialog after adding the font", async () => {
    addSelectedText();

    await uploadThroughPicker(fontFile());
    await confirmUploadDialog();

    await waitFor(() => {
      expect(h.state.openDialog).toBeNull();
    });
  });

  it("lists the uploaded font in the picker under its name", async () => {
    addSelectedText();

    await uploadThroughPicker(fontFile());
    await confirmUploadDialog();
    await waitFor(() => expect(h.state.openDialog).toBeNull());

    openFontPicker();

    expect(screen.getByTitle("Test Font")).not.toBeNull();
    expect(screen.queryByTitle(`ExcalidrawCustomFont-${FONT_ID}`)).toBeNull();
  });

  it("leaves everything unchanged when the dialog is cancelled", async () => {
    const text = addSelectedText();

    await uploadThroughPicker(fontFile());
    await screen.findByRole("checkbox");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(h.state.openDialog).toBeNull();
    expect(Fonts.registered.has(FONT_ID)).toBe(false);
    expect(
      (h.elements.find((el) => el.id === text.id) as ExcalidrawTextElement)
        .fontFamily,
    ).toBe(FONT_FAMILY.Excalifont);
  });

  it("selects the existing font when the same file is uploaded again", async () => {
    const text = addSelectedText();

    await uploadThroughPicker(fontFile());
    await confirmUploadDialog();
    await waitFor(() => expect(h.state.openDialog).toBeNull());

    // switch away, then upload the same bytes under a different name
    API.updateElement(text, { fontFamily: FONT_FAMILY.Nunito });
    await uploadThroughPicker(fontFile(FONT_BYTES, "Copy.woff2"));
    await confirmUploadDialog();

    await waitFor(() => {
      expect(
        (h.elements.find((el) => el.id === text.id) as ExcalidrawTextElement)
          .fontFamily,
      ).toBe(FONT_ID);
    });
    // the first upload's name is kept, no second entry
    expect(Fonts.registered.get(FONT_ID)?.metadata.custom).toEqual({
      name: "Test Font",
    });
    expect(
      Array.from(Fonts.registered.values()).filter((f) => f.metadata.custom),
    ).toHaveLength(1);
  });

  it("shows an error for a TTF file and adds nothing", async () => {
    const text = addSelectedText();

    await uploadThroughPicker(fontFile(TTF_BYTES, "font.ttf"));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Only WOFF and WOFF2 font files are supported.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(Fonts.registered.has(FONT_ID)).toBe(false);
    expect(
      (h.elements.find((el) => el.id === text.id) as ExcalidrawTextElement)
        .fontFamily,
    ).toBe(FONT_FAMILY.Excalifont);
  });
});
