import { vi } from "vitest";

import { Excalidraw } from "../index";
import { act, render, waitFor } from "../tests/test-utils";

import { actionSaveFileToDisk, actionSaveToActiveFile } from "./actionExport";

const { h } = window;

// simulates the user picking a different file name than the one Excalidraw
// suggested, e.g. via the native "Save As" dialog
vi.mock("../data/filesystem.ts", async (importOriginal) => {
  const module = await importOriginal();
  return {
    __esmodule: true,
    //@ts-ignore
    ...module,
    fileSave: vi.fn(async () => ({
      name: "Renamed Diagram.excalidraw",
    })),
  };
});

describe("save-to-disk actions", () => {
  beforeEach(async () => {
    await render(<Excalidraw />);
  });

  it("actionSaveFileToDisk updates appState.name to the name the file was actually saved as", async () => {
    act(() => {
      h.app.actionManager.executeAction(actionSaveFileToDisk);
    });

    await waitFor(() => {
      expect(h.state.name).toBe("Renamed Diagram");
    });
  });

  it("actionSaveToActiveFile updates appState.name to the name the file was actually saved as", async () => {
    act(() => {
      h.app.actionManager.executeAction(actionSaveToActiveFile);
    });

    await waitFor(() => {
      expect(h.state.name).toBe("Renamed Diagram");
    });
  });
});
