import { PRODUCT_DEFINITIONS, PRODUCT_IDS, SNAPSHOT_TTL_MS } from "./constants";
import { createId, sha256 } from "./crypto";
import type { ReinStore } from "./storage";
import type { CatalogProduct, ProductId, Snapshot, SnapshotData } from "./types";

function fixtureData(productId: ProductId): SnapshotData {
  if (productId === "market_snapshot") {
    return {
      kind: "market_snapshot",
      asOf: new Date().toISOString(),
      assets: [
        {
          symbol: "SOL",
          priceUsd: 182.42,
          change24hPct: 4.18,
          marketCapUsd: 86_500_000_000,
        },
        {
          symbol: "ETH",
          priceUsd: 4_820.11,
          change24hPct: 1.76,
          marketCapUsd: 581_000_000_000,
        },
      ],
    };
  }
  return {
    kind: "github_health",
    asOf: new Date().toISOString(),
    repositories: [
      {
        ecosystem: "Solana",
        repository: "anza-xyz/agave",
        stars: 3_820,
        forks: 1_240,
        openIssues: 418,
        commits30d: 96,
        commits30dCapped: false,
        pushedAt: new Date().toISOString(),
      },
      {
        ecosystem: "Ethereum",
        repository: "ethereum/go-ethereum",
        stars: 51_200,
        forks: 21_800,
        openIssues: 318,
        commits30d: 71,
        commits30dCapped: false,
        pushedAt: new Date().toISOString(),
      },
    ],
  };
}

export async function loadFixtureCatalog(
  store: ReinStore,
): Promise<CatalogProduct[]> {
  const products: CatalogProduct[] = [];
  for (const productId of PRODUCT_IDS) {
    let snapshot = await store.getFreshSnapshot(productId);
    if (!snapshot) {
      const data = fixtureData(productId);
      const now = new Date();
      snapshot = {
        id: createId(`fixture_${productId}`),
        productId,
        sourceName: `${PRODUCT_DEFINITIONS[productId].sourceName} test fixture`,
        sourceUrl: PRODUCT_DEFINITIONS[productId].sourceUrl,
        fetchedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + SNAPSHOT_TTL_MS).toISOString(),
        requestHash: sha256(JSON.stringify(data)),
        data,
      } satisfies Snapshot;
      await store.saveSnapshot(snapshot);
    }
    products.push({
      ...PRODUCT_DEFINITIONS[productId],
      available: true,
      snapshotId: snapshot.id,
      fetchedAt: snapshot.fetchedAt,
      expiresAt: snapshot.expiresAt,
    });
  }
  return products;
}
