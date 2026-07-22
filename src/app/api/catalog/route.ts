import { NextResponse } from "next/server";
import { loadCatalog } from "@/lib/rein/catalog";
import { getRuntimeMode } from "@/lib/rein/planner";
import { getStore } from "@/lib/rein/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const products = await loadCatalog(getStore());
  return NextResponse.json(
    { mode: getRuntimeMode(), products },
    { headers: { "Cache-Control": "no-store" } },
  );
}
