/**
 * Page data in a room (#167): merging peers' copies, conflicts, local
 * changes and validation. Pure logic, see collab/pageSync.ts. The room-level
 * behaviour is tested in collabPages.test.tsx.
 */
import type { SharedPageInfo } from "@excalidraw/excalidraw/pages";

import {
  EMPTY_PAGE_DATA,
  getLocalPageChanges,
  getSharedPageInfos,
  isSamePageData,
  mergePageData,
  parsePageData,
  resolvePageNameCollisions,
} from "../collab/pageSync";

import type { PageField, SharedPage, SharedPageData } from "../collab/pageSync";

const BASE_NAME = "Page";

const field = (value: string, updated = 1): PageField => ({ value, updated });

/** a shared page; every field changed at time 1 unless given */
const page = (
  id: string,
  {
    name = id,
    description = "",
    viewBackgroundColor = "#ffffff",
    position = "a0",
    updated = 1,
  }: Partial<Record<"name" | "description" | "viewBackgroundColor", string>> & {
    position?: string;
    updated?: number;
  } = {},
): SharedPage => ({
  id,
  name: field(name, updated),
  description: field(description, updated),
  viewBackgroundColor: field(viewBackgroundColor, updated),
  position: field(position, updated),
});

const data = (
  pages: SharedPage[],
  deletedPageIds: Record<string, number> = {},
): SharedPageData => ({ pages, deletedPageIds });

const info = (id: string, name = id): SharedPageInfo => ({
  id,
  name,
  description: "",
  viewBackgroundColor: "#ffffff",
});

const merge = (a: SharedPageData, b: SharedPageData) =>
  mergePageData(a, b, BASE_NAME);

/** merging in both orders gives the same result: returns it */
const mergeBothWays = (a: SharedPageData, b: SharedPageData) => {
  const ab = merge(a, b);
  expect(isSamePageData(ab, merge(b, a))).toBe(true);
  return ab;
};

const names = (pageData: SharedPageData) =>
  pageData.pages.map((p) => p.name.value);

const ids = (pageData: SharedPageData) => pageData.pages.map((p) => p.id);

describe("page data (#167)", () => {
  // ---------------------------------------------------------------------------
  describe("AC 4.5: simultaneous changes to one page", () => {
    it.each(["name", "description", "viewBackgroundColor"] as const)(
      "the later %s change wins, in any order",
      (key) => {
        const older = data([page("p1", { [key]: "older", updated: 10 })]);
        const newer = data([page("p1", { [key]: "newer", updated: 20 })]);

        const merged = mergeBothWays(older, newer);

        expect(merged.pages[0][key].value).toBe("newer");
      },
    );

    it("the later position change wins, in any order", () => {
      const a = data([
        page("p1", { position: "a0" }),
        page("p2", { position: "a1", updated: 10 }),
      ]);
      const b = data([
        page("p1", { position: "a0" }),
        page("p2", { position: "Zz", updated: 20 }),
      ]);

      expect(ids(mergeBothWays(a, b))).toEqual(["p2", "p1"]);
    });

    it("same time: both clients pick the same value", () => {
      const a = data([page("p1", { name: "Alpha", updated: 10 })]);
      const b = data([page("p1", { name: "Beta", updated: 10 })]);

      expect(names(mergeBothWays(a, b))).toEqual(["Beta"]);
    });

    it("changes to different fields of one page both survive", () => {
      const base = page("p1", { updated: 1 });
      const renamed = data([{ ...base, name: field("Renamed", 10) }]);
      const recoloured = data([
        { ...base, viewBackgroundColor: field("#000000", 11) },
      ]);

      const merged = mergeBothWays(renamed, recoloured).pages[0];

      expect(merged.name.value).toBe("Renamed");
      expect(merged.viewBackgroundColor.value).toBe("#000000");
    });

    it("pages with the same position are ordered by page id", () => {
      expect(
        ids(
          merge(
            data([page("b", { position: "a0" })]),
            data([page("a", { position: "a0" })]),
          ),
        ),
      ).toEqual(["a", "b"]);
    });

    it("a page only one side has is kept", () => {
      expect(
        ids(
          mergeBothWays(
            data([page("p1", { position: "a0" })]),
            data([page("p2", { position: "a1" })]),
          ),
        ),
      ).toEqual(["p1", "p2"]);
    });
  });

  // ---------------------------------------------------------------------------
  describe("AC 4.2: delete wins", () => {
    it("a deleted page stays deleted, even if edited later", () => {
      const deleted = data([page("p2")], { p1: 10 });
      const editedLater = data([
        page("p1", { name: "Edited", updated: 99 }),
        page("p2"),
      ]);

      const merged = mergeBothWays(deleted, editedLater);

      expect(ids(merged)).toEqual(["p2"]);
      expect(merged.deletedPageIds).toEqual({ p1: 10 });
    });

    it("keeps every deletion it hears of", () => {
      const merged = mergeBothWays(
        data([page("p3")], { p1: 10 }),
        data([page("p3")], { p2: 20 }),
      );
      expect(merged.deletedPageIds).toEqual({ p1: 10, p2: 20 });
    });
  });

  describe("AC 4.3: deleting every page", () => {
    it("concurrent deletions of every page leave the same blank page everywhere", () => {
      // A deleted p1 (keeping p2), B deleted p2 (keeping p1)
      const merged = mergeBothWays(
        data([page("p2")], { p1: 10 }),
        data([page("p1")], { p2: 20 }),
      );

      expect(merged.pages).toHaveLength(1);
      expect(names(merged)).toEqual(["Page 1"]);
      expect(merged.pages[0].id).not.toMatch(/^p[12]$/);
    });
  });

  // ---------------------------------------------------------------------------
  describe("AC 4.4: duplicate names", () => {
    it("the page with the later name change becomes the next free Page N", () => {
      // both renamed to "Plan" before hearing of each other
      const a = data([
        page("p1", { name: "Plan", updated: 10, position: "a0" }),
        page("p2", { name: "Page 1", updated: 1, position: "a1" }),
      ]);
      const b = data([
        page("p1", { name: "Page 3", updated: 1, position: "a0" }),
        page("p2", { name: "Plan", updated: 20, position: "a1" }),
      ]);

      // p2's rename was later → renamed. "Page 1" is free again (p2 was
      // "Page 1" before), so that's the next free default name
      expect(names(mergeBothWays(a, b))).toEqual(["Plan", "Page 1"]);
    });

    it("compares names trimmed and case-insensitively", () => {
      const merged = merge(
        data([page("p1", { name: "plan", updated: 10, position: "a0" })]),
        data([page("p2", { name: " Plan ", updated: 20, position: "a1" })]),
      );
      expect(names(merged)).toEqual(["plan", "Page 1"]);
    });

    it("same time: the larger page id is renamed", () => {
      const merged = mergeBothWays(
        data([page("b", { name: "Plan", updated: 10, position: "a0" })]),
        data([page("a", { name: "Plan", updated: 10, position: "a1" })]),
      );
      expect(merged.pages.map((p) => [p.id, p.name.value]).sort()).toEqual([
        ["a", "Plan"],
        ["b", "Page 1"],
      ]);
    });

    it("skips default names that are taken", () => {
      const merged = resolvePageNameCollisions(
        data([
          page("p1", { name: "Page 1", position: "a0" }),
          page("p2", { name: "Plan", updated: 5, position: "a1" }),
          page("p3", { name: "Plan", updated: 6, position: "a2" }),
        ]),
        BASE_NAME,
      );
      expect(names(merged)).toEqual(["Page 1", "Plan", "Page 2"]);
    });

    it("the renamed name is a newer change, so it spreads like any rename", () => {
      const merged = merge(
        data([page("p1", { name: "Plan", updated: 10, position: "a0" })]),
        data([page("p2", { name: "Plan", updated: 20, position: "a1" })]),
      );
      expect(merged.pages[1].name).toEqual({ value: "Page 1", updated: 21 });
    });
  });

  // ---------------------------------------------------------------------------
  describe("local changes (AC 3.2, 3.3)", () => {
    const NOW = 100;
    const shared = data([
      page("p1", { position: "a0" }),
      page("p2", { position: "a1" }),
      page("p3", { position: "a2" }),
    ]);

    it("nothing shared changed → null", () => {
      expect(
        getLocalPageChanges(shared, [info("p1"), info("p2"), info("p3")], NOW),
      ).toBeNull();
    });

    it("a rename changes only that page's name, at the change time", () => {
      const changes = getLocalPageChanges(
        shared,
        [info("p1"), info("p2", "Renamed"), info("p3")],
        NOW,
      )!;
      expect(changes.pages[1].name).toEqual({ value: "Renamed", updated: NOW });
      expect(changes.pages[1].description).toEqual(shared.pages[1].description);
      expect(changes.pages[0]).toEqual(shared.pages[0]);
    });

    it("a description or background change is recorded", () => {
      const changes = getLocalPageChanges(
        shared,
        [
          { ...info("p1"), description: "About" },
          info("p2"),
          { ...info("p3"), viewBackgroundColor: "#000000" },
        ],
        NOW,
      )!;
      expect(changes.pages[0].description).toEqual(field("About", NOW));
      expect(changes.pages[2].viewBackgroundColor).toEqual(
        field("#000000", NOW),
      );
    });

    it("a new page is recorded with every field, after its neighbour", () => {
      const changes = getLocalPageChanges(
        shared,
        [info("p1"), info("p2"), info("p3"), info("p4")],
        NOW,
      )!;
      expect(ids(changes)).toEqual(["p1", "p2", "p3", "p4"]);
      expect(changes.pages[3].name).toEqual(field("p4", NOW));
      expect(changes.pages[3].position.updated).toBe(NOW);
    });

    it("a removed page is recorded as deleted", () => {
      const changes = getLocalPageChanges(
        shared,
        [info("p1"), info("p3")],
        NOW,
      )!;
      expect(ids(changes)).toEqual(["p1", "p3"]);
      expect(changes.deletedPageIds).toEqual({ p2: NOW });
    });

    it("moving one page gives only that page a new position", () => {
      const changes = getLocalPageChanges(
        shared,
        [info("p3"), info("p1"), info("p2")],
        NOW,
      )!;
      expect(ids(changes)).toEqual(["p3", "p1", "p2"]);
      expect(changes.pages.map((p) => p.position.updated)).toEqual([NOW, 1, 1]);
    });

    it("moves of different pages by two clients both survive", () => {
      const four = data([
        page("p1", { position: "a0" }),
        page("p2", { position: "a1" }),
        page("p3", { position: "a2" }),
        page("p4", { position: "a3" }),
      ]);
      // A moves p1 after p2, B moves p4 before p3
      const a = getLocalPageChanges(
        four,
        [info("p2"), info("p1"), info("p3"), info("p4")],
        NOW,
      )!;
      const b = getLocalPageChanges(
        four,
        [info("p1"), info("p2"), info("p4"), info("p3")],
        NOW + 1,
      )!;
      expect(ids(mergeBothWays(a, b))).toEqual(["p2", "p1", "p4", "p3"]);
    });

    it("deleting every page and adding a blank one puts it first", () => {
      // as App.deletePages does: every page gone, one new page left
      const changes = getLocalPageChanges(shared, [info("blank")], NOW)!;
      // a page someone else added meanwhile, after the old pages
      const merged = merge(
        changes,
        data([page("other", { position: "a3", updated: 50 })]),
      );
      expect(ids(merged)).toEqual(["blank", "other"]);
    });

    it("a page moved between two pages with the same key renumbers every page, keeping the order", () => {
      // p1 and p2 share a key (allowed: ties are broken by page id), so no key
      // fits between them
      const tied = data([
        page("p1", { position: "a0" }),
        page("p2", { position: "a0" }),
        page("p3", { position: "a1" }),
        page("p4", { position: "a2" }),
      ]);

      const changes = getLocalPageChanges(
        tied,
        [info("p1"), info("p4"), info("p2"), info("p3")],
        NOW,
      )!;

      expect(ids(changes)).toEqual(["p1", "p4", "p2", "p3"]);
      // the fallback ran: keys are unique again, so p2 (tied with p1) got a
      // new one. (A page whose new key equals its old one keeps its field.)
      const keys = changes.pages.map((p) => p.position.value);
      expect(new Set(keys).size).toBe(4);
      expect(changes.pages.find((p) => p.id === "p2")!.position).toEqual({
        value: expect.not.stringMatching(/^a0$/),
        updated: NOW,
      });
    });

    // bug found in review: renumbering after a delete overwrote a
    // collaborator's rename made meanwhile
    it("a renumbered default name counts as just after the name it replaces", () => {
      const named = data([page("p3", { name: "Page 3", updated: 5 })]);

      const changes = getLocalPageChanges(
        named,
        [info("p3", "Page 2")],
        NOW,
        BASE_NAME,
      )!;

      expect(changes.pages[0].name).toEqual({ value: "Page 2", updated: 6 });
    });

    it("so a collaborator's real rename made meanwhile wins over it", () => {
      const named = data([page("p3", { name: "Page 3", updated: 5 })]);
      const renumbered = getLocalPageChanges(
        named,
        [info("p3", "Page 2")],
        NOW,
        BASE_NAME,
      )!;
      // B renamed it at time 50, before hearing of the delete at NOW (100)
      const theirs = data([page("p3", { name: "Ideas", updated: 50 })]);

      expect(names(mergeBothWays(renumbered, theirs))).toEqual(["Ideas"]);
    });

    it("(control) a user's own rename still counts at the change time", () => {
      const named = data([page("p3", { name: "Page 3", updated: 5 })]);

      expect(
        getLocalPageChanges(named, [info("p3", "Ideas")], NOW, BASE_NAME)!
          .pages[0].name,
      ).toEqual({ value: "Ideas", updated: NOW });
    });

    it("never includes personal settings", () => {
      const changes = getLocalPageChanges(EMPTY_PAGE_DATA, [info("p1")], NOW)!;
      expect(Object.keys(changes.pages[0]).sort()).toEqual([
        "description",
        "id",
        "name",
        "position",
        "viewBackgroundColor",
      ]);
    });

    it("round-trips through what the editor shows", () => {
      const pages = [info("p1", "One"), info("p2", "Two")];
      expect(
        getSharedPageInfos(getLocalPageChanges(EMPTY_PAGE_DATA, pages, NOW)!),
      ).toEqual(pages);
    });
  });

  // ---------------------------------------------------------------------------
  describe("AC 5.1: bad page data", () => {
    const valid = data([page("p1"), page("p2", { position: "a1" })]);

    it("accepts valid page data, dropping unknown fields", () => {
      const parsed = parsePageData({
        ...valid,
        pages: valid.pages.map((p) => ({ ...p, scrollX: 5 })),
      });
      expect(parsed).toEqual(valid);
    });

    it.each([
      ["not an object", "nope"],
      ["no pages", { deletedPageIds: {} }],
      ["no live page", data([])],
      ["no deleted pages entry", { pages: valid.pages }],
      [
        "a duplicate page id",
        data([page("p1"), page("p1", { position: "a1" })]),
      ],
      ["a page without an id", data([{ ...page("p1"), id: "" }])],
      [
        "a page missing a field",
        data([{ ...page("p1"), description: undefined } as any]),
      ],
      [
        "a field without a change time",
        data([{ ...page("p1"), name: { value: "x" } } as any]),
      ],
      ["an empty name", data([page("p1", { name: "  " })])],
      [
        "a name over 50 characters",
        data([page("p1", { name: "x".repeat(51) })]),
      ],
      [
        "a description over 350 characters",
        data([page("p1", { description: "x".repeat(351) })]),
      ],
      ["an invalid position", data([page("p1", { position: "!!" })])],
      ["a deleted page without a time", data([page("p1")], { p2: "x" } as any)],
    ])("rejects %s", (_, value) => {
      expect(parsePageData(value)).toBeNull();
    });
  });
});
