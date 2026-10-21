/**
 * The host app's own export paths (shareable link, Excalidraw+) only export
 * what's visible on this client.
 */
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@excalidraw/excalidraw/tests/test-utils";
import { CREATOR_ID_KEY, newElementWith } from "@excalidraw/element";
import { vi } from "vitest";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { appJotaiStore } from "../app-jotai";
import ExcalidrawApp from "../App";
import { exportToExcalidrawPlus } from "../components/ExportToExcalidrawPlus";
import { exportToBackend } from "../data";
import { shareDialogStateAtom } from "../share/ShareDialog";

vi.mock("../data", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  exportToBackend: vi.fn(async () => ({ url: "https://example.test/#json=x" })),
}));

vi.mock("../components/ExportToExcalidrawPlus", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  exportToExcalidrawPlus: vi.fn(async () => {}),
}));

const stamp = <T extends ExcalidrawElement>(element: T, creatorId: string) =>
  newElementWith(element as ExcalidrawElement, {
    customData: { [CREATOR_ID_KEY]: creatorId },
  }) as T;

const exportedIds = (fn: ReturnType<typeof vi.fn>) =>
  (fn.mock.calls[0][0] as readonly ExcalidrawElement[])
    .map((element) => element.id)
    .sort();

describe("host app exports respect collaborator visibility", () => {
  beforeEach(async () => {
    vi.mocked(exportToBackend).mockClear();
    vi.mocked(exportToExcalidrawPlus).mockClear();
    window.history.replaceState({}, "", window.location.origin);
    await render(<ExcalidrawApp />);
    API.setElements([
      stamp(API.createElement({ id: "alice-rect" }), "alice"),
      stamp(API.createElement({ id: "bob-rect", x: 200 }), "bob"),
    ]);
    act(() => {
      API.setAppState({ hiddenCollaboratorIds: new Set(["bob"]) });
    });
  });

  it("shareable link only contains visible elements", async () => {
    act(() => {
      appJotaiStore.set(shareDialogStateAtom, { isOpen: true, type: "share" });
    });
    fireEvent.click(await screen.findByText("Export to Link"));

    await waitFor(() => expect(exportToBackend).toHaveBeenCalledTimes(1));
    expect(exportedIds(vi.mocked(exportToBackend))).toEqual(["alice-rect"]);
  });

  it("Excalidraw+ export (command palette) only contains visible elements", async () => {
    act(() => {
      API.setAppState({ openDialog: { name: "commandPalette" } });
    });
    const paletteInput = await waitFor(() => {
      const input = document.querySelector<HTMLInputElement>(
        ".command-palette-dialog input",
      );
      expect(input).not.toBe(null);
      return input!;
    });
    fireEvent.change(paletteInput, { target: { value: "Excalidraw+" } });
    fireEvent.click(await screen.findByText("Export to Excalidraw+"));

    await waitFor(() =>
      expect(exportToExcalidrawPlus).toHaveBeenCalledTimes(1),
    );
    expect(exportedIds(vi.mocked(exportToExcalidrawPlus))).toEqual([
      "alice-rect",
    ]);
  });

  it("(control) exports everything when nothing is hidden", async () => {
    act(() => {
      API.setAppState({ hiddenCollaboratorIds: new Set() });
      appJotaiStore.set(shareDialogStateAtom, { isOpen: true, type: "share" });
    });
    fireEvent.click(await screen.findByText("Export to Link"));

    await waitFor(() => expect(exportToBackend).toHaveBeenCalledTimes(1));
    expect(exportedIds(vi.mocked(exportToBackend))).toEqual([
      "alice-rect",
      "bob-rect",
    ]);
  });
});
