import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFixtureCatalog } from "@/lib/proofbuy/catalog-fixtures";
import { refreshCatalog } from "@/lib/proofbuy/catalog";
import { MemoryProofBuyStore } from "@/lib/proofbuy/storage-memory";

const store = new MemoryProofBuyStore();

describe("catalog snapshot availability", () => {
  beforeEach(async () => {
    await store.reset();
  });

  it("marks every product unavailable when upstreams fail before snapshotting", async () => {
    const failingFetch = vi.fn(async () => new Response("down", { status: 503 }));
    const catalog = await refreshCatalog(store, failingFetch as typeof fetch);
    expect(catalog).toHaveLength(2);
    expect(catalog.every((product) => !product.available)).toBe(true);
    expect(catalog.every((product) => product.unavailableReason?.includes("503"))).toBe(true);
  });

  it("returns a fresh cached snapshot without charging before an upstream retry", async () => {
    await loadFixtureCatalog(store);
    const failingFetch = vi.fn(async () => new Response("down", { status: 503 }));
    const catalog = await refreshCatalog(store, failingFetch as typeof fetch);
    expect(catalog.every((product) => product.available)).toBe(true);
    expect(failingFetch).not.toHaveBeenCalled();
  });
});
