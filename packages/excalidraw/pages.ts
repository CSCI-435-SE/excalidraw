import { getElementPageId } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { getDefaultAppState } from "./appState";
import { t } from "./i18n";

import type { AppState, Collaborator } from "./types";

export type PageSettings = Pick<
  AppState,
  | "viewBackgroundColor"
  | "scrollX"
  | "scrollY"
  | "zoom"
  | "gridSize"
  | "gridStep"
  | "gridScale"
  | "gridSnapLinked"
  | "gridSnapScale"
  | "gridColor"
  | "gridOpacity"
  | "gridLayer"
  | "gridModeEnabled"
  | "gridSnapEnabled"
  | "frameRendering"
>;

export type DrawingPage = Readonly<{
  id: string;
  name: string;
  description: string;
  showThumbnail: boolean;
  elements: readonly ExcalidrawElement[];
  settings: PageSettings;
}>;

/**
 * What collaborators share about a page in a room (#167). Everything else
 * (scroll, zoom, grid, `showThumbnail`) stays personal.
 */
export type SharedPageInfo = Readonly<
  Pick<DrawingPage, "id" | "name" | "description"> &
    Pick<PageSettings, "viewBackgroundColor">
>;

export const PAGE_NAME_MAX_LENGTH = 50;
export const PAGE_DESCRIPTION_MAX_LENGTH = 350;

export type PageGridSettings = Pick<
  PageSettings,
  "gridModeEnabled" | "gridSnapEnabled" | "gridSize"
>;

export type PageInfoPatch = {
  name: string;
  description: string;
  showThumbnail: boolean;
  grid: PageGridSettings;
};

export type PageInfoValidation = {
  nameError?: "empty" | "duplicate" | "tooLong";
  descriptionError?: "tooLong";
};

/** how page names compare: trimmed, case-insensitive */
export const normalizePageName = (name: string) =>
  name.trim().toLocaleLowerCase();

/**
 * Returns `${baseName} N` using the smallest N >= 1 whose name isn't already
 * taken (case-insensitively) by another page.
 */
export const getNextDefaultPageName = (
  pages: readonly Pick<DrawingPage, "name">[],
  baseName: string,
): string => {
  const taken = new Set(pages.map((page) => normalizePageName(page.name)));
  let index = 1;
  while (taken.has(normalizePageName(`${baseName} ${index}`))) {
    index++;
  }
  return `${baseName} ${index}`;
};

export const validatePageInfo = (
  info: { name: string; description: string },
  pages: readonly Pick<DrawingPage, "id" | "name">[],
  pageId: string,
): PageInfoValidation => {
  const result: PageInfoValidation = {};
  const trimmedName = info.name.trim();

  if (!trimmedName) {
    result.nameError = "empty";
  } else if (trimmedName.length > PAGE_NAME_MAX_LENGTH) {
    result.nameError = "tooLong";
  } else if (
    pages.some(
      (page) =>
        page.id !== pageId &&
        normalizePageName(page.name) === normalizePageName(trimmedName),
    )
  ) {
    result.nameError = "duplicate";
  }

  if (info.description.length > PAGE_DESCRIPTION_MAX_LENGTH) {
    result.descriptionError = "tooLong";
  }

  return result;
};

export const isPageInfoValid = (validation: PageInfoValidation) =>
  !validation.nameError && !validation.descriptionError;

export const getPageSettings = (appState: PageSettings): PageSettings => ({
  viewBackgroundColor: appState.viewBackgroundColor,
  scrollX: appState.scrollX,
  scrollY: appState.scrollY,
  zoom: appState.zoom,
  gridSize: appState.gridSize,
  gridStep: appState.gridStep,
  gridScale: appState.gridScale,
  gridSnapLinked: appState.gridSnapLinked,
  gridSnapScale: appState.gridSnapScale,
  gridColor: appState.gridColor,
  gridOpacity: appState.gridOpacity,
  gridLayer: appState.gridLayer,
  gridModeEnabled: appState.gridModeEnabled,
  gridSnapEnabled: appState.gridSnapEnabled,
  frameRendering: appState.frameRendering,
});

export const createPage = (id: string, name: string): DrawingPage => ({
  id,
  name,
  description: "",
  showThumbnail: true,
  elements: [],
  settings: getPageSettings(getDefaultAppState()),
});

/** The label shown for a page: its user-editable name (#160). */
export const getPageLabel = (page: DrawingPage) => page.name;

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whether the page still has a default name: `${baseName} N` for any whole
 * number N (case-insensitive, trimmed), e.g. "Page 2" or "Page 10000".
 */
export const hasDefaultPageName = (
  page: Pick<DrawingPage, "name">,
  baseName: string,
) =>
  new RegExp(`^${escapeRegExp(normalizePageName(baseName))} \\d+$`).test(
    normalizePageName(page.name),
  );

/**
 * Default page names follow their page's position: every page still named
 * `${baseName} N` is renamed to `${baseName} <its 1-based position>`, so
 * after page 1 is deleted "Page 2" becomes "Page 1". Pages the user named
 * themselves keep their names. Positions are unique, so the new names can't
 * collide with each other or with a custom name.
 */
export const renumberDefaultPageNames = (
  pages: readonly DrawingPage[],
  baseName: string,
): DrawingPage[] =>
  pages.map((page, index) => {
    if (!hasDefaultPageName(page, baseName)) {
      return page;
    }
    const name = `${baseName} ${index + 1}`;
    return name === page.name ? page : { ...page, name };
  });

/**
 * Removes the given pages. If the active page is removed, the closest
 * surviving page before it becomes active (or the first one after it).
 * Removing every page leaves a single fresh blank page. Pages still named
 * "Page N" are renumbered to their new positions (see
 * `renumberDefaultPageNames`).
 */
export const deletePages = (
  pages: readonly DrawingPage[],
  pageIds: readonly string[],
  activePageId: string,
  generateId: () => string,
): { pages: readonly DrawingPage[]; activePageId: string } => {
  const toDelete = new Set(pageIds);
  if (!toDelete.size) {
    throw new Error("No pages selected for deletion");
  }
  for (const id of toDelete) {
    if (!pages.some((page) => page.id === id)) {
      throw new Error(`Cannot delete unknown page ${id}`);
    }
  }
  const activeIndex = pages.findIndex((page) => page.id === activePageId);
  if (activeIndex === -1) {
    throw new Error(`Active page ${activePageId} does not exist`);
  }

  const remaining = renumberDefaultPageNames(
    pages.filter((page) => !toDelete.has(page.id)),
    t("labels.page"),
  );
  if (!remaining.length) {
    const page = createPage(
      generateId(),
      getNextDefaultPageName([], t("labels.page")),
    );
    return { pages: [page], activePageId: page.id };
  }
  if (!toDelete.has(activePageId)) {
    return { pages: remaining, activePageId };
  }
  const previous = pages
    .slice(0, activeIndex)
    .reverse()
    .find((page) => !toDelete.has(page.id));
  // no survivor before the active page => remaining[0] is the first after it
  return { pages: remaining, activePageId: (previous ?? remaining[0]).id };
};

/**
 * Whether a collaborator is on the given page (#167). Collaborators whose
 * page isn't known (clients that predate multi-page rooms) count as on
 * every page, as before; no open page (outside a room) means everyone.
 */
export const isCollaboratorOnPage = (
  collaborator: Pick<Collaborator, "pageId">,
  pageId: string | null | undefined,
): boolean => !pageId || !collaborator.pageId || collaborator.pageId === pageId;

/**
 * The collaborators on the open page (#167): only their cursors,
 * selections and laser trails are drawn. Returns the map as-is outside a
 * room.
 */
export const getCollaboratorsOnPage = <K>(
  collaborators: ReadonlyMap<K, Collaborator>,
  pageId: string | null | undefined,
): Map<K, Collaborator> =>
  new Map(
    [...collaborators].filter(([, collaborator]) =>
      isCollaboratorOnPage(collaborator, pageId),
    ),
  );

/**
 * Groups elements by their page tag (#167), keeping their relative order.
 * Untagged elements are grouped under `null`.
 */
export const groupElementsByPageTag = <T extends ExcalidrawElement>(
  elements: readonly T[],
): Map<string | null, T[]> => {
  const groups = new Map<string | null, T[]>();
  for (const element of elements) {
    const pageId = getElementPageId(element);
    const group = groups.get(pageId);
    if (group) {
      group.push(element);
    } else {
      groups.set(pageId, [element]);
    }
  }
  return groups;
};

/**
 * Parses 1-based page positions like "2-4, 7" into page ids (in page order).
 * Returns null for anything invalid: empty input, non-numbers, zero,
 * out-of-range positions, or reversed ranges like "4-2".
 */
export const parsePageRange = (
  input: string,
  pages: readonly DrawingPage[],
): string[] | null => {
  const tokens = input.split(",").map((token) => token.trim());
  const positions = new Set<number>();
  for (const token of tokens) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);
    if (!match) {
      return null;
    }
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (start < 1 || end > pages.length || start > end) {
      return null;
    }
    for (let position = start; position <= end; position++) {
      positions.add(position);
    }
  }
  return pages
    .filter((_, index) => positions.has(index + 1))
    .map((page) => page.id);
};

// ---------------------------------------------------------------------------
// Page order and folders (#162)
// ---------------------------------------------------------------------------

export type PageFolder = Readonly<{
  type: "folder";
  id: string;
  name: string;
  collapsed: boolean;
  pageIds: readonly string[];
}>;

export type PageNavNode =
  | Readonly<{ type: "page"; pageId: string }>
  | PageFolder;

/**
 * What the page navigation shows, top to bottom. Folders hold pages only
 * (never other folders). Flattening it gives the order of `pages`.
 */
export type PageTree = readonly PageNavNode[];

/** A page tab or a folder header in the page navigation. */
export type PageNavRef = Readonly<{ type: "page" | "folder"; id: string }>;

export type PageDropPlacement = "before" | "after";

export const createPageTree = (pages: readonly DrawingPage[]): PageTree =>
  pages.map((page) => ({ type: "page", pageId: page.id }));

/** Page ids in navigation order, with folder contents in place. */
export const getPageOrder = (tree: PageTree): string[] =>
  tree.flatMap((node) => (node.type === "page" ? [node.pageId] : node.pageIds));

/** Sorts `pages` into the tree's order. The tree must hold exactly these pages. */
export const orderPages = (
  pages: readonly DrawingPage[],
  tree: PageTree,
): DrawingPage[] => {
  const order = getPageOrder(tree);
  if (order.length !== pages.length) {
    throw new Error("Page tree and pages are out of sync");
  }
  const byId = new Map(pages.map((page) => [page.id, page]));
  return order.map((id) => {
    const page = byId.get(id);
    if (!page) {
      throw new Error(`Page tree references unknown page ${id}`);
    }
    return page;
  });
};

const pruneEmptyFolders = (tree: PageTree): PageTree =>
  tree.filter((node) => node.type === "page" || node.pageIds.length > 0);

/**
 * Brings the tree in line with `pages`: drops pages that no longer exist
 * (and folders left empty), and appends new pages at the end.
 */
export const syncPageTree = (
  tree: PageTree,
  pages: readonly DrawingPage[],
): PageTree => {
  const pageIds = new Set(pages.map((page) => page.id));
  const kept = pruneEmptyFolders(
    tree.flatMap((node): PageNavNode[] => {
      if (node.type === "page") {
        return pageIds.has(node.pageId) ? [node] : [];
      }
      return [
        { ...node, pageIds: node.pageIds.filter((id) => pageIds.has(id)) },
      ];
    }),
  );
  const inTree = new Set(getPageOrder(kept));
  return [
    ...kept,
    ...pages
      .filter((page) => !inTree.has(page.id))
      .map((page): PageNavNode => ({ type: "page", pageId: page.id })),
  ];
};

const assertPageInTree = (tree: PageTree, pageId: string) => {
  if (!getPageOrder(tree).includes(pageId)) {
    throw new Error(`Unknown page ${pageId}`);
  }
};

const findFolder = (tree: PageTree, folderId: string): PageFolder => {
  const folder = tree.find(
    (node): node is PageFolder =>
      node.type === "folder" && node.id === folderId,
  );
  if (!folder) {
    throw new Error(`Unknown page folder ${folderId}`);
  }
  return folder;
};

/** The folder holding the page, or null if the page is at the top level. */
export const getPageFolder = (
  tree: PageTree,
  pageId: string,
): PageFolder | null => {
  assertPageInTree(tree, pageId);
  return (
    tree.find(
      (node): node is PageFolder =>
        node.type === "folder" && node.pageIds.includes(pageId),
    ) ?? null
  );
};

/** Removes the page wherever it is, keeping any folder it leaves empty. */
const removePage = (tree: PageTree, pageId: string): PageTree =>
  tree.flatMap((node): PageNavNode[] => {
    if (node.type === "page") {
      return node.pageId === pageId ? [] : [node];
    }
    return node.pageIds.includes(pageId)
      ? [{ ...node, pageIds: node.pageIds.filter((id) => id !== pageId) }]
      : [node];
  });

const insertAt = <T>(list: readonly T[], index: number, item: T): T[] => [
  ...list.slice(0, index),
  item,
  ...list.slice(index),
];

/**
 * Parses a 1-based target position. Zero is allowed (it means "first");
 * negatives, decimals, text and empty input are invalid and give null.
 */
export const parsePagePosition = (input: string): number | null => {
  const trimmed = input.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
};

/**
 * The page's 1-based position within its own list (the top level, where a
 * folder takes one slot, or its folder), and that list's length.
 */
export const getPagePosition = (
  tree: PageTree,
  pageId: string,
): { position: number; count: number } => {
  const folder = getPageFolder(tree, pageId);
  if (folder) {
    return {
      position: folder.pageIds.indexOf(pageId) + 1,
      count: folder.pageIds.length,
    };
  }
  return {
    position:
      tree.findIndex((node) => node.type === "page" && node.pageId === pageId) +
      1,
    count: tree.length,
  };
};

/**
 * Moves the page to a 1-based position within its own list: the top level
 * (where a folder takes one slot) or the folder holding it. Positions below
 * 1 move it to the start, positions past the end move it to the end.
 */
export const movePageToPosition = (
  tree: PageTree,
  pageId: string,
  position: number,
): PageTree => {
  const folder = getPageFolder(tree, pageId);
  const clampIndex = (length: number) =>
    Math.min(Math.max(position, 1), length + 1) - 1;

  if (folder) {
    const rest = folder.pageIds.filter((id) => id !== pageId);
    const pageIds = insertAt(rest, clampIndex(rest.length), pageId);
    return tree.map((node) =>
      node === folder ? { ...folder, pageIds } : node,
    );
  }
  const node = tree.find(
    (candidate) => candidate.type === "page" && candidate.pageId === pageId,
  )!;
  const rest = tree.filter((candidate) => candidate !== node);
  return insertAt(rest, clampIndex(rest.length), node);
};

/**
 * Moves a page or folder next to the target, in the target's list. Pages can
 * move into and out of folders this way; folders stay at the top level (a
 * folder dropped next to a page in a folder lands next to that folder).
 * Folders left empty are removed.
 */
export const moveNavItem = (
  tree: PageTree,
  dragged: PageNavRef,
  target: PageNavRef,
  placement: PageDropPlacement,
): PageTree => {
  for (const ref of [dragged, target]) {
    if (ref.type === "page") {
      assertPageInTree(tree, ref.id);
    } else {
      findFolder(tree, ref.id);
    }
  }
  if (dragged.type === target.type && dragged.id === target.id) {
    return tree;
  }

  const offset = placement === "after" ? 1 : 0;
  const topLevelIndex = (nodes: PageTree, ref: PageNavRef) =>
    nodes.findIndex((node) =>
      ref.type === "page"
        ? node.type === "page" && node.pageId === ref.id
        : node.type === "folder" && node.id === ref.id,
    );

  if (dragged.type === "folder") {
    const folder = findFolder(tree, dragged.id);
    const targetFolder =
      target.type === "page" ? getPageFolder(tree, target.id) : null;
    const anchor: PageNavRef = targetFolder
      ? { type: "folder", id: targetFolder.id }
      : target;
    if (anchor.type === "folder" && anchor.id === folder.id) {
      return tree;
    }
    const rest = tree.filter((node) => node !== folder);
    return insertAt(rest, topLevelIndex(rest, anchor) + offset, folder);
  }

  const rest = removePage(tree, dragged.id);
  const targetFolder =
    target.type === "page" ? getPageFolder(rest, target.id) : null;

  let next: PageTree;
  if (targetFolder) {
    const index = targetFolder.pageIds.indexOf(target.id) + offset;
    next = rest.map((node) =>
      node === targetFolder
        ? {
            ...targetFolder,
            pageIds: insertAt(targetFolder.pageIds, index, dragged.id),
          }
        : node,
    );
  } else {
    next = insertAt<PageNavNode>(rest, topLevelIndex(rest, target) + offset, {
      type: "page",
      pageId: dragged.id,
    });
  }
  return pruneEmptyFolders(next);
};

/**
 * Groups the pages into a new, expanded folder at the end of the top level.
 * Pages keep their relative order and leave any folder they were in.
 */
export const createPageFolder = (
  tree: PageTree,
  pageIds: readonly string[],
  folderId: string,
  name: string,
): PageTree => {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Page folders need a name");
  }
  if (!pageIds.length) {
    throw new Error("No pages selected for the folder");
  }
  pageIds.forEach((id) => assertPageInTree(tree, id));

  const selected = new Set(pageIds);
  const orderedIds = getPageOrder(tree).filter((id) => selected.has(id));
  const rest = pruneEmptyFolders(
    orderedIds.reduce((nodes, id) => removePage(nodes, id), tree),
  );
  return [
    ...rest,
    {
      type: "folder",
      id: folderId,
      name: trimmedName,
      collapsed: false,
      pageIds: orderedIds,
    },
  ];
};

/**
 * Deletes the folder but keeps its pages: they take the folder's place at the
 * top level, in the same order.
 */
export const deletePageFolder = (
  tree: PageTree,
  folderId: string,
): PageTree => {
  const folder = findFolder(tree, folderId);
  return tree.flatMap((node): PageNavNode[] =>
    node === folder
      ? folder.pageIds.map((pageId) => ({ type: "page", pageId }))
      : [node],
  );
};

/**
 * Takes the page out of its folder and puts it at the top level, right after
 * that folder. A folder left empty is removed.
 */
export const removePageFromFolder = (
  tree: PageTree,
  pageId: string,
): PageTree => {
  const folder = getPageFolder(tree, pageId);
  if (!folder) {
    throw new Error(`Page ${pageId} is not in a folder`);
  }
  return pruneEmptyFolders(
    tree.flatMap((node): PageNavNode[] =>
      node === folder
        ? [
            {
              ...folder,
              pageIds: folder.pageIds.filter((id) => id !== pageId),
            },
            { type: "page", pageId },
          ]
        : [node],
    ),
  );
};

export const togglePageFolder = (
  tree: PageTree,
  folderId: string,
): PageTree => {
  const folder = findFolder(tree, folderId);
  return tree.map((node) =>
    node === folder ? { ...folder, collapsed: !folder.collapsed } : node,
  );
};
