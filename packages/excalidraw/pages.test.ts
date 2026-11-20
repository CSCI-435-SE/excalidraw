import { createPage, deletePages, parsePageRange } from "./pages";

import type { DrawingPage } from "./pages";

const makePages = (...ids: string[]) => ids.map((id) => createPage(id));
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
    const named = [{ ...createPage("a"), name: "Intro" }, createPage("b")];
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
