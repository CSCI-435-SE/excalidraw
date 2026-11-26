import { zoomToFitBounds, reconcileElements } from "@excalidraw/excalidraw";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import {
  APP_NAME,
  arrayToMap,
  cloneJSON,
  EVENT,
  toBrandedType,
} from "@excalidraw/common";
import {
  IDLE_THRESHOLD,
  ACTIVE_THRESHOLD,
  UserIdleState,
  assertNever,
  isDevEnv,
  isTestEnv,
  preventUnload,
  resolvablePromise,
  throttleRAF,
} from "@excalidraw/common";
import { decryptData } from "@excalidraw/excalidraw/data/encryption";
import { getNewcomerState, getVisibleSceneBounds } from "@excalidraw/element";
import { getElementPageId, newElementWith } from "@excalidraw/element";
import { isImageElement, isInitializedImageElement } from "@excalidraw/element";
import { AbortError } from "@excalidraw/excalidraw/errors";
import { t } from "@excalidraw/excalidraw/i18n";
import { withBatchedUpdates } from "@excalidraw/excalidraw/reactUtils";

import throttle from "lodash.throttle";
import { PureComponent } from "react";

import { bumpElementVersions } from "@excalidraw/excalidraw/data/restore";
import { groupElementsByPageTag } from "@excalidraw/excalidraw/pages";

import type {
  ReconciledExcalidrawElement,
  RemoteExcalidrawElement,
} from "@excalidraw/excalidraw/data/reconcile";
import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";
import type {
  ExcalidrawElement,
  FileId,
  InitializedExcalidrawImageElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  ExcalidrawImperativeAPI,
  SocketId,
  Collaborator,
  Gesture,
} from "@excalidraw/excalidraw/types";
import type { Mutable, ValueOf } from "@excalidraw/common/utility-types";

import type { SharedPageInfo } from "@excalidraw/excalidraw/pages";

import { appJotaiStore, atom } from "../app-jotai";
import {
  CURSOR_SYNC_TIMEOUT,
  FILE_UPLOAD_MAX_BYTES,
  FIREBASE_STORAGE_PREFIXES,
  INITIAL_SCENE_UPDATE_TIMEOUT,
  LOAD_IMAGES_TIMEOUT,
  WS_SUBTYPES,
  SYNC_FULL_SCENE_INTERVAL_MS,
  WS_EVENTS,
} from "../app_constants";
import {
  generateCollaborationLinkData,
  getCollaborationLink,
  getSyncableElements,
} from "../data";
import {
  encodeFilesForUpload,
  FileManager,
  updateStaleImageStatuses,
} from "../data/FileManager";
import { FileStatusStore } from "../data/fileStatusStore";
import { LocalData } from "../data/LocalData";
import {
  isSavedToFirebase,
  loadFilesFromFirebase,
  loadFromFirebase,
  saveFilesToFirebase,
  saveToFirebase,
} from "../data/firebase";
import {
  importUsernameFromLocalStorage,
  saveUsernameToLocalStorage,
} from "../data/localStorage";
import { resetBrowserStateVersions } from "../data/tabSync";

import { getClientId } from "./clientIdentity";
import {
  loadCollaboratorDirectory,
  recordCollaboratorSighting,
  saveCollaboratorDirectory,
} from "./collaboratorDirectory";
import {
  isSameCollaboratorSettings,
  loadCollaboratorSettings,
  saveCollaboratorSettings,
} from "./collaboratorSettings";
import { collabErrorIndicatorAtom } from "./CollabError";
import { getElementsToStamp, getStampedCustomData } from "./creatorStamp";
import {
  getElementsToPageStamp,
  getLocalElementsToPageStamp,
  getPageStampedCustomData,
} from "./pageStamp";
import {
  EMPTY_PAGE_DATA,
  getLocalPageChanges,
  getRoomVersion,
  getSharedPageInfos,
  isPageDeleted,
  isSamePageData,
  mergePageData,
  parsePageData,
  restoreElementsByPage,
} from "./pageSync";
import {
  getExpiredResurrections,
  getLocalElementsWithExpiredDeletion,
} from "./expiredDeletions";
import Portal from "./Portal";

import type { CollaboratorDirectory } from "./collaboratorDirectory";
import type { CollaboratorSettings } from "./collaboratorSettings";
import type { SharedPageData } from "./pageSync";
import type {
  SocketUpdateDataSource,
  SyncableExcalidrawElement,
} from "../data";

/** a presence message's page (#167), when the sender included a valid one */
const getPresencePage = (pageId: unknown): Pick<Collaborator, "pageId"> =>
  typeof pageId === "string" && pageId ? { pageId } : {};

export const collabAPIAtom = atom<CollabAPI | null>(null);
export const isCollaboratingAtom = atom(false);
export const isOfflineAtom = atom(false);

interface CollabState {
  errorMessage: string | null;
  /** errors related to saving */
  dialogNotifiedErrors: Record<string, boolean>;
  username: string;
  activeRoomLink: string | null;
}

export const activeRoomLinkAtom = atom<string | null>(null);

type CollabInstance = InstanceType<typeof Collab>;

export interface CollabAPI {
  /** function so that we can access the latest value from stale callbacks */
  isCollaborating: () => boolean;
  onPointerUpdate: CollabInstance["onPointerUpdate"];
  startCollaboration: CollabInstance["startCollaboration"];
  stopCollaboration: CollabInstance["stopCollaboration"];
  syncElements: CollabInstance["syncElements"];
  saveCollaboratorSettings: CollabInstance["saveCollaboratorSettings"];
  fetchImageFilesFromFirebase: CollabInstance["fetchImageFilesFromFirebase"];
  setUsername: CollabInstance["setUsername"];
  getUsername: CollabInstance["getUsername"];
  getActiveRoomLink: CollabInstance["getActiveRoomLink"];
  setCollabError: CollabInstance["setErrorDialog"];
}

interface CollabProps {
  excalidrawAPI: ExcalidrawImperativeAPI;
}

class Collab extends PureComponent<CollabProps, CollabState> {
  portal: Portal;
  fileManager: FileManager;
  excalidrawAPI: CollabProps["excalidrawAPI"];
  activeIntervalId: number | null;
  idleTimeoutId: number | null;

  private socketInitializationTimer?: number;
  /**
   * fingerprint of every page's elements last broadcast or received
   * (`getRoomVersion`); -1 when something still has to go out
   */
  private lastBroadcastedOrReceivedSceneVersion: number = -1;
  private collaborators = new Map<SocketId, Collaborator>();
  /** this tab's collaborator id (see clientIdentity.ts) */
  private clientId: string | null = null;
  /**
   * ids of elements that first reached this client from the room (peers or
   * the stored scene). Everything else in the scene was introduced by this
   * client and gets its creator stamp (see creatorStamp.ts).
   */
  private remoteElementIds = new Set<string>();
  /** ids of elements seen in the room's stored scene (after our saves) */
  private storedElementIds = new Set<string>();
  /**
   * our copy of the room's page data (#167), what our pages were last made
   * to match. `null` until the room's pages are known (e.g. while joining),
   * so local pages aren't shared before the room's replace them.
   */
  private pageData: SharedPageData | null = null;
  /**
   * room elements tagged for a page we don't have yet (its page data may
   * arrive after them), by id. Routed once the page arrives; dropped if the
   * page is deleted.
   */
  private pendingElements = new Map<string, RemoteExcalidrawElement>();
  /** collaborators seen in the current room (see collaboratorDirectory.ts) */
  private collaboratorDirectory: CollaboratorDirectory = new Map();
  private directoryRoomId: string | null = null;
  /**
   * room whose saved dropdown settings (#83) are in the editor, `null` while
   * they aren't (then nothing is saved, so defaults never overwrite them)
   */
  private settingsRoomId: string | null = null;
  /** the settings last saved or restored, so they're saved only on change */
  private savedSettings: CollaboratorSettings | null = null;

  constructor(props: CollabProps) {
    super(props);
    this.state = {
      errorMessage: null,
      dialogNotifiedErrors: {},
      username: importUsernameFromLocalStorage() || "",
      activeRoomLink: null,
    };
    this.portal = new Portal(this);
    this.fileManager = new FileManager({
      onFileStatusChange: FileStatusStore.updateStatuses.bind(FileStatusStore),
      getFiles: async (fileIds) => {
        const { roomId, roomKey } = this.portal;
        if (!roomId || !roomKey) {
          throw new AbortError();
        }

        return loadFilesFromFirebase(`files/rooms/${roomId}`, roomKey, fileIds);
      },
      saveFiles: async ({ addedFiles }) => {
        const { roomId, roomKey } = this.portal;
        if (!roomId || !roomKey) {
          throw new AbortError();
        }

        const { savedFiles, erroredFiles } = await saveFilesToFirebase({
          prefix: `${FIREBASE_STORAGE_PREFIXES.collabFiles}/${roomId}`,
          files: await encodeFilesForUpload({
            files: addedFiles,
            encryptionKey: roomKey,
            maxBytes: FILE_UPLOAD_MAX_BYTES,
          }),
        });

        return {
          savedFiles: savedFiles.reduce(
            (acc: Map<FileId, BinaryFileData>, id) => {
              const fileData = addedFiles.get(id);
              if (fileData) {
                acc.set(id, fileData);
              }
              return acc;
            },
            new Map(),
          ),
          erroredFiles: erroredFiles.reduce(
            (acc: Map<FileId, BinaryFileData>, id) => {
              const fileData = addedFiles.get(id);
              if (fileData) {
                acc.set(id, fileData);
              }
              return acc;
            },
            new Map(),
          ),
        };
      },
    });
    this.excalidrawAPI = props.excalidrawAPI;
    this.activeIntervalId = null;
    this.idleTimeoutId = null;
  }

  private onUmmount: (() => void) | null = null;

  componentDidMount() {
    window.addEventListener(EVENT.BEFORE_UNLOAD, this.beforeUnload);
    window.addEventListener("online", this.onOfflineStatusToggle);
    window.addEventListener("offline", this.onOfflineStatusToggle);
    window.addEventListener(EVENT.UNLOAD, this.onUnload);

    const unsubOnUserFollow = this.excalidrawAPI.onUserFollow((payload) => {
      this.portal.socket && this.portal.broadcastUserFollowed(payload);
      // like following a presenter in PowerPoint: start on their page (#167)
      if (payload.action === "FOLLOW") {
        const { socketId } = payload.userToFollow;
        const pageId = this.collaborators.get(socketId)?.pageId;
        if (pageId) {
          this.followToPage(socketId, pageId);
        }
      }
    });
    const throttledRelayUserViewportBounds = throttleRAF(
      this.relayVisibleSceneBounds,
    );
    const unsubOnScrollChange = this.excalidrawAPI.onScrollChange(() =>
      throttledRelayUserViewportBounds(),
    );
    this.onUmmount = () => {
      unsubOnUserFollow();
      unsubOnScrollChange();
    };

    this.onOfflineStatusToggle();

    const collabAPI: CollabAPI = {
      isCollaborating: this.isCollaborating,
      onPointerUpdate: this.onPointerUpdate,
      startCollaboration: this.startCollaboration,
      syncElements: this.syncElements,
      saveCollaboratorSettings: this.saveCollaboratorSettings,
      fetchImageFilesFromFirebase: this.fetchImageFilesFromFirebase,
      stopCollaboration: this.stopCollaboration,
      setUsername: this.setUsername,
      getUsername: this.getUsername,
      getActiveRoomLink: this.getActiveRoomLink,
      setCollabError: this.setErrorDialog,
    };

    appJotaiStore.set(collabAPIAtom, collabAPI);

    if (isTestEnv() || isDevEnv()) {
      window.collab = window.collab || ({} as Window["collab"]);
      Object.defineProperties(window, {
        collab: {
          configurable: true,
          value: this,
        },
      });
    }
  }

  onOfflineStatusToggle = () => {
    appJotaiStore.set(isOfflineAtom, !window.navigator.onLine);
  };

  componentWillUnmount() {
    window.removeEventListener("online", this.onOfflineStatusToggle);
    window.removeEventListener("offline", this.onOfflineStatusToggle);
    window.removeEventListener(EVENT.BEFORE_UNLOAD, this.beforeUnload);
    window.removeEventListener(EVENT.UNLOAD, this.onUnload);
    window.removeEventListener(EVENT.POINTER_MOVE, this.onPointerMove);
    window.removeEventListener(
      EVENT.VISIBILITY_CHANGE,
      this.onVisibilityChange,
    );
    if (this.activeIntervalId) {
      window.clearInterval(this.activeIntervalId);
      this.activeIntervalId = null;
    }
    if (this.idleTimeoutId) {
      window.clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }
    this.onUmmount?.();
  }

  isCollaborating = () => appJotaiStore.get(isCollaboratingAtom)!;

  private setIsCollaborating = (isCollaborating: boolean) => {
    appJotaiStore.set(isCollaboratingAtom, isCollaborating);
  };

  private onUnload = () => {
    this.destroySocketClient({ isUnload: true });
  };

  private beforeUnload = withBatchedUpdates((event: BeforeUnloadEvent) => {
    const syncableElements = getSyncableElements(
      this.getAllPageElementsIncludingDeleted(),
    );

    if (
      this.isCollaborating() &&
      (this.fileManager.shouldPreventUnload(syncableElements) ||
        !isSavedToFirebase(this.portal, syncableElements, this.pageData))
    ) {
      // this won't run in time if user decides to leave the site, but
      //  the purpose is to run in immediately after user decides to stay
      this.saveCollabRoomToFirebase(syncableElements);

      if (import.meta.env.VITE_APP_DISABLE_PREVENT_UNLOAD !== "true") {
        preventUnload(event);
      } else {
        console.warn(
          "preventing unload disabled (VITE_APP_DISABLE_PREVENT_UNLOAD)",
        );
      }
    }
  });

  saveCollabRoomToFirebase = async (
    syncableElements: readonly SyncableExcalidrawElement[],
  ) => {
    syncableElements = cloneJSON(syncableElements);
    try {
      const storedRoom = await saveToFirebase(
        this.portal,
        syncableElements,
        this.excalidrawAPI.getAppState(),
        this.isKnownToRoom,
        this.pageData,
      );

      this.resetErrorIndicator();

      if (this.isCollaborating() && storedRoom) {
        // the stored pages first (#167), so stored elements find their page
        if (storedRoom.pageData) {
          this.applyRemotePageData(storedRoom.pageData);
        }
        for (const element of storedRoom.elements) {
          this.storedElementIds.add(element.id);
        }
        this.handleRemoteSceneUpdate(
          this._reconcileElements(storedRoom.elements, "storedScene"),
        );
      }
    } catch (error: any) {
      const errorMessage = /is longer than.*?bytes/.test(error.message)
        ? t("errors.collabSaveFailed_sizeExceeded")
        : t("errors.collabSaveFailed");

      if (
        !this.state.dialogNotifiedErrors[errorMessage] ||
        !this.isCollaborating()
      ) {
        this.setErrorDialog(errorMessage);
        this.setState({
          dialogNotifiedErrors: {
            ...this.state.dialogNotifiedErrors,
            [errorMessage]: true,
          },
        });
      }

      if (this.isCollaborating()) {
        this.setErrorIndicator(errorMessage);
      }

      console.error(error);
    }
  };

  stopCollaboration = (keepRemoteState = true) => {
    this.queueBroadcastAllElements.cancel();
    this.queueSaveToFirebase.cancel();
    this.loadImageFiles.cancel();
    this.resetErrorIndicator(true);

    this.saveCollabRoomToFirebase(
      getSyncableElements(this.getAllPageElementsIncludingDeleted()),
    );

    if (this.portal.socket && this.fallbackInitializationHandler) {
      this.portal.socket.off(
        "connect_error",
        this.fallbackInitializationHandler,
      );
    }

    if (!keepRemoteState) {
      LocalData.fileStorage.reset();
      this.destroySocketClient();
    } else if (window.confirm(t("alerts.collabStopOverridePrompt"))) {
      // hack to ensure that we prefer we disregard any new browser state
      // that could have been saved in other tabs while we were collaborating
      resetBrowserStateVersions();

      window.history.pushState({}, APP_NAME, window.location.origin);
      this.destroySocketClient();

      LocalData.fileStorage.reset();

      // on every page (#167): the room's pages stay as the local drawing,
      // so all their images must be saved locally again
      this.excalidrawAPI.setPageElements(
        new Map(
          this.excalidrawAPI.getPages().map((page) => [
            page.id,
            page.elements.map((element) => {
              if (isImageElement(element) && element.status === "saved") {
                return newElementWith(element, { status: "pending" });
              }
              return element;
            }),
          ]),
        ),
      );
    }
  };

  private destroySocketClient = (opts?: { isUnload: boolean }) => {
    this.lastBroadcastedOrReceivedSceneVersion = -1;
    this.remoteElementIds = new Set();
    this.storedElementIds = new Set();
    // the room's pages stay as our local pages (#167); only the sync stops
    this.pageData = null;
    this.pendingElements = new Map();
    this.portal.close();
    this.fileManager.reset();
    if (!opts?.isUnload) {
      this.setIsCollaborating(false);
      this.setActiveRoomLink(null);
      this.collaborators = new Map();
      this.collaboratorDirectory = new Map();
      this.directoryRoomId = null;
      this.settingsRoomId = null;
      this.excalidrawAPI.updateScene({
        collaborators: this.collaborators,
        appState: {
          // back to solo: no directory (every creator its own bucket) and
          // nothing hidden
          collaboratorDirectory: null,
          hiddenCollaboratorIds: new Set(),
        },
      });
      LocalData.resumeSave("collaboration");
    }
  };

  private fetchImageFilesFromFirebase = async (opts: {
    elements: readonly ExcalidrawElement[];
    /**
     * Indicates whether to fetch files that are errored or pending and older
     * than 10 seconds.
     *
     * Use this as a mechanism to fetch files which may be ok but for some
     * reason their status was not updated correctly.
     */
    forceFetchFiles?: boolean;
  }) => {
    const unfetchedImages = opts.elements
      .filter((element) => {
        return (
          isInitializedImageElement(element) &&
          !this.fileManager.isFileTracked(element.fileId) &&
          !element.isDeleted &&
          (opts.forceFetchFiles
            ? element.status !== "pending" ||
              Date.now() - element.updated > 10000
            : element.status === "saved")
        );
      })
      .map((element) => (element as InitializedExcalidrawImageElement).fileId);

    return await this.fileManager.getFiles(unfetchedImages);
  };

  private decryptPayload = async (
    iv: Uint8Array<ArrayBuffer>,
    encryptedData: ArrayBuffer,
    decryptionKey: string,
  ): Promise<ValueOf<SocketUpdateDataSource>> => {
    try {
      const decrypted = await decryptData(iv, encryptedData, decryptionKey);

      const decodedData = new TextDecoder("utf-8").decode(
        new Uint8Array(decrypted),
      );
      return JSON.parse(decodedData);
    } catch (error) {
      window.alert(t("alerts.decryptFailed"));
      console.error(error);
      return {
        type: WS_SUBTYPES.INVALID_RESPONSE,
      };
    }
  };

  private fallbackInitializationHandler: null | (() => any) = null;

  startCollaboration = async (
    existingRoomLinkData: null | { roomId: string; roomKey: string },
  ) => {
    if (!this.state.username) {
      import("@excalidraw/random-username").then(({ getRandomUsername }) => {
        const username = getRandomUsername();
        this.setUsername(username);
      });
    }

    if (this.portal.socket) {
      return null;
    }

    // before the socket opens, so all our messages carry the id
    this.clientId = await getClientId();
    this.remoteElementIds = new Set();
    this.storedElementIds = new Set();

    let roomId;
    let roomKey;

    if (existingRoomLinkData) {
      ({ roomId, roomKey } = existingRoomLinkData);
    } else {
      ({ roomId, roomKey } = await generateCollaborationLinkData());
      window.history.pushState(
        {},
        APP_NAME,
        getCollaborationLink({ roomId, roomKey }),
      );
    }

    // "Previously seen" survives tab close (per room); include ourselves so
    // a future tab of ours that gets a different id can still name these
    // drawings
    this.directoryRoomId = roomId;
    this.collaboratorDirectory = loadCollaboratorDirectory(roomId);
    this.recordSighting(this.clientId, this.state.username);
    this.excalidrawAPI.updateScene({
      appState: {
        collaboratorDirectory: this.collaboratorDirectory,
        // this room's saved dropdown settings (#83), never another room's
        ...this.loadRoomSettings(roomId),
      },
    });

    // TODO: `ImportedDataState` type here seems abused
    const scenePromise = resolvablePromise<
      | (ImportedDataState & { elements: readonly OrderedExcalidrawElement[] })
      | null
    >();

    this.setIsCollaborating(true);
    LocalData.pauseSave("collaboration");

    const { default: socketIOClient } = await import(
      /* webpackChunkName: "socketIoClient" */ "socket.io-client"
    );

    const fallbackInitializationHandler = () => {
      this.initializeRoom({
        roomLinkData: existingRoomLinkData,
        fetchScene: true,
      }).then((scene) => {
        scenePromise.resolve(scene);
      });
    };
    this.fallbackInitializationHandler = fallbackInitializationHandler;

    try {
      this.portal.socket = this.portal.open(
        socketIOClient(import.meta.env.VITE_APP_WS_SERVER_URL, {
          transports: ["websocket", "polling"],
        }),
        roomId,
        roomKey,
      );

      this.portal.socket.once("connect_error", fallbackInitializationHandler);
    } catch (error: any) {
      console.error(error);
      this.setErrorDialog(error.message);
      return null;
    }

    if (existingRoomLinkData) {
      // when joining existing room, don't merge it with current scene data
      this.resetSceneKeepingSettings(roomId);
    } else {
      // every page goes into the room (#167)
      const elementsByPage = new Map(
        this.excalidrawAPI.getPages().map((page) => [
          page.id,
          page.elements
            // remove deleted elements to ensure we don't expose potentially
            // sensitive user data in case user manually deletes existing
            // elements (or clears pages), which would otherwise be persisted
            // to database even if deleted before creating the room.
            .filter((element) => !element.isDeleted)
            .map((element) => {
              if (isImageElement(element) && element.status === "saved") {
                return newElementWith(element, { status: "pending" });
              }
              return element;
            }),
        ]),
      );
      this.excalidrawAPI.setPageElements(elementsByPage);

      // a new room starts from our own pages, so everything in it is ours,
      // on the page it's on. Stamp now (syncElements only stamps once the
      // socket is initialized) so the room's stored scene carries the stamps
      // from the first save
      for (const [pageId, elements] of elementsByPage) {
        this.stampLocallyCreatedElements(elements, pageId);
      }
      // and our pages (order, names, descriptions, backgrounds) are the
      // room's pages
      this.establishPageData();

      this.saveCollabRoomToFirebase(
        getSyncableElements(this.getAllPageElementsIncludingDeleted()),
      );
    }

    // fallback in case you're not alone in the room but still don't receive
    // initial SCENE_INIT message
    this.socketInitializationTimer = window.setTimeout(
      fallbackInitializationHandler,
      INITIAL_SCENE_UPDATE_TIMEOUT,
    );

    // All socket listeners are moving to Portal
    this.portal.socket.on(
      "client-broadcast",
      async (encryptedData: ArrayBuffer, iv: Uint8Array<ArrayBuffer>) => {
        if (!this.portal.roomKey) {
          return;
        }

        const decryptedData = await this.decryptPayload(
          iv,
          encryptedData,
          this.portal.roomKey,
        );

        switch (decryptedData.type) {
          case WS_SUBTYPES.INVALID_RESPONSE:
            return;
          case WS_SUBTYPES.INIT: {
            if (!this.portal.socketInitialized) {
              this.initializeRoom({ fetchScene: false });
              const remoteElements = toBrandedType<
                readonly RemoteExcalidrawElement[]
              >(decryptedData.payload.elements);
              const reconciledElements = this._reconcileElements(
                remoteElements,
                "initialScene",
              );
              this.handleRemoteSceneUpdate(reconciledElements);
              // noop if already resolved via init from firebase
              scenePromise.resolve({
                // the scene is the open page (#167)
                elements: this.excalidrawAPI.getSceneElementsIncludingDeleted(),
                scrollToContent: true,
              });
            }
            break;
          }
          case WS_SUBTYPES.UPDATE:
            this.handleRemoteSceneUpdate(
              this._reconcileElements(
                toBrandedType<readonly RemoteExcalidrawElement[]>(
                  decryptedData.payload.elements,
                ),
                "update",
                decryptedData.payload.sentAt,
              ),
            );
            break;
          case WS_SUBTYPES.PAGE_DATA: {
            // a page message with bad data is ignored as a whole (#167)
            const pageData = parsePageData(decryptedData.payload);
            if (pageData) {
              this.applyRemotePageData(pageData);
            }
            break;
          }
          case WS_SUBTYPES.MOUSE_LOCATION: {
            const {
              pointer,
              button,
              username,
              selectedElementIds,
              clientId,
              pageId,
            } = decryptedData.payload;

            const socketId: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["socketId"] =
              decryptedData.payload.socketId ||
              // @ts-ignore legacy, see #2094 (#2097)
              decryptedData.payload.socketID;

            this.updateCollaborator(socketId, {
              pointer,
              button,
              selectedElementIds,
              username,
              ...(clientId ? { id: clientId } : {}),
              ...getPresencePage(pageId),
            });

            break;
          }

          case WS_SUBTYPES.USER_IDENTITY: {
            const { socketId, clientId, username, pageId } =
              decryptedData.payload;
            this.updateCollaborator(socketId, {
              id: clientId,
              username,
              ...getPresencePage(pageId),
            });
            break;
          }

          case WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS: {
            const { sceneBounds, socketId } = decryptedData.payload;

            const appState = this.excalidrawAPI.getAppState();

            // we're not following the user
            // (shouldn't happen, but could be late message or bug upstream)
            if (appState.userToFollow?.socketId !== socketId) {
              console.warn(
                `receiving remote client's (from ${socketId}) viewport bounds even though we're not subscribed to it!`,
              );
              return;
            }

            // cross-follow case, ignore updates in this case
            if (
              appState.userToFollow &&
              appState.followedBy.has(appState.userToFollow.socketId)
            ) {
              return;
            }

            this.excalidrawAPI.updateScene({
              appState: zoomToFitBounds({
                appState,
                bounds: sceneBounds,
                fit: "contain",
              }).appState,
            });

            break;
          }

          case WS_SUBTYPES.IDLE_STATUS: {
            const { userState, socketId, username, clientId, pageId } =
              decryptedData.payload;
            this.updateCollaborator(socketId, {
              userState,
              username,
              ...(clientId ? { id: clientId } : {}),
              ...getPresencePage(pageId),
            });
            break;
          }

          default: {
            assertNever(decryptedData, null);
          }
        }
      },
    );

    this.portal.socket.on("first-in-room", async () => {
      if (this.portal.socket) {
        this.portal.socket.off("first-in-room");
      }
      const sceneData = await this.initializeRoom({
        fetchScene: true,
        roomLinkData: existingRoomLinkData,
      });
      scenePromise.resolve(sceneData);
    });

    this.portal.socket.on(
      WS_EVENTS.USER_FOLLOW_ROOM_CHANGE,
      (followedBy: SocketId[]) => {
        this.excalidrawAPI.updateScene({
          appState: { followedBy: new Set(followedBy) },
        });

        this.relayVisibleSceneBounds({ force: true });
      },
    );

    this.initializeIdleDetector();

    this.setActiveRoomLink(window.location.href);

    return scenePromise;
  };

  private initializeRoom = async ({
    fetchScene,
    roomLinkData,
  }:
    | {
        fetchScene: true;
        roomLinkData: { roomId: string; roomKey: string } | null;
      }
    | { fetchScene: false; roomLinkData?: null }) => {
    clearTimeout(this.socketInitializationTimer!);
    if (this.portal.socket && this.fallbackInitializationHandler) {
      this.portal.socket.off(
        "connect_error",
        this.fallbackInitializationHandler,
      );
    }
    if (fetchScene && roomLinkData && this.portal.socket) {
      this.resetSceneKeepingSettings(roomLinkData.roomId);

      try {
        const storedRoom = await loadFromFirebase(
          roomLinkData.roomId,
          roomLinkData.roomKey,
          this.portal.socket,
        );
        if (storedRoom) {
          const { elements, pageData } = storedRoom;
          // the room's pages replace ours first (#167), so its elements can
          // go to their pages
          if (pageData) {
            this.applyRemotePageData(pageData);
          }
          // the stored room scene replaces ours (not reconciled with it), so
          // mark it here. The scene was just reset, so all of it is remote.
          this.markRemoteElements(elements, null);

          // every page's elements are stored (#167): each goes to its page,
          // the scene gets the open page's
          const elementsByPage = this.routeStoredElements(elements);
          this.excalidrawAPI.setPageElements(elementsByPage);
          // what we got is what the room has, unless untagged elements were
          // just stamped with a page: those stamps still have to go out
          const stampedAny = getElementsToPageStamp(elements).length > 0;
          this.setLastBroadcastedOrReceivedSceneVersion(
            stampedAny
              ? -1
              : getRoomVersion(this.getAllPageElementsIncludingDeleted()),
          );

          return {
            elements:
              (elementsByPage.get(this.excalidrawAPI.getActivePageId()) as
                | readonly OrderedExcalidrawElement[]
                | undefined) ?? [],
            scrollToContent: true,
          };
        }
      } catch (error: any) {
        // log the error and move on. other peers will sync us the scene.
        console.error(error);
      } finally {
        this.portal.socketInitialized = true;
        // a room without stored pages (new, or from before pages were
        // shared) starts from the page we have (#167)
        this.establishPageData();
        this.portal.broadcastUserIdentity();
        // resetScene() above wiped it from appState
        this.publishCollaboratorDirectory();
      }
    } else {
      this.portal.socketInitialized = true;
      // a peer's INIT (fetchScene false): the room's pages come in their
      // PAGE_DATA, which may arrive just after it. Our blank join page must
      // not become a room page meanwhile, so we wait for theirs. (A new
      // room we created already has its page data: this does nothing.)
      if (fetchScene) {
        this.establishPageData();
      }
      this.portal.broadcastUserIdentity();
      this.publishCollaboratorDirectory();
    }
    return null;
  };

  /**
   * @param source where the remote elements come from:
   * - `"update"`: a peer's incremental update
   * - `"initialScene"`: the room scene sent to us when joining
   * - `"storedScene"`: the room's stored scene (the reference for what the
   *   room has)
   */
  private _reconcileElements = (
    remoteElements: readonly RemoteExcalidrawElement[],
    source: "update" | "initialScene" | "storedScene" = "update",
    /** for updates: the sender's clock when it sent them */
    senderNow?: number,
  ): Map<string, ReconciledExcalidrawElement[]> => {
    const appState = this.excalidrawAPI.getAppState();

    // every page's elements (#167): the room holds the whole drawing
    const pages = this.excalidrawAPI.getPages();
    const existingElements = pages.flatMap((page) => page.elements);
    const existingElementsMap = arrayToMap(existingElements);

    // don't let a peer bring back elements whose deletion expired (see
    // expiredDeletions.ts)
    if (source === "update") {
      const expired = getExpiredResurrections(
        remoteElements,
        existingElementsMap,
        senderNow,
      );
      if (expired.size) {
        remoteElements = remoteElements.filter((el) => !expired.has(el.id));
      }
    }

    // peers' new elements (INIT/UPDATE) + stored-scene echoes. Our own
    // elements are already on our pages, so they're never marked remote.
    this.markRemoteElements(remoteElements, existingElementsMap);

    // NOTE ideally we restore _after_ reconciliation but we can't do that
    // as we'd regenerate even elements such as appState.newElement which would
    // break the state
    remoteElements = restoreElementsByPage(
      // untagged elements go to the first page (#167)
      this.pageStampRemoteElements(remoteElements),
      existingElements,
    ) as RemoteExcalidrawElement[];

    // reconciled page by page: each page orders its elements on its own
    // (fractional indices repeat across pages), and an element's local and
    // remote copies are always on the same page since tags never change
    const remoteByPage = groupElementsByPageTag(remoteElements);
    this.holdElementsForMissingPages(remoteByPage, pages);
    const reconciledByPage = new Map<string, ReconciledExcalidrawElement[]>();
    for (const page of pages) {
      const remotePageElements = remoteByPage.get(page.id);
      // the stored scene is the reference for every page (expired deletes
      // below); otherwise only pages with remote elements change
      if (!remotePageElements && source !== "storedScene") {
        continue;
      }
      const reconciledElements = reconcileElements(
        page.elements as OrderedExcalidrawElement[],
        remotePageElements ?? [],
        appState,
      );
      reconciledByPage.set(
        page.id,
        bumpElementVersions(reconciledElements, page.elements),
      );
    }

    // Avoid broadcasting to the rest of the collaborators the scene
    // we just received! Every page is broadcast (#167), so this is the
    // version of every page after the update.
    // Note: this needs to be set before updating the scene as it
    // synchronously calls render.
    this.setLastBroadcastedOrReceivedSceneVersion(
      getRoomVersion(
        pages.flatMap((page) => reconciledByPage.get(page.id) ?? page.elements),
      ),
    );

    // our live copies of elements the room deleted so long ago it forgot:
    // delete them here too. After the line above, so the fresh deletes are
    // broadcast (to other clients that may hold stale copies too).
    if (source === "storedScene") {
      const remoteIds = new Set(remoteElements.map((el) => el.id));
      for (const [pageId, reconciledElements] of reconciledByPage) {
        const expired = new Set(
          getLocalElementsWithExpiredDeletion(
            reconciledElements,
            remoteIds,
            this.isKnownToRoom,
          ).map((el) => el.id),
        );
        if (expired.size) {
          reconciledByPage.set(
            pageId,
            reconciledElements.map((el) =>
              expired.has(el.id)
                ? (newElementWith(el, {
                    isDeleted: true,
                  }) as ReconciledExcalidrawElement)
                : el,
            ),
          );
        }
      }
    }

    return reconciledByPage;
  };

  /**
   * Whether the element was ever in the room's scene as far as this client
   * knows: received from the room, or part of the stored scene after one of
   * our saves.
   */
  private isKnownToRoom = (elementId: string) =>
    this.remoteElementIds.has(elementId) ||
    this.storedElementIds.has(elementId);

  private loadImageFiles = throttle(async () => {
    const { loadedFiles, erroredFiles } =
      await this.fetchImageFilesFromFirebase({
        // every page's images, so they're there when a page is opened (#167)
        elements: this.getAllPageElementsIncludingDeleted(),
      });

    this.excalidrawAPI.addFiles(loadedFiles);

    updateStaleImageStatuses({
      excalidrawAPI: this.excalidrawAPI,
      erroredFiles,
      elements: this.excalidrawAPI.getSceneElementsIncludingDeleted(),
    });
  }, LOAD_IMAGES_TIMEOUT);

  /** routes reconciled elements to their pages (#167) */
  private handleRemoteSceneUpdate = (
    elementsByPage: ReadonlyMap<string, ReconciledExcalidrawElement[]>,
  ) => {
    this.excalidrawAPI.setPageElements(elementsByPage);

    this.loadImageFiles();
  };

  private onPointerMove = () => {
    if (this.idleTimeoutId) {
      window.clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }

    this.idleTimeoutId = window.setTimeout(this.reportIdle, IDLE_THRESHOLD);

    if (!this.activeIntervalId) {
      this.activeIntervalId = window.setInterval(
        this.reportActive,
        ACTIVE_THRESHOLD,
      );
    }
  };

  private onVisibilityChange = () => {
    if (document.hidden) {
      if (this.idleTimeoutId) {
        window.clearTimeout(this.idleTimeoutId);
        this.idleTimeoutId = null;
      }
      if (this.activeIntervalId) {
        window.clearInterval(this.activeIntervalId);
        this.activeIntervalId = null;
      }
      this.onIdleStateChange(UserIdleState.AWAY);
    } else {
      this.idleTimeoutId = window.setTimeout(this.reportIdle, IDLE_THRESHOLD);
      this.activeIntervalId = window.setInterval(
        this.reportActive,
        ACTIVE_THRESHOLD,
      );
      this.onIdleStateChange(UserIdleState.ACTIVE);
    }
  };

  private reportIdle = () => {
    this.onIdleStateChange(UserIdleState.IDLE);
    if (this.activeIntervalId) {
      window.clearInterval(this.activeIntervalId);
      this.activeIntervalId = null;
    }
  };

  private reportActive = () => {
    this.onIdleStateChange(UserIdleState.ACTIVE);
  };

  private initializeIdleDetector = () => {
    document.addEventListener(EVENT.POINTER_MOVE, this.onPointerMove);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, this.onVisibilityChange);
  };

  setCollaborators(sockets: SocketId[]) {
    const collaborators: InstanceType<typeof Collab>["collaborators"] =
      new Map();
    for (const socketId of sockets) {
      const isCurrentUser = socketId === this.portal.socket?.id;
      collaborators.set(
        socketId,
        Object.assign(
          {},
          this.collaborators.get(socketId),
          { isCurrentUser },
          // lets the editor tell which creator id is "you"
          isCurrentUser && this.clientId ? { id: this.clientId } : {},
        ),
      );
    }
    // collaborators who just left: refresh when we last saw them
    for (const [socketId, collaborator] of this.collaborators) {
      if (!collaborators.has(socketId) && collaborator.id) {
        this.recordSighting(collaborator.id, collaborator.username);
      }
    }
    this.collaborators = collaborators;
    this.excalidrawAPI.updateScene({
      collaborators,
      appState: { collaboratorDirectory: this.collaboratorDirectory },
    });
  }

  updateCollaborator = (socketId: SocketId, updates: Partial<Collaborator>) => {
    const previousPageId = this.collaborators.get(socketId)?.pageId;
    const collaborators = new Map(this.collaborators);
    const user: Mutable<Collaborator> = Object.assign(
      {},
      collaborators.get(socketId),
      updates,
      {
        isCurrentUser: socketId === this.portal.socket?.id,
      },
    );
    collaborators.set(socketId, user);
    this.collaborators = collaborators;

    // #83: seen for the first time (checked before recording the sighting)
    // → starts in the "New collaborators" default
    const newcomerState =
      user.id &&
      this.directoryRoomId &&
      !this.collaboratorDirectory.has(user.id)
        ? getNewcomerState(user.id, {
            ...this.excalidrawAPI.getAppState(),
            collaboratorDirectory: this.collaboratorDirectory,
          })
        : null;

    if (user.id) {
      this.recordSighting(user.id, user.username);
    }

    const appState: Pick<AppState, "collaboratorDirectory"> = {
      ...newcomerState,
      collaboratorDirectory: this.collaboratorDirectory,
    };
    this.excalidrawAPI.updateScene({ collaborators, appState });

    // follow mode: only when they move to another page, so a page we open
    // ourselves while following stays open until they switch again
    if (updates.pageId && updates.pageId !== previousPageId) {
      this.followToPage(socketId, updates.pageId);
    }
  };

  /**
   * Follow mode (#167): when the collaborator we follow is on another page,
   * we open it too. A page we don't have (e.g. its page data hasn't arrived)
   * is ignored.
   */
  private followToPage = (socketId: SocketId, pageId: string) => {
    if (
      this.excalidrawAPI.getAppState().userToFollow?.socketId === socketId &&
      pageId !== this.excalidrawAPI.getActivePageId() &&
      this.excalidrawAPI.getPages().some((page) => page.id === pageId)
    ) {
      this.excalidrawAPI.selectPage(pageId);
    }
  };

  /**
   * Tells the room which page we're on when it changes (#167), so others can
   * show us on its tab, hide our cursor from other pages and follow us.
   * USER_IDENTITY: non-volatile, so a page switch isn't lost.
   */
  private announcePage = () => {
    if (
      this.portal.socketInitialized &&
      this.portal.lastAnnouncedPageId !== this.excalidrawAPI.getActivePageId()
    ) {
      this.portal.broadcastUserIdentity();
    }
  };

  public setLastBroadcastedOrReceivedSceneVersion = (version: number) => {
    this.lastBroadcastedOrReceivedSceneVersion = version;
  };

  public getLastBroadcastedOrReceivedSceneVersion = () => {
    return this.lastBroadcastedOrReceivedSceneVersion;
  };

  public getSceneElementsIncludingDeleted = () => {
    return this.excalidrawAPI.getSceneElementsIncludingDeleted();
  };

  /**
   * every page's elements (#167): what the room holds, broadcasts and stores.
   * The open page's come from the live scene.
   */
  public getAllPageElementsIncludingDeleted = (): OrderedExcalidrawElement[] =>
    this.excalidrawAPI
      .getPages()
      .flatMap((page) => page.elements as OrderedExcalidrawElement[]);

  public getClientId = () => this.clientId;

  /** our copy of the room's page data (#167), null outside a room */
  public getPageData = () => this.pageData;

  /**
   * Records a sighting of `clientId` in the current room's directory, saving
   * it when it changed. Returns whether it changed.
   */
  private recordSighting = (clientId: string, username?: string | null) => {
    if (!this.directoryRoomId) {
      return false;
    }
    const next = recordCollaboratorSighting(
      this.collaboratorDirectory,
      clientId,
      username,
    );
    if (!next) {
      return false;
    }
    this.collaboratorDirectory = next;
    saveCollaboratorDirectory(this.directoryRoomId, next);
    return true;
  };

  /**
   * (Re)publishes the directory to the editor. Also called after scene resets
   * (joining a room resets appState), so it's safe to call redundantly.
   */
  private publishCollaboratorDirectory = () => {
    this.excalidrawAPI.updateScene({
      appState: { collaboratorDirectory: this.collaboratorDirectory },
    });
  };

  /**
   * Loads `roomId`'s saved dropdown settings (#83) to put in the editor, and
   * from then on saves them when they change.
   */
  private loadRoomSettings = (roomId: string) => {
    this.savedSettings = loadCollaboratorSettings(roomId, this.clientId);
    this.settingsRoomId = roomId;
    return this.savedSettings;
  };

  /**
   * Resets the scene for joining `roomId`. The reset also resets appState,
   * so this room's saved settings (#83) are put back right away, and not
   * saved in between.
   */
  private resetSceneKeepingSettings = (roomId: string) => {
    this.settingsRoomId = null;
    this.excalidrawAPI.resetScene();
    // the pages too (#167): the room's pages replace the ones we had, as
    // the room's scene replaces our canvas
    this.excalidrawAPI.resetPages();
    this.pageData = null;
    this.pendingElements = new Map();
    this.excalidrawAPI.updateScene({ appState: this.loadRoomSettings(roomId) });
  };

  // ---------------------------------------------------------------------------
  // page data (#167): see pageSync.ts
  // ---------------------------------------------------------------------------

  /** our pages as the room sees them, in order */
  private getSharedPageInfosFromEditor = (): SharedPageInfo[] =>
    this.excalidrawAPI.getPages().map((page) => ({
      id: page.id,
      name: page.name,
      description: page.description,
      viewBackgroundColor: page.settings.viewBackgroundColor,
    }));

  /**
   * Once the room's pages are known, or the room has none (new, or saved
   * before pages were shared): our pages become the room's pages.
   */
  private establishPageData = () => {
    if (!this.pageData) {
      this.pageData = getLocalPageChanges(
        EMPTY_PAGE_DATA,
        this.getSharedPageInfosFromEditor(),
        Date.now(),
      );
    }
  };

  broadcastPageData = () => {
    if (this.pageData && this.portal.socketInitialized) {
      this.portal.broadcastPageData(this.pageData);
    }
  };

  /**
   * Sends local page changes (create, rename, description, reorder,
   * background, delete) to the room. Called on every editor change, so it
   * does nothing until something shared changed.
   */
  private syncPageData = () => {
    if (!this.pageData || !this.portal.socketInitialized) {
      return;
    }
    const changes = getLocalPageChanges(
      this.pageData,
      this.getSharedPageInfosFromEditor(),
      Date.now(),
      t("labels.page"),
    );
    if (changes) {
      this.pageData = changes;
      this.broadcastPageData();
    }
  };

  /**
   * Merges page data from a peer or room storage into ours and makes our
   * pages match. If ours had something the sender's didn't, the merged copy
   * is sent back so the sender catches up.
   */
  private applyRemotePageData = (remote: SharedPageData) => {
    const merged = mergePageData(
      this.pageData ?? EMPTY_PAGE_DATA,
      remote,
      t("labels.page"),
    );
    const changed = !this.pageData || !isSamePageData(merged, this.pageData);
    this.pageData = merged;
    if (changed) {
      this.excalidrawAPI.applySharedPages(
        getSharedPageInfos(merged),
        Object.keys(merged.deletedPageIds),
      );
      this.routePendingElements();
    }
    if (!isSamePageData(merged, remote)) {
      this.broadcastPageData();
    }
  };

  /**
   * After the socket reconnects (#167): pages and elements match the room's
   * again, including changes made while we were offline, both ways. Others'
   * changes come from the room's stored copy (peers answer our rejoin with
   * their page data, but their INIT is ignored once we're initialized);
   * ours go out as page data and a full resync, and are saved.
   */
  onReconnect = async () => {
    const { roomId, roomKey, socket } = this.portal;
    if (!roomId || !roomKey) {
      return;
    }
    try {
      const storedRoom = await loadFromFirebase(roomId, roomKey, socket);
      if (storedRoom && this.isCollaborating()) {
        if (storedRoom.pageData) {
          this.applyRemotePageData(storedRoom.pageData);
        }
        for (const element of storedRoom.elements) {
          this.storedElementIds.add(element.id);
        }
        this.handleRemoteSceneUpdate(
          this._reconcileElements(
            toBrandedType<readonly RemoteExcalidrawElement[]>(
              storedRoom.elements,
            ),
            "storedScene",
          ),
        );
      }
    } catch (error: any) {
      // peers' page data and the next full resync still catch us up
      console.error(error);
    }
    this.broadcastPageData();
    this.queueBroadcastAllElements.cancel();
    this.queueBroadcastAllElements();
    this.queueSaveToFirebase();
  };

  /** routes elements that were waiting for their page (see pendingElements) */
  private routePendingElements = () => {
    if (!this.pendingElements.size) {
      return;
    }
    const pageIds = new Set(
      this.excalidrawAPI.getPages().map((page) => page.id),
    );
    const ready: RemoteExcalidrawElement[] = [];
    for (const [id, element] of this.pendingElements) {
      const pageId = getElementPageId(element);
      if (pageId && pageIds.has(pageId)) {
        ready.push(element);
        this.pendingElements.delete(id);
      } else if (
        !pageId ||
        (this.pageData && isPageDeleted(this.pageData, pageId))
      ) {
        this.pendingElements.delete(id);
      }
    }
    if (ready.length) {
      this.handleRemoteSceneUpdate(this._reconcileElements(ready, "update"));
    }
  };

  /**
   * Saves the dropdown's settings (#83) when they changed. Called on every
   * editor change, so it only compares references until something changed.
   */
  saveCollaboratorSettings = (appState: AppState) => {
    if (
      !this.settingsRoomId ||
      (this.savedSettings &&
        isSameCollaboratorSettings(this.savedSettings, appState))
    ) {
      return;
    }
    this.savedSettings = appState;
    saveCollaboratorSettings(this.settingsRoomId, appState, this.clientId);
  };

  private markRemoteElements = (
    elements: readonly ExcalidrawElement[],
    existingElementsMap: ReadonlyMap<string, unknown> | null,
  ) => {
    for (const element of elements) {
      // already in our scene → either ours (an echo) or already known
      if (!existingElementsMap?.has(element.id)) {
        this.remoteElementIds.add(element.id);
      }
    }
  };

  /**
   * One-time creator stamp for elements this client introduced to the room.
   * Mutates in place (safe during in-progress drawing) and bumps versions so
   * the stamp syncs.
   */
  private stampLocallyCreatedElements = (
    elements: readonly ExcalidrawElement[],
    /** the page `elements` are on; the open page for the scene */
    pageId: string = this.excalidrawAPI.getActivePageId(),
  ) => {
    const toCreatorStamp = new Set<ExcalidrawElement>(
      this.clientId
        ? getElementsToStamp(elements, this.remoteElementIds, this.clientId)
        : [],
    );
    // the page tag (#167): elements are only ever in their page's list, so
    // the page they're on is the page they were created on. Our own copies
    // carrying another page's tag (pasted, duplicated) are tagged here too.
    const toPageStamp = new Set<ExcalidrawElement>(
      getLocalElementsToPageStamp(elements, pageId, this.remoteElementIds),
    );
    for (const element of elements) {
      if (!toCreatorStamp.has(element) && !toPageStamp.has(element)) {
        continue;
      }
      let customData = element.customData;
      if (toCreatorStamp.has(element)) {
        customData = getStampedCustomData(element, this.clientId!);
      }
      if (toPageStamp.has(element)) {
        customData = getPageStampedCustomData(
          { ...element, customData },
          pageId,
        );
      }
      this.excalidrawAPI.mutateElement(
        element as Mutable<ExcalidrawElement>,
        { customData },
        // not a visual change → no re-render needed
        false,
      );
    }
  };

  /**
   * Groups the room's stored elements by page (#167), replacing what our
   * pages had: every page we have gets the room's elements for it (none if
   * the room has none). Untagged elements go to the first page; elements for
   * pages we don't have are not drawn anywhere.
   */
  private routeStoredElements = <T extends ExcalidrawElement>(
    elements: readonly T[],
  ): Map<string, T[]> => {
    const byTag = groupElementsByPageTag(
      this.pageStampRemoteElements(elements),
    );
    this.holdElementsForMissingPages(byTag, this.excalidrawAPI.getPages());
    return new Map(
      this.excalidrawAPI
        .getPages()
        .map((page) => [page.id, byTag.get(page.id) ?? []]),
    );
  };

  /**
   * Elements for a page we don't have (yet) are drawn nowhere: they're kept
   * until its page data arrives (see routePendingElements), or dropped if it
   * is a deleted page. The newest copy of each is kept.
   */
  private holdElementsForMissingPages = (
    elementsByPage: ReadonlyMap<string | null, readonly ExcalidrawElement[]>,
    pages: readonly { id: string }[],
  ) => {
    for (const [pageId, pageElements] of elementsByPage) {
      if (
        pageId &&
        !pages.some((page) => page.id === pageId) &&
        !(this.pageData && isPageDeleted(this.pageData, pageId))
      ) {
        for (const element of pageElements) {
          const pending = this.pendingElements.get(element.id);
          if (!pending || pending.version < element.version) {
            // (they came from the room)
            this.pendingElements.set(
              element.id,
              element as unknown as RemoteExcalidrawElement,
            );
          }
        }
      }
    }
  };

  /**
   * Stamps elements that reached us from the room without a page tag (#167)
   * with the first page, once. Returns new copies (versions bumped, so the
   * tag syncs); tagged elements are returned as-is.
   */
  private pageStampRemoteElements = <T extends ExcalidrawElement>(
    elements: readonly T[],
  ): T[] => {
    const untagged = new Set<ExcalidrawElement>(
      getElementsToPageStamp(elements),
    );
    if (!untagged.size) {
      return [...elements];
    }
    const firstPageId = this.excalidrawAPI.getPages()[0].id;
    return elements.map((element) =>
      untagged.has(element)
        ? (newElementWith(element as ExcalidrawElement, {
            customData: getPageStampedCustomData(element, firstPageId),
          }) as T)
        : element,
    );
  };

  onPointerUpdate = throttle(
    (payload: {
      pointer: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["pointer"];
      button: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["button"];
      pointersMap: Gesture["pointers"];
    }) => {
      payload.pointersMap.size < 2 &&
        this.portal.socket &&
        this.portal.broadcastMouseLocation(payload);
    },
    CURSOR_SYNC_TIMEOUT,
  );

  relayVisibleSceneBounds = (props?: { force: boolean }) => {
    const appState = this.excalidrawAPI.getAppState();

    if (this.portal.socket && (appState.followedBy.size > 0 || props?.force)) {
      this.portal.broadcastVisibleSceneBounds(
        {
          sceneBounds: getVisibleSceneBounds(appState),
        },
        `follow@${this.portal.socket.id}`,
      );
    }
  };

  onIdleStateChange = (userState: UserIdleState) => {
    this.portal.broadcastIdleChange(userState);
  };

  /**
   * Broadcasts what changed on any page (#167): changes to pages that aren't
   * open (e.g. clearing them) are sent too. Portal only sends elements whose
   * version it hasn't sent yet.
   */
  broadcastElements = (
    elements: readonly OrderedExcalidrawElement[] = this.getAllPageElementsIncludingDeleted(),
  ) => {
    const version = getRoomVersion(elements);
    if (version !== this.getLastBroadcastedOrReceivedSceneVersion()) {
      this.portal.broadcastScene(WS_SUBTYPES.UPDATE, elements, false);
      this.lastBroadcastedOrReceivedSceneVersion = version;
      this.queueBroadcastAllElements();
    }
  };

  /** @param elements the scene, i.e. the open page's elements */
  syncElements = (elements: readonly OrderedExcalidrawElement[]) => {
    // only once the room's scene has loaded, so every room element is already
    // marked remote and can't be mistaken for one of ours
    if (this.portal.socketInitialized) {
      this.stampLocallyCreatedElements(elements);
    }
    // page changes first (#167), so a new page reaches peers before the
    // elements drawn on it
    this.syncPageData();
    // and which page we're on, if we switched
    this.announcePage();
    this.broadcastElements();
    this.queueSaveToFirebase();
  };

  queueBroadcastAllElements = throttle(() => {
    // the page data too, so dropped page messages are recovered (#167)
    this.broadcastPageData();
    const elements = this.getAllPageElementsIncludingDeleted();
    this.portal.broadcastScene(WS_SUBTYPES.UPDATE, elements, true);
    // everything has been sent
    this.setLastBroadcastedOrReceivedSceneVersion(getRoomVersion(elements));
  }, SYNC_FULL_SCENE_INTERVAL_MS);

  queueSaveToFirebase = throttle(
    () => {
      if (this.portal.socketInitialized) {
        this.saveCollabRoomToFirebase(
          getSyncableElements(this.getAllPageElementsIncludingDeleted()),
        );
      }
    },
    SYNC_FULL_SCENE_INTERVAL_MS,
    { leading: false },
  );

  setUsername = (username: string) => {
    this.setState({ username });
    saveUsernameToLocalStorage(username);
    // no-op unless in an initialized room
    this.portal.broadcastUserIdentity(username);
    if (this.clientId && this.recordSighting(this.clientId, username)) {
      this.publishCollaboratorDirectory();
    }
  };

  getUsername = () => this.state.username;

  setActiveRoomLink = (activeRoomLink: string | null) => {
    this.setState({ activeRoomLink });
    appJotaiStore.set(activeRoomLinkAtom, activeRoomLink);
  };

  getActiveRoomLink = () => this.state.activeRoomLink;

  setErrorIndicator = (errorMessage: string | null) => {
    appJotaiStore.set(collabErrorIndicatorAtom, {
      message: errorMessage,
      nonce: Date.now(),
    });
  };

  resetErrorIndicator = (resetDialogNotifiedErrors = false) => {
    appJotaiStore.set(collabErrorIndicatorAtom, { message: null, nonce: 0 });
    if (resetDialogNotifiedErrors) {
      this.setState({
        dialogNotifiedErrors: {},
      });
    }
  };

  setErrorDialog = (errorMessage: string | null) => {
    this.setState({
      errorMessage,
    });
  };

  render() {
    const { errorMessage } = this.state;

    return (
      <>
        {errorMessage != null && (
          <ErrorDialog onClose={() => this.setErrorDialog(null)}>
            {errorMessage}
          </ErrorDialog>
        )}
      </>
    );
  }
}

declare global {
  interface Window {
    collab: InstanceType<typeof Collab>;
  }
}

if (isTestEnv() || isDevEnv()) {
  window.collab = window.collab || ({} as Window["collab"]);
}

export default Collab;

export type TCollabClass = Collab;
