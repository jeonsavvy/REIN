import { generatePaymentId } from "@x402/extensions/payment-identifier";
import { addAtomic, formatUsdcAtomic, parseAtomic } from "./amount";
import { loadCatalog } from "./catalog";
import {
  DEVNET_USDC_MINT,
  MAX_DAILY_ATOMIC,
  PRODUCT_DEFINITIONS,
  RUN_TIMEOUT_MS,
  SOLANA_DEVNET,
} from "./constants";
import { makePaymentFingerprint } from "./crypto";
import {
  PolicyDeniedError,
  ProofBuyError,
  toRunError,
} from "./errors";
import {
  getPaymentGateway,
  productRouteFor,
  type PaymentGateway,
} from "./payment";
import { getPlanner, type ProcurementPlanner } from "./planner";
import { validatePaymentCandidate, validatePlannerSelection } from "./policy";
import { getStore } from "./store";
import { kstDateKey, type NewRunEvent, type ProofBuyStore } from "./storage";
import type {
  CatalogProduct,
  PaymentRecord,
  PurchasedEvidence,
  RunRecord,
} from "./types";

export interface RunDependencies {
  store?: ProofBuyStore;
  planner?: ProcurementPlanner;
  gateway?: PaymentGateway;
  catalogLoader?: (store: ProofBuyStore) => Promise<CatalogProduct[]>;
  baseUrl?: string;
  signal?: AbortSignal;
}

function combinedSignal(parent?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(RUN_TIMEOUT_MS);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

async function emit(
  store: ProofBuyStore,
  runId: string,
  event: NewRunEvent,
): Promise<void> {
  await store.appendEvent(runId, event);
}

function selectedTotal(
  selections: Array<{ productId: keyof typeof PRODUCT_DEFINITIONS }>,
): string {
  return selections
    .reduce(
      (sum, selection) =>
        sum + parseAtomic(PRODUCT_DEFINITIONS[selection.productId].priceAtomic),
      0n,
    )
    .toString();
}

async function markFailure(
  store: ProofBuyStore,
  run: RunRecord,
  error: unknown,
): Promise<void> {
  const detail = toRunError(error);
  const reconciling =
    error instanceof ProofBuyError && error.ambiguousSettlement;
  const denied = error instanceof PolicyDeniedError;
  const status = reconciling ? "reconciling" : denied ? "denied" : "failed";
  await store.updateRun(run.id, {
    status,
    error: detail,
    completedAt: new Date().toISOString(),
  });
  await emit(store, run.id, {
    type: reconciling
      ? "payment.reconciling"
      : denied
        ? "policy.denied"
        : "run.error",
    tone: reconciling ? "warning" : "danger",
    title: reconciling
      ? "Settlement needs reconciliation"
      : denied
        ? "Policy denied purchase"
        : "Run stopped safely",
    detail: `${detail.message} ${detail.recovery}`,
  });
}

export async function executeRun(
  runId: string,
  dependencies: RunDependencies = {},
): Promise<void> {
  const store = dependencies.store ?? getStore();
  const run = await store.getRun(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  if (run.status !== "running") return;
  const planner = dependencies.planner ?? getPlanner(run.mode);
  const gateway = dependencies.gateway ?? getPaymentGateway(run.mode);
  const catalogLoader = dependencies.catalogLoader ?? loadCatalog;
  const signal = combinedSignal(dependencies.signal);
  const baseUrl =
    dependencies.baseUrl ?? process.env.APP_BASE_URL ?? "http://localhost:3000";

  try {
    await emit(store, run.id, {
      type: "run.started",
      tone: "pending",
      title: "Procurement run started",
      detail:
        run.mode === "live"
          ? "Gemini 3.5 Flash가 허용된 상품만 평가합니다."
          : "안전한 demo mode입니다. 블록체인 거래를 서명하거나 전송하지 않습니다.",
    });

    const catalog = await catalogLoader(store);
    const availableCount = catalog.filter((product) => product.available).length;
    await emit(store, run.id, {
      type: "catalog.loaded",
      tone: availableCount > 0 ? "neutral" : "warning",
      title: "Catalog refreshed",
      detail: `${availableCount}/${catalog.length}개 상품의 결제 전 스냅샷이 준비되었습니다.`,
    });
    if (availableCount === 0) {
      throw new ProofBuyError({
        code: "UPSTREAM_UNAVAILABLE",
        message: "구매 가능한 데이터 소스가 없습니다.",
        recovery: "CoinGecko와 GitHub 상태를 확인한 뒤 다시 실행하세요.",
      });
    }

    const plan = await planner.plan({
      goal: run.goal,
      maxBudgetAtomic: run.maxBudgetAtomic,
      catalog,
      signal,
    });
    for (const selection of plan.selections) {
      await emit(store, run.id, {
        type: "choice.explained",
        tone: "neutral",
        title: `${PRODUCT_DEFINITIONS[selection.productId].name} selected`,
        detail: selection.rationale,
        productId: selection.productId,
        amountAtomic: PRODUCT_DEFINITIONS[selection.productId].priceAtomic,
      });
    }
    if (plan.selections.length === 0) {
      throw new PolicyDeniedError(plan.decisionSummary);
    }
    const selections = validatePlannerSelection(
      plan,
      catalog,
      run.maxBudgetAtomic,
    );
    const totalAtomic = selectedTotal(selections);
    await emit(store, run.id, {
      type: "policy.approved",
      tone: "success",
      title: "Deterministic policy approved",
      detail: `${formatUsdcAtomic(totalAtomic)} 테스트 USDC가 ${formatUsdcAtomic(run.maxBudgetAtomic)} 한도 안에 있습니다.`,
      amountAtomic: totalAtomic,
    });

    const evidence: PurchasedEvidence[] = [];
    for (const selection of selections) {
      signal.throwIfAborted();
      const product = catalog.find((item) => item.id === selection.productId);
      if (!product?.snapshotId) {
        throw new ProofBuyError({
          code: "UPSTREAM_UNAVAILABLE",
          message: `${selection.productId} 스냅샷이 만료되었거나 없습니다.`,
          recovery: "새 run을 만들어 결제 전 스냅샷을 갱신하세요.",
        });
      }
      const snapshot = await store.getSnapshot(product.snapshotId);
      if (!snapshot || snapshot.productId !== selection.productId) {
        throw new ProofBuyError({
          code: "UPSTREAM_UNAVAILABLE",
          message: `${selection.productId} 스냅샷 payload를 찾을 수 없습니다.`,
          recovery: "새 run을 만들어 결제 전 스냅샷을 갱신하세요.",
        });
      }
      const payTo =
        run.mode === "live" ? process.env.SVM_PAY_TO : "demo-receiver-no-wallet";
      if (!payTo) {
        throw new ProofBuyError({
          code: "PAYMENT_FAILED",
          message: "SVM_PAY_TO가 설정되지 않았습니다.",
          recovery: "Devnet 수취 주소를 Cloud Run 환경 변수로 설정하세요.",
        });
      }
      const paymentId = generatePaymentId("proofbuy_");
      const route = productRouteFor(selection.productId);
      const requestFingerprint = makePaymentFingerprint({
        method: "GET",
        route,
        snapshotId: product.snapshotId,
        snapshotHash: snapshot.requestHash,
        network: SOLANA_DEVNET,
        asset: DEVNET_USDC_MINT,
        amountAtomic: product.priceAtomic,
        payTo,
      });
      validatePaymentCandidate({
        productId: selection.productId,
        amountAtomic: product.priceAtomic,
        network: SOLANA_DEVNET,
        asset: DEVNET_USDC_MINT,
        payTo,
        route,
      });
      const now = new Date().toISOString();
      const payment: PaymentRecord = {
        id: paymentId,
        runId: run.id,
        productId: selection.productId,
        snapshotId: product.snapshotId,
        snapshotHash: snapshot.requestHash,
        quotaKey: kstDateKey(),
        requestFingerprint,
        amountAtomic: product.priceAtomic,
        network: SOLANA_DEVNET,
        asset: DEVNET_USDC_MINT,
        payTo,
        status: "reserved",
        createdAt: now,
        updatedAt: now,
      };
      await store.reservePayment({
        payment,
        dailyLimitAtomic: MAX_DAILY_ATOMIC.toString(),
      });
      await emit(store, run.id, {
        type: "payment.requested",
        tone: "pending",
        title: `HTTP 402 · ${PRODUCT_DEFINITIONS[selection.productId].shortName}`,
        detail: `${formatUsdcAtomic(product.priceAtomic)} 테스트 USDC 결제를 요청했습니다.`,
        productId: selection.productId,
        amountAtomic: product.priceAtomic,
      });

      try {
        const result = await gateway.purchase({
          payment,
          baseUrl,
          signal,
        });
        await store.settlePayment(payment.id, result.receipt);
        const item: PurchasedEvidence = {
          productId: selection.productId,
          snapshotId: result.snapshot.id,
          data: result.snapshot.data,
          receipt: result.receipt,
        };
        await store.saveEvidence(run.id, item);
        evidence.push(item);
        await emit(store, run.id, {
          type: "payment.settled",
          tone: "success",
          title:
            run.mode === "live"
              ? "Devnet payment settled"
              : "Demo payment simulated",
          detail:
            run.mode === "live"
              ? "영수증과 Solana 거래 서명을 저장했습니다."
              : "온체인 거래가 아닌 명시적 demo receipt를 저장했습니다.",
          productId: selection.productId,
          amountAtomic: product.priceAtomic,
          receipt: result.receipt,
        });
        await emit(store, run.id, {
          type: "data.received",
          tone: "success",
          title: `${PRODUCT_DEFINITIONS[selection.productId].name} received`,
          detail: `고정된 snapshot ${result.snapshot.id.slice(0, 24)}…을 보고서 근거에 추가했습니다.`,
          productId: selection.productId,
        });
      } catch (error) {
        const ambiguous =
          error instanceof ProofBuyError && error.ambiguousSettlement;
        await store.failPayment(
          payment.id,
          error instanceof Error ? error.message : "payment failed",
          ambiguous,
        );
        throw error;
      }
    }

    const brief = await planner.synthesize({ goal: run.goal, evidence, signal });
    await store.updateRun(run.id, {
      status: "completed",
      summary: brief,
      reservedAtomic: "0",
      spentAtomic: evidence
        .map((item) => item.receipt.amountAtomic)
        .reduce((total, amount) => addAtomic(total, amount), "0"),
      completedAt: new Date().toISOString(),
    });
    await emit(store, run.id, {
      type: "report.completed",
      tone: "success",
      title: "Evidence brief completed",
      detail: `${evidence.length}개 구매 근거로 보고서를 작성했습니다.`,
    });
  } catch (error) {
    await markFailure(store, run, error);
  }
}
