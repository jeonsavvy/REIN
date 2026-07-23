import { toRunError } from "./errors";
import {
  VertexAdkProcurementPlanner,
  type ProcurementPlanner,
} from "./planner";
import { getStore } from "./store";
import type { ReinStore } from "./storage";
import type { RunRecord, RunView, UsageAdmission } from "./types";

export class ReportRecoveryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportRecoveryUnavailableError";
  }
}

export interface ReportRecoveryDependencies {
  store?: ReinStore;
  planner?: ProcurementPlanner;
  admission?: UsageAdmission;
}

function isRecoveryCandidate(run: RunRecord): boolean {
  if (run.mode !== "live") return false;
  if (
    run.status === "completed" &&
    run.summary?.generatedBy === "REIN 규칙 기반 분석"
  ) {
    return true;
  }
  // Older revisions stored some post-payment model failures as INTERNAL_ERROR.
  // Eligibility is therefore decided by the settled-evidence invariant below,
  // not by a mutable error-code taxonomy.
  return run.status === "failed";
}

function assertSettledEvidence(view: RunView): void {
  if (view.evidence.length === 0) {
    throw new ReportRecoveryUnavailableError("다시 분석할 구매 근거가 없습니다.");
  }
  const settledIds = new Set(
    view.payments
      .filter((payment) => payment.status === "settled")
      .map((payment) => payment.id),
  );
  const everyEvidenceSettled = view.evidence.every((item) =>
    settledIds.has(item.receipt.paymentId),
  );
  if (
    !everyEvidenceSettled ||
    view.payments.some((payment) => payment.status !== "settled") ||
    view.run.reservedAtomic !== "0"
  ) {
    throw new ReportRecoveryUnavailableError(
      "모든 결제가 확정된 실행만 결제 없이 다시 분석할 수 있습니다.",
    );
  }
}

export async function recoverRunReport(
  runId: string,
  dependencies: ReportRecoveryDependencies = {},
): Promise<RunView> {
  const store = dependencies.store ?? getStore();
  const before = await store.getRunView(runId);
  if (!before) throw new ReportRecoveryUnavailableError("조사 기록을 찾을 수 없습니다.");
  if (!isRecoveryCandidate(before.run)) {
    throw new ReportRecoveryUnavailableError(
      "Gemini 보고서 복구가 필요한 실행이 아닙니다.",
    );
  }
  assertSettledEvidence(before);

  if (!(await store.claimReportRecovery(runId, dependencies.admission))) {
    throw new ReportRecoveryUnavailableError(
      "Gemini 분석이 이미 진행 중이거나 허용된 재시도 횟수를 사용했습니다.",
    );
  }
  await store.appendEvent(runId, {
    type: "report.retry_started",
    tone: "pending",
    title: "Gemini 분석만 다시 시작했습니다",
    detail: "기존 구매 근거를 재사용하며 새 결제는 만들지 않습니다.",
  });

  const planner = dependencies.planner ?? new VertexAdkProcurementPlanner();
  try {
    const summary = await planner.synthesize({
      goal: before.run.goal,
      evidence: before.evidence,
    });
    await store.updateRun(runId, {
      status: "completed",
      summary,
      error: null,
      reportMode: "gemini",
      reportRecoveryState: "succeeded",
      completedAt: new Date().toISOString(),
    });
    await store.appendEvent(runId, {
      type: "report.retry_completed",
      tone: "success",
      title: "Gemini 분석을 복구했습니다",
      detail: "기존 구매 근거만 다시 분석했으며 추가 결제는 발생하지 않았습니다.",
    });
  } catch (error) {
    const detail = toRunError(error);
    await store.updateRun(runId, { reportRecoveryState: "failed" });
    await store.appendEvent(runId, {
      type: "report.retry_failed",
      tone: "warning",
      title: "Gemini 분석을 완료하지 못했습니다",
      detail: `${detail.message} 결제와 구매 데이터는 그대로 보존됩니다.`,
    });
    throw error;
  }

  const recovered = await store.getRunView(runId);
  if (!recovered) throw new Error(`Run not found after report recovery: ${runId}`);
  return recovered;
}
