import {
  DEVNET_USDC_MINT,
  MAX_PURCHASE_ATOMIC,
  MAX_RUN_ATOMIC,
  PRODUCT_DEFINITIONS,
  PRODUCT_IDS,
  SOLANA_DEVNET,
} from "./constants";
import { PolicyDeniedError } from "./errors";
import { parseAtomic } from "./amount";
import type {
  CatalogProduct,
  ProcurementPlan,
  ProcurementSelection,
  ProductId,
} from "./types";

export interface PaymentPolicyCandidate {
  productId: ProductId;
  amountAtomic: string;
  network: string;
  asset: string;
  payTo: string;
  route: string;
}

export function validateRunBudget(maxBudgetAtomic: string): bigint {
  const budget = parseAtomic(maxBudgetAtomic, "maxBudgetAtomic");
  if (budget > MAX_RUN_ATOMIC) {
    throw new PolicyDeniedError(
      `실행 예산은 ${MAX_RUN_ATOMIC.toString()} atomic USDC를 초과할 수 없습니다.`,
    );
  }
  return budget;
}

export function validatePlannerSelection(
  plan: ProcurementPlan,
  catalog: CatalogProduct[],
  maxBudgetAtomic: string,
): ProcurementSelection[] {
  const budget = validateRunBudget(maxBudgetAtomic);
  const byId = new Map(catalog.map((product) => [product.id, product]));
  const seen = new Set<ProductId>();
  let total = 0n;

  if (plan.selections.length > PRODUCT_IDS.length) {
    throw new PolicyDeniedError("허용된 상품 수를 초과했습니다.");
  }

  for (const selection of plan.selections) {
    if (!PRODUCT_IDS.includes(selection.productId)) {
      throw new PolicyDeniedError("카탈로그 밖 상품은 구매할 수 없습니다.");
    }
    if (seen.has(selection.productId)) {
      throw new PolicyDeniedError("같은 상품을 한 실행에서 중복 구매할 수 없습니다.");
    }
    seen.add(selection.productId);

    const product = byId.get(selection.productId);
    if (!product?.available || !product.snapshotId) {
      throw new PolicyDeniedError(`${selection.productId} 상품을 현재 구매할 수 없습니다.`);
    }
    total += parseAtomic(product.priceAtomic);
  }

  if (total > budget) {
    throw new PolicyDeniedError(
      `선택 금액 ${total.toString()}이 실행 예산 ${budget.toString()}을 초과합니다.`,
    );
  }
  return plan.selections;
}

export function validatePaymentCandidate(candidate: PaymentPolicyCandidate): void {
  const product = PRODUCT_DEFINITIONS[candidate.productId];
  const amount = parseAtomic(candidate.amountAtomic);
  if (amount > MAX_PURCHASE_ATOMIC) {
    throw new PolicyDeniedError("구매당 상한을 초과했습니다.");
  }
  if (candidate.network !== SOLANA_DEVNET) {
    throw new PolicyDeniedError("Solana Devnet 이외 네트워크는 허용되지 않습니다.");
  }
  if (candidate.asset !== DEVNET_USDC_MINT) {
    throw new PolicyDeniedError("Circle Devnet USDC 이외 자산은 허용되지 않습니다.");
  }
  if (!candidate.payTo.trim()) {
    throw new PolicyDeniedError("수취 주소가 비어 있습니다.");
  }
  if (candidate.amountAtomic !== product.priceAtomic) {
    throw new PolicyDeniedError("고정 카탈로그 가격과 결제 금액이 다릅니다.");
  }
  if (candidate.route !== product.route) {
    throw new PolicyDeniedError("고정 카탈로그 경로와 요청 경로가 다릅니다.");
  }
}
