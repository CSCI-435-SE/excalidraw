import { MIME_TYPES, toBrandedType } from "@excalidraw/common";

import { decompressData } from "@excalidraw/excalidraw/data/encode";
import {
  encryptData,
  decryptData,
} from "@excalidraw/excalidraw/data/encryption";
import { getSceneVersion } from "@excalidraw/element";
import { t } from "@excalidraw/excalidraw/i18n";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  runTransaction,
  Bytes,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes } from "firebase/storage";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type {
  ExcalidrawElement,
  FileId,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFileMetadata,
  DataURL,
} from "@excalidraw/excalidraw/types";

import { getLocalElementsWithExpiredDeletion } from "../collab/expiredDeletions";
import {
  excludeElementsOnDeletedPages,
  mergePageData,
  parsePageData,
  reconcileElementsByPage,
  restoreElementsByPage,
  serializePageData,
} from "../collab/pageSync";

import { FILE_CACHE_MAX_AGE_SEC } from "../app_constants";

import { getSyncableElements } from ".";

import type { SyncableExcalidrawElement } from ".";
import type { SharedPageData } from "../collab/pageSync";
import type Portal from "../collab/Portal";
import type { Socket } from "socket.io-client";

// private
// -----------------------------------------------------------------------------

let FIREBASE_CONFIG: Record<string, any>;
try {
  FIREBASE_CONFIG = JSON.parse(import.meta.env.VITE_APP_FIREBASE_CONFIG);
} catch (error: any) {
  console.warn(
    `Error JSON parsing firebase config. Supplied value: ${
      import.meta.env.VITE_APP_FIREBASE_CONFIG
    }`,
  );
  FIREBASE_CONFIG = {};
}

let firebaseApp: ReturnType<typeof initializeApp> | null = null;
let firestore: ReturnType<typeof getFirestore> | null = null;
let firebaseStorage: ReturnType<typeof getStorage> | null = null;

const _initializeFirebase = () => {
  if (!firebaseApp) {
    firebaseApp = initializeApp(FIREBASE_CONFIG);
  }
  return firebaseApp;
};

const _getFirestore = () => {
  if (!firestore) {
    firestore = getFirestore(_initializeFirebase());
  }
  return firestore;
};

const _getStorage = () => {
  if (!firebaseStorage) {
    firebaseStorage = getStorage(_initializeFirebase());
  }
  return firebaseStorage;
};

// -----------------------------------------------------------------------------

export const loadFirebaseStorage = async () => {
  return _getStorage();
};

type FirebaseStoredScene = {
  sceneVersion: number;
  iv: Bytes;
  ciphertext: Bytes;
  /**
   * the room's page data (#167), encrypted separately so the elements keep
   * their format. Missing in rooms saved before pages were shared.
   */
  pagesIv?: Bytes;
  pagesCiphertext?: Bytes;
};

/** what the room stores: every page's elements and the page data (#167) */
export type StoredRoom = {
  elements: readonly SyncableExcalidrawElement[];
  /** null when missing or invalid (see `parsePageData`) */
  pageData: SharedPageData | null;
};

const encryptJSON = async (
  key: string,
  value: unknown,
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> => {
  const json = JSON.stringify(value);
  const encoded = new TextEncoder().encode(json);
  const { encryptedBuffer, iv } = await encryptData(key, encoded);

  return { ciphertext: encryptedBuffer, iv };
};

const decryptJSON = async (
  ivBytes: Bytes,
  ciphertextBytes: Bytes,
  roomKey: string,
): Promise<unknown> => {
  const ciphertext = ciphertextBytes.toUint8Array() as Uint8Array<ArrayBuffer>;
  const iv = ivBytes.toUint8Array() as Uint8Array<ArrayBuffer>;

  const decrypted = await decryptData(iv, ciphertext, roomKey);
  const decodedData = new TextDecoder("utf-8").decode(
    new Uint8Array(decrypted),
  );
  return JSON.parse(decodedData);
};

const decryptElements = async (data: FirebaseStoredScene, roomKey: string) =>
  (await decryptJSON(
    data.iv,
    data.ciphertext,
    roomKey,
  )) as readonly ExcalidrawElement[];

const decryptPageData = async (
  data: FirebaseStoredScene,
  roomKey: string,
): Promise<SharedPageData | null> => {
  if (!data.pagesIv || !data.pagesCiphertext) {
    return null;
  }
  try {
    return parsePageData(
      await decryptJSON(data.pagesIv, data.pagesCiphertext, roomKey),
    );
  } catch (error: any) {
    console.error(error);
    return null;
  }
};

/** what was last saved to or loaded from the room, per socket */
class FirebaseSceneVersionCache {
  private static cache = new WeakMap<
    Socket,
    { sceneVersion: number; pageData: string | null }
  >();
  static get = (socket: Socket) => {
    return FirebaseSceneVersionCache.cache.get(socket);
  };
  static set = (
    socket: Socket,
    elements: readonly SyncableExcalidrawElement[],
    pageData: SharedPageData | null,
  ) => {
    FirebaseSceneVersionCache.cache.set(socket, {
      sceneVersion: getSceneVersion(elements),
      pageData: pageData && serializePageData(pageData),
    });
  };
}

/**
 * @param pageData the room's page data (#167): a page change is unsaved too.
 * Omit it to compare elements only.
 */
export const isSavedToFirebase = (
  portal: Portal,
  elements: readonly ExcalidrawElement[],
  pageData?: SharedPageData | null,
): boolean => {
  if (portal.socket && portal.roomId && portal.roomKey) {
    const saved = FirebaseSceneVersionCache.get(portal.socket);
    return (
      saved?.sceneVersion === getSceneVersion(elements) &&
      (pageData === undefined ||
        saved.pageData === (pageData && serializePageData(pageData)))
    );
  }
  // if no room exists, consider the room saved so that we don't unnecessarily
  // prevent unload (there's nothing we could do at that point anyway)
  return true;
};

export const saveFilesToFirebase = async ({
  prefix,
  files,
}: {
  prefix: string;
  files: { id: FileId; buffer: Uint8Array }[];
}) => {
  const storage = await loadFirebaseStorage();

  const erroredFiles: FileId[] = [];
  const savedFiles: FileId[] = [];

  await Promise.all(
    files.map(async ({ id, buffer }) => {
      try {
        const storageRef = ref(storage, `${prefix}/${id}`);
        await uploadBytes(storageRef, buffer, {
          cacheControl: `public, max-age=${FILE_CACHE_MAX_AGE_SEC}`,
        });
        savedFiles.push(id);
      } catch (error: any) {
        erroredFiles.push(id);
      }
    }),
  );

  return { savedFiles, erroredFiles };
};

const createFirebaseSceneDocument = async (
  elements: readonly SyncableExcalidrawElement[],
  pageData: SharedPageData | null,
  roomKey: string,
) => {
  const sceneVersion = getSceneVersion(elements);
  const { ciphertext, iv } = await encryptJSON(roomKey, elements);
  const pages = pageData && (await encryptJSON(roomKey, pageData));
  return {
    sceneVersion,
    ciphertext: Bytes.fromUint8Array(new Uint8Array(ciphertext)),
    iv: Bytes.fromUint8Array(iv),
    ...(pages
      ? {
          pagesCiphertext: Bytes.fromUint8Array(
            new Uint8Array(pages.ciphertext),
          ),
          pagesIv: Bytes.fromUint8Array(pages.iv),
        }
      : {}),
  } as FirebaseStoredScene;
};

/**
 * @param isKnownToRoom whether an element was ever in the room's scene as
 * far as this client knows. Local elements the stored scene no longer has
 * because their deletion expired aren't saved (see expiredDeletions.ts).
 * @param pageData our copy of the room's page data (#167), merged with the
 * stored copy
 * @returns what the room stores after the save, or null if nothing was saved
 */
export const saveToFirebase = async (
  portal: Portal,
  elements: readonly SyncableExcalidrawElement[],
  appState: AppState,
  isKnownToRoom?: (elementId: string) => boolean,
  pageData: SharedPageData | null = null,
): Promise<{
  elements: RemoteExcalidrawElement[];
  pageData: SharedPageData | null;
} | null> => {
  const { roomId, roomKey, socket } = portal;
  if (
    // bail if no room exists as there's nothing we can do at this point
    !roomId ||
    !roomKey ||
    !socket ||
    isSavedToFirebase(portal, elements, pageData)
  ) {
    return null;
  }

  const firestore = _getFirestore();
  const docRef = doc(firestore, "scenes", roomId);

  const storedScene = await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(docRef);

    if (!snapshot.exists()) {
      const storedScene = await createFirebaseSceneDocument(
        elements,
        pageData,
        roomKey,
      );

      transaction.set(docRef, storedScene);

      return storedScene;
    }

    const prevStoredScene = snapshot.data() as FirebaseStoredScene;
    const prevStoredElements = getSyncableElements(
      // page by page (#167)
      restoreElementsByPage(
        await decryptElements(prevStoredScene, roomKey),
        null,
      ),
    );
    // don't save our live copies of elements whose deletion expired
    const expiredIds = isKnownToRoom
      ? new Set(
          getLocalElementsWithExpiredDeletion(
            elements,
            new Set(prevStoredElements.map((el) => el.id)),
            isKnownToRoom,
          ).map((el) => el.id),
        )
      : new Set<string>();
    const reconciledElements = getSyncableElements(
      reconcileElementsByPage(
        elements.filter((el) => !expiredIds.has(el.id)),
        prevStoredElements as OrderedExcalidrawElement[] as RemoteExcalidrawElement[],
        appState,
      ),
    );
    // the same merge as for peers' page data, so storage converges too
    const prevPageData = await decryptPageData(prevStoredScene, roomKey);
    const mergedPageData =
      pageData && prevPageData
        ? mergePageData(prevPageData, pageData, t("labels.page"))
        : pageData ?? prevPageData;

    const storedScene = await createFirebaseSceneDocument(
      // a deleted page's elements go with it, whoever still had them
      mergedPageData
        ? excludeElementsOnDeletedPages(reconciledElements, mergedPageData)
        : reconciledElements,
      mergedPageData,
      roomKey,
    );

    transaction.update(docRef, storedScene);

    // Return the stored elements as the in memory `reconciledElements` could have mutated in the meantime
    return storedScene;
  });

  const storedElements = getSyncableElements(
    restoreElementsByPage(await decryptElements(storedScene, roomKey), null),
  );
  const storedPageData = await decryptPageData(storedScene, roomKey);

  FirebaseSceneVersionCache.set(socket, storedElements, storedPageData);

  return {
    elements: toBrandedType<RemoteExcalidrawElement[]>(storedElements),
    pageData: storedPageData,
  };
};

export const loadFromFirebase = async (
  roomId: string,
  roomKey: string,
  socket: Socket | null,
): Promise<StoredRoom | null> => {
  const firestore = _getFirestore();
  const docRef = doc(firestore, "scenes", roomId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    return null;
  }
  const storedScene = docSnap.data() as FirebaseStoredScene;
  const elements = getSyncableElements(
    restoreElementsByPage(await decryptElements(storedScene, roomKey), null, {
      deleteInvisibleElements: true,
    }),
  );
  const pageData = await decryptPageData(storedScene, roomKey);

  if (socket) {
    FirebaseSceneVersionCache.set(socket, elements, pageData);
  }

  return { elements, pageData };
};

export const loadFilesFromFirebase = async (
  prefix: string,
  decryptionKey: string,
  filesIds: readonly FileId[],
) => {
  const loadedFiles: BinaryFileData[] = [];
  const erroredFiles = new Map<FileId, true>();

  await Promise.all(
    [...new Set(filesIds)].map(async (id) => {
      try {
        const url = `https://firebasestorage.googleapis.com/v0/b/${
          FIREBASE_CONFIG.storageBucket
        }/o/${encodeURIComponent(prefix.replace(/^\//, ""))}%2F${id}`;
        const response = await fetch(`${url}?alt=media`);
        if (response.status < 400) {
          const arrayBuffer = await response.arrayBuffer();

          const { data, metadata } = await decompressData<BinaryFileMetadata>(
            new Uint8Array(arrayBuffer),
            {
              decryptionKey,
            },
          );

          const dataURL = new TextDecoder().decode(data) as DataURL;

          loadedFiles.push({
            mimeType: metadata.mimeType || MIME_TYPES.binary,
            id,
            dataURL,
            created: metadata?.created || Date.now(),
            lastRetrieved: metadata?.created || Date.now(),
          });
        } else {
          erroredFiles.set(id, true);
        }
      } catch (error: any) {
        erroredFiles.set(id, true);
        console.error(error);
      }
    }),
  );

  return { loadedFiles, erroredFiles };
};
