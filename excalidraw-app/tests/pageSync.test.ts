import {
  PAGE_ID_KEY,
  getSceneVersion,
  newElementWith,
} from "@excalidraw/element";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type {
  ExcalidrawElement,
  FractionalIndex,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

import {
  excludeElementsOnDeletedPages,
  getRoomVersion,
  reconcileElementsByPage,
  restoreElementsByPage,
} from "../collab/pageSync";

const appState = {
  ...getDefaultAppState(),
  width: 1000,
  height: 1000,
} as AppState;

/** an element on `pageId` with order key `index` */
const onPage = (
  id: string,
  pageId: string,
  index: string,
  updates: Partial<ExcalidrawElement> = {},
) =>
  ({
    ...newElementWith(API.createElement({ type: "rectangle", id }), {
      customData: { [PAGE_ID_KEY]: pageId },
    }),
    index: index as FractionalIndex,
    ...updates,
  } as OrderedExcalidrawElement);

const toOrderKeys = (elements: readonly ExcalidrawElement[]) =>
  elements.map((el) => `${el.id}@${el.index}`);

// every page's elements go through the room together (#167); each page
// orders its own, so order keys repeat across pages
describe("pages in one room (#167)", () => {
  describe("restoreElementsByPage", () => {
    it("(control) restoring two pages together renumbers repeated order keys", () => {
      expect(
        toOrderKeys(
          restoreElements(
            [onPage("p1-a", "p1", "a0"), onPage("p2-a", "p2", "a0")],
            null,
          ),
        ),
      ).not.toEqual(["p1-a@a0", "p2-a@a0"]);
    });

    it("keeps each page's order keys", () => {
      expect(
        toOrderKeys(
          restoreElementsByPage(
            [
              onPage("p1-a", "p1", "a0"),
              onPage("p2-a", "p2", "a0"),
              onPage("p1-b", "p1", "a1"),
            ],
            null,
          ),
        ),
      ).toEqual(["p1-a@a0", "p1-b@a1", "p2-a@a0"]);
    });

    it("still repairs order keys within a page", () => {
      expect(
        toOrderKeys(
          restoreElementsByPage(
            [onPage("p1-a", "p1", "a0"), onPage("p1-b", "p1", "a0")],
            null,
          ),
        ),
      ).not.toEqual(["p1-a@a0", "p1-b@a0"]);
    });
  });

  describe("reconcileElementsByPage", () => {
    it("keeps each page's order keys when merging", () => {
      expect(
        toOrderKeys(
          reconcileElementsByPage(
            [onPage("p1-a", "p1", "a0")],
            [
              onPage("p2-a", "p2", "a0"),
              onPage("p2-b", "p2", "a1"),
            ] as RemoteExcalidrawElement[],
            appState,
          ),
        ),
      ).toEqual(["p1-a@a0", "p2-a@a0", "p2-b@a1"]);
    });

    it("keeps the newer copy of each element", () => {
      const reconciled = reconcileElementsByPage(
        [
          onPage("newer-here", "p1", "a0", { version: 5, x: 1 }),
          onPage("newer-there", "p2", "a0", { version: 2, x: 1 }),
        ],
        [
          onPage("newer-here", "p1", "a0", { version: 3, x: 2 }),
          onPage("newer-there", "p2", "a0", { version: 4, x: 2 }),
        ] as RemoteExcalidrawElement[],
        appState,
      );
      expect(reconciled.map((el) => [el.id, el.x])).toEqual([
        ["newer-here", 1],
        ["newer-there", 2],
      ]);
    });

    it("keeps elements only one side has", () => {
      expect(
        reconcileElementsByPage(
          [onPage("only-here", "p1", "a0")],
          [onPage("only-there", "p2", "a0")] as RemoteExcalidrawElement[],
          appState,
        ).map((el) => el.id),
      ).toEqual(["only-here", "only-there"]);
    });
  });

  // AC 4.2: delete wins, in room storage too
  describe("excludeElementsOnDeletedPages", () => {
    it("drops elements of deleted pages, keeps the rest", () => {
      const elements = [
        onPage("kept", "p1", "a0"),
        onPage("gone", "p2", "a0"),
        newElementWith(
          API.createElement({ type: "rectangle", id: "untagged" }),
          {},
        ),
      ];
      expect(
        excludeElementsOnDeletedPages(elements, {
          pages: [],
          deletedPageIds: { p2: 10 },
        }).map((el) => el.id),
      ).toEqual(["kept", "untagged"]);
    });
  });

  // broadcasting after a page is deleted (step 4)
  describe("getRoomVersion", () => {
    it("(control) a version sum can't tell a deleted page plus a new element apart", () => {
      const removed = onPage("removed", "p2", "a0", { version: 3 });
      const added = onPage("added", "p1", "a1", { version: 3 });
      const kept = onPage("kept", "p1", "a0", { version: 5 });
      expect(getSceneVersion([kept, removed])).toBe(
        getSceneVersion([kept, added]),
      );
    });

    it("changes when a deleted page's elements go and new ones come", () => {
      const removed = onPage("removed", "p2", "a0", { version: 3 });
      const added = onPage("added", "p1", "a1", { version: 3 });
      const kept = onPage("kept", "p1", "a0", { version: 5 });
      expect(getRoomVersion([kept, removed])).not.toBe(
        getRoomVersion([kept, added]),
      );
    });

    it("stays the same for the same elements", () => {
      const elements = [onPage("a", "p1", "a0"), onPage("b", "p2", "a0")];
      expect(getRoomVersion(elements)).toBe(
        getRoomVersion(elements.map((el) => ({ ...el }))),
      );
    });

    it("changes with any edit", () => {
      const element = onPage("a", "p1", "a0");
      expect(getRoomVersion([element])).not.toBe(
        getRoomVersion([newElementWith(element, { x: 1 })]),
      );
    });
  });
});
