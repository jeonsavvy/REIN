import { withX402FromHTTPServer } from "@x402/next";
import { x402HTTPResourceServer } from "@x402/core/server";
import {
  declarePaymentIdentifierExtension,
  PAYMENT_IDENTIFIER,
} from "@x402/extensions/payment-identifier";
import { NextRequest, NextResponse } from "next/server";
import { sha256 } from "./crypto";
import { PRODUCT_DEFINITIONS, SOLANA_DEVNET } from "./constants";
import { getRuntimeMode } from "./planner";
import { canonicalProductUrl } from "./public-origin";
import { getStore } from "./store";
import type { ProductId } from "./types";
import { getX402Server, mayReuseResourceGrant } from "./x402-server";

function productHandler(productId: ProductId) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const snapshotId = request.nextUrl.searchParams.get("snapshotId");
    if (!snapshotId) {
      return NextResponse.json({ error: "snapshotId is required" }, { status: 400 });
    }
    const snapshot = await getStore().getSnapshot(snapshotId);
    if (!snapshot || snapshot.productId !== productId) {
      return NextResponse.json({ error: "snapshot not found" }, { status: 404 });
    }
    return NextResponse.json(
      { snapshot },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
          "X-ProofBuy-Snapshot": snapshot.id,
        },
      },
    );
  };
}

function demoHandler(productId: ProductId) {
  const paidHandler = productHandler(productId);
  return async (request: NextRequest): Promise<NextResponse> => {
    const paymentId = request.headers.get("x-proofbuy-payment-id");
    const proof = request.headers.get("x-proofbuy-demo-payment");
    if (!paymentId || !proof) {
      return NextResponse.json(
        {
          error: "PAYMENT_REQUIRED",
          mode: "demo",
          priceAtomic: PRODUCT_DEFINITIONS[productId].priceAtomic,
          note: "This challenge is simulated and cannot settle on-chain.",
        },
        { status: 402, headers: { "Cache-Control": "no-store" } },
      );
    }
    const payment = await getStore().getPayment(paymentId);
    const snapshotId = request.nextUrl.searchParams.get("snapshotId");
    if (
      !payment ||
      payment.productId !== productId ||
      payment.snapshotId !== snapshotId ||
      proof !== sha256(`${payment.id}:${payment.requestFingerprint}`)
    ) {
      return NextResponse.json({ error: "Invalid demo payment proof" }, { status: 403 });
    }
    return paidHandler(request);
  };
}

export function createPaidProductHandler(productId: ProductId) {
  if (getRuntimeMode() === "demo") return demoHandler(productId);
  const payTo = process.env.SVM_PAY_TO;
  if (!payTo) {
    return async () =>
      NextResponse.json(
        { error: "SVM_PAY_TO is required in live mode" },
        { status: 503 },
      );
  }
  const definition = PRODUCT_DEFINITIONS[productId];
  const routeConfig = {
    accepts: [
      {
        scheme: "exact" as const,
        price: `$${(Number(definition.priceAtomic) / 1_000_000).toFixed(3)}`,
        network: SOLANA_DEVNET,
        payTo,
      },
    ],
    description: definition.description,
    mimeType: "application/json",
    extensions: {
      [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true),
    },
  };
  const httpServer = new x402HTTPResourceServer(getX402Server(), {
    "*": routeConfig,
  }).onProtectedRequest(async (context) => {
    const snapshotId = context.adapter.getQueryParam?.("snapshotId");
    const reusable = await mayReuseResourceGrant({
      paymentHeader: context.paymentHeader,
      path: context.path,
      snapshotId: typeof snapshotId === "string" ? snapshotId : undefined,
    });
    if (reusable) return { grantAccess: true };
  });
  const protectedHandler = withX402FromHTTPServer(
    productHandler(productId),
    httpServer,
  );
  return async (request: NextRequest): Promise<NextResponse> => {
    const appBaseUrl = process.env.APP_BASE_URL;
    if (!appBaseUrl) {
      return NextResponse.json(
        { error: "APP_BASE_URL is required in live mode" },
        { status: 503 },
      );
    }
    const canonicalUrl = canonicalProductUrl(request.nextUrl, appBaseUrl);
    const canonicalRequest = new NextRequest(canonicalUrl, {
      method: request.method,
      headers: request.headers,
    });
    return protectedHandler(canonicalRequest);
  };
}
