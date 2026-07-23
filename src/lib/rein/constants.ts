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
export const MODEL_PLAN_TIMEOUT_MS = 20_000;
export const MODEL_REPORT_TIMEOUT_MS = 20_000;
export const MAX_REPORT_SYNTHESIS_ATTEMPTS = 2;
export const MAX_REPORT_RECOVERY_ATTEMPTS = 2;
export const REPORT_RECOVERY_STALE_MS = 60_000;
export const RUN_TIMEOUT_MS = 90_000;
export const MAX_DAILY_RUN_ADMISSIONS = 100;
export const MAX_DAILY_RUN_ADMISSIONS_PER_CLIENT = 25;
export const MAX_DAILY_MODEL_CREDITS = 400;
export const MAX_DAILY_MODEL_CREDITS_PER_CLIENT = 100;
export const RUN_MODEL_CREDITS = 3;
export const REPORT_RECOVERY_MODEL_CREDITS = 2;

export const PRODUCT_DEFINITIONS: Record<ProductId, ProductDefinition> = {
  market_snapshot: {
    id: "market_snapshot",
    name: "시장 스냅샷",
    shortName: "시장 데이터",
    description:
      "SOL과 ETH의 USD 가격, 24시간 변화율, 시가총액을 같은 시점에 비교합니다.",
    priceAtomic: "1000",
    sourceName: "CoinGecko Public API",
    sourceUrl: "https://api.coingecko.com/api/v3",
    route: "/api/products/market-snapshot",
  },
  github_health: {
    id: "github_health",
    name: "GitHub 개발 활동",
    shortName: "개발 데이터",
    description:
      "Solana Agave와 go-ethereum의 최근 커밋 수, 스타, 포크, 이슈를 비교합니다.",
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
