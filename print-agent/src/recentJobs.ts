const DEDUPE_WINDOW_MS = 2 * 60 * 1000;

const seen = new Map<string, number>();

function sweep(now: number): void {
  for (const [jobId, timestamp] of seen) {
    if (now - timestamp > DEDUPE_WINDOW_MS) {
      seen.delete(jobId);
    }
  }
}

// If a request times out on the backend side but the agent actually got and printed it, a
// retried request must not print it again. Checked before rendering, recorded after.
export function wasRecentlyPrinted(jobId: string): boolean {
  sweep(Date.now());
  return seen.has(jobId);
}

export function markPrinted(jobId: string): void {
  seen.set(jobId, Date.now());
}
