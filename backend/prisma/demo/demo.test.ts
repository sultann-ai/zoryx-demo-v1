import { describe, expect, it } from "vitest";
import { pkTime } from "./history";
import { SeededRandom } from "./random";
import { databaseRefusal, preflightRefusal } from "./safety";

describe("demo reset refusals", () => {
  it("refuses without DEMO_RESET_ALLOWED=true, then without --yes", () => {
    expect(preflightRefusal({ allowedEnv: undefined, argv: ["--yes"] })).toMatch(/DEMO_RESET_ALLOWED=true/);
    expect(preflightRefusal({ allowedEnv: "1", argv: ["--yes"] })).toMatch(/DEMO_RESET_ALLOWED=true/);
    expect(preflightRefusal({ allowedEnv: "true", argv: [] })).toMatch(/--yes/);
    expect(preflightRefusal({ allowedEnv: "true", argv: ["node", "reset.ts", "--yes"] })).toBeNull();
  });

  it("refuses a database with orders unless it is already a demo", () => {
    expect(databaseRefusal({ orderCount: 4, isDemo: false })).toBe(
      "this database has 4 order(s) and is not a demo database (SiteSettings.isDemo is not true).",
    );
    expect(databaseRefusal({ orderCount: 0, isDemo: false })).toBeNull();
    expect(databaseRefusal({ orderCount: 4909, isDemo: true })).toBeNull();
  });
});

describe("SeededRandom", () => {
  it("gives the same sequence for the same seed, and a different one for another seed", () => {
    const draw = (seed: number) => {
      const random = new SeededRandom(seed);
      return [random.next(), random.int(1, 100), random.uuid(), random.code("ABC", 5)];
    };
    expect(draw(7)).toEqual(draw(7));
    expect(draw(7)).not.toEqual(draw(8));
  });

  it("draws UUID-shaped ids and stays inside int bounds", () => {
    const random = new SeededRandom(1);
    expect(random.uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    for (let i = 0; i < 500; i += 1) {
      const value = random.int(40, 70);
      expect(value).toBeGreaterThanOrEqual(40);
      expect(value).toBeLessThanOrEqual(70);
    }
  });
});

describe("pkTime", () => {
  it("turns a Pakistan wall-clock time into UTC, rolling hours past 23 into the next day", () => {
    expect(pkTime("2026-11-16", 12).toISOString()).toBe("2026-11-16T07:00:00.000Z");
    expect(pkTime("2026-11-16", 24, 30).toISOString()).toBe("2026-11-16T19:30:00.000Z");
  });
});
