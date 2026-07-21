import {
  DEVNET_USDC_MINT,
  PRODUCT_DEFINITIONS,
  SOLANA_DEVNET,
} from "@/lib/proofbuy/constants";
import { kstDateKey } from "@/lib/proofbuy/storage";
import type {
  CatalogProduct,
  PaymentReceipt,
  PaymentRecord,
  ProductId,
} from "@/lib/proofbuy/types";

export function availableCatalog(): CatalogProduct[] {
  return Object.values(PRODUCT_DEFINITIONS).map((product) => ({
    ...product,
    available: true,
    snapshotId: `snapshot_${product.id}`,
    fetchedAt: "2026-07-21T00:00:00.000Z",
    expiresAt: "2099-07-21T00:05:00.000Z",
  }));
}

export function paymentRecord(input: {
  id?: string;
  runId: string;
  productId?: ProductId;
  amountAtomic?: string;
  fingerprint?: string;
}): PaymentRecord {
  const productId = input.productId ?? "market_snapshot";
  const now = new Date().toISOString();
  return {
    id: input.id ?? `payment_${crypto.randomUUID()}`,
    runId: input.runId,
    productId,
    snapshotId: `snapshot_${productId}`,
    snapshotHash: `hash_${productId}`,
    quotaKey: kstDateKey(),
    requestFingerprint: input.fingerprint ?? `fingerprint_${crypto.randomUUID()}`,
    amountAtomic:
      input.amountAtomic ?? PRODUCT_DEFINITIONS[productId].priceAtomic,
    network: SOLANA_DEVNET,
    asset: DEVNET_USDC_MINT,
    payTo: "demo-receiver-no-wallet",
    status: "reserved",
    createdAt: now,
    updatedAt: now,
  };
}

export function paymentReceipt(payment: PaymentRecord): PaymentReceipt {
  return {
    paymentId: payment.id,
    productId: payment.productId,
    amountAtomic: payment.amountAtomic,
    decimals: 6,
    network: payment.network,
    asset: payment.asset,
    payer: "demo-buyer-no-wallet",
    payee: payment.payTo,
    signature: `demo_${payment.id}`,
    settledAt: new Date().toISOString(),
    mode: "demo",
  };
}
