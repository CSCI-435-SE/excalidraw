import { CREATOR_ID_KEY, newElementWith } from "@excalidraw/element";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import {
  getElementsToStamp,
  getStampedCustomData,
} from "../collab/creatorStamp";

const ME = "me";

const createRect = (id: string, creatorId?: string) =>
  newElementWith(API.createElement({ type: "rectangle", id }), {
    customData: creatorId ? { [CREATOR_ID_KEY]: creatorId } : undefined,
  }) as ExcalidrawElement;

const getIdsToStamp = (
  elements: ExcalidrawElement[],
  remoteIds: string[] = [],
) => getElementsToStamp(elements, new Set(remoteIds), ME).map((el) => el.id);

describe("getElementsToStamp", () => {
  it("stamps elements this client introduced", () => {
    expect(getIdsToStamp([createRect("new")])).toEqual(["new"]);
  });

  it("never stamps elements received from the room (edits don't transfer ownership)", () => {
    expect(getIdsToStamp([createRect("theirs", "alice")], ["theirs"])).toEqual(
      [],
    );
    // untagged legacy elements stay untagged (→ Miscellaneous)
    expect(getIdsToStamp([createRect("legacy")], ["legacy"])).toEqual([]);
  });

  it("restamps pasted/duplicated copies of someone else's element", () => {
    // new id (not remote) carrying the original's copied stamp
    expect(getIdsToStamp([createRect("pasted", "alice")])).toEqual(["pasted"]);
  });

  it("skips elements already stamped by this client", () => {
    expect(getIdsToStamp([createRect("mine", ME)])).toEqual([]);
  });

  it("skips deleted elements", () => {
    const deleted = newElementWith(createRect("deleted"), { isDeleted: true });
    expect(getIdsToStamp([deleted])).toEqual([]);
  });
});

describe("getStampedCustomData", () => {
  it("sets the creator while keeping other customData", () => {
    const element = newElementWith(API.createElement({ type: "rectangle" }), {
      customData: { [CREATOR_ID_KEY]: "alice", other: 1 },
    });

    expect(getStampedCustomData(element, ME)).toEqual({
      [CREATOR_ID_KEY]: ME,
      other: 1,
    });
  });
});
