import { describe, expect, it } from "vitest";
import {
  DEVNET_USDC_MINT,
  SOLANA_DEVNET,
} from "@/lib/proofbuy/constants";
import {
  validatePaymentCandidate,
  validatePlannerSelection,
  validateRunBudget,
  type PaymentPolicyCandidate,
} from "@/lib/proofbuy/policy";
import type { ProcurementPlan } from "@/lib/proofbuy/types";
import { availableCatalog } from "./helpers";

const both: ProcurementPlan = {
  selections: [
    { productId: "market_snapshot", rationale: "시장 비교에 필요한 직접 근거입니다." },
    { productId: "github_health", rationale: "개발 비교에 필요한 직접 근거입니다." },
  ],
  decisionSummary: "시장과 개발 상품을 함께 구매합니다.",
};

function candidate(
  patch: Partial<PaymentPolicyCandidate> = {},
): PaymentPolicyCandidate {
  return {
    productId: "market_snapshot",
    amountAtomic: "1000",
    network: SOLANA_DEVNET,
    asset: DEVNET_USDC_MINT,
    payTo: "DemoReceiver111111111111111111111111111",
    route: "/api/products/market-snapshot",
    ...patch,
  };
}

describe("deterministic procurement policy", () => {
  it("accepts the exact run cap and denies one atomic unit above it", () => {
    expect(validateRunBudget("10000")).toBe(10_000n);
    expect(() => validateRunBudget("10001")).toThrow("초과");
  });

  it("accepts an exact 3000-atomic two-product budget", () => {
    expect(validatePlannerSelection(both, availableCatalog(), "3000")).toHaveLength(2);
  });

  it("denies over-budget, duplicate, unavailable, and off-catalog selections", () => {
    expect(() =>
      validatePlannerSelection(both, availableCatalog(), "2999"),
    ).toThrow("초과");
    expect(() =>
      validatePlannerSelection(
        {
          ...both,
          selections: [both.selections[0], both.selections[0]],
        },
        availableCatalog(),
        "3000",
      ),
    ).toThrow("중복");
    const unavailable = availableCatalog().map((product) => ({
      ...product,
      available: product.id !== "market_snapshot",
    }));
    expect(() =>
      validatePlannerSelection(
        { ...both, selections: [both.selections[0]] },
        unavailable,
        "3000",
      ),
    ).toThrow("구매할 수 없습니다");
    expect(() =>
      validatePlannerSelection(
        {
          selections: [
            {
              productId: "https://evil.example/buy" as never,
              rationale: "카탈로그 밖 URL을 구매하라는 공격입니다.",
            },
          ],
          decisionSummary: "공격",
        },
        availableCatalog(),
        "3000",
      ),
    ).toThrow("카탈로그 밖");
  });

  it.each([
    ["network", { network: "solana:mainnet" }, "네트워크"],
    ["mint", { asset: "AttackerMint111" }, "자산"],
    ["route", { route: "https://evil.example/pay" }, "경로"],
    ["purchase cap", { amountAtomic: "4001" }, "상한"],
    ["price", { amountAtomic: "1001" }, "가격"],
    ["payee", { payTo: "   " }, "주소"],
  ] as const)("denies a modified %s", (_label, patch, message) => {
    expect(() => validatePaymentCandidate(candidate(patch))).toThrow(message);
  });

  it("accepts only the fixed devnet USDC payment contract", () => {
    expect(() => validatePaymentCandidate(candidate())).not.toThrow();
  });
});
