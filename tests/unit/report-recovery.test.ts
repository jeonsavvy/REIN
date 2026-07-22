import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFixtureCatalog } from "@/lib/rein/catalog-fixtures";
import { ReinError } from "@/lib/rein/errors";
import { DemoProcurementPlanner, type ProcurementPlanner } from "@/lib/rein/planner";
import {
  recoverRunReport,
  ReportRecoveryUnavailableError,
} from "@/lib/rein/report-recovery";
import { MemoryReinStore } from "@/lib/rein/storage-memory";
import type { PurchasedEvidence, ResearchBrief } from "@/lib/rein/types";
import { paymentReceipt, paymentRecord } from "./helpers";

const store = new MemoryReinStore();

function geminiBrief(): ResearchBrief {
  return {
    headline: "SOL과 ETH의 시장·개발 모멘텀 비교",
    executiveSummary:
      "시장과 개발 활동은 서로 다른 방향을 보이며, 구매한 두 근거를 함께 확인해야 합니다.",
    findings: [
      {
        label: "비교 결과",
        value: "시장·개발 지표 분리",
        interpretation: "구매한 스냅샷의 관측값만 사용해 비교했습니다.",
      },
    ],
    caveats: ["특정 시점과 저장소에 한정된 결과입니다."],
    generatedBy: "Gemini 3.5 Flash",
  };
}

async function paidLiveRun() {
  const run = await store.createRun({
    goal: "SOL과 ETH의 개발·시장 모멘텀 비교",
    maxBudgetAtomic: "3000",
    mode: "live",
  });
  await store.claimRun(run.id, `claim_${run.id}`);
  const catalog = await loadFixtureCatalog(store);
  const evidence: PurchasedEvidence[] = [];
  for (const product of catalog) {
    const payment = paymentRecord({
      id: `payment_${product.id}_${run.id}`,
      runId: run.id,
      productId: product.id,
    });
    await store.reservePayment({ payment, dailyLimitAtomic: "250000" });
    const receipt = { ...paymentReceipt(payment), mode: "live" as const };
    await store.settlePayment(payment.id, receipt);
    const snapshot = await store.getSnapshot(product.snapshotId!);
    if (!snapshot) throw new Error("fixture snapshot missing");
    const item = {
      productId: product.id,
      snapshotId: snapshot.id,
      data: snapshot.data,
      receipt,
    } satisfies PurchasedEvidence;
    await store.saveEvidence(run.id, item);
    evidence.push(item);
  }
  return { run, evidence };
}

describe("report-only recovery", () => {
  beforeEach(async () => {
    await store.reset();
  });

  it("replaces a fallback report with Gemini without creating or changing payments", async () => {
    const { run, evidence } = await paidLiveRun();
    const fallback = await new DemoProcurementPlanner().synthesize({
      goal: run.goal,
      evidence,
    });
    await store.updateRun(run.id, { status: "completed", summary: fallback });
    const paymentsBefore = await store.listPayments(run.id);
    const synthesize = vi.fn(async () => geminiBrief());

    const recovered = await recoverRunReport(run.id, {
      store,
      planner: { plan: vi.fn(), synthesize },
    });

    expect(synthesize).toHaveBeenCalledOnce();
    expect(await store.listPayments(run.id)).toEqual(paymentsBefore);
    expect(recovered.run.status).toBe("completed");
    expect(recovered.run.error).toBeNull();
    expect(recovered.run.summary?.generatedBy).toBe("Gemini 3.5 Flash");
    expect(recovered.run.reportRecoveryAttempts).toBe(1);
    expect(recovered.run.reportRecoveryState).toBe("succeeded");
    expect(recovered.events.slice(-2).map((event) => event.type)).toEqual([
      "report.retry_started",
      "report.retry_completed",
    ]);
  });

  it("repairs a legacy paid failure from existing settled evidence", async () => {
    const { run } = await paidLiveRun();
    await store.updateRun(run.id, {
      status: "failed",
      error: {
        code: "INTERNAL_ERROR",
        message: "Gemini returned no JSON object",
        recovery: "분석만 다시 시도하세요.",
      },
    });

    const recovered = await recoverRunReport(run.id, {
      store,
      planner: { plan: vi.fn(), synthesize: vi.fn(async () => geminiBrief()) },
    });

    expect(recovered.run.status).toBe("completed");
    expect(recovered.run.summary).toEqual(geminiBrief());
    expect(recovered.payments).toHaveLength(2);
    expect(recovered.payments.every((payment) => payment.status === "settled")).toBe(
      true,
    );
  });

  it("preserves the fallback and payments when report-only recovery fails", async () => {
    const { run, evidence } = await paidLiveRun();
    const fallback = await new DemoProcurementPlanner().synthesize({
      goal: run.goal,
      evidence,
    });
    await store.updateRun(run.id, { status: "completed", summary: fallback });
    const paymentsBefore = await store.listPayments(run.id);
    const planner: ProcurementPlanner = {
      plan: vi.fn(),
      async synthesize() {
        throw new ReinError({
          code: "MODEL_TIMEOUT",
          message: "Gemini 응답이 제한 시간 안에 오지 않았습니다.",
          recovery: "기존 결과를 사용하세요.",
        });
      },
    };

    await expect(recoverRunReport(run.id, { store, planner })).rejects.toThrow(
      "제한 시간",
    );

    const after = await store.getRunView(run.id);
    expect(after?.run.status).toBe("completed");
    expect(after?.run.summary).toEqual(fallback);
    expect(after?.run.reportRecoveryState).toBe("failed");
    expect(after?.payments).toEqual(paymentsBefore);
    expect(after?.events.at(-1)?.type).toBe("report.retry_failed");
  });

  it("rejects normal Gemini reports and runs without settled evidence", async () => {
    const normal = await paidLiveRun();
    await store.updateRun(normal.run.id, {
      status: "completed",
      summary: geminiBrief(),
    });
    await expect(recoverRunReport(normal.run.id, { store })).rejects.toBeInstanceOf(
      ReportRecoveryUnavailableError,
    );

    const empty = await store.createRun({
      goal: "SOL과 ETH의 개발·시장 모멘텀 비교",
      maxBudgetAtomic: "3000",
      mode: "live",
    });
    await store.updateRun(empty.id, {
      status: "failed",
      error: {
        code: "MODEL_ERROR",
        message: "Gemini 응답 형식을 확인할 수 없습니다.",
        recovery: "다시 시도하세요.",
      },
    });
    await expect(recoverRunReport(empty.id, { store })).rejects.toThrow(
      "구매 근거",
    );
  });
});
