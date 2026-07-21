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
import {
  DemoProcurementPlanner,
  getPlanner,
  type ProcurementPlanner,
} from "./planner";
import { validatePaymentCandidate, validatePlannerSelection } from "./policy";
import { getStore } from "./store";
import { kstDateKey, type NewRunEvent, type ProofBuyStore } from "./storage";
import type {
  CatalogProduct,
  PaymentRecord,
  ProcurementPlan,
  PurchasedEvidence,
  ResearchBrief,
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

function isRecoverableModelFailure(error: unknown): boolean {
  if (error instanceof ProofBuyError) {
    return error.detail.code === "MODEL_TIMEOUT" || error.detail.code === "MODEL_ERROR";
  }
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
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
      ? "결제 확인이 필요합니다"
      : denied
        ? "예산 정책이 구매를 중단했습니다"
        : "실행을 중단했습니다",
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
      title: "조사를 시작했습니다",
      detail:
        run.mode === "live"
          ? "Gemini 3.5 Flash가 허용된 상품만 평가합니다."
          : "데모 모드에서는 블록체인 거래를 서명하거나 전송하지 않습니다.",
    });

    const catalog = await catalogLoader(store);
    const availableCount = catalog.filter((product) => product.available).length;
    await emit(store, run.id, {
      type: "catalog.loaded",
      tone: availableCount > 0 ? "neutral" : "warning",
      title: "구매 가능한 데이터를 확인했습니다",
      detail: `${availableCount}/${catalog.length}개 상품의 결제 전 스냅샷이 준비되었습니다.`,
    });
    if (availableCount === 0) {
      throw new ProofBuyError({
        code: "UPSTREAM_UNAVAILABLE",
        message: "구매 가능한 데이터 소스가 없습니다.",
        recovery: "CoinGecko와 GitHub 상태를 확인한 뒤 다시 실행하세요.",
      });
    }

    let selectionMode: "gemini" | "rules" = "gemini";
    let plan: ProcurementPlan;
    try {
      plan = await planner.plan({
        goal: run.goal,
        maxBudgetAtomic: run.maxBudgetAtomic,
        catalog,
        signal,
      });
    } catch (error) {
      if (run.mode !== "live" || !isRecoverableModelFailure(error)) throw error;
      plan = await new DemoProcurementPlanner().plan({
        goal: run.goal,
        maxBudgetAtomic: run.maxBudgetAtomic,
        catalog,
      });
      selectionMode = "rules";
      await emit(store, run.id, {
        type: "selection.fallback",
        tone: "warning",
        title: "상품 선택을 안전 규칙으로 이어갑니다",
        detail:
          "Gemini 응답이 늦어져 고정 카탈로그의 관련성과 예산만으로 평가했습니다.",
      });
    }
    await store.updateRun(run.id, { selectionMode });
    for (const selection of plan.selections) {
      await emit(store, run.id, {
        type: "choice.explained",
        tone: "neutral",
        title: `${PRODUCT_DEFINITIONS[selection.productId].name}을 선택했습니다`,
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
      title: "예산 정책을 통과했습니다",
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
          recovery: "새 조사를 시작해 결제 전 스냅샷을 갱신하세요.",
        });
      }
      const snapshot = await store.getSnapshot(product.snapshotId);
      if (!snapshot || snapshot.productId !== selection.productId) {
        throw new ProofBuyError({
          code: "UPSTREAM_UNAVAILABLE",
          message: `${selection.productId} 스냅샷 데이터를 찾을 수 없습니다.`,
          recovery: "새 조사를 시작해 결제 전 스냅샷을 갱신하세요.",
        });
      }
      const payTo =
        run.mode === "live" ? process.env.SVM_PAY_TO : "demo-receiver-no-wallet";
      if (!payTo) {
        throw new ProofBuyError({
          code: "PAYMENT_FAILED",
          message: "Devnet 수취 주소가 준비되지 않았습니다.",
          recovery: "결제 서비스 상태를 확인한 뒤 다시 실행하세요.",
        });
      }
      const paymentId = generatePaymentId("rein_");
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
        title: `${PRODUCT_DEFINITIONS[selection.productId].shortName} 결제를 요청했습니다`,
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
              ? "Devnet 결제가 완료됐습니다"
              : "데모 결제를 기록했습니다",
          detail:
            run.mode === "live"
              ? "영수증과 Solana 거래 서명을 저장했습니다."
              : "데모 영수증을 저장했습니다. 블록체인 거래는 생성되지 않았습니다.",
          productId: selection.productId,
          amountAtomic: product.priceAtomic,
          receipt: result.receipt,
        });
        await emit(store, run.id, {
          type: "data.received",
          tone: "success",
          title: `${PRODUCT_DEFINITIONS[selection.productId].name}을 받았습니다`,
          detail: `고정된 스냅샷 ${result.snapshot.id.slice(0, 24)}…을 보고서 근거에 추가했습니다.`,
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

    let fallbackBrief: ResearchBrief | undefined;
    if (run.mode === "live") {
      fallbackBrief = await new DemoProcurementPlanner().synthesize({
        goal: run.goal,
        evidence,
      });
      await store.updateRun(run.id, {
        summary: fallbackBrief,
        reportMode: "preview",
      });
      await emit(store, run.id, {
        type: "report.preview_ready",
        tone: "pending",
        title: "구매 데이터를 먼저 정리했습니다",
        detail: "결제와 영수증은 확정됐고 Gemini가 최종 분석을 작성하고 있습니다.",
      });
    }

    let usedFallbackReport = false;
    let brief: ResearchBrief;
    try {
      brief = await planner.synthesize({ goal: run.goal, evidence, signal });
    } catch (error) {
      if (run.mode !== "live" || evidence.length === 0) throw error;
      const fallback =
        fallbackBrief ??
        (await new DemoProcurementPlanner().synthesize({
          goal: run.goal,
          evidence,
        }));
      brief = {
        ...fallback,
        caveats: [
          ...fallback.caveats,
          "Gemini 응답이 늦어져 결제된 데이터는 REIN의 규칙 기반 분석으로 정리했습니다.",
        ],
      };
      usedFallbackReport = true;
    }
    if (run.mode === "live" && brief.generatedBy !== "Gemini 3.5 Flash") {
      usedFallbackReport = true;
    }
    await store.updateRun(run.id, {
      status: "completed",
      summary: brief,
      reportMode:
        run.mode === "live"
          ? usedFallbackReport
            ? "fallback"
            : "gemini"
          : undefined,
      reservedAtomic: "0",
      spentAtomic: evidence
        .map((item) => item.receipt.amountAtomic)
        .reduce((total, amount) => addAtomic(total, amount), "0"),
      completedAt: new Date().toISOString(),
    });
    await emit(store, run.id, {
      type: "report.completed",
      tone: usedFallbackReport ? "warning" : "success",
      title: usedFallbackReport
        ? "결제된 데이터로 결과를 보존했습니다"
        : "비교 보고서를 완성했습니다",
      detail: usedFallbackReport
        ? `${evidence.length}개 구매 근거를 규칙 기반으로 정리했습니다.`
        : `${evidence.length}개 구매 근거로 보고서를 작성했습니다.`,
    });
  } catch (error) {
    await markFailure(store, run, error);
  }
}
