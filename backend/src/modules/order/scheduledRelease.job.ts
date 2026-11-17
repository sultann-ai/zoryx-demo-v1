import * as orderService from "./order.service";

// How often due scheduled orders are released. A scheduled order goes out at most about this
// long after its time.
export const SCHEDULED_RELEASE_INTERVAL_MS = 30_000;

let timer: NodeJS.Timeout | null = null;
let isRunning = false;

// One pass: release everything due. Never throws — a failed pass (database briefly
// unreachable during a deploy, say) is logged and simply retried on the next tick, since
// the database, not this process, holds what's due.
export async function runScheduledReleasePass(): Promise<void> {
  // A slow pass is never overlapped by the next tick. (Even if it were, releasing is a
  // conditional UPDATE that only one caller can win — see releaseScheduledOrder.)
  if (isRunning) {
    return;
  }
  isRunning = true;
  try {
    const released = await orderService.releaseDueScheduledOrders(new Date());
    for (const order of released) {
      console.log(
        `[scheduled] released order #${order.orderNumber} (${order.id}) due ${order.scheduledFor?.toISOString()}`,
      );
    }
  } catch (error) {
    console.error("[scheduled] release pass failed; will retry on the next tick", error);
  } finally {
    isRunning = false;
  }
}

// Called once from server.ts. Runs a pass immediately — the startup catch-up that releases
// anything that fell due while the server was down (every deploy restarts it) — then every
// SCHEDULED_RELEASE_INTERVAL_MS. Holds no schedule of its own in memory: each pass asks the
// database what's due, so nothing is lost across restarts and nothing is released twice.
export function startScheduledReleaseJob(): void {
  if (timer) {
    return;
  }
  void runScheduledReleasePass();
  timer = setInterval(() => void runScheduledReleasePass(), SCHEDULED_RELEASE_INTERVAL_MS);
}

export function stopScheduledReleaseJob(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
