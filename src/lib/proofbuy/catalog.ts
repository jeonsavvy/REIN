import { z } from "zod";
import {
  PRODUCT_DEFINITIONS,
  PRODUCT_IDS,
  SNAPSHOT_TTL_MS,
} from "./constants";
import { createId, sha256 } from "./crypto";
import type { ProofBuyStore } from "./storage";
import type {
  CatalogProduct,
  GithubHealthData,
  MarketSnapshotData,
  ProductId,
  Snapshot,
  SnapshotData,
} from "./types";

type FetchLike = typeof fetch;

const coinGeckoSchema = z.object({
  solana: z.object({
    usd: z.number(),
    usd_24h_change: z.number(),
    usd_market_cap: z.number(),
  }),
  ethereum: z.object({
    usd: z.number(),
    usd_24h_change: z.number(),
    usd_market_cap: z.number(),
  }),
});

const githubRepoSchema = z.object({
  stargazers_count: z.number().int().nonnegative(),
  forks_count: z.number().int().nonnegative(),
  open_issues_count: z.number().int().nonnegative(),
  pushed_at: z.string().datetime(),
});

const commitsSchema = z.array(
  z.object({
    sha: z.string(),
  }),
);

async function fetchJson(
  url: string,
  schema: z.ZodType,
  fetcher: FetchLike,
  headers: HeadersInit = {},
): Promise<unknown> {
  const response = await fetcher(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Upstream ${new URL(url).hostname} returned ${response.status}`);
  }
  return schema.parse(await response.json());
}

async function fetchMarketSnapshot(fetcher: FetchLike): Promise<MarketSnapshotData> {
  const url =
    "https://api.coingecko.com/api/v3/simple/price" +
    "?ids=solana,ethereum&vs_currencies=usd" +
    "&include_24hr_change=true&include_market_cap=true";
  const raw = (await fetchJson(url, coinGeckoSchema, fetcher, {
    Accept: "application/json",
    "User-Agent": "REIN/0.1 hackathon-demo",
  })) as z.infer<typeof coinGeckoSchema>;
  return {
    kind: "market_snapshot",
    asOf: new Date().toISOString(),
    assets: [
      {
        symbol: "SOL",
        priceUsd: raw.solana.usd,
        change24hPct: raw.solana.usd_24h_change,
        marketCapUsd: raw.solana.usd_market_cap,
      },
      {
        symbol: "ETH",
        priceUsd: raw.ethereum.usd,
        change24hPct: raw.ethereum.usd_24h_change,
        marketCapUsd: raw.ethereum.usd_market_cap,
      },
    ],
  };
}

async function fetchGithubRepository(
  ecosystem: "Solana" | "Ethereum",
  repository: string,
  fetcher: FetchLike,
): Promise<GithubHealthData["repositories"][number]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "REIN/0.1 hackathon-demo",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const [metadata, commits] = await Promise.all([
    fetchJson(
      `https://api.github.com/repos/${repository}`,
      githubRepoSchema,
      fetcher,
      headers,
    ) as Promise<z.infer<typeof githubRepoSchema>>,
    fetchJson(
      `https://api.github.com/repos/${repository}/commits?since=${encodeURIComponent(since)}&per_page=100`,
      commitsSchema,
      fetcher,
      headers,
    ) as Promise<z.infer<typeof commitsSchema>>,
  ]);
  return {
    ecosystem,
    repository,
    stars: metadata.stargazers_count,
    forks: metadata.forks_count,
    openIssues: metadata.open_issues_count,
    commits30d: commits.length,
    commits30dCapped: commits.length === 100,
    pushedAt: metadata.pushed_at,
  };
}

async function fetchGithubHealth(fetcher: FetchLike): Promise<GithubHealthData> {
  const repositories = await Promise.all([
    fetchGithubRepository("Solana", "anza-xyz/agave", fetcher),
    fetchGithubRepository("Ethereum", "ethereum/go-ethereum", fetcher),
  ]);
  return {
    kind: "github_health",
    asOf: new Date().toISOString(),
    repositories,
  };
}

async function createSnapshot(
  productId: ProductId,
  fetcher: FetchLike,
): Promise<Snapshot> {
  const definition = PRODUCT_DEFINITIONS[productId];
  const data: SnapshotData =
    productId === "market_snapshot"
      ? await fetchMarketSnapshot(fetcher)
      : await fetchGithubHealth(fetcher);
  const fetchedAt = new Date().toISOString();
  return {
    id: createId(`snap_${productId}`),
    productId,
    sourceName: definition.sourceName,
    sourceUrl: definition.sourceUrl,
    fetchedAt,
    expiresAt: new Date(Date.now() + SNAPSHOT_TTL_MS).toISOString(),
    requestHash: sha256(JSON.stringify(data)),
    data,
  };
}

async function refreshProduct(
  store: ProofBuyStore,
  productId: ProductId,
  fetcher: FetchLike,
): Promise<CatalogProduct> {
  const definition = PRODUCT_DEFINITIONS[productId];
  try {
    let snapshot = await store.getFreshSnapshot(productId);
    if (!snapshot) {
      snapshot = await createSnapshot(productId, fetcher);
      await store.saveSnapshot(snapshot);
    }
    return {
      ...definition,
      available: true,
      snapshotId: snapshot.id,
      fetchedAt: snapshot.fetchedAt,
      expiresAt: snapshot.expiresAt,
    };
  } catch (error) {
    return {
      ...definition,
      available: false,
      unavailableReason:
        error instanceof Error
          ? error.message.replace(/[\r\n]/g, " ").slice(0, 140)
          : "Upstream source unavailable",
    };
  }
}

export async function refreshCatalog(
  store: ProofBuyStore,
  fetcher: FetchLike = fetch,
): Promise<CatalogProduct[]> {
  return Promise.all(
    PRODUCT_IDS.map((productId) => refreshProduct(store, productId, fetcher)),
  );
}

export async function loadCatalog(
  store: ProofBuyStore,
  fetcher: FetchLike = fetch,
): Promise<CatalogProduct[]> {
  if (process.env.PROOFBUY_UPSTREAM_MODE === "fixture") {
    const { loadFixtureCatalog } = await import("./catalog-fixtures");
    return loadFixtureCatalog(store);
  }
  return refreshCatalog(store, fetcher);
}

export function staticCatalog(): CatalogProduct[] {
  return PRODUCT_IDS.map((productId) => ({
    ...PRODUCT_DEFINITIONS[productId],
    available: false,
    unavailableReason: "Freshness check pending",
  }));
}
