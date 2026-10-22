import { arrayToMap } from "@excalidraw/common";

import { newElement, newTextElement } from "../newElement";
import {
  CREATOR_ID_KEY,
  UNKNOWN_CREATOR_ID,
  getElementCreatorId,
  getElementVisibilityBucket,
} from "../ownership";

const createRect = (creatorId?: unknown) =>
  newElement({
    type: "rectangle",
    x: 0,
    y: 0,
    customData:
      creatorId === undefined ? undefined : { [CREATOR_ID_KEY]: creatorId },
  });

const createLabel = (containerId: string, creatorId: string) =>
  newTextElement({
    text: "label",
    x: 0,
    y: 0,
    containerId,
    customData: { [CREATOR_ID_KEY]: creatorId },
  });

describe("getElementCreatorId", () => {
  it("returns the stamped creator id", () => {
    const rect = createRect("alice");
    expect(getElementCreatorId(rect, arrayToMap([rect]))).toBe("alice");
  });

  it("returns UNKNOWN for elements without creator metadata", () => {
    const rect = createRect();
    expect(getElementCreatorId(rect, arrayToMap([rect]))).toBe(
      UNKNOWN_CREATOR_ID,
    );
  });

  it("returns UNKNOWN for malformed creator ids", () => {
    const empty = createRect("");
    const numeric = createRect(42);
    const map = arrayToMap([empty, numeric]);

    expect(getElementCreatorId(empty, map)).toBe(UNKNOWN_CREATOR_ID);
    expect(getElementCreatorId(numeric, map)).toBe(UNKNOWN_CREATOR_ID);
  });

  it("bound text follows its container's creator", () => {
    const container = createRect("alice");
    const text = createLabel(container.id, "bob");

    expect(getElementCreatorId(text, arrayToMap([container, text]))).toBe(
      "alice",
    );
  });

  it("bound text falls back to its own stamp if container is missing", () => {
    const text = createLabel("missing", "bob");

    expect(getElementCreatorId(text, arrayToMap([text]))).toBe("bob");
  });
});

describe("getElementVisibilityBucket", () => {
  const directory = new Map([["alice", {}]]);

  it("is the creator when there's no directory (outside of a room)", () => {
    const rect = createRect("bob");
    expect(getElementVisibilityBucket(rect, arrayToMap([rect]), null)).toBe(
      "bob",
    );
  });

  it("is the creator when the creator is in the directory", () => {
    const rect = createRect("alice");
    expect(
      getElementVisibilityBucket(rect, arrayToMap([rect]), directory),
    ).toBe("alice");
  });

  it("is UNKNOWN (miscellaneous) for creators this client never saw", () => {
    const rect = createRect("never-seen");
    expect(
      getElementVisibilityBucket(rect, arrayToMap([rect]), directory),
    ).toBe(UNKNOWN_CREATOR_ID);
  });

  it("is UNKNOWN for untagged elements", () => {
    const rect = createRect();
    expect(
      getElementVisibilityBucket(rect, arrayToMap([rect]), directory),
    ).toBe(UNKNOWN_CREATOR_ID);
  });
});
