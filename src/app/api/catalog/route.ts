import { NextResponse } from "next/server";
import { loadCatalog } from "@/lib/proofbuy/catalog";
import { getRuntimeMode } from "@/lib/proofbuy/planner";
import { getStore } from "@/lib/proofbuy/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const products = await loadCatalog(getStore());
  return NextResponse.json(
    { mode: getRuntimeMode(), products },
    { headers: { "Cache-Control": "no-store" } },
  );
}
