import { FirestoreReinStore } from "./storage-firestore";
import { MemoryReinStore } from "./storage-memory";
import type { ReinStore } from "./storage";
import type { StorageMode } from "./types";

const globalForStore = globalThis as typeof globalThis & {
  __reinStore?: ReinStore;
  __reinStoreMode?: StorageMode;
};

export function getStorageMode(): StorageMode {
  return process.env.REIN_STORAGE === "firestore" ? "firestore" : "memory";
}

export function getStore(): ReinStore {
  const mode = getStorageMode();
  if (!globalForStore.__reinStore || globalForStore.__reinStoreMode !== mode) {
    globalForStore.__reinStore =
      mode === "firestore" ? new FirestoreReinStore() : new MemoryReinStore();
    globalForStore.__reinStoreMode = mode;
  }
  return globalForStore.__reinStore;
}
