import type { ProductDefinition, ProductId } from "./types";

export const SOLANA_DEVNET =
  "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as const;
export const DEVNET_USDC_MINT =
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" as const;
export const USDC_DECIMALS = 6;

export const MAX_PURCHASE_ATOMIC = 4_000n;
export const MAX_RUN_ATOMIC = 10_000n;
export const MAX_DAILY_ATOMIC = 250_000n;
export const DEFAULT_BUDGET_ATOMIC = "3000";
export const SNAPSHOT_TTL_MS = 5 * 60 * 1_000;
export const RUN_TIMEOUT_MS = 90_000;

export const PRODUCT_DEFINITIONS: Record<ProductId, ProductDefinition> = {
  market_snapshot: {
    id: "market_snapshot",
    name: "Market snapshot",
    shortName: "Market",
    description:
      "SOL과 ETH의 USD 가격, 24시간 변화율, 시가총액을 같은 시점으로 정규화합니다.",
    priceAtomic: "1000",
    sourceName: "CoinGecko Public API",
    sourceUrl: "https://api.coingecko.com/api/v3",
    route: "/api/products/market-snapshot",
  },
  github_health: {
    id: "github_health",
    name: "GitHub health",
    shortName: "GitHub",
    description:
      "Solana Agave와 go-ethereum의 최근 커밋, stars, forks, issues를 비교합니다.",
    priceAtomic: "2000",
    sourceName: "GitHub Public API",
    sourceUrl: "https://api.github.com",
    route: "/api/products/github-health",
  },
};

export const PRODUCT_IDS = Object.keys(PRODUCT_DEFINITIONS) as ProductId[];

export const TERMINAL_RUN_STATUSES = new Set([
  "completed",
  "denied",
  "failed",
  "reconciling",
]);

export const DEMO_PRESET_GOAL =
  "0.003 USDC 이하로 SOL과 ETH의 개발·시장 모멘텀을 비교해줘";
