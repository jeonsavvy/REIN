import { NextResponse } from "next/server";
import { getStore } from "@/lib/rein/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const view = await getStore().getRunView(id);
  if (!view) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json(view, {
    headers: { "Cache-Control": "no-store" },
  });
}
