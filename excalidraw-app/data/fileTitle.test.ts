import { sanitizeFilenameForURL, updateDocumentTitleAndURL } from "./fileTitle";

describe("sanitizeFilenameForURL", () => {
  it("strips characters that are unsafe in file names / URLs", () => {
    expect(sanitizeFilenameForURL('my<>:"/\\|?#%*file')).toBe("myfile");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeFilenameForURL("  My Diagram  ")).toBe("My Diagram");
  });

  it("caps the length to keep the URL reasonable", () => {
    const longName = "a".repeat(200);
    expect(sanitizeFilenameForURL(longName).length).toBe(100);
  });
});

describe("updateDocumentTitleAndURL", () => {
  const originalTitle = document.title;

  afterEach(() => {
    document.title = originalTitle;
    window.history.replaceState({}, "", "/");
  });

  it("reflects the file name in the document title and the URL", () => {
    updateDocumentTitleAndURL("My Diagram");

    expect(document.title).toBe("My Diagram - Excalidraw");
    expect(new URL(window.location.href).searchParams.get("title")).toBe(
      "My Diagram",
    );
  });

  it("resets to the default title and clears the URL param when name is null", () => {
    updateDocumentTitleAndURL("My Diagram");
    updateDocumentTitleAndURL(null);

    expect(document.title).toBe("Excalidraw Whiteboard");
    expect(new URL(window.location.href).searchParams.has("title")).toBe(false);
  });

  it("preserves other parts of the URL (e.g. hash) when updating", () => {
    window.history.replaceState({}, "", "/?id=abc#room=1,2");

    updateDocumentTitleAndURL("My Diagram");

    const url = new URL(window.location.href);
    expect(url.searchParams.get("id")).toBe("abc");
    expect(url.hash).toBe("#room=1,2");
    expect(url.searchParams.get("title")).toBe("My Diagram");
  });
});
