import { APP_NAME } from "@excalidraw/common";

const DEFAULT_TITLE = "Excalidraw Whiteboard";

// characters not allowed in file names on common filesystems (Windows in
// particular), plus characters that are awkward to carry around in a URL
const INVALID_FILENAME_CHARS = /[<>:"/\\|?#%*]/g;

/** query param used to reflect the current file's name in the URL */
const TITLE_URL_PARAM = "title";

/**
 * Restricts a (user-supplied) file name down to characters that are safe to
 * use both as an actual file name and as a URL query param, so it can be
 * reflected in the address bar without needing to be percent-encoded into
 * illegibility.
 */
export const sanitizeFilenameForURL = (name: string): string => {
  return name.replace(INVALID_FILENAME_CHARS, "").trim().slice(0, 100);
};

/**
 * Reflects the currently open file's name (if any) in the document title and
 * in the URL, so the user can tell at a glance which file they're working on.
 * Intentionally only called once a file has actually been saved to disk or
 * opened from disk (i.e. `name` is non-null) — a scene that was never saved
 * keeps the generic app title and a clean URL.
 */
export const updateDocumentTitleAndURL = (name: string | null) => {
  const sanitizedName = name ? sanitizeFilenameForURL(name) : "";

  document.title = sanitizedName
    ? `${sanitizedName} - ${APP_NAME}`
    : DEFAULT_TITLE;

  const url = new URL(window.location.href);
  if (sanitizedName) {
    url.searchParams.set(TITLE_URL_PARAM, sanitizedName);
  } else {
    url.searchParams.delete(TITLE_URL_PARAM);
  }

  if (url.toString() !== window.location.href) {
    window.history.replaceState({}, document.title, url);
  }
};
