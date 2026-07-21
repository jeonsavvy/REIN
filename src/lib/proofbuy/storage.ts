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

export type NewRunEvent = Omit<RunEvent, "id" | "seq" | "at"> & {
  at?: string;
};

export interface ProofBuyStore {
  createRun(input: NewRunInput): Promise<RunRecord>;
  getRun(runId: string): Promise<RunRecord | undefined>;
  claimRun(runId: string, claimId: string): Promise<boolean>;
  updateRun(runId: string, patch: Partial<RunRecord>): Promise<RunRecord>;
  appendEvent(runId: string, event: NewRunEvent): Promise<RunEvent>;
  listEvents(runId: string): Promise<RunEvent[]>;

  saveSnapshot(snapshot: Snapshot): Promise<void>;
  getSnapshot(snapshotId: string): Promise<Snapshot | undefined>;
  getFreshSnapshot(productId: ProductId, now?: Date): Promise<Snapshot | undefined>;

  reservePayment(input: ReservePaymentInput): Promise<PaymentRecord>;
  getPayment(paymentId: string): Promise<PaymentRecord | undefined>;
  settlePayment(paymentId: string, receipt: PaymentReceipt): Promise<PaymentRecord>;
  failPayment(
    paymentId: string,
    reason: string,
    ambiguous: boolean,
  ): Promise<PaymentRecord>;
  listPayments(runId: string): Promise<PaymentRecord[]>;
  saveResourceGrant(paymentId: string, requestFingerprint: string): Promise<void>;
  hasResourceGrant(paymentId: string, requestFingerprint: string): Promise<boolean>;

  saveEvidence(runId: string, evidence: PurchasedEvidence): Promise<void>;
  listEvidence(runId: string): Promise<PurchasedEvidence[]>;
  getRunView(runId: string): Promise<RunView | undefined>;
  reset?(): Promise<void>;
}

export function kstDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
