"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import {
  DEFAULT_BUDGET_ATOMIC,
  DEMO_PRESET_GOAL,
  MAX_RUN_ATOMIC,
} from "@/lib/proofbuy/constants";
import {
  formatUsdcAtomic,
  parseUsdcDisplay,
  safeSubtractAtomic,
} from "@/lib/proofbuy/amount";
import type {
  CatalogProduct,
  PaymentReceipt,
  ProductId,
  RunEvent,
  RunStatus,
  RunView,
  RuntimeMode,
} from "@/lib/proofbuy/types";

const RUN_EVENT_TYPES: RunEvent["type"][] = [
  "run.started",
  "catalog.loaded",
  "selection.fallback",
  "choice.explained",
  "policy.approved",
  "policy.denied",
  "payment.requested",
  "payment.settled",
  "payment.reconciling",
  "data.received",
  "report.preview_ready",
  "report.completed",
  "report.retry_started",
  "report.retry_completed",
  "report.retry_failed",
  "run.error",
];

const TERMINAL_EVENTS = new Set<RunEvent["type"]>([
  "policy.denied",
  "payment.reconciling",
  "report.completed",
  "run.error",
]);

const STATUS_LABELS: Record<RunStatus | "idle", string> = {
  idle: "준비됨",
  queued: "대기 중",
  running: "조사 중",
  completed: "완료",
  denied: "정책 중단",
  failed: "실행 중단",
  reconciling: "결제 확인 중",
};

const PRODUCT_LABELS: Record<ProductId, string> = {
  market_snapshot: "시장 데이터",
  github_health: "개발 데이터",
};

type PhaseState = "waiting" | "active" | "done" | "warning" | "error";

interface Phase {
  id: "select" | "policy" | "payment" | "report";
  title: string;
  description: string;
  state: PhaseState;
}

function Mark() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className="brand-mark">
      <path d="M6 4v32M13 4v32" />
      <path d="M13 7h9.5c5 0 8 2.7 8 7s-3 7-8 7H13" />
      <path d="m21 21 11 15" />
      <path d="M5 4h9M5 36h9" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M6 3h7v7M13 3 6 10M12 9v4H3V4h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
      />
    </svg>
  );
}

function shorten(value: string, head = 9, tail = 7): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function receiptFromEvents(events: RunEvent[]): PaymentReceipt[] {
  const byId = new Map<string, PaymentReceipt>();
  for (const event of events) {
    if (event.receipt) byId.set(event.receipt.paymentId, event.receipt);
  }
  return [...byId.values()];
}

function formatObservedAt(value?: string): string {
  if (!value) return "준비 중";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function phaseState(
  events: RunEvent[],
  status: RunStatus | "idle",
  mode: RuntimeMode,
  degradedReport: boolean,
): Phase[] {
  const has = (type: RunEvent["type"]) => events.some((event) => event.type === type);
  const failed = status === "failed" || status === "denied";
  const reconciling = status === "reconciling";
  const selectionDone = has("choice.explained") || has("policy.denied");
  const selectionFallback = has("selection.fallback");
  const policyDone = has("policy.approved");
  const paymentStarted = has("payment.requested");
  const paymentDone = has("data.received");
  const reportDone = has("report.completed") || has("report.retry_completed");

  const selectState: PhaseState = selectionDone
    ? selectionFallback
      ? "warning"
      : "done"
    : failed
      ? "error"
      : status === "running"
        ? "active"
        : "waiting";
  const policyState: PhaseState = policyDone
    ? "done"
    : status === "denied"
      ? "error"
      : selectionDone && status === "running"
        ? "active"
        : "waiting";
  const paymentState: PhaseState = reconciling
    ? "warning"
    : paymentDone
      ? "done"
      : failed && paymentStarted
        ? "error"
        : policyDone && status === "running"
          ? "active"
          : "waiting";
  const reportState: PhaseState = reportDone
    ? degradedReport
      ? "warning"
      : "done"
    : failed && paymentDone
      ? "error"
      : paymentDone && status === "running"
        ? "active"
        : "waiting";

  return [
    {
      id: "select",
      title: "데이터 선택",
      description: "목표와 관련 있는 상품만 고릅니다.",
      state: selectState,
    },
    {
      id: "policy",
      title: "정책 검사",
      description: "가격, 주소, 네트워크와 예산을 코드로 확인합니다.",
      state: policyState,
    },
    {
      id: "payment",
      title: "결제 및 수령",
      description:
        mode === "live"
          ? "REIN 전용 Devnet 지갑이 자동 서명하고 고정된 데이터를 받습니다."
          : "결제 과정을 시뮬레이션하고 고정된 데이터를 받습니다.",
      state: paymentState,
    },
    {
      id: "report",
      title: "보고서 작성",
      description: "구매한 근거만 사용해 결론과 한계를 정리합니다.",
      state: reportState,
    },
  ];
}

export function ReinDashboard() {
  const [goal, setGoal] = useState(DEMO_PRESET_GOAL);
  const [budgetInput, setBudgetInput] = useState(
    formatUsdcAtomic(DEFAULT_BUDGET_ATOMIC),
  );
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [mode, setMode] = useState<RuntimeMode>("demo");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [runId, setRunId] = useState<string>();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [view, setView] = useState<RunView>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [copied, setCopied] = useState<string>();
  const [retryingReport, setRetryingReport] = useState(false);
  const [reportRetryError, setReportRetryError] = useState<string>();
  const sourceRef = useRef<EventSource | null>(null);
  const restoredRef = useRef(false);

  const budgetAtomic = useMemo(() => {
    try {
      return parseUsdcDisplay(budgetInput, "budget");
    } catch {
      return undefined;
    }
  }, [budgetInput]);

  const budgetError = useMemo(() => {
    if (!budgetAtomic) return "USDC 금액을 소수점 여섯 자리 이내로 입력하세요.";
    if (BigInt(budgetAtomic) > MAX_RUN_ATOMIC) {
      return `한 번의 조사에는 최대 ${formatUsdcAtomic(MAX_RUN_ATOMIC.toString())} USDC까지 사용할 수 있습니다.`;
    }
    return undefined;
  }, [budgetAtomic]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const response = await fetch("/api/catalog", { cache: "no-store" });
      if (!response.ok) throw new Error("Catalog request failed");
      const body = (await response.json()) as {
        mode: RuntimeMode;
        products: CatalogProduct[];
      };
      setMode(body.mode);
      setCatalog(body.products);
    } catch {
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const refreshRun = useCallback(async (id: string): Promise<boolean> => {
    const response = await fetch(`/api/runs/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!response.ok) return false;
    const body = (await response.json()) as RunView;
    setView(body);
    setEvents(body.events);
    setMode(body.run.mode);
    if (["completed", "denied", "failed", "reconciling"].includes(body.run.status)) {
      sourceRef.current?.close();
      setSubmitting(false);
    }
    return true;
  }, []);

  const connectToRun = useCallback(
    (id: string) => {
      sourceRef.current?.close();
      const source = new EventSource(`/api/runs/${encodeURIComponent(id)}/events`);
      sourceRef.current = source;
      const receive = (message: MessageEvent<string>) => {
        const event = JSON.parse(message.data) as RunEvent;
        setEvents((current) => {
          const byId = new Map(current.map((item) => [item.id, item]));
          byId.set(event.id, event);
          return [...byId.values()].sort((left, right) => left.seq - right.seq);
        });
        if (TERMINAL_EVENTS.has(event.type)) {
          source.close();
          setSubmitting(false);
          void refreshRun(id);
        } else if (event.type === "report.preview_ready") {
          void refreshRun(id);
        }
      };
      for (const type of RUN_EVENT_TYPES) source.addEventListener(type, receive);
      source.onerror = () => {
        void refreshRun(id);
      };
    },
    [refreshRun],
  );

  useEffect(() => {
    let active = true;
    fetch("/api/catalog", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Catalog request failed");
        return (await response.json()) as {
          mode: RuntimeMode;
          products: CatalogProduct[];
        };
      })
      .then((body) => {
        if (!active) return;
        setMode(body.mode);
        setCatalog(body.products);
      })
      .catch(() => {
        if (active) setCatalog([]);
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });
    return () => {
      active = false;
      sourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const id = new URL(window.location.href).searchParams.get("run");
    if (!id) return;
    const timer = window.setTimeout(() => {
      setRunId(id);
      setSubmitting(true);
      void refreshRun(id).then((found) => {
        if (!found) {
          setSubmitting(false);
          setFormError("이 주소에 저장된 조사 결과를 찾을 수 없습니다.");
          return;
        }
        connectToRun(id);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [connectToRun, refreshRun]);

  async function startRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!budgetAtomic || budgetError) {
      setFormError(budgetError ?? "예산을 확인하세요.");
      return;
    }
    setFormError(undefined);
    setReportRetryError(undefined);
    setEvents([]);
    setView(undefined);
    setSubmitting(true);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          maxBudgetAtomic: budgetAtomic,
          preset: goal === DEMO_PRESET_GOAL ? "SOL vs ETH momentum" : undefined,
        }),
      });
      const body = (await response.json()) as {
        runId?: string;
        error?: { message?: string };
      };
      if (!response.ok || !body.runId) {
        throw new Error(body.error?.message ?? "조사를 시작할 수 없습니다.");
      }
      setRunId(body.runId);
      window.history.replaceState({}, "", `?run=${encodeURIComponent(body.runId)}`);
      connectToRun(body.runId);
      window.setTimeout(() => {
        document.getElementById("run-progress")?.scrollIntoView({
          behavior: "auto",
          block: "start",
        });
      }, 80);
    } catch (error) {
      setSubmitting(false);
      setFormError(
        error instanceof Error ? error.message : "조사를 시작할 수 없습니다.",
      );
    }
  }

  function resetRun() {
    sourceRef.current?.close();
    setRunId(undefined);
    setEvents([]);
    setView(undefined);
    setSubmitting(false);
    setFormError(undefined);
    setReportRetryError(undefined);
    window.history.replaceState({}, "", window.location.pathname);
    document.getElementById("research-brief")?.scrollIntoView({
      behavior: "auto",
      block: "start",
    });
  }

  async function retryReport() {
    if (!runId || retryingReport) return;
    setRetryingReport(true);
    setReportRetryError(undefined);
    try {
      const response = await fetch(
        `/api/runs/${encodeURIComponent(runId)}/report`,
        { method: "POST" },
      );
      const body = (await response.json()) as RunView & {
        error?: { message?: string };
      };
      if (!response.ok || !body.run) {
        throw new Error(body.error?.message ?? "Gemini 분석을 다시 시작할 수 없습니다.");
      }
      setView(body);
      setEvents(body.events);
      setMode(body.run.mode);
    } catch (error) {
      setReportRetryError(
        error instanceof Error
          ? error.message
          : "Gemini 분석을 다시 시작할 수 없습니다.",
      );
      await refreshRun(runId);
    } finally {
      setRetryingReport(false);
    }
  }

  async function copyText(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied((current) => (current === key ? undefined : current)), 1600);
  }

  const receipts = useMemo(() => {
    const fromView =
      view?.payments.flatMap((payment) => (payment.receipt ? [payment.receipt] : [])) ?? [];
    return fromView.length > 0 ? fromView : receiptFromEvents(events);
  }, [events, view]);

  const spentAtomic =
    view?.run.spentAtomic ??
    receipts
      .reduce(
        (sum, receipt) => BigInt(sum) + BigInt(receipt.amountAtomic),
        0n,
      )
      .toString();
  const displayedBudget =
    view?.run.maxBudgetAtomic ?? budgetAtomic ?? DEFAULT_BUDGET_ATOMIC;
  const remainingAtomic = useMemo(() => {
    try {
      return safeSubtractAtomic(displayedBudget, spentAtomic);
    } catch {
      return "0";
    }
  }, [displayedBudget, spentAtomic]);
  const status: RunStatus | "idle" =
    view?.run.status ?? (submitting ? "running" : "idle");
  const summary = view?.run.summary;
  const usedFallbackReport =
    mode === "live" &&
    status === "completed" &&
    (view?.run.reportMode === "fallback" ||
      (!view?.run.reportMode && summary?.generatedBy === "REIN 규칙 기반 분석"));
  const reportPreview =
    mode === "live" &&
    status === "running" &&
    view?.run.reportMode === "preview" &&
    Boolean(summary);
  const usedFallbackSelection =
    mode === "live" && view?.run.selectionMode === "rules";
  const lastEvent = events.at(-1);
  const phases = useMemo(
    () => phaseState(events, status, mode, usedFallbackReport),
    [events, mode, status, usedFallbackReport],
  );
  const availableProducts = catalog.filter((product) => product.available);
  const allProductsPrice = availableProducts
    .reduce((total, product) => total + BigInt(product.priceAtomic), 0n)
    .toString();
  const runError = view?.run.error;
  const reportAttempts = view?.run.reportRecoveryAttempts ?? 0;
  const canRetryReport = Boolean(
    runId &&
      mode === "live" &&
      reportAttempts < 2 &&
      view?.run.reportRecoveryState !== "running" &&
      view?.run.reportRecoveryState !== "succeeded" &&
      (usedFallbackReport ||
        (status === "failed" &&
          view?.evidence.length &&
          (runError?.code === "MODEL_TIMEOUT" || runError?.code === "MODEL_ERROR"))),
  );
  const runUrl = runId && typeof window !== "undefined" ? window.location.href : undefined;

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand-lockup" href="/" aria-label="REIN 홈">
          <Mark />
          <span className="brand-name">REIN</span>
        </Link>
        <div className="topbar-meta">
          <span className={`mode-badge ${mode}`} data-testid="mode-badge">
            <i />
            {mode === "live"
              ? "Solana Devnet · 테스트 결제"
              : "데모 · 온체인 전송 없음"}
          </span>
          <span className="model-label">Gemini 3.5 Flash</span>
        </div>
      </header>

      <section className="intro-band" aria-labelledby="page-title">
        <p className="product-label">예산 안에서 필요한 데이터를 직접 구매하는 AI 에이전트</p>
        <h1 id="page-title">
          목표와 예산만 정하면,
          <br />
          <em>데이터 구매까지 끝냅니다.</em>
        </h1>
        <div className="intro-support">
          <p>
            사용자는 조사 목표와 지출 상한만 정합니다. Gemini가 살 데이터를 고르면
            정책 엔진이 가격·자산·수취 주소를 검사하고, REIN 전용 지갑이 허용된
            결제를 자동으로 서명합니다.
          </p>
          <ul aria-label="자율 결제 방식">
            <li>실행 후 추가 승인 없음</li>
            <li>정책 검사 후 서버 지갑 서명</li>
            <li>Solana Devnet 실제 영수증</li>
          </ul>
        </div>
      </section>

      <section className="workspace-grid" aria-label="REIN 조사 작업 공간">
        <aside className="brief-panel" id="research-brief" aria-labelledby="brief-title">
          <div className="section-heading">
            <div>
              <span>조사 설정</span>
              <h2 id="brief-title">무엇을 알아볼까요?</h2>
            </div>
          </div>

          <form onSubmit={startRun}>
            <label className="field-label" htmlFor="goal">
              조사 목표
            </label>
            <textarea
              id="goal"
              name="goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              autoComplete="off"
              required
              minLength={8}
              maxLength={500}
              disabled={submitting}
              rows={5}
            />

            <label className="field-label budget-label" htmlFor="budget">
              최대 예산
            </label>
            <div className={`budget-control ${budgetError ? "invalid" : ""}`}>
              <input
                id="budget"
                name="maxBudgetUsdc"
                type="text"
                value={budgetInput}
                onChange={(event) =>
                  setBudgetInput(event.target.value.replace(/[^\d.]/g, "").slice(0, 10))
                }
                inputMode="decimal"
                autoComplete="off"
                required
                disabled={submitting}
                aria-describedby="budget-help"
                aria-invalid={Boolean(budgetError)}
              />
              <span>USDC</span>
            </div>
            <p id="budget-help" className={`field-help ${budgetError ? "error" : ""}`}>
              {budgetError ?? "Circle Devnet 테스트 USDC만 사용합니다. Mainnet 자산은 쓰지 않습니다."}
            </p>

            <div className="budget-presets" aria-label="예산 빠른 선택">
              {["0.001", "0.003", "0.005"].map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setBudgetInput(value)}
                  className={budgetInput === value ? "active" : ""}
                  aria-pressed={budgetInput === value}
                  disabled={submitting}
                >
                  {value} USDC
                </button>
              ))}
            </div>

            <div className="catalog-preview">
              <div className="catalog-heading">
                <span>구매 가능한 데이터</span>
                <button
                  type="button"
                  onClick={() => void loadCatalog()}
                  disabled={catalogLoading || submitting}
                >
                  새로고침
                </button>
              </div>
              {catalogLoading ? (
                <div
                  className="catalog-loading"
                  role="status"
                  aria-live="polite"
                  aria-label="데이터 상품 불러오는 중"
                >
                  <span />
                  <span />
                </div>
              ) : catalog.length === 0 ? (
                <div className="catalog-unavailable" role="status">
                  <strong>데이터 소스를 불러오지 못했습니다.</strong>
                  <span>잠시 후 새로고침해 주세요.</span>
                </div>
              ) : (
                <div className="catalog-items">
                  {catalog.map((product) => (
                    <article className={!product.available ? "unavailable" : ""} key={product.id}>
                      <div>
                        <strong>{product.shortName}</strong>
                        <span>{product.description}</span>
                        <small>
                          {product.available
                            ? `${product.sourceName} · ${formatObservedAt(product.fetchedAt)} 기준`
                            : product.unavailableReason ?? "현재 구매할 수 없습니다."}
                        </small>
                      </div>
                      <b>{formatUsdcAtomic(product.priceAtomic)} USDC</b>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="purchase-preview">
              <span>전체 구매 시</span>
              <strong>{formatUsdcAtomic(allProductsPrice)} USDC</strong>
            </div>

            <button
              className="primary-action"
              disabled={
                submitting ||
                goal.trim().length < 8 ||
                Boolean(budgetError) ||
                availableProducts.length === 0
              }
              type="submit"
              data-testid="run-button"
            >
              {submitting ? "조사하는 중…" : "이 예산으로 조사 시작"}
              <span aria-hidden="true">→</span>
            </button>
            {formError && (
              <p className="inline-error" role="alert">
                {formError}
              </p>
            )}
          </form>

          <div className="safety-note">
            <strong>브라우저 지갑을 연결하지 않습니다.</strong>
            <p>
              REIN 전용 Devnet 지갑은 서버 정책이 허용한 결제만 서명합니다. Gemini와
              브라우저는 결제 키를 볼 수 없습니다.
            </p>
          </div>
        </aside>

        <section className="run-panel" id="run-progress" aria-labelledby="progress-title">
          <div className="run-heading">
            <div>
              <span>진행 상황</span>
              <h2 id="progress-title">
                {reportPreview
                  ? "결제는 끝났고 Gemini가 결과를 정리하고 있습니다"
                  : usedFallbackReport
                  ? "결제된 데이터로 결과를 보존했습니다"
                  : summary
                  ? "조사가 끝났습니다"
                  : status === "idle"
                    ? "시작하면 네 단계로 진행됩니다"
                    : "데이터 구매를 진행하고 있습니다"}
              </h2>
            </div>
            <span
              className={`status-pill ${reportPreview ? "processing" : usedFallbackReport ? "degraded" : status}`}
              aria-live="polite"
              data-testid="run-status"
              data-status={status}
            >
              <i />{" "}
              {reportPreview
                ? "결제 완료 · 분석 중"
                : usedFallbackReport
                  ? "완료 · 규칙 기반"
                  : STATUS_LABELS[status]}
            </span>
          </div>

          {summary ? (
            <>
              {usedFallbackSelection && (
                <div className="selection-mode-notice" role="status">
                  <strong>상품 선택 · 고정 규칙 사용</strong>
                  <p>
                    Gemini 응답이 늦어 목표 키워드, 상품 가격, 예산으로 구매 대상을
                    골랐습니다. 결제 정책과 지출 한도는 그대로 적용됐습니다.
                  </p>
                </div>
              )}
              {reportPreview && (
                <div className="report-mode-notice processing" role="status">
                  <div>
                    <strong>결제 완료 · Gemini 분석 중</strong>
                    <p>
                      구매한 데이터의 계산 결과를 먼저 표시했습니다. Gemini가 최종
                      문장을 작성하는 동안 영수증과 아래 결과를 바로 확인할 수 있습니다.
                    </p>
                  </div>
                </div>
              )}
              {usedFallbackReport && (
                <div className="report-mode-notice" role="status">
                  <div>
                    <strong>결제 완료 · 규칙 기반 결과</strong>
                    <p>
                      Gemini가 제한 시간 안에 응답하지 않아 구매한 데이터는 REIN의
                      계산 규칙으로 정리했습니다. 추가 결제는 발생하지 않았습니다.
                    </p>
                    {reportRetryError && <small role="alert">{reportRetryError}</small>}
                  </div>
                  {canRetryReport && (
                    <button
                      type="button"
                      onClick={() => void retryReport()}
                      disabled={retryingReport}
                    >
                      {retryingReport ? "Gemini 분석 중…" : "Gemini 분석만 다시 시도"}
                    </button>
                  )}
                </div>
              )}
              <article className="result-spotlight" data-testid="research-report">
                <span className="result-label">
                  {usedFallbackReport
                    ? "규칙 기반으로 보존한 결론"
                    : reportPreview
                      ? "구매 데이터를 먼저 계산한 결과"
                    : mode === "live"
                      ? "구매한 근거로 만든 결론"
                      : "데모 데이터로 만든 결론"}
                </span>
                <h3>{summary.headline}</h3>
                <p>{summary.executiveSummary}</p>
                <dl>
                  <div>
                    <dt>총 지출</dt>
                    <dd>{formatUsdcAtomic(spentAtomic)} USDC</dd>
                  </div>
                  <div>
                    <dt>영수증</dt>
                    <dd>{receipts.length}건</dd>
                  </div>
                  <div>
                    <dt>남은 예산</dt>
                    <dd>{formatUsdcAtomic(remainingAtomic)} USDC</dd>
                  </div>
                </dl>
                <div className="result-actions">
                  <a href="#receipts">영수증 확인</a>
                  {runUrl && (
                    <button type="button" onClick={() => void copyText(runUrl, "run-url")}>
                      {copied === "run-url" ? "주소 복사됨" : "결과 주소 복사"}
                    </button>
                  )}
                </div>
              </article>
            </>
          ) : (
            <div className="run-intro">
              <p>
                {lastEvent?.detail ??
                  "실행하면 추가 승인 없이 상품 선택, 정책 검사, 서버 지갑 결제, 보고서 작성까지 이어집니다."}
              </p>
              <div className="budget-summary">
                <div>
                  <span>사용한 예산</span>
                  <strong>{formatUsdcAtomic(spentAtomic)} USDC</strong>
                </div>
                <div>
                  <span>최대 예산</span>
                  <strong>{formatUsdcAtomic(displayedBudget)} USDC</strong>
                </div>
              </div>
            </div>
          )}

          {runError && (
            <div className={`recovery-panel ${status}`} role="alert">
              <span>{runError.code === "INSUFFICIENT_DEVNET_BALANCE" ? "잔액 부족" : "실행 중단"}</span>
              <h3>{runError.message}</h3>
              <p>{runError.recovery}</p>
              <div>
                {canRetryReport && (
                  <button
                    type="button"
                    onClick={() => void retryReport()}
                    disabled={retryingReport}
                  >
                    {retryingReport ? "Gemini 분석 중…" : "결제 없이 분석 다시 시도"}
                  </button>
                )}
                {runError.code === "INSUFFICIENT_DEVNET_BALANCE" && (
                  <>
                    <a href="https://faucet.solana.com/" target="_blank" rel="noreferrer">
                      Devnet SOL 받기 <ExternalIcon />
                    </a>
                    <a
                      href="https://faucet.circle.com/?allow=true"
                      target="_blank"
                      rel="noreferrer"
                    >
                      테스트 USDC 받기 <ExternalIcon />
                    </a>
                  </>
                )}
                <button type="button" onClick={resetRun}>
                  새 조사 준비
                </button>
              </div>
              {reportRetryError && <small role="alert">{reportRetryError}</small>}
            </div>
          )}

          <ol className="phase-list" aria-label="조사 진행 단계">
            {phases.map((phase, index) => (
              <li key={phase.id} className={phase.state}>
                <span className="phase-number">
                  {phase.state === "done" ? "✓" : index + 1}
                </span>
                <div>
                  <strong>{phase.title}</strong>
                  <p>{phase.description}</p>
                </div>
                <span className="phase-state">
                  {phase.state === "done"
                    ? "완료"
                    : phase.state === "active"
                      ? "진행 중"
                      : phase.state === "warning"
                        ? "확인 필요"
                        : phase.state === "error"
                          ? "중단"
                          : "대기"}
                </span>
              </li>
            ))}
          </ol>

          <details className="technical-log" open={status === "failed" || status === "reconciling"}>
            <summary>
              <span>실행 상세</span>
              <b>{events.length}개 기록</b>
            </summary>
            {events.length === 0 ? (
              <p className="log-empty">조사를 시작하면 선택과 결제 기록이 생성됩니다.</p>
            ) : (
              <ol>
                {events.map((event) => (
                  <li key={event.id} className={event.tone}>
                    <span>{String(event.seq).padStart(2, "0")}</span>
                    <div>
                      <strong>{event.title}</strong>
                      <p>{event.detail}</p>
                      {event.amountAtomic && (
                        <code>{formatUsdcAtomic(event.amountAtomic)} USDC</code>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </details>
        </section>
      </section>

      {receipts.length > 0 && (
        <section className="receipt-section" id="receipts" aria-labelledby="receipt-title">
          <div className="wide-heading">
            <div>
              <span>결제 내역</span>
              <h2 id="receipt-title">
                {mode === "live" ? "Solana 영수증" : "데모 영수증"} {receipts.length}건
              </h2>
            </div>
            <p>
              {mode === "live"
                ? "각 거래를 Solana Explorer에서 직접 확인할 수 있습니다."
                : "데모 영수증에는 블록체인 거래가 없습니다."}
            </p>
          </div>
          <div className="receipt-grid" data-testid="receipt-list">
            {receipts.map((receipt) => (
              <article className="receipt-card" key={receipt.paymentId}>
                <div className="receipt-card-top">
                  <div>
                    <span>{receipt.mode === "live" ? "결제 완료" : "데모 기록"}</span>
                    <h3>{PRODUCT_LABELS[receipt.productId]}</h3>
                  </div>
                  <strong>{formatUsdcAtomic(receipt.amountAtomic)} USDC</strong>
                </div>
                <dl>
                  <div>
                    <dt>{receipt.mode === "live" ? "REIN 에이전트 지갑" : "데모 구매자"}</dt>
                    <dd>{shorten(receipt.payer, 12, 9)}</dd>
                  </div>
                  <div>
                    <dt>{receipt.mode === "live" ? "데이터 판매자" : "데모 판매자"}</dt>
                    <dd>{shorten(receipt.payee, 12, 9)}</dd>
                  </div>
                </dl>
                <div className="signature-block">
                  <span>거래 서명</span>
                  <code>{receipt.signature}</code>
                </div>
                <div className="receipt-actions">
                  {receipt.explorerUrl ? (
                    <a href={receipt.explorerUrl} target="_blank" rel="noreferrer">
                      Explorer에서 확인 <ExternalIcon />
                    </a>
                  ) : (
                    <span>온체인 거래 아님</span>
                  )}
                  <button
                    type="button"
                    onClick={() => void copyText(receipt.signature, receipt.paymentId)}
                  >
                    {copied === receipt.paymentId ? "복사됨" : "서명 복사"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {summary && (
        <section className="evidence-section" aria-labelledby="evidence-title">
          <div className="wide-heading">
            <div>
              <span>비교 결과</span>
              <h2 id="evidence-title">구매한 데이터로 본 결과</h2>
            </div>
            <p>보고서에는 결론과 데이터 한계를 함께 기록합니다.</p>
          </div>
          <div className="finding-list">
            {summary.findings.map((finding, index) => (
              <article key={`${finding.label}-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{finding.label}</p>
                <strong>{finding.value}</strong>
                <small>{finding.interpretation}</small>
              </article>
            ))}
          </div>
          <div className="evidence-meta">
            <div className="provenance-list">
              <h3>구매한 데이터</h3>
              {view?.evidence.map((item) => (
                <div key={item.snapshotId}>
                  <strong>{PRODUCT_LABELS[item.productId]}</strong>
                  <span>{formatObservedAt(item.data.asOf)} 기준</span>
                  <code>{shorten(item.snapshotId, 16, 8)}</code>
                </div>
              ))}
            </div>
            <div className="caveat-list">
              <h3>해석할 때 주의할 점</h3>
              {summary.caveats.map((caveat) => (
                <p key={caveat}>{caveat}</p>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="footer">
        <span>REIN · 사람은 한도를 정하고, 에이전트는 결제를 끝냅니다.</span>
        <span>Gemini 3.5 Flash · x402 · Solana Devnet · Cloud Run</span>
      </footer>
    </main>
  );
}
