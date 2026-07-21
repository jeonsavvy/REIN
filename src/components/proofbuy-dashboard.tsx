"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { DEFAULT_BUDGET_ATOMIC, DEMO_PRESET_GOAL } from "@/lib/proofbuy/constants";
import { formatUsdcAtomic, safeSubtractAtomic } from "@/lib/proofbuy/amount";
import type {
  CatalogProduct,
  PaymentReceipt,
  RunEvent,
  RunView,
  RuntimeMode,
} from "@/lib/proofbuy/types";

const RUN_EVENT_TYPES: RunEvent["type"][] = [
  "run.started",
  "catalog.loaded",
  "choice.explained",
  "policy.approved",
  "policy.denied",
  "payment.requested",
  "payment.settled",
  "payment.reconciling",
  "data.received",
  "report.completed",
  "run.error",
];

const TERMINAL_EVENTS = new Set<RunEvent["type"]>([
  "policy.denied",
  "payment.reconciling",
  "report.completed",
  "run.error",
]);

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

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 3h7v7M13 3 6 10M12 9v4H3V4h4" fill="none" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  );
}

function shorten(value: string, head = 9, tail = 7): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function elapsedLabel(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function receiptFromEvents(events: RunEvent[]): PaymentReceipt[] {
  const byId = new Map<string, PaymentReceipt>();
  for (const event of events) {
    if (event.receipt) byId.set(event.receipt.paymentId, event.receipt);
  }
  return [...byId.values()];
}

export function ReinDashboard() {
  const [goal, setGoal] = useState(DEMO_PRESET_GOAL);
  const [budget, setBudget] = useState(DEFAULT_BUDGET_ATOMIC);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [mode, setMode] = useState<RuntimeMode>("demo");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [runId, setRunId] = useState<string>();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [view, setView] = useState<RunView>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();
  const sourceRef = useRef<EventSource | null>(null);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const response = await fetch("/api/catalog", { cache: "no-store" });
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

  const refreshRun = useCallback(async (id: string) => {
    const response = await fetch(`/api/runs/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (response.ok) setView((await response.json()) as RunView);
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
        }
      };
      for (const type of RUN_EVENT_TYPES) source.addEventListener(type, receive);
      source.onerror = () => {
        void refreshRun(id);
      };
    },
    [refreshRun],
  );

  async function startRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    setEvents([]);
    setView(undefined);
    setSubmitting(true);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          maxBudgetAtomic: budget,
          preset: goal === DEMO_PRESET_GOAL ? "SOL vs ETH momentum" : undefined,
        }),
      });
      const body = (await response.json()) as {
        runId?: string;
        error?: { message?: string };
      };
      if (!response.ok || !body.runId) {
        throw new Error(body.error?.message ?? "Run을 시작할 수 없습니다.");
      }
      setRunId(body.runId);
      connectToRun(body.runId);
    } catch (error) {
      setSubmitting(false);
      setFormError(error instanceof Error ? error.message : "Run start failed");
    }
  }

  const receipts = useMemo(() => {
    const fromView =
      view?.payments.flatMap((payment) => (payment.receipt ? [payment.receipt] : [])) ?? [];
    return fromView.length > 0 ? fromView : receiptFromEvents(events);
  }, [events, view]);

  const spentAtomic =
    view?.run.spentAtomic ??
    receipts.reduce((sum, receipt) => (BigInt(sum) + BigInt(receipt.amountAtomic)).toString(), "0");
  const displayedBudget = view?.run.maxBudgetAtomic ?? budget;
  const remainingAtomic = useMemo(() => {
    try {
      return safeSubtractAtomic(displayedBudget, spentAtomic);
    } catch {
      return "0";
    }
  }, [displayedBudget, spentAtomic]);
  const status = view?.run.status ?? (submitting ? "running" : "idle");
  const lastEvent = events.at(-1);
  const progress = events.length === 0 ? 0 : lastEvent?.type === "report.completed" ? 100 : Math.min(92, 12 + events.length * 9);
  const summary = view?.run.summary;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <Mark />
          <div>
            <strong>REIN<sup>/</sup></strong>
            <span>Policy-bound commerce</span>
          </div>
        </div>
        <div className="topbar-meta">
          <span className={`mode-badge ${mode}`} data-testid="mode-badge">
            <i /> {mode === "live" ? "SOLANA DEVNET · LIVE" : "DEMO MODE · NO ON-CHAIN TX"}
          </span>
          <span className="model-label">Gemini 3.5 Flash / Vertex AI</span>
        </div>
      </header>

      <section className="intro-band" aria-labelledby="page-title">
        <div>
          <p className="kicker">AGENT COMMERCE / CONTROL PLANE 01</p>
          <h1 id="page-title">자율 구매에,<br /><em>증명의 고삐를.</em></h1>
        </div>
        <div className="intro-copy">
          <p>목표와 상한만 정하세요. REIN은 필요한 데이터를 고르고, 정책을 통과한 구매만 실행한 뒤 모든 결정을 영수증으로 남깁니다.</p>
          <span>AUTONOMY, HELD TO PROOF.</span>
          <div className="intro-index" aria-label="REIN demo constraints">
            <div><small>GOODS</small><b>02</b></div>
            <div><small>DEFAULT LIMIT</small><b>0.003</b></div>
            <div><small>SETTLEMENT</small><b>DEVNET</b></div>
          </div>
        </div>
      </section>

      <section className="operations-grid">
        <aside className="request-panel panel-rule" aria-labelledby="request-title">
          <div className="panel-heading">
            <span>01</span>
            <div>
              <p>REQUEST</p>
              <h2 id="request-title">조사 주문서</h2>
            </div>
          </div>
          <form onSubmit={startRun}>
            <label className="field-label" htmlFor="goal">Research goal</label>
            <textarea
              id="goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              minLength={8}
              maxLength={500}
              disabled={submitting}
              rows={6}
            />
            <div className="field-topline">
              <label className="field-label" htmlFor="budget">Hard budget</label>
              <output>{formatUsdcAtomic(budget)} test USDC</output>
            </div>
            <input
              id="budget"
              className="budget-input"
              value={budget}
              onChange={(event) => setBudget(event.target.value.replace(/\D/g, "").slice(0, 5) || "0")}
              inputMode="numeric"
              disabled={submitting}
              aria-describedby="budget-help"
            />
            <p id="budget-help" className="field-help">Atomic units · 1 USDC = 1,000,000</p>
            <div className="budget-presets" aria-label="Budget presets">
              {["1000", "3000", "5000"].map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setBudget(value)}
                  className={budget === value ? "active" : ""}
                  disabled={submitting}
                >
                  {formatUsdcAtomic(value)}
                </button>
              ))}
            </div>
            <button className="primary-action" disabled={submitting || goal.trim().length < 8} type="submit" data-testid="run-button">
              <span>{submitting ? "Procurement running" : "Run procurement"}</span>
              <ArrowIcon />
            </button>
            {formError && <p className="inline-error" role="alert">{formError}</p>}
          </form>
          <div className="safety-note">
            <span className="safety-mark">R</span>
            <p><strong>Policy holds the signing key.</strong> 모델은 키·주소·URL·가격을 만들 수 없습니다.</p>
          </div>
        </aside>

        <section className="ledger-panel panel-rule" aria-labelledby="ledger-title">
          <div className="panel-heading ledger-heading">
            <span>02</span>
            <div>
              <p>LIVE LEDGER</p>
              <h2 id="ledger-title">구매 결정 기록</h2>
            </div>
            <div className={`run-status ${status}`} aria-live="polite">
              <i /> {status.toUpperCase()}
            </div>
          </div>
          <div className="progress-track" aria-label={`Run progress ${progress}%`}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="ledger-body" data-testid="event-ledger">
            {events.length === 0 ? (
              <div className="ledger-empty">
                <div className="empty-sequence"><span>CATALOG</span><b /><span>POLICY</span><b /><span>PAYMENT</span><b /><span>PROOF</span></div>
                <p>실행하면 모든 자율 결정과 금액이 여기에 순서대로 기록됩니다.</p>
              </div>
            ) : (
              <ol className="event-list">
                {events.map((event) => (
                  <li key={event.id} className={`event-row ${event.tone}`}>
                    <div className="event-index">{String(event.seq).padStart(2, "0")}</div>
                    <div className="event-node"><span /></div>
                    <div className="event-copy">
                      <div className="event-title-line">
                        <strong>{event.title}</strong>
                        <time dateTime={event.at}>{elapsedLabel(event.at)}</time>
                      </div>
                      <p>{event.detail}</p>
                      {event.amountAtomic && <code>{formatUsdcAtomic(event.amountAtomic)} USDC</code>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <aside className="proof-panel" aria-labelledby="proof-title">
          <div className="panel-heading">
            <span>03</span>
            <div>
              <p>CONTROL</p>
              <h2 id="proof-title">예산과 영수증</h2>
            </div>
          </div>
          <div className="budget-meter">
            <p>SPENT / HARD LIMIT</p>
            <div className="budget-numbers"><strong>{formatUsdcAtomic(spentAtomic)}</strong><span>/ {formatUsdcAtomic(displayedBudget)}</span></div>
            <div className="meter-track"><span data-testid="budget-meter-fill" style={{ width: `${Math.min(100, Number((BigInt(spentAtomic) * 100n) / BigInt(displayedBudget === "0" ? "1" : displayedBudget)))}%` }} /></div>
            <div className="budget-foot"><span>Remaining</span><b>{formatUsdcAtomic(remainingAtomic)} USDC</b></div>
          </div>

          <div className="catalog-list">
            <div className="section-label"><span>AVAILABLE GOODS</span><button type="button" onClick={() => void loadCatalog()} disabled={catalogLoading}>Refresh</button></div>
            {catalogLoading ? (
              <div className="catalog-skeleton"><span /><span /></div>
            ) : catalog.length === 0 ? (
              <p className="rail-empty">Catalog unavailable</p>
            ) : catalog.map((product) => (
              <div className="catalog-row" key={product.id}>
                <i className={product.available ? "available" : "unavailable"} />
                <div><strong>{product.shortName}</strong><span>{product.available ? "Snapshot ready" : "Unavailable"}</span></div>
                <code>{formatUsdcAtomic(product.priceAtomic)}</code>
              </div>
            ))}
          </div>

          <div className="receipt-list" data-testid="receipt-list">
            <div className="section-label"><span>RECEIPTS</span><b>{receipts.length}</b></div>
            {receipts.length === 0 ? <p className="rail-empty">결제 후 검증 가능한 영수증이 표시됩니다.</p> : receipts.map((receipt) => (
              <article className="receipt" key={receipt.paymentId}>
                <div className="receipt-top"><span>{receipt.mode === "live" ? "SETTLED" : "SIMULATED"}</span><strong>{formatUsdcAtomic(receipt.amountAtomic)} USDC</strong></div>
                <code>{shorten(receipt.signature)}</code>
                {receipt.explorerUrl ? (
                  <a href={receipt.explorerUrl} target="_blank" rel="noreferrer">Solana Explorer <ExternalIcon /></a>
                ) : <small>온체인 거래 아님</small>}
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className="evidence-section" aria-labelledby="evidence-title">
        <div className="evidence-heading">
          <div><p>04 / PURCHASED OUTPUT</p><h2 id="evidence-title">구매한 근거, 작성된 결론</h2></div>
          {runId && <code>RUN {shorten(runId, 12, 6)}</code>}
        </div>
        {!summary ? (
          <div className="evidence-empty">
            <span>REPORT PENDING</span>
            <p>{lastEvent?.detail ?? "자율 구매가 완료되면 원본 지표와 종합 보고서가 이 영역에 고정됩니다."}</p>
          </div>
        ) : (
          <div className="report-grid" data-testid="research-report">
            <article className="report-lead">
              <span>EXECUTIVE BRIEF</span>
              <h3>{summary.headline}</h3>
              <p>{summary.executiveSummary}</p>
              <small>Generated by {summary.generatedBy}</small>
            </article>
            <div className="finding-list">
              {summary.findings.map((finding, index) => (
                <article key={`${finding.label}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><p>{finding.label}</p><strong>{finding.value}</strong><small>{finding.interpretation}</small></div>
                </article>
              ))}
            </div>
            <aside className="caveat-list"><p>LIMITS OF EVIDENCE</p>{summary.caveats.map((caveat) => <span key={caveat}>{caveat}</span>)}</aside>
          </div>
        )}
      </section>

      <footer className="footer">
        <span>REIN / GCP × SOLANA AI AGENTIC HACKATHON · 2026</span>
        <span>x402 / Solana Devnet / Vertex AI / Cloud Run</span>
      </footer>
    </main>
  );
}
