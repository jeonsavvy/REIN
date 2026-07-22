import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
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

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireData<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message);
  return value;
}

export class FirestoreReinStore implements ReinStore {
  private readonly db: Firestore;

  constructor() {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const app =
      getApps()[0] ??
      initializeApp({
        credential: applicationDefault(),
        projectId,
      });
    this.db = getFirestore(app, process.env.FIRESTORE_DATABASE_ID ?? "(default)");
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
    await this.db.collection("runs").doc(run.id).create(clean(run));
    return run;
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    const doc = await this.db.collection("runs").doc(runId).get();
    return doc.exists ? (doc.data() as RunRecord) : undefined;
  }

  async claimRun(runId: string, claimId: string): Promise<boolean> {
    const ref = this.db.collection("runs").doc(runId);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists || (doc.data() as RunRecord).status !== "queued") return false;
      tx.update(ref, {
        status: "running",
        claimId,
        updatedAt: new Date().toISOString(),
      });
      return true;
    });
  }

  async claimReportRecovery(runId: string): Promise<boolean> {
    const ref = this.db.collection("runs").doc(runId);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) return false;
      const run = doc.data() as RunRecord;
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
      tx.update(ref, {
        reportRecoveryState: "running",
        reportRecoveryAttempts: attempts + 1,
        reportRecoveryStartedAt: now,
        updatedAt: now,
      });
      return true;
    });
  }

  async updateRun(runId: string, patch: Partial<RunRecord>): Promise<RunRecord> {
    const ref = this.db.collection("runs").doc(runId);
    const safePatch = { ...patch };
    delete safePatch.id;
    await ref.update(clean({ ...safePatch, updatedAt: new Date().toISOString() }));
    return requireData(await this.getRun(runId), `Run not found: ${runId}`);
  }

  async appendEvent(runId: string, event: NewRunEvent): Promise<RunEvent> {
    const runRef = this.db.collection("runs").doc(runId);
    const eventRef = runRef.collection("events").doc(createId("evt"));
    return this.db.runTransaction(async (tx) => {
      const runDoc = await tx.get(runRef);
      if (!runDoc.exists) throw new Error(`Run not found: ${runId}`);
      const run = runDoc.data() as RunRecord;
      const persisted: RunEvent = {
        ...event,
        id: eventRef.id,
        seq: run.nextEventSeq,
        at: event.at ?? new Date().toISOString(),
      };
      tx.update(runRef, {
        nextEventSeq: run.nextEventSeq + 1,
        updatedAt: persisted.at,
      });
      tx.create(eventRef, clean(persisted));
      return persisted;
    });
  }

  async listEvents(runId: string): Promise<RunEvent[]> {
    const snapshot = await this.db
      .collection("runs")
      .doc(runId)
      .collection("events")
      .orderBy("seq", "asc")
      .get();
    return snapshot.docs.map((doc) => doc.data() as RunEvent);
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    const snapshotRef = this.db.collection("snapshots").doc(snapshot.id);
    const headRef = this.db.collection("snapshot_heads").doc(snapshot.productId);
    const batch = this.db.batch();
    batch.set(snapshotRef, clean(snapshot));
    batch.set(headRef, { snapshotId: snapshot.id, expiresAt: snapshot.expiresAt });
    await batch.commit();
  }

  async getSnapshot(snapshotId: string): Promise<Snapshot | undefined> {
    const doc = await this.db.collection("snapshots").doc(snapshotId).get();
    return doc.exists ? (doc.data() as Snapshot) : undefined;
  }

  async getFreshSnapshot(
    productId: ProductId,
    now = new Date(),
  ): Promise<Snapshot | undefined> {
    const head = await this.db.collection("snapshot_heads").doc(productId).get();
    if (!head.exists) return undefined;
    const data = head.data() as { snapshotId: string; expiresAt: string };
    if (new Date(data.expiresAt).getTime() <= now.getTime()) return undefined;
    return this.getSnapshot(data.snapshotId);
  }

  async reservePayment(input: ReservePaymentInput): Promise<PaymentRecord> {
    const paymentRef = this.db.collection("payments").doc(input.payment.id);
    const runRef = this.db.collection("runs").doc(input.payment.runId);
    const quotaRef = this.db.collection("quota").doc(input.payment.quotaKey);
    return this.db.runTransaction(async (tx) => {
      const [paymentDoc, runDoc, quotaDoc] = await Promise.all([
        tx.get(paymentRef),
        tx.get(runRef),
        tx.get(quotaRef),
      ]);
      if (paymentDoc.exists) {
        const existing = paymentDoc.data() as PaymentRecord;
        if (existing.requestFingerprint !== input.payment.requestFingerprint) {
          throw new PolicyDeniedError("같은 payment ID가 다른 요청에 재사용되었습니다.");
        }
        return existing;
      }
      if (!runDoc.exists) throw new Error(`Run not found: ${input.payment.runId}`);
      const run = runDoc.data() as RunRecord;
      if (run.status !== "running") {
        throw new PolicyDeniedError("실행 중인 run에만 결제를 예약할 수 있습니다.");
      }
      const amount = parseAtomic(input.payment.amountAtomic);
      const runCommitted =
        parseAtomic(run.spentAtomic) + parseAtomic(run.reservedAtomic) + amount;
      if (runCommitted > parseAtomic(run.maxBudgetAtomic)) {
        throw new PolicyDeniedError("원자적으로 확인한 실행 예산을 초과했습니다.");
      }
      const quota = quotaDoc.exists
        ? (quotaDoc.data() as { reservedAtomic: string; settledAtomic: string })
        : { reservedAtomic: "0", settledAtomic: "0" };
      const dailyCommitted =
        parseAtomic(quota.reservedAtomic) +
        parseAtomic(quota.settledAtomic) +
        amount;
      if (dailyCommitted > parseAtomic(input.dailyLimitAtomic)) {
        throw new PolicyDeniedError("일일 전역 결제 상한에 도달했습니다.");
      }

      tx.create(paymentRef, clean(input.payment));
      tx.update(runRef, {
        reservedAtomic: addAtomic(run.reservedAtomic, input.payment.amountAtomic),
        updatedAt: new Date().toISOString(),
      });
      tx.set(
        quotaRef,
        {
          reservedAtomic: addAtomic(quota.reservedAtomic, input.payment.amountAtomic),
          settledAtomic: quota.settledAtomic,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      return input.payment;
    });
  }

  async getPayment(paymentId: string): Promise<PaymentRecord | undefined> {
    const doc = await this.db.collection("payments").doc(paymentId).get();
    return doc.exists ? (doc.data() as PaymentRecord) : undefined;
  }

  private async mutatePayment(
    paymentId: string,
    callback: (
      tx: Transaction,
      payment: PaymentRecord,
      run: RunRecord,
      quota: { reservedAtomic: string; settledAtomic: string },
      refs: {
        payment: DocumentReference;
        run: DocumentReference;
        quota: DocumentReference;
      },
    ) => PaymentRecord,
  ): Promise<PaymentRecord> {
    const paymentRef = this.db.collection("payments").doc(paymentId);
    return this.db.runTransaction(async (tx) => {
      const paymentDoc = await tx.get(paymentRef);
      if (!paymentDoc.exists) throw new Error(`Payment not found: ${paymentId}`);
      const payment = paymentDoc.data() as PaymentRecord;
      const runRef = this.db.collection("runs").doc(payment.runId);
      const quotaRef = this.db
        .collection("quota")
        .doc(payment.quotaKey);
      const [runDoc, quotaDoc] = await Promise.all([tx.get(runRef), tx.get(quotaRef)]);
      if (!runDoc.exists) throw new Error(`Run not found: ${payment.runId}`);
      const quota = quotaDoc.exists
        ? (quotaDoc.data() as { reservedAtomic: string; settledAtomic: string })
        : { reservedAtomic: "0", settledAtomic: "0" };
      return callback(tx, payment, runDoc.data() as RunRecord, quota, {
        payment: paymentRef,
        run: runRef,
        quota: quotaRef,
      });
    });
  }

  async settlePayment(
    paymentId: string,
    receipt: PaymentReceipt,
  ): Promise<PaymentRecord> {
    return this.mutatePayment(paymentId, (tx, payment, run, quota, refs) => {
      if (payment.status === "settled") return payment;
      if (payment.status !== "reserved") {
        throw new Error(`Cannot settle payment in status ${payment.status}`);
      }
      const updated: PaymentRecord = {
        ...payment,
        status: "settled",
        receipt,
        updatedAt: new Date().toISOString(),
      };
      tx.update(refs.payment, clean(updated));
      tx.update(refs.run, {
        reservedAtomic: safeSubtractAtomic(run.reservedAtomic, payment.amountAtomic),
        spentAtomic: addAtomic(run.spentAtomic, payment.amountAtomic),
        updatedAt: updated.updatedAt,
      });
      tx.set(
        refs.quota,
        {
          reservedAtomic: safeSubtractAtomic(
            quota.reservedAtomic,
            payment.amountAtomic,
          ),
          settledAtomic: addAtomic(quota.settledAtomic, payment.amountAtomic),
          updatedAt: updated.updatedAt,
        },
        { merge: true },
      );
      return updated;
    });
  }

  async failPayment(
    paymentId: string,
    reason: string,
    ambiguous: boolean,
  ): Promise<PaymentRecord> {
    return this.mutatePayment(paymentId, (tx, payment, run, quota, refs) => {
      if (payment.status !== "reserved") return payment;
      const updated: PaymentRecord = {
        ...payment,
        status: ambiguous ? "reconciling" : "failed",
        failureReason: reason,
        updatedAt: new Date().toISOString(),
      };
      tx.update(refs.payment, clean(updated));
      if (!ambiguous) {
        tx.update(refs.run, {
          reservedAtomic: safeSubtractAtomic(
            run.reservedAtomic,
            payment.amountAtomic,
          ),
          updatedAt: updated.updatedAt,
        });
        tx.set(
          refs.quota,
          {
            reservedAtomic: safeSubtractAtomic(
              quota.reservedAtomic,
              payment.amountAtomic,
            ),
            settledAtomic: quota.settledAtomic,
            updatedAt: updated.updatedAt,
          },
          { merge: true },
        );
      }
      return updated;
    });
  }

  async listPayments(runId: string): Promise<PaymentRecord[]> {
    const snapshot = await this.db
      .collection("payments")
      .where("runId", "==", runId)
      .get();
    return snapshot.docs
      .map((doc) => doc.data() as PaymentRecord)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async saveResourceGrant(
    paymentId: string,
    requestFingerprint: string,
  ): Promise<void> {
    await this.db.collection("resource_grants").doc(paymentId).set({
      requestFingerprint,
      settledAt: new Date().toISOString(),
    });
  }

  async hasResourceGrant(
    paymentId: string,
    requestFingerprint: string,
  ): Promise<boolean> {
    const doc = await this.db.collection("resource_grants").doc(paymentId).get();
    return (
      doc.exists &&
      (doc.data() as { requestFingerprint?: string }).requestFingerprint ===
        requestFingerprint
    );
  }

  async saveEvidence(runId: string, evidence: PurchasedEvidence): Promise<void> {
    await this.db
      .collection("runs")
      .doc(runId)
      .collection("evidence")
      .doc(evidence.receipt.paymentId)
      .set(clean(evidence));
  }

  async listEvidence(runId: string): Promise<PurchasedEvidence[]> {
    const snapshot = await this.db
      .collection("runs")
      .doc(runId)
      .collection("evidence")
      .get();
    return snapshot.docs.map((doc) => doc.data() as PurchasedEvidence);
  }

  async getRunView(runId: string): Promise<RunView | undefined> {
    const run = await this.getRun(runId);
    if (!run) return undefined;
    const [events, payments, evidence] = await Promise.all([
      this.listEvents(runId),
      this.listPayments(runId),
      this.listEvidence(runId),
    ]);
    return { run, events, payments, evidence };
  }
}
