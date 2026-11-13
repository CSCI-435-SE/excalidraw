import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";

import { CustomFontError, loadCustomFontFile } from "../data/customFonts";

import { CustomFontUploadDialog } from "./CustomFontUploadDialog";

import type { CustomFontCandidate } from "../data/customFonts";

// the real Dialog needs the whole editor context (container, app state, jotai),
// these tests only cover this dialog's own logic
vi.mock("./Dialog", () => ({
  Dialog: ({
    title,
    children,
    onCloseRequest,
  }: {
    title: React.ReactNode;
    children: React.ReactNode;
    onCloseRequest: () => void;
  }) => (
    <div role="dialog">
      <h2>{title}</h2>
      <button onClick={onCloseRequest}>close</button>
      {children}
    </div>
  ),
}));

vi.mock("../data/customFonts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data/customFonts")>()),
  loadCustomFontFile: vi.fn(),
}));

const loadMock = vi.mocked(loadCustomFontFile);

const CANDIDATE: CustomFontCandidate = {
  id: 2007,
  name: "My Font",
  mimeType: "font/woff2",
  dataURL: "data:font/woff2;base64,d09GMg==" as CustomFontCandidate["dataURL"],
  created: 1234,
};

const FILE = new File(["wOF2"], "My Font.woff2");

const renderDialog = async () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  await act(async () => {
    render(
      <CustomFontUploadDialog
        file={FILE}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
  });

  return { onConfirm, onCancel };
};

const nameInput = () => screen.getByRole("textbox") as HTMLInputElement;
const licenseCheckbox = () => screen.getByRole("checkbox");
const addButton = () =>
  screen.getByRole("button", { name: "Add font" }) as HTMLButtonElement;
const cancelButton = () => screen.getByRole("button", { name: "Cancel" });

describe("<CustomFontUploadDialog /> (#140)", () => {
  beforeEach(() => {
    loadMock.mockReset();
  });

  describe("valid font file", () => {
    beforeEach(() => {
      loadMock.mockResolvedValue(CANDIDATE);
    });

    it("reads the chosen file", async () => {
      await renderDialog();

      expect(loadMock).toHaveBeenCalledTimes(1);
      expect(loadMock).toHaveBeenCalledWith(FILE);
    });

    it("shows the title and pre-fills the name from the file", async () => {
      await renderDialog();

      expect(screen.getByText("Add custom font")).not.toBeNull();
      expect(nameInput().value).toBe("My Font");
    });

    it("keeps Add disabled until the license box is ticked", async () => {
      await renderDialog();

      expect(licenseCheckbox().getAttribute("aria-checked")).toBe("false");
      expect(addButton().disabled).toBe(true);

      fireEvent.click(licenseCheckbox());

      expect(licenseCheckbox().getAttribute("aria-checked")).toBe("true");
      expect(addButton().disabled).toBe(false);
    });

    it("disables Add again if the license box is unticked", async () => {
      await renderDialog();

      fireEvent.click(licenseCheckbox());
      fireEvent.click(licenseCheckbox());

      expect(addButton().disabled).toBe(true);
    });

    it("adds the font with the acknowledged license", async () => {
      const { onConfirm } = await renderDialog();

      fireEvent.click(licenseCheckbox());
      fireEvent.click(addButton());

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledWith({
        id: 2007,
        name: "My Font",
        mimeType: "font/woff2",
        dataURL: "data:font/woff2;base64,d09GMg==",
        created: 1234,
        licenseAcknowledged: true,
      });
    });

    it("uses the edited name, trimmed", async () => {
      const { onConfirm } = await renderDialog();

      fireEvent.change(nameInput(), { target: { value: "  Renamed  " } });
      fireEvent.click(licenseCheckbox());
      fireEvent.click(addButton());

      expect(onConfirm.mock.calls[0][0].name).toBe("Renamed");
    });

    it("disables Add when the name is blank", async () => {
      const { onConfirm } = await renderDialog();

      fireEvent.click(licenseCheckbox());
      fireEvent.change(nameInput(), { target: { value: "   " } });

      expect(addButton().disabled).toBe(true);
      fireEvent.click(addButton());
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("confirms with Enter only once the license is acknowledged", async () => {
      const { onConfirm } = await renderDialog();

      fireEvent.keyDown(nameInput(), { key: "Enter" });
      expect(onConfirm).not.toHaveBeenCalled();

      fireEvent.click(licenseCheckbox());
      fireEvent.keyDown(nameInput(), { key: "Enter" });
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("cancels without adding the font", async () => {
      const { onConfirm, onCancel } = await renderDialog();

      fireEvent.click(cancelButton());

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("cancels when the dialog is closed", async () => {
      const { onCancel } = await renderDialog();

      fireEvent.click(screen.getByRole("button", { name: "close" }));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("while reading the file", () => {
    it("shows a loading message and a disabled Add button", async () => {
      loadMock.mockReturnValue(new Promise(() => {}));

      await renderDialog();

      expect(screen.getByText("Reading font file…")).not.toBeNull();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(addButton().disabled).toBe(true);
    });
  });

  describe("invalid font file", () => {
    it.each([
      ["tooLarge", "This font file is larger than 5 MB."],
      ["unsupportedType", "Only WOFF and WOFF2 font files are supported."],
      [
        "invalidFont",
        "This file couldn't be read as a font. It may be damaged.",
      ],
    ] as const)("shows the %s error message", async (code, message) => {
      loadMock.mockRejectedValue(new CustomFontError(code, "test"));

      await renderDialog();

      expect(screen.getByRole("alert").textContent).toBe(message);
    });

    it("treats unexpected errors as an unreadable font", async () => {
      loadMock.mockRejectedValue(new Error("something else"));

      await renderDialog();

      expect(screen.getByRole("alert").textContent).toBe(
        "This file couldn't be read as a font. It may be damaged.",
      );
    });

    it("offers only Cancel, with no name field or license box", async () => {
      loadMock.mockRejectedValue(new CustomFontError("tooLarge", "test"));

      const { onCancel } = await renderDialog();

      expect(screen.queryByRole("button", { name: "Add font" })).toBeNull();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.queryByRole("checkbox")).toBeNull();

      fireEvent.click(cancelButton());
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });
});
