import { afterEach, describe, expect, it, vi } from "vitest";

// The job wrapper only: escalateDueCalls (the database work) is stubbed, see tableCall.test.ts for it.
const escalate = vi.hoisted(() => ({ impl: async (): Promise<unknown[]> => [] }));
vi.mock("./tableCall.service", () => ({ escalateDueCalls: () => escalate.impl() }));

import { CALL_ESCALATION_INTERVAL_MS, runCallEscalationPass, startCallEscalationJob, stopCallEscalationJob } from "./callEscalation.job";

afterEach(() => {
  stopCallEscalationJob();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("call escalation job", () => {
  it("never throws: a failed pass is logged and the next tick retries", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    escalate.impl = async () => {
      throw new Error("database unreachable");
    };
    await expect(runCallEscalationPass()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("escalation pass failed"), expect.any(Error));
  });

  it("never overlaps a pass that is still running", async () => {
    let release: () => void = () => undefined;
    let calls = 0;
    escalate.impl = () => {
      calls += 1;
      return new Promise((resolve) => {
        release = () => resolve([]);
      });
    };
    const first = runCallEscalationPass();
    await runCallEscalationPass();
    expect(calls).toBe(1);
    release();
    await first;
  });

  it("runs a pass at start, then every 30 s", async () => {
    vi.useFakeTimers();
    let calls = 0;
    escalate.impl = async () => {
      calls += 1;
      return [];
    };
    startCallEscalationJob();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(CALL_ESCALATION_INTERVAL_MS);
    expect(calls).toBe(2);
    expect(CALL_ESCALATION_INTERVAL_MS).toBe(30_000);
  });
});
