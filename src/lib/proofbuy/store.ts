import { FirestoreProofBuyStore } from "./storage-firestore";
import { MemoryProofBuyStore } from "./storage-memory";
import type { ProofBuyStore } from "./storage";
import type { StorageMode } from "./types";

const globalForStore = globalThis as typeof globalThis & {
  __proofBuyStore?: ProofBuyStore;
  __proofBuyStoreMode?: StorageMode;
};

export function getStorageMode(): StorageMode {
  return process.env.PROOFBUY_STORAGE === "firestore" ? "firestore" : "memory";
}

export function getStore(): ProofBuyStore {
  const mode = getStorageMode();
  if (!globalForStore.__proofBuyStore || globalForStore.__proofBuyStoreMode !== mode) {
    globalForStore.__proofBuyStore =
      mode === "firestore" ? new FirestoreProofBuyStore() : new MemoryProofBuyStore();
    globalForStore.__proofBuyStoreMode = mode;
  }
  return globalForStore.__proofBuyStore;
}
