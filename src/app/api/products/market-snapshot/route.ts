import { createPaidProductHandler } from "@/lib/rein/product-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createPaidProductHandler("market_snapshot");
