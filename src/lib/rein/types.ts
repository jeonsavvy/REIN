export type ProductId = "market_snapshot" | "github_health";
export type RuntimeMode = "demo" | "live";
export type StorageMode = "memory" | "firestore";
export type ReportRecoveryState = "running" | "failed" | "succeeded";
export type SelectionMode = "gemini" | "rules";
export type ReportMode = "preview" | "gemini" | "fallback";

export interface ProductDefinition {
  id: ProductId;
  name: string;
  shortName: string;
  description: string;
  priceAtomic: string;
  sourceName: string;
  sourceUrl: string;
  route: string;
}

export interface CatalogProduct extends ProductDefinition {
  available: boolean;
  snapshotId?: string;
  fetchedAt?: string;
  expiresAt?: string;
  unavailableReason?: string;
}

export interface MarketSnapshotData {
  kind: "market_snapshot";
  asOf: string;
  assets: Array<{
    symbol: "SOL" | "ETH";
    priceUsd: number;
    change24hPct: number;
    marketCapUsd: number;
  }>;
}

export interface GithubHealthData {
  kind: "github_health";
  asOf: string;
  repositories: Array<{
    ecosystem: "Solana" | "Ethereum";
    repository: string;
    stars: number;
    forks: number;
    openIssues: number;
    commits30d: number;
    commits30dCapped: boolean;
    pushedAt: string;
  }>;
}

export type SnapshotData = MarketSnapshotData | GithubHealthData;

export interface Snapshot {
  id: string;
  productId: ProductId;
  sourceName: string;
  sourceUrl: string;
  fetchedAt: string;
  expiresAt: string;
  requestHash: string;
  data: SnapshotData;
}

export interface ProcurementSelection {
  productId: ProductId;
  rationale: string;
}

export interface ProcurementPlan {
  selections: ProcurementSelection[];
  decisionSummary: string;
}

export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "denied"
  | "failed"
  | "reconciling";

export interface RunRecord {
  id: string;
  goal: string;
  maxBudgetAtomic: string;
  reservedAtomic: string;
  spentAtomic: string;
  status: RunStatus;
  mode: RuntimeMode;
  preset?: string;
  claimId?: string;
  nextEventSeq: number;
  summary?: ResearchBrief;
  selectionMode?: SelectionMode;
  reportMode?: ReportMode;
  error?: RunError | null;
  reportRecoveryState?: ReportRecoveryState;
  reportRecoveryAttempts?: number;
  reportRecoveryStartedAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type RunEventType =
  | "run.started"
  | "catalog.loaded"
  | "selection.fallback"
  | "choice.explained"
  | "policy.approved"
  | "policy.denied"
  | "payment.requested"
  | "payment.settled"
  | "payment.reconciling"
  | "data.received"
  | "report.preview_ready"
  | "report.completed"
  | "report.retry_started"
  | "report.retry_completed"
  | "report.retry_failed"
  | "run.error";

export interface RunEvent {
  id: string;
  seq: number;
  type: RunEventType;
  tone: "neutral" | "pending" | "success" | "warning" | "danger";
  title: string;
  detail: string;
  at: string;
  productId?: ProductId;
  amountAtomic?: string;
  receipt?: PaymentReceipt;
}

export type PaymentStatus =
  | "reserved"
  | "settled"
  | "failed"
  | "reconciling";

export interface PaymentRecord {
  id: string;
  runId: string;
  productId: ProductId;
  snapshotId: string;
  snapshotHash: string;
  quotaKey: string;
  requestFingerprint: string;
  amountAtomic: string;
  network: string;
  asset: string;
  payTo: string;
  status: PaymentStatus;
  receipt?: PaymentReceipt;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentReceipt {
  paymentId: string;
  productId: ProductId;
  amountAtomic: string;
  decimals: 6;
  network: string;
  asset: string;
  payer: string;
  payee: string;
  signature: string;
  explorerUrl?: string;
  settledAt: string;
  mode: RuntimeMode;
}

export interface PurchasedEvidence {
  productId: ProductId;
  snapshotId: string;
  data: SnapshotData;
  receipt: PaymentReceipt;
}

export interface ResearchBrief {
  headline: string;
  executiveSummary: string;
  findings: Array<{
    label: string;
    value: string;
    interpretation: string;
  }>;
  caveats: string[];
  generatedBy: "Gemini 3.5 Flash" | "REIN 규칙 기반 분석";
}

export interface RunError {
  code:
    | "VALIDATION_ERROR"
    | "POLICY_DENIED"
    | "UPSTREAM_UNAVAILABLE"
    | "INSUFFICIENT_DEVNET_BALANCE"
    | "PAYMENT_FAILED"
    | "PAYMENT_RECONCILING"
    | "MODEL_TIMEOUT"
    | "MODEL_ERROR"
    | "USAGE_LIMIT_REACHED"
    | "INTERNAL_ERROR";
  message: string;
  recovery: string;
}

export interface RunView {
  run: RunRecord;
  events: RunEvent[];
  payments: PaymentRecord[];
  evidence: PurchasedEvidence[];
}

export interface NewRunInput {
  goal: string;
  maxBudgetAtomic: string;
  preset?: string;
  mode: RuntimeMode;
}

export interface UsageAdmission {
  quotaKey: string;
  clientKey: string;
  runUnits: number;
  modelUnits: number;
  globalRunLimit: number;
  clientRunLimit: number;
  globalModelLimit: number;
  clientModelLimit: number;
}

export interface ReservePaymentInput {
  payment: PaymentRecord;
  dailyLimitAtomic: string;
}
