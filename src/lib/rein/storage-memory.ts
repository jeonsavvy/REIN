import { addAtomic, parseAtomic, safeSubtractAtomic } from "./amount";
import { createId } from "./crypto";
import { PolicyDeniedError } from "./errors";
import {
  MAX_REPORT_RECOVERY_ATTEMPTS,
  REPORT_RECOVERY_STALE_MS,
} from "./constants";
import type { NewRunEvent, ReinStore } from "./storage";
import type {
  NewRunInput,
  PaymentReceipt,
  PaymentRecord,
  PurchasedEvidence,
  ReservePaymentInput,
  RunEvent,
  RunRecord,
  RunView,
  Snapshot,
  ProductId,
} from "./types";

interface QuotaRecord {
  reservedAtomic: string;
  settledAtomic: string;
}

interface MemoryState {
  runs: Map<string, RunRecord>;
  events: Map<string, RunEvent[]>;
  payments: Map<string, PaymentRecord>;
  snapshots: Map<string, Snapshot>;
  snapshotHeads: Map<ProductId, string>;
  evidence: Map<string, PurchasedEvidence[]>;
  quotas: Map<string, QuotaRecord>;
  resourceGrants: Map<string, string>;
}

function createState(): MemoryState {
  return {
    runs: new Map(),
    events: new Map(),
    payments: new Map(),
    snapshots: new Map(),
    snapshotHeads: new Map(),
    evidence: new Map(),
    quotas: new Map(),
    resourceGrants: new Map(),
  };
}

const globalForStore = globalThis as typeof globalThis & {
  __reinMemoryState?: MemoryState;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryReinStore implements ReinStore {
  private get state(): MemoryState {
    globalForStore.__reinMemoryState ??= createState();
    return globalForStore.__reinMemoryState;
  }

  async createRun(input: NewRunInput): Promise<RunRecord> {
    const now = new Date().toISOString();
    const run: RunRecord = {
      id: createId("run"),
      goal: input.goal,
      maxBudgetAtomic: input.maxBudgetAtomic,
      reservedAtomic: "0",
      spentAtomic: "0",
      status: "queued",
      mode: input.mode,
      preset: input.preset,
      nextEventSeq: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.state.runs.set(run.id, clone(run));
    this.state.events.set(run.id, []);
    this.state.evidence.set(run.id, []);
    return clone(run);
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    const run = this.state.runs.get(runId);
    return run ? clone(run) : undefined;
  }

  async claimRun(runId: string, claimId: string): Promise<boolean> {
    const run = this.state.runs.get(runId);
    if (!run || run.status !== "queued") return false;
    run.status = "running";
    run.claimId = claimId;
    run.updatedAt = new Date().toISOString();
    return true;
  }

  async claimReportRecovery(runId: string): Promise<boolean> {
    const run = this.state.runs.get(runId);
    if (!run) return false;
    const attempts = run.reportRecoveryAttempts ?? 0;
    const startedAt = run.reportRecoveryStartedAt
      ? new Date(run.reportRecoveryStartedAt).getTime()
      : 0;
    const active =
      run.reportRecoveryState === "running" &&
      Date.now() - startedAt < REPORT_RECOVERY_STALE_MS;
    if (
      active ||
      run.reportRecoveryState === "succeeded" ||
      attempts >= MAX_REPORT_RECOVERY_ATTEMPTS
    ) {
      return false;
    }
    const now = new Date().toISOString();
    run.reportRecoveryState = "running";
    run.reportRecoveryAttempts = attempts + 1;
    run.reportRecoveryStartedAt = now;
    run.updatedAt = now;
    return true;
  }

  async updateRun(runId: string, patch: Partial<RunRecord>): Promise<RunRecord> {
    const run = this.state.runs.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    const updated = {
      ...run,
      ...clone(patch),
      id: run.id,
      updatedAt: new Date().toISOString(),
    };
    this.state.runs.set(runId, updated);
    return clone(updated);
  }

  async appendEvent(runId: string, event: NewRunEvent): Promise<RunEvent> {
    const run = this.state.runs.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    const persisted: RunEvent = {
      ...clone(event),
      id: createId("evt"),
      seq: run.nextEventSeq,
      at: event.at ?? new Date().toISOString(),
    };
    run.nextEventSeq += 1;
    run.updatedAt = persisted.at;
    const list = this.state.events.get(runId) ?? [];
    list.push(persisted);
    this.state.events.set(runId, list);
    return clone(persisted);
  }

  async listEvents(runId: string): Promise<RunEvent[]> {
    return clone(this.state.events.get(runId) ?? []);
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    this.state.snapshots.set(snapshot.id, clone(snapshot));
    this.state.snapshotHeads.set(snapshot.productId, snapshot.id);
  }

  async getSnapshot(snapshotId: string): Promise<Snapshot | undefined> {
    const snapshot = this.state.snapshots.get(snapshotId);
    return snapshot ? clone(snapshot) : undefined;
  }

  async getFreshSnapshot(
    productId: ProductId,
    now = new Date(),
  ): Promise<Snapshot | undefined> {
    const id = this.state.snapshotHeads.get(productId);
    if (!id) return undefined;
    const snapshot = this.state.snapshots.get(id);
    if (!snapshot || new Date(snapshot.expiresAt).getTime() <= now.getTime()) {
      return undefined;
    }
    return clone(snapshot);
  }

  async reservePayment(input: ReservePaymentInput): Promise<PaymentRecord> {
    const existing = this.state.payments.get(input.payment.id);
    if (existing) {
      if (existing.requestFingerprint !== input.payment.requestFingerprint) {
        throw new PolicyDeniedError("같은 payment ID가 다른 요청에 재사용되었습니다.");
      }
      return clone(existing);
    }

    const run = this.state.runs.get(input.payment.runId);
    if (!run || run.status !== "running") {
      throw new PolicyDeniedError("실행 중인 run에만 결제를 예약할 수 있습니다.");
    }
    const amount = parseAtomic(input.payment.amountAtomic);
    const runCommitted =
      parseAtomic(run.spentAtomic) + parseAtomic(run.reservedAtomic) + amount;
    if (runCommitted > parseAtomic(run.maxBudgetAtomic)) {
      throw new PolicyDeniedError("원자적으로 확인한 실행 예산을 초과했습니다.");
    }

    const quotaKey = input.payment.quotaKey;
    const quota = this.state.quotas.get(quotaKey) ?? {
      reservedAtomic: "0",
      settledAtomic: "0",
    };
    const dailyCommitted =
      parseAtomic(quota.reservedAtomic) + parseAtomic(quota.settledAtomic) + amount;
    if (dailyCommitted > parseAtomic(input.dailyLimitAtomic)) {
      throw new PolicyDeniedError("일일 전역 결제 상한에 도달했습니다.");
    }

    run.reservedAtomic = addAtomic(run.reservedAtomic, input.payment.amountAtomic);
    run.updatedAt = new Date().toISOString();
    quota.reservedAtomic = addAtomic(
      quota.reservedAtomic,
      input.payment.amountAtomic,
    );
    this.state.quotas.set(quotaKey, quota);
    this.state.payments.set(input.payment.id, clone(input.payment));
    return clone(input.payment);
  }

  async getPayment(paymentId: string): Promise<PaymentRecord | undefined> {
    const payment = this.state.payments.get(paymentId);
    return payment ? clone(payment) : undefined;
  }

  async settlePayment(
    paymentId: string,
    receipt: PaymentReceipt,
  ): Promise<PaymentRecord> {
    const payment = this.state.payments.get(paymentId);
    if (!payment) throw new Error(`Payment not found: ${paymentId}`);
    if (payment.status === "settled") return clone(payment);
    if (payment.status !== "reserved") {
      throw new Error(`Cannot settle payment in status ${payment.status}`);
    }
    const run = this.state.runs.get(payment.runId);
    if (!run) throw new Error(`Run not found: ${payment.runId}`);

    payment.status = "settled";
    payment.receipt = clone(receipt);
    payment.updatedAt = new Date().toISOString();
    run.reservedAtomic = safeSubtractAtomic(
      run.reservedAtomic,
      payment.amountAtomic,
    );
    run.spentAtomic = addAtomic(run.spentAtomic, payment.amountAtomic);
    run.updatedAt = payment.updatedAt;

    const quotaKey = payment.quotaKey;
    const quota = this.state.quotas.get(quotaKey) ?? {
      reservedAtomic: payment.amountAtomic,
      settledAtomic: "0",
    };
    quota.reservedAtomic = safeSubtractAtomic(
      quota.reservedAtomic,
      payment.amountAtomic,
    );
    quota.settledAtomic = addAtomic(quota.settledAtomic, payment.amountAtomic);
    this.state.quotas.set(quotaKey, quota);
    return clone(payment);
  }

  async failPayment(
    paymentId: string,
    reason: string,
    ambiguous: boolean,
  ): Promise<PaymentRecord> {
    const payment = this.state.payments.get(paymentId);
    if (!payment) throw new Error(`Payment not found: ${paymentId}`);
    if (payment.status !== "reserved") return clone(payment);

    payment.status = ambiguous ? "reconciling" : "failed";
    payment.failureReason = reason;
    payment.updatedAt = new Date().toISOString();
    if (!ambiguous) {
      const run = this.state.runs.get(payment.runId);
      if (!run) throw new Error(`Run not found: ${payment.runId}`);
      run.reservedAtomic = safeSubtractAtomic(
        run.reservedAtomic,
        payment.amountAtomic,
      );
      const quotaKey = payment.quotaKey;
      const quota = this.state.quotas.get(quotaKey);
      if (quota) {
        quota.reservedAtomic = safeSubtractAtomic(
          quota.reservedAtomic,
          payment.amountAtomic,
        );
      }
    }
    return clone(payment);
  }

  async listPayments(runId: string): Promise<PaymentRecord[]> {
    return clone(
      [...this.state.payments.values()]
        .filter((payment) => payment.runId === runId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  }

  async saveResourceGrant(
    paymentId: string,
    requestFingerprint: string,
  ): Promise<void> {
    this.state.resourceGrants.set(paymentId, requestFingerprint);
  }

  async hasResourceGrant(
    paymentId: string,
    requestFingerprint: string,
  ): Promise<boolean> {
    return this.state.resourceGrants.get(paymentId) === requestFingerprint;
  }

  async saveEvidence(runId: string, evidence: PurchasedEvidence): Promise<void> {
    const list = this.state.evidence.get(runId) ?? [];
    const existing = list.findIndex(
      (item) => item.receipt.paymentId === evidence.receipt.paymentId,
    );
    if (existing >= 0) list[existing] = clone(evidence);
    else list.push(clone(evidence));
    this.state.evidence.set(runId, list);
  }

  async listEvidence(runId: string): Promise<PurchasedEvidence[]> {
    return clone(this.state.evidence.get(runId) ?? []);
  }

  async getRunView(runId: string): Promise<RunView | undefined> {
    const run = await this.getRun(runId);
    if (!run) return undefined;
    return {
      run,
      events: await this.listEvents(runId),
      payments: await this.listPayments(runId),
      evidence: await this.listEvidence(runId),
    };
  }

  async reset(): Promise<void> {
    globalForStore.__reinMemoryState = createState();
  }
}
