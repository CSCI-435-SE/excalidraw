/**
 * Issue #83 — the "New collaborators" setting in the collaborator dropdown
 * (desktop and phone). Expected values come from the acceptance criteria in
 * #83, not from running the implementation:
 *
 * - A: the dropdown has a "New collaborators" setting with three options,
 *   Visible, Locked, Hidden; it defaults to Locked
 * - C: changing it doesn't change any collaborator already seen
 * - G: local only, never in undo/redo history
 *
 * Applying the setting to newcomers and saving it across reloads is the host
 * app's job (excalidraw-app/tests/collabNewcomer.test.tsx).
 */
import React from "react";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import {
  act,
  fireEvent,
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
  waitFor,
} from "./test-utils";

import type { AppState } from "../types";

const { h } = window;

// Session: me, alice (locked by me) and bob (visible), all seen before
const collaborators = new Map([
  ["my-socket", { id: "me", username: "Me", isCurrentUser: true }],
  ["alice-socket", { id: "alice", username: "Alice" }],
  ["bob-socket", { id: "bob", username: "Bob" }],
]) as unknown as AppState["collaborators"];

const collaboratorDirectory = new Map([
  ["me", { username: "Me", lastSeen: 1 }],
  ["alice", { username: "Alice", lastSeen: 1 }],
  ["bob", { username: "Bob", lastSeen: 1 }],
]);

/** the options in the order the AC lists them */
const OPTIONS = ["visible", "locked", "hidden"] as const;

const openMenu = (scope: ParentNode = document) => {
  fireEvent.click(
    scope.querySelector<HTMLElement>(
      "[data-testid='collaborator-visibility-trigger']",
    )!,
  );
};

const getRadios = () => [
  ...document.querySelectorAll<HTMLInputElement>(
    "input[name='collaborator-newcomer-default']",
  ),
];

const getRadio = (option: typeof OPTIONS[number]) =>
  getRadios()[OPTIONS.indexOf(option)];

const checkedOption = () => {
  const index = getRadios().findIndex((radio) => radio.checked);
  return index === -1 ? null : OPTIONS[index];
};

beforeEach(async () => {
  await render(<Excalidraw handleKeyboardGlobally={true} />);
  act(() => {
    h.app.updateScene({ collaborators });
    API.setAppState({
      collaboratorDirectory,
      lockedCollaboratorIds: new Set(["alice"]),
    });
  });
});

describe("New collaborators setting — dropdown UI (desktop)", () => {
  it("AC-A: the dropdown has a New collaborators setting with Visible, Locked and Hidden", () => {
    openMenu();

    expect(
      document.querySelector(".CollaboratorVisibilityMenu__newcomers")
        ?.textContent,
    ).toContain("New collaborators");
    expect(getRadios()).toHaveLength(3);
    expect(
      getRadios().map((radio) => radio.parentElement!.textContent),
    ).toEqual(["Visible", "Locked", "Hidden"]);
  });

  it("AC-A: Locked is selected by default", () => {
    openMenu();
    expect(h.state.newCollaboratorDefault).toBe("locked");
    expect(checkedOption()).toBe("locked");
  });

  for (const option of OPTIONS) {
    it(`AC-A: choosing ${option} selects it`, () => {
      openMenu();
      // start from another option, so choosing this one is a change
      act(() => {
        API.setAppState({
          newCollaboratorDefault: option === "locked" ? "hidden" : "locked",
        });
      });
      expect(checkedOption()).not.toBe(option);

      fireEvent.click(getRadio(option));

      expect(h.state.newCollaboratorDefault).toBe(option);
      expect(checkedOption()).toBe(option);
    });
  }

  it("AC-C: choosing an option doesn't change collaborators already seen", () => {
    openMenu();
    const lockedBefore = h.state.lockedCollaboratorIds;
    const hiddenBefore = h.state.hiddenCollaboratorIds;

    for (const option of ["hidden", "visible", "locked"] as const) {
      fireEvent.click(getRadio(option));
      expect(h.state.newCollaboratorDefault).toBe(option);
      expect([...h.state.lockedCollaboratorIds]).toEqual(["alice"]);
      expect(h.state.hiddenCollaboratorIds.size).toBe(0);
    }
    // not even copied: the same sets as before
    expect(h.state.lockedCollaboratorIds).toBe(lockedBefore);
    expect(h.state.hiddenCollaboratorIds).toBe(hiddenBefore);
  });

  it("AC-G: choosing an option adds no undo history entries", () => {
    openMenu();
    const undoBefore = API.getUndoStack().length;

    fireEvent.click(getRadio("hidden"));
    fireEvent.click(getRadio("visible"));

    expect(h.state.newCollaboratorDefault).toBe("visible");
    expect(API.getUndoStack().length).toBe(undoBefore);
  });
});

describe("New collaborators setting — dropdown UI (phone)", () => {
  beforeAll(() => {
    mockBoundingClientRect({ height: 400, width: 800 });
  });

  afterAll(() => {
    restoreOriginalGetBoundingClientRect();
  });

  it("AC-A: the setting is in the main menu's collaborator section, and choosing an option selects it", async () => {
    act(() => {
      h.app.refreshEditorInterface();
    });
    expect(h.app.editorInterface.formFactor).toBe("phone");

    fireEvent.click(document.querySelector(".main-menu-trigger")!);
    const row = await waitFor(() => {
      const element = document.querySelector(".UserList-Wrapper__row");
      expect(element).not.toBe(null);
      return element!;
    });
    openMenu(row);

    expect(checkedOption()).toBe("locked");
    fireEvent.click(getRadio("hidden"));
    expect(h.state.newCollaboratorDefault).toBe("hidden");
    expect(checkedOption()).toBe("hidden");
  });
});
