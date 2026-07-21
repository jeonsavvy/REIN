import { createHash, randomUUID } from "node:crypto";

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function makePaymentFingerprint(input: {
  method: string;
  route: string;
  snapshotId: string;
  snapshotHash: string;
  network: string;
  asset: string;
  amountAtomic: string;
  payTo: string;
}): string {
  return sha256(
    [
      input.method.toUpperCase(),
      input.route,
      input.snapshotId,
      input.snapshotHash,
      input.network,
      input.asset,
      input.amountAtomic,
      input.payTo,
    ].join("|"),
  );
}
