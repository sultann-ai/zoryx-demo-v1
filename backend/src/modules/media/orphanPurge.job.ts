import * as mediaService from "./media.service";

const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Long enough that an admin who uploaded a photo and is still filling in the form never loses it.
const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

// One pass. Never throws: a failure (database briefly unreachable during a deploy) is logged and
// retried on the next tick.
export async function runOrphanPurgePass(): Promise<void> {
  try {
    const removed = await mediaService.purgeOrphanMedia(new Date(Date.now() - ORPHAN_MIN_AGE_MS));
    if (removed > 0) {
      console.log(`[media] purged ${removed} unreferenced upload(s)`);
    }
  } catch (error) {
    console.error("[media] orphan purge failed; will retry on the next tick", error);
  }
}

// Called once from server.ts.
export function startOrphanPurgeJob(): void {
  if (timer) {
    return;
  }
  void runOrphanPurgePass();
  timer = setInterval(() => void runOrphanPurgePass(), PURGE_INTERVAL_MS);
  timer.unref();
}
