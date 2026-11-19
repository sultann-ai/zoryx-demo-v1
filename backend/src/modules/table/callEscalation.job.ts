import { escalateDueCalls } from "./tableCall.service";

// How often unacknowledged waiter calls are checked. A call is escalated at most about this long after
// its two minutes are up.
export const CALL_ESCALATION_INTERVAL_MS = 30_000;

let timer: NodeJS.Timeout | null = null;
let isRunning = false;

// One pass: escalate everything due. Never throws — a failed pass (database briefly unreachable during
// a deploy, say) is logged and retried on the next tick, since the database, not this process, holds
// what's due. Same shape as order/scheduledRelease.job.ts.
export async function runCallEscalationPass(): Promise<void> {
  // A slow pass is never overlapped by the next tick. (Even if it were, escalating is a conditional
  // UPDATE that only one caller can win — see escalateDueCalls.)
  if (isRunning) {
    return;
  }
  isRunning = true;
  try {
    const escalated = await escalateDueCalls(new Date());
    for (const call of escalated) {
      console.log(`[table-call] escalated ${call.type} call ${call.id} at ${call.diningArea.name} (raised ${call.createdAt.toISOString()})`);
    }
  } catch (error) {
    console.error("[table-call] escalation pass failed; will retry on the next tick", error);
  } finally {
    isRunning = false;
  }
}

// Called once from server.ts, after Socket.io is up. Runs a pass immediately (catching up on calls that
// went unanswered while the server was down), then every CALL_ESCALATION_INTERVAL_MS. Holds no state of
// its own: each pass asks the database.
export function startCallEscalationJob(): void {
  if (timer) {
    return;
  }
  void runCallEscalationPass();
  timer = setInterval(() => void runCallEscalationPass(), CALL_ESCALATION_INTERVAL_MS);
}

export function stopCallEscalationJob(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
