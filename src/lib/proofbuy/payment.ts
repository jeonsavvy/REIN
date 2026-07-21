import { base58 } from "@scure/base";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { appendPaymentIdentifierToExtensions } from "@x402/extensions/payment-identifier";
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { z } from "zod";
import { DEVNET_USDC_MINT, SOLANA_DEVNET, USDC_DECIMALS } from "./constants";
import { sha256 } from "./crypto";
import { PolicyDeniedError, ProofBuyError } from "./errors";
import { validatePaymentCandidate } from "./policy";
import type {
  PaymentReceipt,
  PaymentRecord,
  ProductId,
  RuntimeMode,
  Snapshot,
} from "./types";

export interface PaymentResult {
  snapshot: Snapshot;
  receipt: PaymentReceipt;
}

export interface PaymentGateway {
  purchase(input: {
    payment: PaymentRecord;
    baseUrl: string;
    signal?: AbortSignal;
  }): Promise<PaymentResult>;
}

const paidResourceSchema = z.object({
  snapshot: z.object({
    id: z.string(),
    productId: z.enum(["market_snapshot", "github_health"]),
    sourceName: z.string(),
    sourceUrl: z.string().url(),
    fetchedAt: z.string(),
    expiresAt: z.string(),
    requestHash: z.string(),
    data: z.unknown(),
  }),
});

const settleSchema = z.object({
  success: z.boolean(),
  transaction: z.string(),
  network: z.string(),
  payer: z.string().optional(),
});

function assertBaseUrl(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new PolicyDeniedError("APP_BASE_URL은 HTTP(S) URL이어야 합니다.");
  }
  return url;
}

export function x402SettlementFailure(message: string): ProofBuyError {
  const insufficient = /insufficient|balance/i.test(message);
  return new ProofBuyError({
    code: insufficient ? "INSUFFICIENT_DEVNET_BALANCE" : "PAYMENT_FAILED",
    message: insufficient
      ? "Devnet SOL 또는 테스트 USDC 잔액이 부족합니다."
      : `x402 정산 실패: ${message}`,
    recovery: insufficient
      ? "Solana와 Circle faucet에서 테스트 자산을 보충하세요."
      : "x402 정산 서비스와 수취 주소를 확인한 뒤 새 조사를 시작하세요.",
  });
}

export function x402TransportFailure(
  error: unknown,
  paymentPayloadCreated: boolean,
): ProofBuyError {
  const timedOut =
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError");
  return new ProofBuyError(
    {
      code: paymentPayloadCreated
        ? "PAYMENT_RECONCILING"
        : timedOut
          ? "MODEL_TIMEOUT"
          : "PAYMENT_FAILED",
      message: paymentPayloadCreated
        ? error instanceof Error
          ? error.message
          : "서명 후 x402 응답을 받지 못했습니다."
        : timedOut
          ? "모델 또는 결제 네트워크가 제한 시간 안에 응답하지 않았습니다."
          : error instanceof Error
            ? error.message
            : "x402 요청에 실패했습니다.",
      recovery: paymentPayloadCreated
        ? "자동 재결제하지 말고 Solana Explorer에서 payment ID와 서명을 대조하세요."
        : timedOut
          ? "서명 전 시간 초과입니다. 네트워크 상태를 확인한 뒤 새 조사를 시작하세요."
          : "네트워크와 x402 정산 서비스 상태를 확인한 뒤 새 조사를 시작하세요.",
    },
    paymentPayloadCreated,
  );
}

function resourceUrl(baseUrl: string, payment: PaymentRecord): string {
  const base = assertBaseUrl(baseUrl);
  const route =
    payment.productId === "market_snapshot"
      ? "/api/products/market-snapshot"
      : "/api/products/github-health";
  const url = new URL(route, base);
  url.searchParams.set("snapshotId", payment.snapshotId);
  return url.toString();
}

export function validatePaidSnapshot(
  raw: unknown,
  payment: PaymentRecord,
): Snapshot {
  const parsed = paidResourceSchema.parse(raw).snapshot;
  if (
    parsed.id !== payment.snapshotId ||
    parsed.productId !== payment.productId ||
    parsed.requestHash !== payment.snapshotHash ||
    sha256(JSON.stringify(parsed.data)) !== parsed.requestHash
  ) {
    throw new PolicyDeniedError(
      "결제한 요청과 반환된 스냅샷의 ID 또는 무결성 해시가 일치하지 않습니다.",
    );
  }
  return parsed as Snapshot;
}

export class DemoPaymentGateway implements PaymentGateway {
  async purchase(input: {
    payment: PaymentRecord;
    baseUrl: string;
    signal?: AbortSignal;
  }): Promise<PaymentResult> {
    const url = resourceUrl(input.baseUrl, input.payment);
    const challenge = await fetch(url, { signal: input.signal, cache: "no-store" });
    if (challenge.status !== 402) {
      throw new ProofBuyError({
        code: "PAYMENT_FAILED",
        message: "데모 유료 경로가 HTTP 402 결제 요구를 반환하지 않았습니다.",
        recovery: "상품 경로와 PROOFBUY_MODE 설정을 확인하세요.",
      });
    }
    const demoProof = sha256(
      `${input.payment.id}:${input.payment.requestFingerprint}`,
    );
    const response = await fetch(url, {
      signal: input.signal,
      cache: "no-store",
      headers: {
        "x-rein-demo-payment": demoProof,
        "x-rein-payment-id": input.payment.id,
      },
    });
    if (!response.ok) {
      throw new ProofBuyError({
        code: "PAYMENT_FAILED",
        message: `데모 결제 재시도가 ${response.status}로 거부되었습니다.`,
        recovery: "새 조사를 시작해 payment ID와 스냅샷을 다시 생성하세요.",
      });
    }
    const snapshot = validatePaidSnapshot(await response.json(), input.payment);
    const settledAt = new Date().toISOString();
    return {
      snapshot,
      receipt: {
        paymentId: input.payment.id,
        productId: input.payment.productId,
        amountAtomic: input.payment.amountAtomic,
        decimals: USDC_DECIMALS,
        network: SOLANA_DEVNET,
        asset: DEVNET_USDC_MINT,
        payer: "demo-buyer-no-wallet",
        payee: input.payment.payTo,
        signature: `demo_${sha256(input.payment.id).slice(0, 48)}`,
        settledAt,
        mode: "demo",
      },
    };
  }
}

export class LiveX402PaymentGateway implements PaymentGateway {
  async purchase(input: {
    payment: PaymentRecord;
    baseUrl: string;
    signal?: AbortSignal;
  }): Promise<PaymentResult> {
    const expectedBaseUrl = process.env.APP_BASE_URL;
    if (!expectedBaseUrl) {
      throw new ProofBuyError({
        code: "PAYMENT_FAILED",
        message: "APP_BASE_URL이 live 모드에 설정되지 않았습니다.",
        recovery: "배포된 Cloud Run HTTPS 주소를 APP_BASE_URL로 고정하세요.",
      });
    }
    if (
      assertBaseUrl(input.baseUrl).origin !==
      assertBaseUrl(expectedBaseUrl).origin
    ) {
      throw new PolicyDeniedError(
        "결제 대상 주소가 고정된 APP_BASE_URL과 다릅니다.",
      );
    }
    const privateKey = process.env.SVM_PRIVATE_KEY;
    if (!privateKey) {
      throw new ProofBuyError({
        code: "PAYMENT_FAILED",
        message: "SVM_PRIVATE_KEY가 설정되지 않았습니다.",
        recovery: "Devnet 전용 키를 Secret Manager에서 Cloud Run 환경 변수로 연결하세요.",
      });
    }
    validatePaymentCandidate({
      productId: input.payment.productId,
      amountAtomic: input.payment.amountAtomic,
      network: input.payment.network,
      asset: input.payment.asset,
      payTo: input.payment.payTo,
      route:
        input.payment.productId === "market_snapshot"
          ? "/api/products/market-snapshot"
          : "/api/products/github-health",
    });

    const signer = await createKeyPairSignerFromBytes(base58.decode(privateKey));
    const client = new x402Client();
    let paymentPayloadCreated = false;
    client.register("solana:*", new ExactSvmScheme(signer));
    client.onBeforePaymentCreation(async ({
      paymentRequired,
      selectedRequirements,
    }) => {
      if (
        selectedRequirements.network !== SOLANA_DEVNET ||
        selectedRequirements.asset !== DEVNET_USDC_MINT ||
        selectedRequirements.amount !== input.payment.amountAtomic ||
        selectedRequirements.payTo !== input.payment.payTo
      ) {
        return {
          abort: true,
          reason: "Payment requirements do not match the local allowlist",
        };
      }
      if (paymentRequired.extensions) {
        appendPaymentIdentifierToExtensions(
          paymentRequired.extensions,
          input.payment.id,
        );
      }
    });
    client.onAfterPaymentCreation(async () => {
      paymentPayloadCreated = true;
    });

    const fetchWithPayment = wrapFetchWithPayment(fetch, client);
    const httpClient = new x402HTTPClient(client);
    try {
      const response = await fetchWithPayment(
        resourceUrl(input.baseUrl, input.payment),
        {
          method: "GET",
          signal: input.signal,
          cache: "no-store",
        },
      );
      const result = await httpClient.processResponse(response);
      if (result.paymentStatus !== "settled") {
        const message = JSON.stringify(result.header ?? result.body).slice(0, 300);
        throw x402SettlementFailure(message);
      }
      const settle = settleSchema.parse(result.header);
      if (!settle.success || settle.network !== SOLANA_DEVNET) {
        throw new PolicyDeniedError("정산 응답이 Devnet 성공 조건을 충족하지 않습니다.");
      }
      const snapshot = validatePaidSnapshot(result.body, input.payment);
      return {
        snapshot,
        receipt: {
          paymentId: input.payment.id,
          productId: input.payment.productId,
          amountAtomic: input.payment.amountAtomic,
          decimals: USDC_DECIMALS,
          network: settle.network,
          asset: DEVNET_USDC_MINT,
          payer: settle.payer ?? signer.address,
          payee: input.payment.payTo,
          signature: settle.transaction,
          explorerUrl: `https://explorer.solana.com/tx/${encodeURIComponent(settle.transaction)}?cluster=devnet`,
          settledAt: new Date().toISOString(),
          mode: "live",
        },
      };
    } catch (error) {
      if (error instanceof ProofBuyError) throw error;
      throw x402TransportFailure(error, paymentPayloadCreated);
    }
  }
}

export function getPaymentGateway(mode: RuntimeMode): PaymentGateway {
  return mode === "live"
    ? new LiveX402PaymentGateway()
    : new DemoPaymentGateway();
}

export function productRouteFor(productId: ProductId): string {
  return productId === "market_snapshot"
    ? "/api/products/market-snapshot"
    : "/api/products/github-health";
}
