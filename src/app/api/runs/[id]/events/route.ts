import { executeRun } from "@/lib/rein/orchestrator";
import { createId } from "@/lib/rein/crypto";
import { getStore } from "@/lib/rein/store";
import { TERMINAL_RUN_STATUSES } from "@/lib/rein/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const encoder = new TextEncoder();

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const store = getStore();
  const run = await store.getRun(id);
  if (!run) return new Response("Run not found", { status: 404 });

  const claimId = createId("claim");
  const claimed = await store.claimRun(id, claimId);
  const url = new URL(request.url);
  const baseUrl = process.env.APP_BASE_URL ?? url.origin;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastSeq = 0;
      let lastHeartbeat = Date.now();
      const startedAt = Date.now();
      controller.enqueue(encoder.encode(": rein stream connected\n\n"));
      const execution = claimed
        ? executeRun(id, { store, baseUrl })
        : Promise.resolve();
      try {
        while (!request.signal.aborted && Date.now() - startedAt < 110_000) {
          const events = await store.listEvents(id);
          for (const event of events.filter((item) => item.seq > lastSeq)) {
            controller.enqueue(
              encoder.encode(
                `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
              ),
            );
            lastSeq = event.seq;
          }
          const current = await store.getRun(id);
          if (!current || TERMINAL_RUN_STATUSES.has(current.status)) break;
          if (Date.now() - lastHeartbeat > 15_000) {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
            lastHeartbeat = Date.now();
          }
          await sleep(250, request.signal);
        }
        await execution;
        const remaining = (await store.listEvents(id)).filter(
          (event) => event.seq > lastSeq,
        );
        for (const event of remaining) {
          controller.enqueue(
            encoder.encode(
              `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
            ),
          );
        }
      } catch {
        // A dropped EventSource must not cancel a signed payment or trigger a retry.
        // Keep the claimed run alive so a reconnect can read persisted events.
        await execution;
      } finally {
        try {
          controller.close();
        } catch {
          // The consumer may already have closed the stream.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
