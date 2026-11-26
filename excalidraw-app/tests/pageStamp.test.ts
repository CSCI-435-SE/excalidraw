import {
  CREATOR_ID_KEY,
  PAGE_ID_KEY,
  getElementPageId,
  isElementOnOtherPage,
  newElementWith,
} from "@excalidraw/element";
import { groupElementsByPageTag } from "@excalidraw/excalidraw/pages";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import {
  getElementsToPageStamp,
  getLocalElementsToPageStamp,
  getPageStampedCustomData,
} from "../collab/pageStamp";

const createRect = (id: string, customData?: ExcalidrawElement["customData"]) =>
  newElementWith(API.createElement({ type: "rectangle", id }), {
    customData,
  }) as ExcalidrawElement;

const onPage = (id: string, pageId: string) =>
  createRect(id, { [PAGE_ID_KEY]: pageId });

// AC 2.1 (page tag) and 2.3 (untagged elements)
describe("page tag (#167)", () => {
  describe("getElementsToPageStamp", () => {
    it("stamps only elements without a page tag", () => {
      expect(
        getElementsToPageStamp([
          createRect("new"),
          onPage("tagged", "page-1"),
        ]).map((el) => el.id),
      ).toEqual(["new"]);
    });

    it("never restamps a tagged element, whatever page is open", () => {
      // e.g. an element that was edited or moved: its tag stays
      expect(getElementsToPageStamp([onPage("moved", "page-2")])).toEqual([]);
    });

    it("treats an invalid tag as no tag", () => {
      expect(
        getElementsToPageStamp([
          createRect("empty", { [PAGE_ID_KEY]: "" }),
          createRect("number", { [PAGE_ID_KEY]: 7 }),
        ]).map((el) => el.id),
      ).toEqual(["empty", "number"]);
    });
  });

  describe("getPageStampedCustomData", () => {
    it("adds the page id and keeps the rest of customData", () => {
      expect(
        getPageStampedCustomData(
          createRect("a", { [CREATOR_ID_KEY]: "alice", keep: true }),
          "page-1",
        ),
      ).toEqual({
        [CREATOR_ID_KEY]: "alice",
        keep: true,
        [PAGE_ID_KEY]: "page-1",
      });
    });

    it("works without customData", () => {
      expect(getPageStampedCustomData(createRect("a"), "page-1")).toEqual({
        [PAGE_ID_KEY]: "page-1",
      });
    });
  });

  describe("getElementPageId", () => {
    it("reads a valid tag, null otherwise", () => {
      expect(getElementPageId(onPage("a", "page-1"))).toBe("page-1");
      expect(getElementPageId(createRect("b"))).toBeNull();
      expect(getElementPageId(createRect("c", { [PAGE_ID_KEY]: "" }))).toBe(
        null,
      );
    });
  });

  // AC 2.4 (safety net)
  describe("isElementOnOtherPage", () => {
    it("is true only for elements tagged for another page than the open one", () => {
      expect(isElementOnOtherPage(onPage("a", "page-2"), "page-1")).toBe(true);
      expect(isElementOnOtherPage(onPage("a", "page-1"), "page-1")).toBe(false);
    });

    it("never hides untagged elements (they're stamped before routing)", () => {
      expect(isElementOnOtherPage(createRect("a"), "page-1")).toBe(false);
    });

    it("is off when no page is open (outside a room)", () => {
      expect(isElementOnOtherPage(onPage("a", "page-2"), null)).toBe(false);
      expect(isElementOnOtherPage(onPage("a", "page-2"), undefined)).toBe(
        false,
      );
    });
  });

  // AC 2.2 (routing)
  describe("groupElementsByPageTag", () => {
    it("groups by tag, keeping order, untagged under null", () => {
      const groups = groupElementsByPageTag([
        onPage("a1", "page-a"),
        onPage("b1", "page-b"),
        createRect("untagged"),
        onPage("a2", "page-a"),
      ]);
      expect(
        [...groups].map(([pageId, elements]) => [
          pageId,
          elements.map((el) => el.id),
        ]),
      ).toEqual([
        ["page-a", ["a1", "a2"]],
        ["page-b", ["b1"]],
        [null, ["untagged"]],
      ]);
    });
  });

  // bug found in review: a pasted or duplicated copy keeps the original's
  // tag, so it was hidden on the page it was pasted on
  describe("getLocalElementsToPageStamp", () => {
    const ids = (elements: ExcalidrawElement[]) => elements.map((el) => el.id);

    it("stamps untagged elements", () => {
      expect(
        ids(getLocalElementsToPageStamp([createRect("new")], "p2", new Set())),
      ).toEqual(["new"]);
    });

    it("retags our own copy carrying another page's tag (pasted, duplicated)", () => {
      expect(
        ids(
          getLocalElementsToPageStamp(
            [onPage("pasted", "p1")],
            "p2",
            new Set(),
          ),
        ),
      ).toEqual(["pasted"]);
    });

    it("never retags an element that came from the room", () => {
      expect(
        getLocalElementsToPageStamp(
          [onPage("theirs", "p1")],
          "p2",
          new Set(["theirs"]),
        ),
      ).toEqual([]);
    });

    it("leaves elements already tagged with this page", () => {
      expect(
        getLocalElementsToPageStamp([onPage("mine", "p2")], "p2", new Set()),
      ).toEqual([]);
    });
  });
});
