import { Buffer } from "node:buffer";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { extractPaymentIdentifier } from "@x402/extensions/payment-identifier";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { DEVNET_USDC_MINT, SOLANA_DEVNET } from "./constants";
import { getStore } from "./store";
import { productRouteFor } from "./payment";

const globalForX402 = globalThis as typeof globalThis & {
  __proofBuyX402Server?: x402ResourceServer;
};

function parsePaymentPayload(encoded?: string): unknown {
  if (!encoded) return undefined;
  try {
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

function getPaymentId(encoded?: string): string | undefined {
  const payload = parsePaymentPayload(encoded);
  if (!payload || typeof payload !== "object") return undefined;
  try {
    return extractPaymentIdentifier(payload as never) ?? undefined;
  } catch {
    return undefined;
  }
}

function getPaymentIdFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  try {
    return extractPaymentIdentifier(payload as never) ?? undefined;
  } catch {
    return undefined;
  }
}

export function getX402Server(): x402ResourceServer {
  if (globalForX402.__proofBuyX402Server) {
    return globalForX402.__proofBuyX402Server;
  }
  const facilitator = new HTTPFacilitatorClient({
    url: process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
  });
  const server = new x402ResourceServer(facilitator);
  server.register("solana:*", new ExactSvmScheme());
  server.onBeforeVerify(async (context) => {
    const paymentId = getPaymentIdFromPayload(context.paymentPayload);
    if (!paymentId) {
      return { abort: true, reason: "Missing payment-identifier extension" };
    }
    const payment = await getStore().getPayment(paymentId);
    if (!payment) return { abort: true, reason: "Unknown ProofBuy payment" };
    const transport = context.transportContext as
      | {
          request?: {
            path?: string;
            adapter?: { getQueryParam?(name: string): string | string[] | undefined };
          };
        }
      | undefined;
    const snapshotId = transport?.request?.adapter?.getQueryParam?.("snapshotId");
    const validSnapshot =
      typeof snapshotId === "string" && snapshotId === payment.snapshotId;
    const validRoute =
      transport?.request?.path === productRouteFor(payment.productId);
    const validRequirements =
      context.requirements.network === SOLANA_DEVNET &&
      context.requirements.asset === DEVNET_USDC_MINT &&
      context.requirements.amount === payment.amountAtomic &&
      context.requirements.payTo === payment.payTo;
    if (!validSnapshot || !validRoute || !validRequirements) {
      return { abort: true, reason: "Payment is not bound to this resource request" };
    }
  });
  server.onAfterSettle(async ({ paymentPayload }) => {
    const paymentId = getPaymentIdFromPayload(paymentPayload);
    if (!paymentId) return;
    const payment = await getStore().getPayment(paymentId);
    if (payment) {
      await getStore().saveResourceGrant(payment.id, payment.requestFingerprint);
    }
  });
  globalForX402.__proofBuyX402Server = server;
  return server;
}

export async function mayReuseResourceGrant(input: {
  paymentHeader?: string;
  path: string;
  snapshotId?: string;
}): Promise<boolean> {
  const paymentId = getPaymentId(input.paymentHeader);
  if (!paymentId) return false;
  const store = getStore();
  const payment = await store.getPayment(paymentId);
  if (
    !payment ||
    input.path !== productRouteFor(payment.productId) ||
    input.snapshotId !== payment.snapshotId
  ) {
    return false;
  }
  return store.hasResourceGrant(paymentId, payment.requestFingerprint);
}
