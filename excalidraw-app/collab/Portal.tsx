import { trackEvent } from "@excalidraw/excalidraw/analytics";
import { encryptData } from "@excalidraw/excalidraw/data/encryption";
import { newElementWith } from "@excalidraw/element";
import throttle from "lodash.throttle";

import type { UserIdleState } from "@excalidraw/common";
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  OnUserFollowedPayload,
  SocketId,
} from "@excalidraw/excalidraw/types";

import { WS_EVENTS, FILE_UPLOAD_TIMEOUT, WS_SUBTYPES } from "../app_constants";
import { isSyncableElement } from "../data";

import type {
  SocketUpdateData,
  SocketUpdateDataSource,
  SyncableExcalidrawElement,
} from "../data";
import type { TCollabClass } from "./Collab";
import type { SharedPageData } from "./pageSync";
import type { Socket } from "socket.io-client";

class Portal {
  collab: TCollabClass;
  socket: Socket | null = null;
  socketInitialized: boolean = false; // we don't want the socket to emit any updates until it is fully initialized
  roomId: string | null = null;
  roomKey: string | null = null;
  broadcastedElementVersions: Map<string, number> = new Map();
  /** the open page we last told the room about (#167), see USER_IDENTITY */
  lastAnnouncedPageId: string | null = null;

  constructor(collab: TCollabClass) {
    this.collab = collab;
  }

  open(socket: Socket, id: string, key: string) {
    this.socket = socket;
    this.roomId = id;
    this.roomKey = key;

    // Initialize socket listeners
    this.socket.on("init-room", () => {
      if (this.socket) {
        this.socket.emit("join-room", this.roomId);
        trackEvent("share", "room joined");
        // sent again when the socket reconnects: catch up with the room
        if (this.socketInitialized) {
          this.collab.onReconnect();
        }
      }
    });
    this.socket.on("new-user", async (_socketId: string) => {
      // the pages first, so the elements that follow can go to their pages
      this.collab.broadcastPageData();
      this.broadcastScene(
        WS_SUBTYPES.INIT,
        // every page (#167)
        this.collab.getAllPageElementsIncludingDeleted(),
        /* syncAll */ true,
      );
      // introduce ourselves so the newcomer knows our name/id right away
      // (otherwise it only learns them once we move the pointer)
      this.broadcastUserIdentity();
    });
    this.socket.on("room-user-change", (clients: SocketId[]) => {
      this.collab.setCollaborators(clients);
    });

    return socket;
  }

  close() {
    if (!this.socket) {
      return;
    }
    this.queueFileUpload.flush();
    this.socket.close();
    this.socket = null;
    this.roomId = null;
    this.roomKey = null;
    this.socketInitialized = false;
    this.broadcastedElementVersions = new Map();
    this.lastAnnouncedPageId = null;
  }

  isOpen() {
    return !!(
      this.socketInitialized &&
      this.socket &&
      this.roomId &&
      this.roomKey
    );
  }

  async _broadcastSocketData(
    data: SocketUpdateData,
    volatile: boolean = false,
    roomId?: string,
  ) {
    if (this.isOpen()) {
      const json = JSON.stringify(data);
      const encoded = new TextEncoder().encode(json);
      const { encryptedBuffer, iv } = await encryptData(this.roomKey!, encoded);

      this.socket?.emit(
        volatile ? WS_EVENTS.SERVER_VOLATILE : WS_EVENTS.SERVER,
        roomId ?? this.roomId,
        encryptedBuffer,
        iv,
      );
    }
  }

  queueFileUpload = throttle(async () => {
    try {
      await this.collab.fileManager.saveFiles({
        // every page's images (#167)
        elements: this.collab.getAllPageElementsIncludingDeleted(),
        files: this.collab.excalidrawAPI.getFiles(),
      });
    } catch (error: any) {
      if (error.name !== "AbortError") {
        this.collab.excalidrawAPI.updateScene({
          appState: {
            errorMessage: error.message,
          },
        });
      }
    }

    // every page's images (#167): an image on a page that isn't open must
    // be marked saved too, or collaborators never load it
    const changedPages = new Map<string, readonly ExcalidrawElement[]>();
    for (const page of this.collab.excalidrawAPI.getPages()) {
      let isChanged = false;
      const newElements = page.elements.map((element) => {
        if (this.collab.fileManager.shouldUpdateImageElementStatus(element)) {
          isChanged = true;
          // this will signal collaborators to pull image data from server
          // (using mutation instead of newElementWith otherwise it'd break
          // in-progress dragging)
          return newElementWith(element, { status: "saved" });
        }
        return element;
      });
      if (isChanged) {
        changedPages.set(page.id, newElements);
      }
    }

    if (changedPages.size) {
      // (the open page through the scene, without history, as before)
      this.collab.excalidrawAPI.setPageElements(changedPages);
    }
  }, FILE_UPLOAD_TIMEOUT);

  broadcastScene = async (
    updateType: WS_SUBTYPES.INIT | WS_SUBTYPES.UPDATE,
    elements: readonly OrderedExcalidrawElement[],
    syncAll: boolean,
  ) => {
    if (updateType === WS_SUBTYPES.INIT && !syncAll) {
      throw new Error("syncAll must be true when sending SCENE.INIT");
    }

    // sync out only the elements we think we need to to save bandwidth.
    // periodically we'll resync the whole thing to make sure no one diverges
    // due to a dropped message (server goes down etc).
    const syncableElements = elements.reduce((acc, element) => {
      if (
        (syncAll ||
          !this.broadcastedElementVersions.has(element.id) ||
          element.version > this.broadcastedElementVersions.get(element.id)!) &&
        isSyncableElement(element)
      ) {
        acc.push(element);
      }
      return acc;
    }, [] as SyncableExcalidrawElement[]);

    // nothing new to send (e.g. only a deleted page's elements went away, #167)
    if (!syncAll && !syncableElements.length) {
      return;
    }

    const data: SocketUpdateDataSource[typeof updateType] = {
      type: updateType,
      payload: {
        elements: syncableElements,
        ...(updateType === WS_SUBTYPES.UPDATE ? { sentAt: Date.now() } : {}),
      },
    };

    for (const syncableElement of syncableElements) {
      this.broadcastedElementVersions.set(
        syncableElement.id,
        syncableElement.version,
      );
    }

    this.queueFileUpload();

    await this._broadcastSocketData(data as SocketUpdateData);
  };

  /**
   * The room's page data (#167). Non-volatile: a dropped page change would
   * leave clients with different pages until the next full resync.
   */
  broadcastPageData = (pageData: SharedPageData) => {
    const data: SocketUpdateDataSource["PAGE_DATA"] = {
      type: WS_SUBTYPES.PAGE_DATA,
      payload: pageData,
    };
    return this._broadcastSocketData(data as SocketUpdateData);
  };

  broadcastIdleChange = (userState: UserIdleState) => {
    if (this.socket?.id) {
      const data: SocketUpdateDataSource["IDLE_STATUS"] = {
        type: WS_SUBTYPES.IDLE_STATUS,
        payload: {
          socketId: this.socket.id as SocketId,
          userState,
          username: this.collab.state.username,
          clientId: this.collab.getClientId() ?? undefined,
          pageId: this.collab.excalidrawAPI.getActivePageId(),
        },
      };
      return this._broadcastSocketData(
        data as SocketUpdateData,
        true, // volatile
      );
    }
  };

  /**
   * Non-volatile, so it isn't dropped: collaborator visibility depends on
   * knowing every client's id.
   *
   * @param username pass when the name just changed (collab state may not
   * have updated yet)
   */
  broadcastUserIdentity = (username = this.collab.state.username) => {
    const clientId = this.collab.getClientId();
    if (this.socket?.id && this.socketInitialized && clientId) {
      const pageId = this.collab.excalidrawAPI.getActivePageId();
      this.lastAnnouncedPageId = pageId;
      const data: SocketUpdateDataSource["USER_IDENTITY"] = {
        type: WS_SUBTYPES.USER_IDENTITY,
        payload: {
          socketId: this.socket.id as SocketId,
          clientId,
          pageId,
          username,
        },
      };
      return this._broadcastSocketData(data as SocketUpdateData);
    }
  };

  broadcastMouseLocation = (payload: {
    pointer: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["pointer"];
    button: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["button"];
  }) => {
    if (this.socket?.id) {
      const data: SocketUpdateDataSource["MOUSE_LOCATION"] = {
        type: WS_SUBTYPES.MOUSE_LOCATION,
        payload: {
          socketId: this.socket.id as SocketId,
          pointer: payload.pointer,
          button: payload.button || "up",
          selectedElementIds:
            this.collab.excalidrawAPI.getAppState().selectedElementIds,
          username: this.collab.state.username,
          clientId: this.collab.getClientId() ?? undefined,
          pageId: this.collab.excalidrawAPI.getActivePageId(),
        },
      };

      return this._broadcastSocketData(
        data as SocketUpdateData,
        true, // volatile
      );
    }
  };

  broadcastVisibleSceneBounds = (
    payload: {
      sceneBounds: SocketUpdateDataSource["USER_VISIBLE_SCENE_BOUNDS"]["payload"]["sceneBounds"];
    },
    roomId: string,
  ) => {
    if (this.socket?.id) {
      const data: SocketUpdateDataSource["USER_VISIBLE_SCENE_BOUNDS"] = {
        type: WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS,
        payload: {
          socketId: this.socket.id as SocketId,
          username: this.collab.state.username,
          sceneBounds: payload.sceneBounds,
        },
      };

      return this._broadcastSocketData(
        data as SocketUpdateData,
        true, // volatile
        roomId,
      );
    }
  };

  broadcastUserFollowed = (payload: OnUserFollowedPayload) => {
    if (this.socket?.id) {
      this.socket.emit(WS_EVENTS.USER_FOLLOW_CHANGE, payload);
    }
  };
}

export default Portal;
