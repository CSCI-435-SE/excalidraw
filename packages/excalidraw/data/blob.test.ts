import { MIME_TYPES } from "@excalidraw/common";

import { loadFromBlob } from "./blob";

const validExcalidrawData = (appState: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements: [],
    appState,
    files: {},
  });

describe("loadFromBlob", () => {
  it("derives appState.name from the opened file's name (stripped of extension)", async () => {
    const file = new File([validExcalidrawData()], "My Diagram.excalidraw", {
      type: MIME_TYPES.excalidraw,
    });

    const { appState } = await loadFromBlob(file, null, null);

    expect(appState.name).toBe("My Diagram");
  });

  it("strips only the last extension when the file name contains dots", async () => {
    const file = new File(
      [validExcalidrawData()],
      "2024.roadmap.v2.excalidraw",
      { type: MIME_TYPES.excalidraw },
    );

    const { appState } = await loadFromBlob(file, null, null);

    expect(appState.name).toBe("2024.roadmap.v2");
  });

  it("falls back to null when the blob carries no file name", async () => {
    const blob = new Blob([validExcalidrawData()], {
      type: MIME_TYPES.excalidraw,
    });

    const { appState } = await loadFromBlob(blob, null, null);

    expect(appState.name).toBeNull();
  });

  it("prefers an explicitly supplied FileSystemFileHandle's name over the blob's own name", async () => {
    const file = new File([validExcalidrawData()], "blob-name.excalidraw", {
      type: MIME_TYPES.excalidraw,
    });

    const { appState } = await loadFromBlob(file, null, null, {
      name: "handle-name.excalidraw",
    } as unknown as FileSystemFileHandle);

    expect(appState.name).toBe("handle-name");
  });
});
