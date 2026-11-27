import { reconcileElements } from "@excalidraw/excalidraw";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import {
  PAGE_DESCRIPTION_MAX_LENGTH,
  PAGE_NAME_MAX_LENGTH,
  getNextDefaultPageName,
  hasDefaultPageName,
  groupElementsByPageTag,
  normalizePageName,
} from "@excalidraw/excalidraw/pages";
import {
  generateFractionalIndexBetween,
  getElementPageId,
  hashElementsVersion,
  isValidFractionalIndex,
} from "@excalidraw/element";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { SharedPageInfo } from "@excalidraw/excalidraw/pages";
import type {
  ExcalidrawElement,
  FractionalIndex,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

/**
 * Multi-page live collaboration (#167): pure helpers for keeping every
 * page of a room in sync.
 */

/**
 * `restoreElements` for a room's elements (every page's), page by page:
 * restoring also repairs order keys, which repeat across pages, so restoring
 * them together would reorder them.
 *
 * @param existingElements context for each page (e.g. repairing bindings):
 * our elements with the same page tag
 */
export const restoreElementsByPage = <T extends ExcalidrawElement>(
  elements: readonly T[],
  existingElements: readonly ExcalidrawElement[] | null,
  opts?: Parameters<typeof restoreElements>[2],
) => {
  const existingByPage = groupElementsByPageTag(existingElements ?? []);
  return [...groupElementsByPageTag(elements)].flatMap(
    ([pageId, pageElements]) =>
      restoreElements(
        pageElements,
        existingElements ? existingByPage.get(pageId) ?? [] : null,
        opts,
      ),
  );
};

/**
 * Reconciles two copies of a room's elements (every page's), page by page.
 * Each page orders its elements on its own (fractional indices repeat across
 * pages), so reconciling them together would reorder them. An element's
 * copies always have the same page tag, since tags never change.
 */
export const reconcileElementsByPage = (
  localElements: readonly OrderedExcalidrawElement[],
  remoteElements: readonly RemoteExcalidrawElement[],
  appState: AppState,
): OrderedExcalidrawElement[] => {
  const localByPage = groupElementsByPageTag(localElements);
  const remoteByPage = groupElementsByPageTag(remoteElements);
  const pageIds = new Set([...localByPage.keys(), ...remoteByPage.keys()]);
  return [...pageIds].flatMap((pageId) =>
    reconcileElements(
      localByPage.get(pageId) ?? [],
      remoteByPage.get(pageId) ?? [],
      appState,
    ),
  );
};

// -----------------------------------------------------------------------------
// page data: what the room shares about each page
// -----------------------------------------------------------------------------

/**
 * A shared page value with the time it last changed, by the clock of the
 * client that changed it. Each field has its own time, so changes to
 * different fields of a page never overwrite each other.
 */
export type PageField = Readonly<{ value: string; updated: number }>;

/**
 * The page fields everyone in a room shares. Everything else about a page
 * (scroll, zoom, grid, `showThumbnail`) is personal and never sent.
 * `position` is a fractional order key: pages are ordered by it, ties broken
 * by page id.
 */
export const SHARED_PAGE_FIELDS = [
  "name",
  "description",
  "viewBackgroundColor",
  "position",
] as const;
export type SharedPageField = typeof SHARED_PAGE_FIELDS[number];

export type SharedPage = Readonly<
  { id: string } & Record<SharedPageField, PageField>
>;

/** the PAGE_DATA message payload, also kept in the room's stored document */
export type SharedPageData = Readonly<{
  /** live pages, in page order */
  pages: readonly SharedPage[];
  /**
   * deleted page ids → when they were deleted. Kept so deletion wins: a
   * page deleted here never comes back, whatever arrives later.
   */
  deletedPageIds: Readonly<Record<string, number>>;
}>;

export const EMPTY_PAGE_DATA: SharedPageData = {
  pages: [],
  deletedPageIds: {},
};

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** page order: by position, ties broken by page id */
const comparePages = (a: SharedPage, b: SharedPage) =>
  compareStrings(a.position.value, b.position.value) ||
  compareStrings(a.id, b.id);

export const isPageDeleted = (
  data: Pick<SharedPageData, "deletedPageIds">,
  pageId: string,
) => Object.prototype.hasOwnProperty.call(data.deletedPageIds, pageId);

/**
 * The later change wins. Two changes to the same field of the same page at
 * the same time can't be told apart by page id, so the larger value wins:
 * every client picks the same one, whatever order they arrive in.
 */
const pickNewerField = (a: PageField, b: PageField): PageField =>
  a.updated !== b.updated
    ? a.updated > b.updated
      ? a
      : b
    : a.value >= b.value
    ? a
    : b;

const mergePage = (a: SharedPage, b: SharedPage): SharedPage => ({
  id: a.id,
  name: pickNewerField(a.name, b.name),
  description: pickNewerField(a.description, b.description),
  viewBackgroundColor: pickNewerField(
    a.viewBackgroundColor,
    b.viewBackgroundColor,
  ),
  position: pickNewerField(a.position, b.position),
});

/**
 * Pages whose names collide (case-insensitive, trimmed) after changes crossed
 * in transit: the page whose name changed later is renamed to the next free
 * default name ("Page N"), ties broken by page id (the larger id is
 * renamed). The new name's time is one after the renamed change, so every
 * client computes the same field.
 */
export const resolvePageNameCollisions = (
  data: SharedPageData,
  baseName: string,
): SharedPageData => {
  const byNameTime = [...data.pages].sort(
    (a, b) => a.name.updated - b.name.updated || compareStrings(a.id, b.id),
  );
  const names = new Map(data.pages.map((page) => [page.id, page.name]));
  const taken = new Set<string>();
  const renamed = new Map<string, PageField>();
  for (const page of byNameTime) {
    const name = normalizePageName(page.name.value);
    if (!taken.has(name)) {
      taken.add(name);
      continue;
    }
    const value = getNextDefaultPageName(
      [...names.values()].map((field) => ({ name: field.value })),
      baseName,
    );
    const field = { value, updated: page.name.updated + 1 };
    names.set(page.id, field);
    renamed.set(page.id, field);
    taken.add(normalizePageName(value));
  }
  if (!renamed.size) {
    return data;
  }
  return {
    ...data,
    pages: data.pages.map((page) =>
      renamed.has(page.id) ? { ...page, name: renamed.get(page.id)! } : page,
    ),
  };
};

/**
 * When concurrent deletions leave no page at all, every client adds the same
 * blank page (same id, name and position), so they still agree.
 */
const getBlankPageAfterDeletions = (
  deletedPageIds: SharedPageData["deletedPageIds"],
  baseName: string,
): SharedPage => {
  const [id, updated] = Object.entries(deletedPageIds).sort(
    ([idA, a], [idB, b]) => b - a || compareStrings(idA, idB),
  )[0];
  const field = (value: string): PageField => ({ value, updated });
  return {
    id: `${id}-blank`,
    name: field(getNextDefaultPageName([], baseName)),
    description: field(""),
    viewBackgroundColor: field(getDefaultAppState().viewBackgroundColor),
    position: field(generateFractionalIndexBetween(null, null)),
  };
};

/**
 * Merges two copies of a room's page data (#167). The result is the same
 * whatever order changes arrive in:
 * - each field of each page: the later change wins (`pickNewerField`)
 * - deletion wins: a deleted page never comes back, even if edited later
 * - colliding names are resolved (`resolvePageNameCollisions`)
 *
 * @param baseName the default page name, e.g. "Page"
 */
export const mergePageData = (
  local: SharedPageData,
  remote: SharedPageData,
  baseName: string,
): SharedPageData => {
  const deletedPageIds: Record<string, number> = { ...local.deletedPageIds };
  for (const [id, deletedAt] of Object.entries(remote.deletedPageIds)) {
    deletedPageIds[id] = Math.max(deletedPageIds[id] ?? deletedAt, deletedAt);
  }

  const byId = new Map(local.pages.map((page) => [page.id, page]));
  for (const page of remote.pages) {
    const ours = byId.get(page.id);
    byId.set(page.id, ours ? mergePage(ours, page) : page);
  }
  let pages = [...byId.values()].filter(
    (page) => !isPageDeleted({ deletedPageIds }, page.id),
  );
  if (!pages.length && Object.keys(deletedPageIds).length) {
    pages = [getBlankPageAfterDeletions(deletedPageIds, baseName)];
  }

  return resolvePageNameCollisions(
    { pages: pages.sort(comparePages), deletedPageIds },
    baseName,
  );
};

/**
 * Indices (into `values`) of a longest strictly increasing subsequence. The
 * pages at these indices kept their relative order, so only the others moved.
 */
const getLongestIncreasingRun = (values: readonly number[]): Set<number> => {
  const lengths = values.map(() => 1);
  const previous = values.map(() => -1);
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < i; j++) {
      if (values[j] < values[i] && lengths[j] + 1 > lengths[i]) {
        lengths[i] = lengths[j] + 1;
        previous[i] = j;
      }
    }
  }
  const kept = new Set<number>();
  let i = values.length ? lengths.indexOf(Math.max(...lengths)) : -1;
  while (i !== -1) {
    kept.add(i);
    i = previous[i];
  }
  return kept;
};

/**
 * Order keys for `pages` in their local order: pages that kept their
 * relative order keep their keys (null), the others (moved or new) get new
 * keys between their neighbours.
 */
const getPositions = (
  shared: SharedPageData,
  pages: readonly SharedPageInfo[],
): (string | null)[] => {
  const sharedIndex = new Map(shared.pages.map((page, i) => [page.id, i]));
  const known = pages
    .map((page, i) => ({ i, sharedIndex: sharedIndex.get(page.id) }))
    .filter(
      (entry): entry is { i: number; sharedIndex: number } =>
        entry.sharedIndex !== undefined,
    );
  const keptRun = getLongestIncreasingRun(
    known.map((entry) => entry.sharedIndex),
  );
  const keepsKey = new Set(
    known.filter((_, k) => keptRun.has(k)).map((entry) => entry.i),
  );
  const keyOf = (i: number) =>
    shared.pages[sharedIndex.get(pages[i].id)!].position.value;

  // new pages before every kept page go before every known page, e.g. the
  // blank page left by deleting every page becomes the first page
  const firstKnownKey = shared.pages[0]?.position.value ?? null;
  const positions: (string | null)[] = [];
  let lower: string | null = null;
  for (let i = 0; i < pages.length; i++) {
    if (keepsKey.has(i)) {
      positions.push(null);
      lower = keyOf(i);
      continue;
    }
    let next = i + 1;
    while (next < pages.length && !keepsKey.has(next)) {
      next++;
    }
    const upper =
      next < pages.length ? keyOf(next) : lower === null ? firstKnownKey : null;
    const key: string = generateFractionalIndexBetween(
      lower as FractionalIndex | null,
      upper as FractionalIndex | null,
    );
    positions.push(key);
    lower = key;
  }
  return positions;
};

/** fresh keys for every page, in order (fallback when keys can't fit) */
const getFreshPositions = (pages: readonly SharedPageInfo[]) => {
  let lower: string | null = null;
  return pages.map(() => {
    lower = generateFractionalIndexBetween(
      lower as FractionalIndex | null,
      null,
    );
    return lower;
  });
};

/**
 * Turns the editor's pages into page data, given the last shared copy (#167):
 * pages that are new, changed, moved or gone are recorded as changed `now`.
 * Returns null when nothing shared changed (personal settings never count).
 *
 * A default name renumbered after a delete ("Page 3" → "Page 2") isn't a
 * user's rename: it counts as made just after the name it replaces, so a
 * collaborator's real rename of that page, made meanwhile, wins.
 *
 * @param pages the editor's pages, in order
 * @param baseName the default page name, e.g. "Page"
 */
export const getLocalPageChanges = (
  shared: SharedPageData,
  pages: readonly SharedPageInfo[],
  now: number,
  baseName = "Page",
): SharedPageData | null => {
  const sharedById = new Map(shared.pages.map((page) => [page.id, page]));
  const localIds = new Set(pages.map((page) => page.id));
  let changed = false;

  const deletedPageIds: Record<string, number> = { ...shared.deletedPageIds };
  for (const page of shared.pages) {
    if (!localIds.has(page.id)) {
      deletedPageIds[page.id] = now;
      changed = true;
    }
  }

  let positions: (string | null)[];
  try {
    positions = getPositions(shared, pages);
  } catch {
    // e.g. two pages with the same key around a moved page: renumber all
    positions = getFreshPositions(pages);
  }

  const toField = (
    previous: PageField | undefined,
    value: string,
  ): PageField => {
    if (previous && previous.value === value) {
      return previous;
    }
    changed = true;
    return { value, updated: now };
  };

  const renumbered = (previous: PageField, value: string): PageField => {
    changed = true;
    return { value, updated: previous.updated + 1 };
  };

  const sharedPages = pages.map((page, i): SharedPage => {
    const previous = sharedById.get(page.id);
    const position = positions[i];
    return {
      id: page.id,
      name:
        previous &&
        previous.name.value !== page.name &&
        hasDefaultPageName({ name: previous.name.value }, baseName) &&
        hasDefaultPageName(page, baseName)
          ? renumbered(previous.name, page.name)
          : toField(previous?.name, page.name),
      description: toField(previous?.description, page.description),
      viewBackgroundColor: toField(
        previous?.viewBackgroundColor,
        page.viewBackgroundColor,
      ),
      position:
        position === null
          ? previous!.position
          : toField(previous?.position, position),
    };
  });

  return changed
    ? { pages: sharedPages.sort(comparePages), deletedPageIds }
    : null;
};

/**
 * A fingerprint of a room's elements (every page's, in page order), to tell
 * whether anything changed since the last broadcast. A sum of versions
 * (`getSceneVersion`) can come out the same when a deleted page's elements
 * go away and new ones are drawn; this hash of `versionNonce`s changes with
 * any edit, addition or removal.
 */
export const getRoomVersion = (elements: readonly ExcalidrawElement[]) =>
  hashElementsVersion(elements);

/** drops elements tagged for a deleted page (delete wins, #167) */
export const excludeElementsOnDeletedPages = <T extends ExcalidrawElement>(
  elements: readonly T[],
  pageData: SharedPageData,
): T[] =>
  elements.filter((element) => {
    const pageId = getElementPageId(element);
    return !pageId || !isPageDeleted(pageData, pageId);
  });

/** the pages as the editor shows them, in order */
export const getSharedPageInfos = (data: SharedPageData): SharedPageInfo[] =>
  data.pages.map((page) => ({
    id: page.id,
    name: page.name.value,
    description: page.description.value,
    viewBackgroundColor: page.viewBackgroundColor.value,
  }));

/**
 * A canonical text form of page data (pages in order, deleted pages sorted),
 * so equal data always gives the same text whatever order it was built in.
 */
export const serializePageData = (data: SharedPageData) =>
  JSON.stringify({
    pages: [...data.pages].sort(comparePages),
    deletedPageIds: Object.entries(data.deletedPageIds).sort(([a], [b]) =>
      compareStrings(a, b),
    ),
  });

export const isSamePageData = (a: SharedPageData, b: SharedPageData) =>
  serializePageData(a) === serializePageData(b);

// -----------------------------------------------------------------------------
// validation of page data from peers and room storage
// -----------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPageField = (value: unknown): value is PageField =>
  isRecord(value) &&
  typeof value.value === "string" &&
  typeof value.updated === "number" &&
  Number.isFinite(value.updated);

const parseSharedPage = (value: unknown): SharedPage | null => {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    !SHARED_PAGE_FIELDS.every((field) => isPageField(value[field]))
  ) {
    return null;
  }
  const page = value as SharedPage;
  const name = page.name.value.trim();
  if (
    !name ||
    name.length > PAGE_NAME_MAX_LENGTH ||
    page.description.value.length > PAGE_DESCRIPTION_MAX_LENGTH ||
    !isValidFractionalIndex(page.position.value, undefined, undefined)
  ) {
    return null;
  }
  // only the known fields: nothing else from a peer reaches the editor
  const pick = (field: PageField): PageField => ({
    value: field.value,
    updated: field.updated,
  });
  return {
    id: page.id,
    name: pick(page.name),
    description: pick(page.description),
    viewBackgroundColor: pick(page.viewBackgroundColor),
    position: pick(page.position),
  };
};

/**
 * Validates page data from a peer or the room's storage (#167). Returns null
 * (ignore all of it, keep the pages as they are) for a page with missing or
 * invalid fields, two pages with the same id, no live page, or an invalid
 * deleted-page entry.
 */
export const parsePageData = (value: unknown): SharedPageData | null => {
  if (
    !isRecord(value) ||
    !Array.isArray(value.pages) ||
    !value.pages.length ||
    !isRecord(value.deletedPageIds)
  ) {
    return null;
  }
  const pages: SharedPage[] = [];
  const ids = new Set<string>();
  for (const candidate of value.pages) {
    const page = parseSharedPage(candidate);
    if (!page || ids.has(page.id)) {
      return null;
    }
    ids.add(page.id);
    pages.push(page);
  }
  const deletedPageIds: Record<string, number> = {};
  for (const [id, deletedAt] of Object.entries(value.deletedPageIds)) {
    if (!id || typeof deletedAt !== "number" || !Number.isFinite(deletedAt)) {
      return null;
    }
    deletedPageIds[id] = deletedAt;
  }
  return { pages: pages.sort(comparePages), deletedPageIds };
};
