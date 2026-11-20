import {
  createPage,
  createPageFolder,
  createPageTree,
  deletePageFolder,
  deletePages,
  getPageFolder,
  getPageOrder,
  getPagePosition,
  moveNavItem,
  movePageToPosition,
  orderPages,
  parsePagePosition,
  parsePageRange,
  removePageFromFolder,
  syncPageTree,
  togglePageFolder,
} from "./pages";

import type { DrawingPage, PageFolder, PageTree } from "./pages";

const makePages = (...ids: string[]) => ids.map((id) => createPage(id, id));
const ids = (pages: readonly DrawingPage[]) => pages.map((page) => page.id);
const noNewId = () => {
  throw new Error("should not create a page");
};

describe("deletePages", () => {
  const pages = makePages("a", "b", "c", "d");

  it("removes a non-active page and keeps the active page", () => {
    const result = deletePages(pages, ["c"], "a", noNewId);
    expect(ids(result.pages)).toEqual(["a", "b", "d"]);
    expect(result.activePageId).toBe("a");
  });

  it("moves to the previous page when the active page is deleted", () => {
    const result = deletePages(pages, ["c"], "c", noNewId);
    expect(ids(result.pages)).toEqual(["a", "b", "d"]);
    expect(result.activePageId).toBe("b");
  });

  it("skips deleted neighbours to find the closest surviving previous page", () => {
    const result = deletePages(pages, ["b", "c"], "c", noNewId);
    expect(result.activePageId).toBe("a");
  });

  it("moves to the next page when the deleted active page was first", () => {
    const result = deletePages(pages, ["a"], "a", noNewId);
    expect(result.activePageId).toBe("b");
  });

  it("moves to the next surviving page when everything before it is deleted", () => {
    const result = deletePages(pages, ["a", "b", "c"], "b", noNewId);
    expect(ids(result.pages)).toEqual(["d"]);
    expect(result.activePageId).toBe("d");
  });

  it("creates a single blank page when every page is deleted", () => {
    const result = deletePages(pages, ["a", "b", "c", "d"], "b", () => "new");
    expect(ids(result.pages)).toEqual(["new"]);
    expect(result.pages[0].elements).toEqual([]);
    expect(result.activePageId).toBe("new");
  });

  it("deletes all but the current page", () => {
    const result = deletePages(pages, ["a", "b", "d"], "c", noNewId);
    expect(ids(result.pages)).toEqual(["c"]);
    expect(result.activePageId).toBe("c");
  });

  it("keeps extra page fields (e.g. names added by other features)", () => {
    const named = [
      { ...createPage("a", "a"), description: "Intro page" },
      createPage("b", "b"),
    ];
    const result = deletePages(named, ["b"], "a", noNewId);
    expect(result.pages[0]).toBe(named[0]);
  });

  it("ignores duplicate ids", () => {
    const result = deletePages(pages, ["b", "b"], "a", noNewId);
    expect(ids(result.pages)).toEqual(["a", "c", "d"]);
  });

  it("does not mutate the input", () => {
    deletePages(pages, ["a"], "a", noNewId);
    expect(ids(pages)).toEqual(["a", "b", "c", "d"]);
  });

  it("rejects an empty selection", () => {
    expect(() => deletePages(pages, [], "a", noNewId)).toThrow();
  });

  it("rejects unknown page ids", () => {
    expect(() => deletePages(pages, ["zzz"], "a", noNewId)).toThrow();
  });

  it("rejects an unknown active page", () => {
    expect(() => deletePages(pages, ["a"], "zzz", noNewId)).toThrow();
  });
});

describe("parsePageRange", () => {
  const pages = makePages("p1", "p2", "p3", "p4", "p5", "p6", "p7");

  it.each([
    ["3", ["p3"]],
    ["2-4", ["p2", "p3", "p4"]],
    ["2-4, 7", ["p2", "p3", "p4", "p7"]],
    [" 7 , 1 ", ["p1", "p7"]],
    ["2 - 3", ["p2", "p3"]],
    ["4-4", ["p4"]],
    ["1-3, 2-4", ["p1", "p2", "p3", "p4"]],
    ["1-7", ["p1", "p2", "p3", "p4", "p5", "p6", "p7"]],
  ])("parses %j", (input, expected) => {
    expect(parsePageRange(input, pages)).toEqual(expected);
  });

  it("handles two-digit page numbers in drawings with 10+ pages", () => {
    const manyPages = makePages(
      ...Array.from({ length: 12 }, (_, index) => `p${index + 1}`),
    );

    expect(parsePageRange("10-12", manyPages)).toEqual(["p10", "p11", "p12"]);
    expect(parsePageRange("11", manyPages)).toEqual(["p11"]);
    expect(parsePageRange("9-10", manyPages)).toEqual(["p9", "p10"]);
  });

  it.each([
    "",
    "   ",
    "0",
    "8",
    "1-8",
    "4-2",
    "-1",
    "abc",
    "1.5",
    "2-",
    "2,",
    "1,,3",
    "2-3-4",
  ])("rejects %j", (input) => {
    expect(parsePageRange(input, pages)).toBeNull();
  });
});

// --- page order and folders (#162) -----------------------------------------

const folder = (
  id: string,
  pageIds: string[],
  extra: Partial<PageFolder> = {},
): PageFolder => ({
  type: "folder",
  id,
  name: id,
  collapsed: false,
  pageIds,
  ...extra,
});
const pageNode = (pageId: string) => ({ type: "page" as const, pageId });
/** compact tree shape: "a" for a page, "F[b,c]" for a folder */
const shape = (tree: PageTree) =>
  tree.map((node) =>
    node.type === "page" ? node.pageId : `${node.id}[${node.pageIds}]`,
  );
const pageRef = (id: string) => ({ type: "page" as const, id });
const folderRef = (id: string) => ({ type: "folder" as const, id });

describe("page tree basics", () => {
  it("starts as a flat list in page order", () => {
    expect(shape(createPageTree(makePages("a", "b", "c")))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("flattens folders in place", () => {
    const tree = [pageNode("a"), folder("F", ["b", "c"]), pageNode("d")];
    expect(getPageOrder(tree)).toEqual(["a", "b", "c", "d"]);
  });

  it("orders pages to match the tree", () => {
    const pages = makePages("a", "b", "c");
    const tree = [folder("F", ["c", "a"]), pageNode("b")];
    expect(ids(orderPages(pages, tree))).toEqual(["c", "a", "b"]);
  });

  it("rejects a tree that does not match the pages", () => {
    const pages = makePages("a", "b");
    expect(() => orderPages(pages, [pageNode("a")])).toThrow();
    expect(() => orderPages(pages, [pageNode("a"), pageNode("zzz")])).toThrow();
  });

  it("finds the folder holding a page", () => {
    const tree = [pageNode("a"), folder("F", ["b"])];
    expect(getPageFolder(tree, "a")).toBeNull();
    expect(getPageFolder(tree, "b")?.id).toBe("F");
    expect(() => getPageFolder(tree, "zzz")).toThrow();
  });

  it("reports a position within the page's own list", () => {
    const tree = [pageNode("a"), folder("F", ["b", "c"]), pageNode("d")];
    expect(getPagePosition(tree, "d")).toEqual({ position: 3, count: 3 });
    expect(getPagePosition(tree, "c")).toEqual({ position: 2, count: 2 });
  });
});

describe("syncPageTree", () => {
  it("appends new pages at the top level", () => {
    const tree = [folder("F", ["a"]), pageNode("b")];
    expect(shape(syncPageTree(tree, makePages("a", "b", "c")))).toEqual([
      "F[a]",
      "b",
      "c",
    ]);
  });

  it("drops deleted pages and folders left empty", () => {
    const tree = [folder("F", ["a"]), folder("G", ["b", "c"]), pageNode("d")];
    expect(shape(syncPageTree(tree, makePages("c", "d")))).toEqual([
      "G[c]",
      "d",
    ]);
  });
});

describe("parsePagePosition", () => {
  it.each([
    ["1", 1],
    [" 3 ", 3],
    ["0", 0],
    ["99", 99],
  ])("parses %j", (input, expected) => {
    expect(parsePagePosition(input)).toBe(expected);
  });

  it.each(["", "  ", "-1", "-0", "1.5", "abc", "2a", "+2", "1e2"])(
    "rejects %j",
    (input) => {
      expect(parsePagePosition(input)).toBeNull();
    },
  );
});

describe("movePageToPosition", () => {
  const tree = createPageTree(makePages("a", "b", "c", "d"));

  it("moves a page to the given position", () => {
    expect(shape(movePageToPosition(tree, "a", 3))).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
    expect(shape(movePageToPosition(tree, "d", 2))).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
  });

  it("moves to the start for position 0 (Criteria E)", () => {
    expect(shape(movePageToPosition(tree, "c", 0))).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("moves to the end for a position past the end (Criteria D)", () => {
    expect(shape(movePageToPosition(tree, "a", 99))).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
    expect(shape(movePageToPosition(tree, "a", 5))).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
  });

  it("leaves the order alone when the page is already there", () => {
    expect(shape(movePageToPosition(tree, "b", 2))).toEqual(shape(tree));
  });

  it("counts a folder as one slot at the top level", () => {
    const withFolder = [pageNode("a"), folder("F", ["b", "c"]), pageNode("d")];
    expect(shape(movePageToPosition(withFolder, "d", 2))).toEqual([
      "a",
      "d",
      "F[b,c]",
    ]);
  });

  it("moves within the page's folder", () => {
    const withFolder = [pageNode("a"), folder("F", ["b", "c", "d"])];
    expect(shape(movePageToPosition(withFolder, "d", 1))).toEqual([
      "a",
      "F[d,b,c]",
    ]);
    expect(shape(movePageToPosition(withFolder, "b", 99))).toEqual([
      "a",
      "F[c,d,b]",
    ]);
  });

  it("does not mutate the input", () => {
    movePageToPosition(tree, "a", 3);
    expect(shape(tree)).toEqual(["a", "b", "c", "d"]);
  });

  it("rejects unknown pages", () => {
    expect(() => movePageToPosition(tree, "zzz", 1)).toThrow();
  });
});

describe("moveNavItem", () => {
  const flat = createPageTree(makePages("a", "b", "c", "d"));

  it("drops a page before or after another page", () => {
    expect(
      shape(moveNavItem(flat, pageRef("d"), pageRef("b"), "before")),
    ).toEqual(["a", "d", "b", "c"]);
    expect(
      shape(moveNavItem(flat, pageRef("a"), pageRef("c"), "after")),
    ).toEqual(["b", "c", "a", "d"]);
  });

  it("does nothing when dropped on itself", () => {
    expect(moveNavItem(flat, pageRef("a"), pageRef("a"), "after")).toBe(flat);
  });

  const nested: PageTree = [
    pageNode("a"),
    folder("F", ["b", "c"]),
    pageNode("d"),
  ];

  it("moves a page into a folder next to a page inside it", () => {
    expect(
      shape(moveNavItem(nested, pageRef("d"), pageRef("b"), "after")),
    ).toEqual(["a", "F[b,d,c]"]);
  });

  it("moves a page out of a folder", () => {
    expect(
      shape(moveNavItem(nested, pageRef("c"), pageRef("a"), "before")),
    ).toEqual(["c", "a", "F[b]", "d"]);
  });

  it("places a page next to a folder header at the top level", () => {
    expect(
      shape(moveNavItem(nested, pageRef("a"), folderRef("F"), "after")),
    ).toEqual(["F[b,c]", "a", "d"]);
  });

  it("removes a folder once its last page is dragged out", () => {
    const single = [folder("F", ["a"]), pageNode("b")];
    expect(
      shape(moveNavItem(single, pageRef("a"), pageRef("b"), "after")),
    ).toEqual(["b", "a"]);
  });

  it("reorders folders like pages (Criteria C)", () => {
    expect(
      shape(moveNavItem(nested, folderRef("F"), pageRef("a"), "before")),
    ).toEqual(["F[b,c]", "a", "d"]);
    expect(
      shape(moveNavItem(nested, folderRef("F"), pageRef("d"), "after")),
    ).toEqual(["a", "d", "F[b,c]"]);
  });

  it("never nests folders: a folder dropped by a page in a folder lands by that folder", () => {
    const two = [folder("F", ["a", "b"]), folder("G", ["c"])];
    expect(
      shape(moveNavItem(two, folderRef("G"), pageRef("b"), "before")),
    ).toEqual(["G[c]", "F[a,b]"]);
    expect(moveNavItem(two, folderRef("F"), pageRef("a"), "after")).toBe(two);
  });

  it("rejects unknown items", () => {
    expect(() =>
      moveNavItem(flat, pageRef("zzz"), pageRef("a"), "before"),
    ).toThrow();
    expect(() =>
      moveNavItem(flat, pageRef("a"), folderRef("zzz"), "before"),
    ).toThrow();
  });
});

describe("createPageFolder", () => {
  const flat = createPageTree(makePages("a", "b", "c", "d"));

  it("groups pages into a named, expanded folder at the end (Criteria B/C)", () => {
    const tree = createPageFolder(flat, ["c", "a"], "F", "  Notes  ");
    expect(shape(tree)).toEqual(["b", "d", "F[a,c]"]);
    expect(tree[2]).toMatchObject({ name: "Notes", collapsed: false });
  });

  it("pulls pages out of other folders and removes folders left empty", () => {
    const tree: PageTree = [folder("G", ["a"]), folder("H", ["b", "c"])];
    expect(shape(createPageFolder(tree, ["a", "b"], "F", "New"))).toEqual([
      "H[c]",
      "F[a,b]",
    ]);
  });

  it("requires a name, pages, and known pages", () => {
    expect(() => createPageFolder(flat, ["a"], "F", "   ")).toThrow();
    expect(() => createPageFolder(flat, [], "F", "Name")).toThrow();
    expect(() => createPageFolder(flat, ["zzz"], "F", "Name")).toThrow();
  });
});

describe("deletePageFolder", () => {
  it("keeps the pages in the folder's place, in order", () => {
    const tree = [pageNode("a"), folder("F", ["b", "c"]), pageNode("d")];
    expect(shape(deletePageFolder(tree, "F"))).toEqual(["a", "b", "c", "d"]);
  });

  it("rejects unknown folders", () => {
    expect(() => deletePageFolder([pageNode("a")], "F")).toThrow();
  });
});

describe("removePageFromFolder", () => {
  it("puts the page right after its folder", () => {
    const tree = [pageNode("a"), folder("F", ["b", "c"]), pageNode("d")];
    expect(shape(removePageFromFolder(tree, "b"))).toEqual([
      "a",
      "F[c]",
      "b",
      "d",
    ]);
  });

  it("removes the folder once it is empty", () => {
    const tree = [folder("F", ["a"]), pageNode("b")];
    expect(shape(removePageFromFolder(tree, "a"))).toEqual(["a", "b"]);
  });

  it("rejects pages that are not in a folder", () => {
    const tree = [pageNode("a"), folder("F", ["b"])];
    expect(() => removePageFromFolder(tree, "a")).toThrow();
    expect(() => removePageFromFolder(tree, "zzz")).toThrow();
  });
});

describe("togglePageFolder", () => {
  it("collapses and expands a folder", () => {
    const tree = [folder("F", ["a"])];
    const collapsed = togglePageFolder(tree, "F");
    expect((collapsed[0] as PageFolder).collapsed).toBe(true);
    expect((togglePageFolder(collapsed, "F")[0] as PageFolder).collapsed).toBe(
      false,
    );
  });

  it("rejects unknown folders", () => {
    expect(() => togglePageFolder([], "F")).toThrow();
  });
});
