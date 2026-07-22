import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadFixtureCatalog } from "@/lib/rein/catalog-fixtures";
import { executeRun } from "@/lib/rein/orchestrator";
import { ReinError } from "@/lib/rein/errors";
import {
  DemoProcurementPlanner,
  type ProcurementPlanner,
} from "@/lib/rein/planner";
import { MemoryReinStore } from "@/lib/rein/storage-memory";
import type { PaymentGateway } from "@/lib/rein/payment";
import type {
  PaymentReceipt,
  ResearchBrief,
  RuntimeMode,
} from "@/lib/rein/types";

const store = new MemoryReinStore();

async function createClaimedRun(
  goal: string,
  maxBudgetAtomic = "3000",
  mode: RuntimeMode = "demo",
) {
  const run = await store.createRun({ goal, maxBudgetAtomic, mode });
  await store.claimRun(run.id, `claim_${run.id}`);
  return run;
}

function successfulGateway(): PaymentGateway {
  return {
    async purchase({ payment }) {
      const snapshot = await store.getSnapshot(payment.snapshotId);
      if (!snapshot) throw new Error("fixture snapshot missing");
      const receipt: PaymentReceipt = {
        paymentId: payment.id,
        productId: payment.productId,
        amountAtomic: payment.amountAtomic,
        decimals: 6,
        network: payment.network,
        asset: payment.asset,
        payer: "demo-buyer-no-wallet",
        payee: payment.payTo,
        signature: `demo_${payment.id}`,
        settledAt: new Date().toISOString(),
        mode: "demo",
      };
      return { snapshot, receipt };
    },
  };
}

describe("procurement orchestration", () => {
  beforeEach(async () => {
    await store.reset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("completes two purchases, persists evidence, and emits sanitized milestones", async () => {
    const run = await createClaimedRun("SOL과 ETH의 개발·시장 모멘텀 비교");
    await executeRun(run.id, {
      store,
      planner: new DemoProcurementPlanner(),
      gateway: successfulGateway(),
      catalogLoader: loadFixtureCatalog,
    });
    const view = await store.getRunView(run.id);
    expect(view?.run.status).toBe("completed");
    expect(view?.run.spentAtomic).toBe("3000");
    expect(view?.payments).toHaveLength(2);
    expect(view?.evidence).toHaveLength(2);
    expect(view?.events.map((event) => event.type)).toContain("report.completed");
    expect(JSON.stringify(view?.events)).not.toMatch(/chain.of.thought|private.?key/i);
  });

  it("does not retry an ambiguous settlement and leaves it reconciling", async () => {
    const run = await createClaimedRun("SOL ETH 가격 비교", "1000");
    const purchase = vi.fn(async () => {
      throw new ReinError(
        {
          code: "PAYMENT_RECONCILING",
          message: "facilitator response was lost after signing",
          recovery: "Explorer에서 먼저 확인하세요.",
        },
        true,
      );
    });
    await executeRun(run.id, {
      store,
      planner: new DemoProcurementPlanner(),
      gateway: { purchase },
      catalogLoader: loadFixtureCatalog,
    });
    const view = await store.getRunView(run.id);
    expect(purchase).toHaveBeenCalledTimes(1);
    expect(view?.run.status).toBe("reconciling");
    expect(view?.run.reservedAtomic).toBe("1000");
    expect(view?.payments[0]?.status).toBe("reconciling");
    expect(view?.events.at(-1)?.type).toBe("payment.reconciling");
  });

  it("releases a known payment failure and stops safely", async () => {
    const run = await createClaimedRun("SOL ETH 가격 비교", "1000");
    await executeRun(run.id, {
      store,
      planner: new DemoProcurementPlanner(),
      gateway: {
        async purchase() {
          throw new ReinError({
            code: "PAYMENT_FAILED",
            message: "facilitator rejected before settlement",
            recovery: "facilitator 상태를 확인하세요.",
          });
        },
      },
      catalogLoader: loadFixtureCatalog,
    });
    const view = await store.getRunView(run.id);
    expect(view?.run.status).toBe("failed");
    expect(view?.run.reservedAtomic).toBe("0");
    expect(view?.payments[0]?.status).toBe("failed");
  });

  it("preserves paid evidence but does not complete when Gemini reporting fails", async () => {
    vi.stubEnv("SVM_PAY_TO", "4uZJ85RptKhsnVwRnUNsWm5iXwHLysSiyzufR45GeM7P");
    const run = await createClaimedRun(
      "SOL과 ETH의 개발·시장 모멘텀 비교",
      "3000",
      "live",
    );
    const deterministicPlanner = new DemoProcurementPlanner();
    const planner: ProcurementPlanner = {
      plan: (input) => deterministicPlanner.plan(input),
      async synthesize() {
        throw new ReinError({
          code: "MODEL_TIMEOUT",
          message: "Gemini 응답이 제한 시간 안에 오지 않았습니다.",
          recovery: "잠시 후 다시 실행하세요.",
        });
      },
    };
    const gateway = successfulGateway();
    const purchase = vi.fn(gateway.purchase);

    await executeRun(run.id, {
      store,
      planner,
      gateway: { purchase },
      catalogLoader: loadFixtureCatalog,
    });

    const view = await store.getRunView(run.id);
    expect(purchase).toHaveBeenCalledTimes(2);
    expect(view?.run.status).toBe("failed");
    expect(view?.run.spentAtomic).toBe("3000");
    expect(view?.run.reservedAtomic).toBe("0");
    expect(view?.run.summary?.generatedBy).toBe("REIN 규칙 기반 분석");
    expect(view?.run.reportMode).toBe("preview");
    expect(view?.run.error?.code).toBe("MODEL_TIMEOUT");
    expect(view?.payments.every((payment) => payment.status === "settled")).toBe(true);
    expect(view?.events.map((event) => event.type)).not.toContain("report.completed");
    expect(view?.events.at(-1)).toMatchObject({
      type: "run.error",
      tone: "danger",
    });
  });

  it("publishes an immediate paid-data preview before the live Gemini report", async () => {
    vi.stubEnv("SVM_PAY_TO", "4uZJ85RptKhsnVwRnUNsWm5iXwHLysSiyzufR45GeM7P");
    const run = await createClaimedRun(
      "SOL과 ETH의 개발·시장 모멘텀 비교",
      "3000",
      "live",
    );
    const deterministicPlanner = new DemoProcurementPlanner();
    const geminiBrief: ResearchBrief = {
      headline: "SOL과 ETH의 시장·개발 모멘텀 비교",
      executiveSummary:
        "구매한 시장과 개발 근거를 함께 비교했으며 서로 다른 신호를 구분했습니다.",
      findings: [
        {
          label: "비교 결과",
          value: "시장·개발 분리",
          interpretation: "구매한 두 스냅샷만 사용해 비교했습니다.",
        },
      ],
      caveats: ["특정 시점과 저장소에 한정된 결과입니다."],
      generatedBy: "Gemini 3.5 Flash",
    };
    const planner: ProcurementPlanner = {
      plan: (input) => deterministicPlanner.plan(input),
      async synthesize() {
        const preview = await store.getRun(run.id);
        expect(preview?.status).toBe("running");
        expect(preview?.reportMode).toBe("preview");
        expect(preview?.summary?.generatedBy).toBe("REIN 규칙 기반 분석");
        return geminiBrief;
      },
    };

    await executeRun(run.id, {
      store,
      planner,
      gateway: successfulGateway(),
      catalogLoader: loadFixtureCatalog,
    });

    const view = await store.getRunView(run.id);
    expect(view?.run.status).toBe("completed");
    expect(view?.run.reportMode).toBe("gemini");
    expect(view?.run.summary).toEqual(geminiBrief);
    expect(view?.events.map((event) => event.type)).toContain(
      "report.preview_ready",
    );
  });

  it("stops before payment when live Gemini planning times out", async () => {
    vi.stubEnv("SVM_PAY_TO", "4uZJ85RptKhsnVwRnUNsWm5iXwHLysSiyzufR45GeM7P");
    const run = await createClaimedRun(
      "SOL과 ETH의 개발·시장 모멘텀 비교",
      "3000",
      "live",
    );
    const deterministicPlanner = new DemoProcurementPlanner();
    const planner: ProcurementPlanner = {
      async plan() {
        throw new ReinError({
          code: "MODEL_TIMEOUT",
          message: "Gemini 응답이 제한 시간 안에 오지 않았습니다.",
          recovery: "안전 규칙을 사용하세요.",
        });
      },
      synthesize: (input) => deterministicPlanner.synthesize(input),
    };
    const gateway = successfulGateway();
    const purchase = vi.fn(gateway.purchase);

    await executeRun(run.id, {
      store,
      planner,
      gateway: { purchase },
      catalogLoader: loadFixtureCatalog,
    });

    const view = await store.getRunView(run.id);
    expect(view?.run.status).toBe("failed");
    expect(view?.run.selectionMode).toBeUndefined();
    expect(purchase).not.toHaveBeenCalled();
    expect(view?.payments).toEqual([]);
    expect(view?.events.map((event) => event.type)).not.toContain(
      "selection.fallback",
    );
  });

  it("fails before payment when planning exceeds the model deadline", async () => {
    const run = await createClaimedRun("SOL과 ETH의 개발·시장 모멘텀 비교");
    const purchase = vi.fn(successfulGateway().purchase);
    const planner: ProcurementPlanner = {
      async plan() {
        throw new ReinError({
          code: "MODEL_TIMEOUT",
          message: "Gemini 응답이 제한 시간 안에 오지 않았습니다.",
          recovery: "잠시 후 다시 실행하세요.",
        });
      },
      synthesize: vi.fn(),
    };

    await executeRun(run.id, {
      store,
      planner,
      gateway: { purchase },
      catalogLoader: loadFixtureCatalog,
    });

    const view = await store.getRunView(run.id);
    expect(purchase).not.toHaveBeenCalled();
    expect(view?.payments).toEqual([]);
    expect(view?.run.status).toBe("failed");
    expect(view?.run.error?.code).toBe("MODEL_TIMEOUT");
  });

  it("surfaces upstream outage before any payment reservation", async () => {
    const run = await createClaimedRun("SOL ETH 가격 비교");
    await executeRun(run.id, {
      store,
      planner: new DemoProcurementPlanner(),
      gateway: successfulGateway(),
      catalogLoader: async () =>
        (await loadFixtureCatalog(store)).map((product) => ({
          ...product,
          available: false,
          snapshotId: undefined,
          unavailableReason: "upstream down",
        })),
    });
    const view = await store.getRunView(run.id);
    expect(view?.run.status).toBe("failed");
    expect(view?.run.error?.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(view?.payments).toEqual([]);
  });
});
