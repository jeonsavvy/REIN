import { NextResponse } from "next/server";
import { getRuntimeMode } from "@/lib/proofbuy/planner";
import { getStorageMode } from "@/lib/proofbuy/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "rein",
      mode: getRuntimeMode(),
      storage: getStorageMode(),
      model: "gemini-3.5-flash",
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
